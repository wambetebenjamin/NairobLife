/**
 * The camera.
 *
 *  - Menu: a slow orbit around KICC, as a living backdrop.
 *  - Third person: orbits a point over the player's shoulder. A ball is swept from the
 *    player towards the camera, and the camera stops where the ball first touches the
 *    world, so it never ends up inside a wall.
 *  - First person: sits at eye height.
 *  - At the wheel: the same orbit, further back and centred on the vehicle. Leave the
 *    mouse alone and it swings round behind the vehicle, a beat late in the corners so
 *    you see the car turn. In first person it rides on the bonnet (or at the rider's
 *    head on a boda) and turns with the vehicle.
 *
 * Must live inside <Physics> (it queries the collision world), and runs after the
 * player and the vehicles have been placed for the frame.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import { useMemo, useRef } from 'react'
import { MathUtils, Vector3, type PerspectiveCamera } from 'three'
import { CAMERA, PLAYER } from '../config/game'
import { DRIVING, VEHICLES } from '../config/vehicles'
import { clamp, damp, dampAngle, wrapAngle } from '../core/math'
import { input } from '../input/input'
import { useGame } from '../state/gameStore'
import { runtime } from '../state/runtime'
import { NOT_PLAYER_GROUPS, WORLD_ONLY_GROUPS } from '../world/physics/groups'
import { pivotHeight } from './rig'

/** Radius of the ball swept from player to camera; a bit more than the near plane. */
const PROBE_RADIUS = 0.24
const NO_ROTATION = { x: 0, y: 0, z: 0, w: 1 }
const FIRST_PERSON_PITCH = 1.45

/** Chase camera: where it settles when left alone, in radians of elevation. */
const CHASE_PITCH = 0.17
/** How much of a hill's slope the chase camera tips with, so the road ahead stays in view. */
const CHASE_SLOPE = 0.7
/** Share of a boda's lean that the driver's-eye view tips by. All of it is seasickness. */
const EYE_LEAN = 0.5
/** How quickly the view glides from the player to the vehicle and back, per second. */
const HANDOVER = 7

/** Menu orbit: centre on KICC, far enough out to take in the skyline. */
const ORBIT = { radius: 560, height: 150, lookHeight: 62, speed: 0.022, startAngle: 2.75 }

export function CameraRig() {
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const { rapier, world } = useRapier()
  const probe = useMemo(() => new rapier.Ball(PROBE_RADIUS), [rapier])

  const rig = useRef({
    height: CAMERA.targetHeight as number,
    shoulder: CAMERA.shoulder as number,
    /** Actual distance from pivot to camera after collision; runtime.camera.distance is the wanted one. */
    distance: CAMERA.distance as number,
    /** How far back the camera is trying to be; eases between the on-foot and chase distances. */
    reach: CAMERA.distance as number,
    orbit: ORBIT.startAngle,
    fov: CAMERA.fov as number,
    /** Seconds since the player last moved the view by hand. */
    sinceLook: 10,
    driving: false,
    /** The vehicle's heading last frame, to turn the driver's-eye view with it. */
    vehicleYaw: 0,
    /** Whether last frame's third-person pivot was on a vehicle, to spot the handover. */
    wasDriving: false,
    /** Just got in: still swinging round behind the vehicle. */
    settling: false,
  }).current
  const pivot = useMemo(() => new Vector3(), [])
  const back = useMemo(() => new Vector3(), [])
  const target = useMemo(() => new Vector3(), [])
  /** Where the pivot was last frame, and what is left of the glide from there. */
  const lastPivot = useMemo(() => new Vector3(), [])
  const glide = useMemo(() => new Vector3(), [])

  /** Sweep the probe from `from` along `direction`; returns how far it can travel. */
  const sweep = (from: Vector3, direction: Vector3, distance: number, groups: number): number => {
    const hit = world.castShape(
      from,
      NO_ROTATION,
      direction,
      probe,
      0,
      distance,
      false,
      rapier.QueryFilterFlags.EXCLUDE_SENSORS,
      groups,
    )
    return hit ? Math.max(0, hit.time_of_impact) : distance
  }

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    const game = useGame.getState()
    const cam = runtime.camera
    const p = runtime.player

    // ------------------------------------------------------------- menu backdrop
    if (game.phase === 'menu' || game.phase === 'loading') {
      rig.orbit += dt * ORBIT.speed
      camera.position.set(
        Math.cos(rig.orbit) * ORBIT.radius,
        ORBIT.height,
        Math.sin(rig.orbit) * ORBIT.radius,
      )
      camera.lookAt(0, ORBIT.lookHeight, 0)
      setFov(camera, CAMERA.fov)
      rig.fov = CAMERA.fov
      return
    }

    const firstPerson = game.settings.cameraMode === 'first'
    const driving = runtime.driving >= 0
    const v = runtime.vehicle
    const spec = VEHICLES[v.kind]

    // ------------------------------------------------------------- look input
    let looked = false
    if (game.phase === 'playing') {
      const look = input.consumeLook()
      looked = look.x !== 0 || look.y !== 0
      const speed = game.settings.sensitivity
      cam.yaw = MathUtils.euclideanModulo(cam.yaw - look.x * speed + Math.PI, Math.PI * 2) - Math.PI
      cam.pitch += look.y * speed * (game.settings.invertY ? -1 : 1)
      const zoom = input.consumeZoom()
      if (zoom && !firstPerson) {
        cam.distance = clamp(
          cam.distance * Math.pow(1.12, zoom),
          CAMERA.minDistance,
          CAMERA.maxDistance,
        )
      }
    }
    rig.sinceLook = looked ? 0 : rig.sinceLook + dt

    // ------------------------------------------------------------- at the wheel
    if (driving !== rig.driving) {
      rig.driving = driving
      rig.vehicleYaw = v.yaw
      // Getting in: swing round behind the vehicle straight away, to show which way it faces.
      if (driving) {
        rig.sinceLook = DRIVING.cameraRecentre
        rig.settling = true
      }
    }
    if (driving) {
      const handsOff = rig.sinceLook >= DRIVING.cameraRecentre
      if (looked || Math.abs(wrapAngle(cam.yaw - v.yaw)) < 0.06) rig.settling = false
      if (firstPerson) {
        // The driver turns with the vehicle, and looks ahead again when the mouse rests.
        cam.yaw = wrapAngle(cam.yaw + wrapAngle(v.yaw - rig.vehicleYaw))
        if (handsOff) {
          cam.yaw = dampAngle(cam.yaw, v.yaw, 5, dt)
          cam.pitch = damp(cam.pitch, 0.04, 4, dt)
        }
      } else if (handsOff) {
        // Standing still, leave the view alone: it is the moment to look at the car.
        const follow = rig.settling
          ? DRIVING.cameraFollow
          : DRIVING.cameraFollow * clamp(Math.abs(v.speed) / 4, 0, 1)
        cam.yaw = dampAngle(cam.yaw, v.yaw, follow, dt)
        cam.pitch = damp(cam.pitch, CHASE_PITCH - v.pitch * CHASE_SLOPE, follow * 0.7, dt)
      }
      rig.vehicleYaw = v.yaw
    }
    cam.pitch = firstPerson
      ? clamp(cam.pitch, -FIRST_PERSON_PITCH, FIRST_PERSON_PITCH)
      : clamp(cam.pitch, CAMERA.minPitch, CAMERA.maxPitch)

    // A hard landing dips the camera briefly.
    const thump = p.landingImpact * 0.3 * Math.exp(-p.landedAgo * 9) * Math.cos(p.landedAgo * 16)

    // Field of view opens up at a sprint, and a good deal more at speed on the road.
    const kick = driving
      ? DRIVING.speedFovKick * clamp(Math.abs(v.speed) / spec.topSpeed, 0, 1)
      : CAMERA.sprintFovKick *
        clamp((p.speed - PLAYER.jogSpeed) / (PLAYER.sprintSpeed - PLAYER.jogSpeed), 0, 1)
    rig.fov = damp(rig.fov, CAMERA.fov + kick, driving ? 3 : 6, dt)
    setFov(camera, rig.fov)

    // ------------------------------------------------------------- first person
    if (firstPerson) {
      if (driving) {
        // The eye point: right of, above and ahead of the middle of the vehicle.
        const [right, up, ahead] = spec.eye
        const sin = Math.sin(v.yaw)
        const cos = Math.cos(v.yaw)
        // Leaning a bike over carries the rider's head sideways with it.
        const sideways = right - Math.sin(v.roll) * up
        camera.position.set(
          v.x + cos * sideways - sin * ahead,
          v.y + up * Math.cos(v.roll) + ahead * Math.sin(v.pitch) - thump,
          v.z - sin * sideways - cos * ahead,
        )
        camera.rotation.set(
          -cam.pitch + v.pitch * Math.cos(cam.yaw - v.yaw),
          cam.yaw,
          v.roll * EYE_LEAN,
          'YXZ',
        )
        lastPivot.copy(camera.position)
        return
      }
      const eye = p.crouching ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight
      rig.height = damp(rig.height, eye, 14, dt)
      // Slightly ahead of the body's centre, where the eyes are.
      camera.position.set(
        p.x - Math.sin(cam.yaw) * 0.08,
        p.y + rig.height - thump,
        p.z - Math.cos(cam.yaw) * 0.08,
      )
      camera.rotation.set(-cam.pitch, cam.yaw, 0, 'YXZ')
      lastPivot.copy(camera.position)
      return
    }

    // ------------------------------------------------------------- third person
    // Vehicles do not block the chase camera: squeezing past a parked car should not
    // make the view lurch. On foot they do, like any other wall.
    const groups = driving ? WORLD_ONLY_GROUPS : NOT_PLAYER_GROUPS
    if (driving) {
      rig.height = damp(rig.height, spec.camera.height, 8, dt)
      pivot.set(v.x, v.y + rig.height - thump, v.z)
      // A knock rattles the view for a moment.
      const rattle = Math.min(v.impact, 14) * 0.012 * Math.exp(-v.impactAgo * 7)
      if (rattle > 0.002) {
        pivot.x += Math.sin(v.impactAgo * 71) * rattle
        pivot.y += Math.cos(v.impactAgo * 57) * rattle
      }
      rig.shoulder = damp(rig.shoulder, 0, 8, dt)
    } else {
      rig.height = damp(rig.height, pivotHeight(p.crouching), 12, dt)
      pivot.set(p.x, p.y + rig.height - thump, p.z)
    }

    // Step sideways to the shoulder, as far as the world allows.
    back.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw))
    if (!driving) {
      const shoulder = Math.min(CAMERA.shoulder, sweep(pivot, back, CAMERA.shoulder, groups))
      rig.shoulder = shoulder < rig.shoulder ? shoulder : damp(rig.shoulder, shoulder, 6, dt)
    }
    pivot.addScaledVector(back, rig.shoulder)

    // Getting in or out moves the pivot a couple of metres at once: glide there instead.
    if (driving !== rig.wasDriving) {
      rig.wasDriving = driving
      glide.copy(lastPivot).sub(pivot)
      // A teleport is not a glide.
      if (glide.lengthSq() > 64) glide.set(0, 0, 0)
    }
    glide.multiplyScalar(Math.exp(-HANDOVER * dt))
    pivot.add(glide)
    lastPivot.copy(pivot)

    // Then back and up from there, as far as the world allows. The mouse wheel scales
    // the chase distance by as much as it scales the on-foot one.
    const wanted = driving ? spec.camera.distance * (cam.distance / CAMERA.distance) : cam.distance
    rig.reach = damp(rig.reach, wanted, 5, dt)
    const cosPitch = Math.cos(cam.pitch)
    back.set(Math.sin(cam.yaw) * cosPitch, Math.sin(cam.pitch), Math.cos(cam.yaw) * cosPitch)
    const free = sweep(pivot, back, rig.reach, groups)
    // Come in at once when blocked, drift back out when clear.
    rig.distance = free < rig.distance ? free : damp(rig.distance, free, 5, dt)
    runtime.cameraGap = rig.distance

    camera.position.copy(pivot).addScaledVector(back, rig.distance)
    target.copy(pivot).addScaledVector(back, -10)
    camera.lookAt(target)
  }, -10)

  return null
}

function setFov(camera: PerspectiveCamera, fov: number): void {
  if (Math.abs(camera.fov - fov) < 0.01) return
  camera.fov = fov
  camera.updateProjectionMatrix()
}
