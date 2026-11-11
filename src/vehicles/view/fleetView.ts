/**
 * Draws the fleet.
 *
 * Every vehicle of a kind shares one mesh and is drawn by instancing, so three hundred
 * parked cars cost a handful of draw calls. Two things keep that cheap on a phone:
 *
 *  - **Two tiers.** Vehicles near the camera are drawn with wheels, a patch of shade
 *    underneath and a sun shadow. Further off they are just bodies, and past the far
 *    range they are not drawn at all. `refresh` sorts them into tiers a few times a
 *    second; it is the only thing that touches a parked vehicle.
 *  - **Only what moves is rewritten.** `update` runs every frame and rewrites the few
 *    vehicles that are awake: their place between two physics steps, spinning wheels,
 *    steering, body roll and brake lights.
 *
 * The vehicle being driven also gets working headlights after dark: one real light,
 * shared by whichever vehicle that is (see BEAM).
 *
 * Plain three.js, no React: Vehicles.tsx owns one of these and adds `group` to the scene.
 */
import {
  BufferGeometry,
  Euler,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  SpotLight,
  Vector3,
  type Material,
} from 'three'
import { VEHICLE_KINDS, type VehicleKind } from '../../config/vehicles'
import { clamp, damp } from '../../core/math'
import type { Fleet, Pose, Vehicle } from '../fleet'
import { buildVehicleModel, buildWheelGeometry, type VehicleModel } from '../models/vehicleModels'
import {
  createUnderShadowMaterial,
  createVehicleMaterial,
  createWheelMaterial,
} from './vehicleMaterials'

/** How far out each tier reaches, in metres from the camera. */
export interface DrawRanges {
  near: number
  far: number
}

const HIDDEN = 0
const NEAR = 1
const FAR = 2

/** Lamp brightness. Above 1 on purpose: the tone mapping turns it into a glare. */
const HEADLAMPS_ON = 2.4
const TAIL_LAMPS_ON = 0.9
const BRAKE_LAMPS = 2.6
/** Lamps come on when the sky is this dark (0 day .. 1 night). */
const LAMPS_ON_AT = 0.3

/**
 * The driven vehicle's headlights on the road: one cone of light from the nose, with no
 * shadows. The ground materials are in on it (see `catchHeadlights` in
 * world/materials/groundMaterials.ts), which is what lets a lamp this low light the road.
 */
const BEAM = {
  colour: '#ffe9c4',
  intensity: 24,
  /** Height of the lamp above the road, in metres. */
  height: 0.8,
  /** How far ahead of the nose the middle of the beam meets the road, in metres. */
  reach: 25,
  /** Half the angle of the cone, and how much of it is soft edge (0..1). */
  angle: 0.65,
  penumbra: 1,
  /** Light fades to nothing by this distance, in metres, and how quickly on the way. */
  range: 110,
  decay: 0.75,
} as const

/** Height of the under-shadow above the road, and how far it spreads past the bodywork. */
const SHADE_Y = 0.03
const SHADE_SPREAD = 0.5

interface Tier {
  mesh: InstancedMesh
  lamps: InstancedBufferAttribute
  count: number
}

interface KindView {
  model: VehicleModel
  near: Tier
  far: Tier
}

const position = new Vector3()
const scale = new Vector3()
const one = new Vector3(1, 1, 1)
const quaternion = new Quaternion()
const turn = new Quaternion()
const euler = new Euler(0, 0, 0, 'YXZ')
const base = new Matrix4()
const body = new Matrix4()
const local = new Matrix4()
const world = new Matrix4()
const scratchPose: Pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }

export class FleetView {
  readonly group = new Group()

  private readonly fleet: Fleet
  private readonly kinds: Record<VehicleKind, KindView>
  private readonly wheels: InstancedMesh
  private readonly shade: InstancedMesh
  /** Always in the scene, at zero by day: adding a light later would recompile every shader. */
  private readonly beam: SpotLight
  private readonly materials: Material[]
  private readonly geometries: BufferGeometry[] = []

  /** Per vehicle: which tier it is drawn in, and its place in that tier's buffers. */
  private readonly tier: Uint8Array
  private readonly slot: Int32Array
  private readonly wheelSlot: Int32Array
  private readonly shadeSlot: Int32Array

  /** Per vehicle: how the bodywork is sitting, eased from frame to frame. Looks only. */
  private readonly spin: Float32Array
  private readonly roll: Float32Array
  private readonly dive: Float32Array

  private wheelCount = 0
  private shadeCount = 0
  private seenRevision = -1

  constructor(fleet: Fleet) {
    this.fleet = fleet
    this.group.name = 'vehicles'
    const total = fleet.vehicles.length
    this.tier = new Uint8Array(total)
    this.slot = new Int32Array(total)
    this.wheelSlot = new Int32Array(total)
    this.shadeSlot = new Int32Array(total)
    this.spin = new Float32Array(total)
    this.roll = new Float32Array(total)
    this.dive = new Float32Array(total)

    const paint = createVehicleMaterial()
    const tyre = createWheelMaterial()
    const shade = createUnderShadowMaterial()
    this.materials = [paint, tyre, shade]

    const counts: Record<VehicleKind, number> = { car: 0, boda: 0, matatu: 0 }
    let wheelTotal = 0
    const models = {} as Record<VehicleKind, VehicleModel>
    for (const kind of VEHICLE_KINDS) models[kind] = buildVehicleModel(kind)
    for (const vehicle of fleet.vehicles) {
      counts[vehicle.kind]++
      wheelTotal += models[vehicle.kind].wheels.length
    }

    this.kinds = {} as Record<VehicleKind, KindView>
    for (const kind of VEHICLE_KINDS) {
      const model = models[kind]
      this.geometries.push(model.body)
      const capacity = Math.max(1, counts[kind])
      const tier = (shadows: boolean): Tier => {
        // Each tier needs its own per-instance lamp levels, so it gets its own geometry
        // object. The vertex data inside is shared, not copied.
        const geometry = new BufferGeometry()
        for (const name of Object.keys(model.body.attributes)) {
          geometry.setAttribute(name, model.body.attributes[name])
        }
        geometry.setIndex(model.body.index)
        const lamps = new InstancedBufferAttribute(new Float32Array(capacity * 2), 2)
        geometry.setAttribute('lamps', lamps)
        this.geometries.push(geometry)

        const mesh = new InstancedMesh(geometry, paint, capacity)
        mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3)
        mesh.count = 0
        // Instances are scattered across the whole zone, and we already choose which to
        // draw by distance, so three's whole-mesh culling would only get in the way.
        mesh.frustumCulled = false
        mesh.castShadow = shadows
        mesh.receiveShadow = true
        mesh.name = `${kind}:${shadows ? 'near' : 'far'}`
        this.group.add(mesh)
        return { mesh, lamps, count: 0 }
      }
      this.kinds[kind] = { model, near: tier(true), far: tier(false) }
    }

    const wheel = buildWheelGeometry()
    this.geometries.push(wheel)
    this.wheels = new InstancedMesh(wheel, tyre, Math.max(1, wheelTotal))
    this.wheels.count = 0
    this.wheels.frustumCulled = false
    this.wheels.receiveShadow = true
    this.wheels.name = 'wheels'
    this.group.add(this.wheels)

    const patch = new PlaneGeometry(1, 1)
    patch.rotateX(-Math.PI / 2)
    this.geometries.push(patch)
    this.shade = new InstancedMesh(patch, shade, Math.max(1, total))
    this.shade.count = 0
    this.shade.frustumCulled = false
    // After the road markings (1), before the player's own blob (3).
    this.shade.renderOrder = 2
    this.shade.name = 'under-shadows'
    this.group.add(this.shade)

    this.beam = new SpotLight(BEAM.colour, 0, BEAM.range, BEAM.angle, BEAM.penumbra, BEAM.decay)
    this.beam.name = 'headlights'
    this.group.add(this.beam, this.beam.target)
  }

  /** True when a vehicle has woken or gone to sleep since the last `refresh`. */
  get stale(): boolean {
    return this.seenRevision !== this.fleet.revision
  }

  /**
   * Decide what to draw, from where the camera is. Cheap (one distance per vehicle), but
   * there is no need to do it every frame: a few times a second is plenty.
   */
  refresh(cameraX: number, cameraY: number, cameraZ: number, ranges: DrawRanges): void {
    this.seenRevision = this.fleet.revision
    for (const kind of VEHICLE_KINDS) this.kinds[kind].near.count = this.kinds[kind].far.count = 0
    this.wheelCount = 0
    this.shadeCount = 0
    const nearSq = ranges.near * ranges.near
    const farSq = ranges.far * ranges.far

    for (const vehicle of this.fleet.vehicles) {
      const { id, state } = vehicle
      const dx = state.x - cameraX
      const dy = state.y - cameraY
      const dz = state.z - cameraZ
      const distanceSq = dx * dx + dy * dy + dz * dz
      // Anything moving is drawn in full, wherever it is.
      const tier = vehicle.awake || distanceSq < nearSq ? NEAR : distanceSq < farSq ? FAR : HIDDEN
      this.tier[id] = tier
      if (tier === HIDDEN) continue
      const view = this.kinds[vehicle.kind]
      if (tier === NEAR) {
        this.slot[id] = view.near.count++
        this.wheelSlot[id] = this.wheelCount
        this.wheelCount += view.model.wheels.length
        this.shadeSlot[id] = this.shadeCount++
      } else {
        this.slot[id] = view.far.count++
      }
      scratchPose.x = state.x
      scratchPose.y = state.y
      scratchPose.z = state.z
      scratchPose.yaw = state.yaw
      scratchPose.pitch = state.pitch
      this.write(vehicle, scratchPose, 0, 0, false)
    }

    for (const kind of VEHICLE_KINDS) {
      const view = this.kinds[kind]
      for (const part of [view.near, view.far]) {
        part.mesh.count = part.count
        flag(part.mesh.instanceMatrix, part.count)
        flag(part.mesh.instanceColor!, part.count)
        flag(part.lamps, part.count)
      }
    }
    this.wheels.count = this.wheelCount
    flag(this.wheels.instanceMatrix, this.wheelCount)
    this.shade.count = this.shadeCount
    flag(this.shade.instanceMatrix, this.shadeCount)
  }

  /**
   * Redraw the vehicles that are awake.
   *
   * @param alpha   how far this frame is between the last two physics steps, 0..1
   * @param driven  id of the vehicle the player is driving, or -1
   * @param night   how dark it is, 0..1
   * @returns the pose the driven vehicle was drawn at, or undefined if nobody is driving
   */
  update(alpha: number, dt: number, driven: number, night: number, out: Pose): Pose | undefined {
    let drawn: Pose | undefined
    let beam = 0
    const awake = this.fleet.awake
    if (awake.length === 0) {
      this.beam.intensity = 0
      return drawn
    }
    for (const vehicle of awake) {
      const { id, spec, state } = vehicle
      // The bodywork leans on its springs a moment after the forces change.
      this.roll[id] = damp(this.roll[id], clamp(spec.roll * state.accelLat, -0.9, 0.9), 7, dt)
      this.dive[id] = damp(this.dive[id], clamp(spec.dive * state.accelLong, -0.07, 0.07), 9, dt)
      this.spin[id] = (this.spin[id] + (state.speed / spec.wheelRadius) * dt) % (Math.PI * 2)

      const isDriven = id === driven
      const pose = this.fleet.pose(vehicle, alpha, isDriven ? out : scratchPose)
      if (isDriven) drawn = pose
      if (this.tier[id] === HIDDEN) continue
      const lit = isDriven && night > LAMPS_ON_AT
      if (lit) {
        beam = BEAM.intensity
        this.aimBeam(vehicle, pose)
      }
      this.write(
        vehicle,
        pose,
        lit ? HEADLAMPS_ON : 0,
        (lit ? TAIL_LAMPS_ON : 0) + (isDriven && state.braking ? BRAKE_LAMPS : 0),
        true,
      )
    }
    for (const kind of VEHICLE_KINDS) {
      const { near } = this.kinds[kind]
      flag(near.mesh.instanceMatrix, near.count)
      flag(near.lamps, near.count)
    }
    flag(this.wheels.instanceMatrix, this.wheelCount)
    flag(this.shade.instanceMatrix, this.shadeCount)
    // Headlights come up and die away over a moment rather than snapping.
    this.beam.intensity =
      beam > 0 || this.beam.intensity > 1 ? damp(this.beam.intensity, beam, 9, dt) : 0
    return drawn
  }

  /** Point the headlight beam down the road in front of a vehicle. */
  private aimBeam(vehicle: Vehicle, pose: Pose): void {
    const nose = vehicle.spec.length / 2
    const level = Math.cos(pose.pitch)
    const forwardX = -Math.sin(pose.yaw) * level
    const forwardY = Math.sin(pose.pitch)
    const forwardZ = -Math.cos(pose.yaw) * level
    const lamp = nose + 0.1
    this.beam.position.set(
      pose.x + forwardX * lamp,
      pose.y + forwardY * lamp + BEAM.height,
      pose.z + forwardZ * lamp,
    )
    const ahead = nose + BEAM.reach
    this.beam.target.position.set(
      pose.x + forwardX * ahead,
      pose.y + forwardY * ahead,
      pose.z + forwardZ * ahead,
    )
  }

  /** How far the driven vehicle's bodywork is leaning, for the rider and the camera. */
  rollOf(id: number): number {
    return this.roll[id]
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose()
    for (const material of this.materials) {
      const texture = material.userData.falloff as { dispose(): void } | undefined
      texture?.dispose()
      material.dispose()
    }
    for (const kind of VEHICLE_KINDS) {
      this.kinds[kind].near.mesh.dispose()
      this.kinds[kind].far.mesh.dispose()
    }
    this.wheels.dispose()
    this.shade.dispose()
  }

  /** Write one vehicle into its tier's buffers: body, paint, lamps, wheels and shade. */
  private write(
    vehicle: Vehicle,
    pose: Pose,
    headlamps: number,
    tailLamps: number,
    moving: boolean,
  ): void {
    const { id, spec, state } = vehicle
    const view = this.kinds[vehicle.kind]
    const near = this.tier[id] === NEAR
    const part = near ? view.near : view.far
    const slot = this.slot[id]
    const roll = moving ? this.roll[id] : 0
    const dive = moving ? this.dive[id] : 0

    // The chassis follows the road: heading and slope.
    position.set(pose.x, pose.y, pose.z)
    quaternion.setFromEuler(euler.set(pose.pitch, pose.yaw, 0))
    base.compose(position, quaternion, one)
    // The bodywork also rolls and dives on its springs.
    quaternion.setFromEuler(euler.set(pose.pitch + dive, pose.yaw, roll))
    body.compose(position, quaternion, one)

    body.toArray(part.mesh.instanceMatrix.array, slot * 16)
    const colours = part.mesh.instanceColor!.array
    colours[slot * 3] = vehicle.paint[0]
    colours[slot * 3 + 1] = vehicle.paint[1]
    colours[slot * 3 + 2] = vehicle.paint[2]
    part.lamps.array[slot * 2] = headlamps
    part.lamps.array[slot * 2 + 1] = tailLamps
    if (!near) return

    // ---- wheels: on four wheels they stay on the road; on two they lean with the bike
    const chassis = spec.track === 0 ? body : base
    // A bike's front wheel is held by a fork the model does not turn, so show less lock.
    const lock = spec.track === 0 ? 0.45 : 1
    const mounts = view.model.wheels
    for (let w = 0; w < mounts.length; w++) {
      const mount = mounts[w]
      position.set(mount.x, spec.wheelRadius, -mount.forward)
      quaternion.setFromEuler(euler.set(-this.spin[id], 0, 0))
      if (mount.steers && state.steerAngle !== 0) {
        // Steering right is a clockwise turn seen from above: negative about the y axis.
        turn.setFromEuler(euler.set(0, -state.steerAngle * lock, 0))
        quaternion.premultiply(turn)
      }
      scale.set(spec.wheelWidth, spec.wheelRadius * 2, spec.wheelRadius * 2)
      local.compose(position, quaternion, scale)
      world.multiplyMatrices(chassis, local)
      world.toArray(this.wheels.instanceMatrix.array, (this.wheelSlot[id] + w) * 16)
    }

    // ---- the patch of shade underneath; nothing to lie on while in the air
    const airborne = !state.groundedFront && !state.groundedRear
    position.set(0, SHADE_Y, 0)
    scale.set(
      airborne ? 0 : spec.width + SHADE_SPREAD,
      1,
      airborne ? 0 : spec.length + SHADE_SPREAD,
    )
    local.compose(position, quaternion.identity(), scale)
    world.multiplyMatrices(base, local)
    world.toArray(this.shade.instanceMatrix.array, this.shadeSlot[id] * 16)
  }
}

/** Mark the first `count` items of an instanced attribute for upload. */
function flag(attribute: InstancedBufferAttribute, count: number): void {
  if (count <= 0) return
  attribute.clearUpdateRanges()
  attribute.addUpdateRange(0, count * attribute.itemSize)
  attribute.needsUpdate = true
}
