/**
 * Every vehicle in the zone: where each one is, which are moving, and what they collide
 * with.
 *
 * A few hundred vehicles stand parked around the city, and almost all of them stay that
 * way. So a vehicle is *asleep* until someone gets in or something hits it: asleep, it
 * is just a box in the collision world and costs nothing per frame. Awake, it is run
 * through the driving model (sim/vehicleSim.ts) on every physics step, and goes back to
 * sleep once it has stood still for a moment.
 *
 * Each vehicle's collision box is a plain collider with no rigid body behind it. Rapier
 * never moves it; we do, after every step. That keeps the physics engine's own work at
 * zero for the whole fleet, and lets the player on foot, the camera and other vehicles
 * all bump into a car without any of them knowing how cars work.
 *
 * No React and no three.js in here: the tests drive a fleet in plain Node.
 *
 * TODO(traffic): Phase 3 gives awake vehicles a driver other than the player. `step`
 * already takes the input as an argument; an AI driver is another source of it.
 * TODO(multiplayer): vehicle ids are stable and state is plain numbers, so a snapshot of
 * `awake` is what the server would send.
 */
import type { Collider, World } from '@dimforge/rapier3d-compat'
import { PLAYER } from '../config/game'
import {
  BODA_PAINT,
  CAR_PAINT,
  MATATU_PAINT,
  VEHICLES,
  type VehicleKind,
  type VehicleSpec,
} from '../config/vehicles'
import { lerp, wrapAngle } from '../core/math'
import { hexToLinear, type RGB } from '../world/geometry/palette'
import { NOT_PLAYER_GROUPS, VEHICLE_GROUPS } from '../world/physics/groups'
import type { Placement } from './placement'
import { createRapierSurroundings, type RapierSurroundings } from './sim/rapierSurroundings'
import {
  PARKED,
  createVehicleState,
  isAtRest,
  stepVehicle,
  type DriveInput,
  type Movable,
  type VehicleState,
} from './sim/vehicleSim'

/** The parts of the Rapier module the fleet uses. The browser and the tests both supply it. */
type RapierModule = Pick<
  typeof import('@dimforge/rapier3d-compat'),
  'Ray' | 'QueryFilterFlags' | 'ColliderDesc' | 'Capsule' | 'Ball'
>

/** Where a vehicle is: the road under its middle, its heading, and the slope it sits on. */
export interface Pose {
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
}

export interface Vehicle {
  /** Position in `Fleet.vehicles`. Stable for as long as the zone is loaded. */
  readonly id: number
  readonly kind: VehicleKind
  readonly spec: VehicleSpec
  /** Paint, as linear RGB. */
  readonly paint: RGB
  /** Matatus: the route or SACCO of the stage it was parked at. */
  readonly label?: string
  readonly state: VehicleState
  /** Where it was one physics step ago. The view draws somewhere between this and `state`. */
  readonly previous: Pose
  /** Being simulated. A parked vehicle sleeps until someone gets in or something hits it. */
  awake: boolean
  /** Physics steps in a row that it has been standing still. */
  restSteps: number
  readonly collider: Collider
}

const PAINT: Record<VehicleKind, readonly string[]> = {
  car: CAR_PAINT,
  boda: BODA_PAINT,
  matatu: MATATU_PAINT,
}

/** Gap between the road and the bottom of the collision box, so it clears kerbs and ramp feet. */
const BOX_LIFT = 0.18
/** A vehicle that has stood still for this many steps (half a second) goes back to sleep. */
const STEPS_TO_SLEEP = 30

/** Stepping out: the ground may be this much higher or lower than the road under the vehicle. */
const EXIT_STEP_UP = 0.7
const EXIT_DROP = 1.3
const NO_ROTATION = { x: 0, y: 0, z: 0, w: 1 }

export class Fleet {
  readonly vehicles: Vehicle[] = []
  /** The vehicles being simulated right now: the driven one and any still rolling. */
  readonly awake: Vehicle[] = []
  /** Goes up whenever a vehicle wakes or falls asleep, so the view knows to look again. */
  revision = 0
  /** Physics steps taken so far. */
  ticks = 0

  private readonly world: World
  private readonly rapier: RapierModule
  private readonly surroundings: RapierSurroundings
  private readonly movables: Movable[] = []
  private readonly ray: InstanceType<RapierModule['Ray']>
  private readonly standing: InstanceType<RapierModule['Capsule']>
  private readonly probe: InstanceType<RapierModule['Ball']>

  constructor(world: World, rapier: RapierModule, placements: readonly Placement[]) {
    this.world = world
    this.rapier = rapier
    this.ray = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })
    this.standing = new rapier.Capsule(PLAYER.height / 2 - PLAYER.radius, PLAYER.radius)
    this.probe = new rapier.Ball(0.22)

    const owners = new Map<number, number>()
    placements.forEach((placement, id) => {
      const spec = VEHICLES[placement.kind]
      const colours = PAINT[placement.kind]
      const collider = world.createCollider(
        rapier.ColliderDesc.cuboid(
          spec.width / 2,
          (spec.height - BOX_LIFT) / 2,
          spec.length / 2,
        ).setCollisionGroups(VEHICLE_GROUPS),
      )
      const state = createVehicleState(placement.x, 0, placement.z, placement.yaw)
      const vehicle: Vehicle = {
        id,
        kind: placement.kind,
        spec,
        paint: hexToLinear(colours[placement.paint % colours.length]),
        label: placement.label,
        state,
        previous: { x: state.x, y: state.y, z: state.z, yaw: state.yaw, pitch: 0 },
        awake: false,
        restSteps: 0,
        collider,
      }
      this.vehicles.push(vehicle)
      owners.set(collider.handle, id)
      // How this vehicle looks to another one that runs into it.
      this.movables.push({
        mass: spec.mass,
        get vx() {
          return state.vx
        },
        get vz() {
          return state.vz
        },
        shove: (dvx, dvz) => {
          state.vx += dvx
          state.vz += dvz
          this.wake(vehicle)
        },
      })
      this.placeCollider(vehicle)
    })

    this.surroundings = createRapierSurroundings(world, rapier, {
      bodies: owners,
      movable: (id) => this.movables[id],
    })
  }

  /** Start simulating a vehicle. Safe to call on one that is already awake. */
  wake(vehicle: Vehicle): void {
    vehicle.restSteps = 0
    if (vehicle.awake) return
    vehicle.awake = true
    rememberPose(vehicle)
    this.awake.push(vehicle)
    this.revision++
  }

  /**
   * Advance every awake vehicle by one physics step.
   *
   * Call it once before each step of the physics world, never twice in a row.
   *
   * @param driven  id of the vehicle the player is driving, or -1
   * @param input   what the driver is asking for; everything else is parked
   */
  step(dt: number, driven: number, input: DriveInput): void {
    // Rapier can only answer "what is near this point" once the world has been stepped
    // with these collision boxes in it. Asked sooner it does not merely miss: it
    // crashes. Every call here is followed by a world step, so sit the first one out.
    if (this.ticks++ === 0) return
    const awake = this.awake
    // A knock during the loop can wake another vehicle, which joins the end of the list
    // and is stepped in this same pass.
    for (let i = 0; i < awake.length; i++) {
      const vehicle = awake[i]
      const state = vehicle.state
      rememberPose(vehicle)
      this.surroundings.ignore(vehicle.collider)
      stepVehicle(
        state,
        vehicle.spec,
        vehicle.id === driven ? input : PARKED,
        this.surroundings,
        dt,
      )
      if (!Number.isFinite(state.x + state.y + state.z + state.yaw)) {
        // Should never happen; if it does, a car vanishing is better than the game ending.
        this.reset(vehicle)
      }
      this.placeCollider(vehicle)
      vehicle.restSteps = vehicle.id !== driven && isAtRest(state) ? vehicle.restSteps + 1 : 0
    }
    this.surroundings.ignore(undefined)

    for (let i = awake.length - 1; i >= 0; i--) {
      const vehicle = awake[i]
      if (vehicle.restSteps < STEPS_TO_SLEEP) continue
      const state = vehicle.state
      state.vx = state.vz = state.yawRate = 0
      state.speed = state.slide = state.accelLong = state.accelLat = 0
      state.braking = false
      rememberPose(vehicle)
      vehicle.awake = false
      awake[i] = awake[awake.length - 1]
      awake.pop()
      this.revision++
    }
  }

  /** Where a vehicle should be drawn, `alpha` of the way from the last step to this one. */
  pose(vehicle: Vehicle, alpha: number, out: Pose): Pose {
    const from = vehicle.previous
    const to = vehicle.state
    out.x = lerp(from.x, to.x, alpha)
    out.y = lerp(from.y, to.y, alpha)
    out.z = lerp(from.z, to.z, alpha)
    out.yaw = wrapAngle(from.yaw + wrapAngle(to.yaw - from.yaw) * alpha)
    out.pitch = lerp(from.pitch, to.pitch, alpha)
    return out
  }

  /**
   * The vehicle whose bodywork is nearest to a point, if any is within `reach` metres
   * and on the same level (not on the flyover overhead).
   */
  nearest(x: number, y: number, z: number, reach: number): Vehicle | undefined {
    let best: Vehicle | undefined
    let bestDistance = reach
    for (const vehicle of this.vehicles) {
      const { spec, state } = vehicle
      const dx = x - state.x
      const dz = z - state.z
      const limit = reach + spec.length
      if (dx > limit || dx < -limit || dz > limit || dz < -limit) continue
      if (Math.abs(y - state.y) > 1.6) continue
      // Into the vehicle's own frame: how far ahead of its centre, how far to its right.
      const sin = Math.sin(state.yaw)
      const cos = Math.cos(state.yaw)
      const ahead = Math.abs(-dx * sin - dz * cos) - spec.length / 2
      const across = Math.abs(dx * cos - dz * sin) - spec.width / 2
      const distance = Math.hypot(Math.max(ahead, 0), Math.max(across, 0))
      if (distance < bestDistance) {
        bestDistance = distance
        best = vehicle
      }
    }
    return best
  }

  /**
   * Somewhere to stand when getting out: by the driver's door if there is room, then
   * the other side, then behind, then in front. Null if the vehicle is boxed in.
   */
  exitSpot(vehicle: Vehicle): { x: number; y: number; z: number } | null {
    const { spec, state } = vehicle
    const flags = this.rapier.QueryFilterFlags.EXCLUDE_SENSORS
    const forwardX = -Math.sin(state.yaw)
    const forwardZ = -Math.cos(state.yaw)
    const rightX = Math.cos(state.yaw)
    const rightZ = -Math.sin(state.yaw)
    const seat = spec.eye[2]
    const clear = spec.length / 2 + PLAYER.radius + 0.4
    const spots: [right: number, ahead: number][] = [
      [spec.door, seat],
      [-spec.door, seat],
      [0, -clear],
      [0, clear],
    ]
    const chest = { x: state.x + forwardX * seat, y: state.y + 1, z: state.z + forwardZ * seat }
    for (const [right, ahead] of spots) {
      const x = state.x + rightX * right + forwardX * ahead
      const z = state.z + rightZ * right + forwardZ * ahead

      // Nothing in the way between the seat and the spot: no wall, no other vehicle.
      const dx = x - chest.x
      const dz = z - chest.z
      const distance = Math.hypot(dx, dz)
      if (distance > 1e-3) {
        const blocked = this.world.castShape(
          chest,
          NO_ROTATION,
          { x: dx / distance, y: 0, z: dz / distance },
          this.probe,
          0,
          distance,
          true,
          flags,
          NOT_PLAYER_GROUPS,
          vehicle.collider,
        )
        if (blocked) continue
      }

      // Ground to stand on, about level with the road under the vehicle.
      this.ray.origin.x = x
      this.ray.origin.y = state.y + EXIT_STEP_UP
      this.ray.origin.z = z
      const ground = this.world.castRay(
        this.ray,
        EXIT_STEP_UP + EXIT_DROP,
        true,
        flags,
        NOT_PLAYER_GROUPS,
      )
      if (!ground) continue
      const y = state.y + EXIT_STEP_UP - ground.timeOfImpact

      // And room for a person to stand there.
      const centre = { x, y: y + PLAYER.height / 2 + 0.08, z }
      if (
        this.world.intersectionWithShape(
          centre,
          NO_ROTATION,
          this.standing,
          flags,
          NOT_PLAYER_GROUPS,
        )
      ) {
        continue
      }
      return { x, y: y + 0.03, z }
    }
    return null
  }

  /** Remove every vehicle's collision box. Call when the zone unloads. */
  dispose(): void {
    for (const vehicle of this.vehicles) {
      // The whole world may already be gone if the physics shut down first.
      try {
        this.world.removeCollider(vehicle.collider, false)
      } catch {
        /* world already freed */
      }
    }
    this.vehicles.length = 0
    this.awake.length = 0
  }

  /** Put a vehicle back where it was a step ago, standing still. */
  private reset(vehicle: Vehicle): void {
    const fresh = createVehicleState(
      vehicle.previous.x,
      vehicle.previous.y,
      vehicle.previous.z,
      vehicle.previous.yaw,
    )
    Object.assign(vehicle.state, fresh)
  }

  /** Move the collision box to where the vehicle now is: turned to its heading, tipped to the slope. */
  private placeCollider(vehicle: Vehicle): void {
    const { state, spec, collider } = vehicle
    const halfYaw = state.yaw / 2
    const halfPitch = state.pitch / 2
    const sinYaw = Math.sin(halfYaw)
    const cosYaw = Math.cos(halfYaw)
    const sinPitch = Math.sin(halfPitch)
    const cosPitch = Math.cos(halfPitch)
    translation.x = state.x
    translation.y = state.y + BOX_LIFT + (spec.height - BOX_LIFT) / 2
    translation.z = state.z
    // Yaw about the vertical, then pitch about the vehicle's own sideways axis.
    rotation.x = cosYaw * sinPitch
    rotation.y = sinYaw * cosPitch
    rotation.z = -sinYaw * sinPitch
    rotation.w = cosYaw * cosPitch
    collider.setTranslation(translation)
    collider.setRotation(rotation)
  }
}

const translation = { x: 0, y: 0, z: 0 }
const rotation = { x: 0, y: 0, z: 0, w: 1 }

function rememberPose(vehicle: Vehicle): void {
  const { previous, state } = vehicle
  previous.x = state.x
  previous.y = state.y
  previous.z = state.z
  previous.yaw = state.yaw
  previous.pitch = state.pitch
}
