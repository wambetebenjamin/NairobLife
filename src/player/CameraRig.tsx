/**
 * The camera.
 *
 *  - Menu: a slow orbit around KICC, as a living backdrop.
 *  - Third person: orbits a point over the player's shoulder. A ball is swept from the
 *    player towards the camera, and the camera stops where the ball first touches the
 *    world, so it never ends up inside a wall.
 *  - First person: sits at eye height.
 *
 * Must live inside <Physics> (it queries the collision world), and runs after the
 * player has been placed for the frame.
 *
 * TODO(vehicles): a chase camera for Phase 2, wider and springier than this one.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import { useMemo, useRef } from 'react'
import { MathUtils, Vector3, type PerspectiveCamera } from 'three'
import { CAMERA, PLAYER } from '../config/game'
import { clamp, damp } from '../core/math'
import { input } from '../input/input'
import { useGame } from '../state/gameStore'
import { runtime } from '../state/runtime'
import { NOT_PLAYER_GROUPS } from '../world/physics/groups'
import { pivotHeight } from './rig'

/** Radius of the ball swept from player to camera; a bit more than the near plane. */
const PROBE_RADIUS = 0.24
const NO_ROTATION = { x: 0, y: 0, z: 0, w: 1 }
const FIRST_PERSON_PITCH = 1.45

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
    orbit: ORBIT.startAngle,
    fov: CAMERA.fov as number,
  }).current
  const pivot = useMemo(() => new Vector3(), [])
  const back = useMemo(() => new Vector3(), [])
  const target = useMemo(() => new Vector3(), [])

  /** Sweep the probe from `from` along `direction`; returns how far it can travel. */
  const sweep = (from: Vector3, direction: Vector3, distance: number): number => {
    const hit = world.castShape(
      from,
      NO_ROTATION,
      direction,
      probe,
      0,
      distance,
      false,
      rapier.QueryFilterFlags.EXCLUDE_SENSORS,
      NOT_PLAYER_GROUPS,
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

    // ------------------------------------------------------------- look input
    if (game.phase === 'playing') {
      const look = input.consumeLook()
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
    cam.pitch = firstPerson
      ? clamp(cam.pitch, -FIRST_PERSON_PITCH, FIRST_PERSON_PITCH)
      : clamp(cam.pitch, CAMERA.minPitch, CAMERA.maxPitch)

    // A hard landing dips the camera briefly.
    const thump = p.landingImpact * 0.3 * Math.exp(-p.landedAgo * 9) * Math.cos(p.landedAgo * 16)

    // Field of view opens up a little at a sprint.
    const sprint = clamp((p.speed - PLAYER.jogSpeed) / (PLAYER.sprintSpeed - PLAYER.jogSpeed), 0, 1)
    rig.fov = damp(rig.fov, CAMERA.fov + CAMERA.sprintFovKick * sprint, 6, dt)
    setFov(camera, rig.fov)

    // ------------------------------------------------------------- first person
    if (firstPerson) {
      const eye = p.crouching ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight
      rig.height = damp(rig.height, eye, 14, dt)
      // Slightly ahead of the body's centre, where the eyes are.
      camera.position.set(
        p.x - Math.sin(cam.yaw) * 0.08,
        p.y + rig.height - thump,
        p.z - Math.cos(cam.yaw) * 0.08,
      )
      camera.rotation.set(-cam.pitch, cam.yaw, 0, 'YXZ')
      return
    }

    // ------------------------------------------------------------- third person
    rig.height = damp(rig.height, pivotHeight(p.crouching), 12, dt)
    pivot.set(p.x, p.y + rig.height - thump, p.z)

    // Step sideways to the shoulder, as far as the world allows.
    back.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw))
    const shoulder = Math.min(CAMERA.shoulder, sweep(pivot, back, CAMERA.shoulder))
    rig.shoulder = shoulder < rig.shoulder ? shoulder : damp(rig.shoulder, shoulder, 6, dt)
    pivot.addScaledVector(back, rig.shoulder)

    // Then back and up from there, as far as the world allows.
    const cosPitch = Math.cos(cam.pitch)
    back.set(Math.sin(cam.yaw) * cosPitch, Math.sin(cam.pitch), Math.cos(cam.yaw) * cosPitch)
    const free = sweep(pivot, back, cam.distance)
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
