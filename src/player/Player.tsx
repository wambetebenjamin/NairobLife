/**
 * The player on foot.
 *
 * Physics: a capsule moved by Rapier's kinematic character controller. Each fixed
 * physics step we turn input into a wanted movement, and the controller works out how
 * far the capsule can actually go: sliding along walls, walking up kerbs and stairs,
 * sticking to ramps. We keep our own velocity so that jumping, gravity and
 * acceleration feel the way we choose rather than the way a rigid body would.
 *
 * Rendering reads runtime.player, which this component fills in every frame.
 *
 * At the wheel (runtime.driving, see vehicles/driving.ts) none of that runs. The capsule
 * is carried along inside the vehicle, touching nothing, so that getting out is one step
 * to the side; the fleet fills in runtime.player instead.
 */
import type { KinematicCharacterController } from '@dimforge/rapier3d-compat'
import { useFrame } from '@react-three/fiber'
import {
  CapsuleCollider,
  RigidBody,
  useAfterPhysicsStep,
  useBeforePhysicsStep,
  useRapier,
  type RapierCollider,
  type RapierRigidBody,
} from '@react-three/rapier'
import { useEffect, useMemo, useRef } from 'react'
import { Vector3, type Group } from 'three'
import { CAMERA, PLAYER } from '../config/game'
import { clamp, dampAngle } from '../core/math'
import { input } from '../input/input'
import { useGame } from '../state/gameStore'
import { runtime, type TeleportRequest } from '../state/runtime'
import { endDriving } from '../vehicles/driving'
import { NOT_PLAYER_GROUPS, PLAYER_GROUPS } from '../world/physics/groups'
import { PlayerModel } from './PlayerModel'

/** Gap the controller keeps between the capsule and the world, in metres. */
const SKIN = 0.02
const TERMINAL_SPEED = 55
/** Fall this far below the ground and you are put back where you last stood. */
const VOID_Y = -30

const UP = { x: 0, y: 1, z: 0 }
const DOWN = { x: 0, y: -1, z: 0 }
const NO_ROTATION = { x: 0, y: 0, z: 0, w: 1 }

const halfHeightFor = (height: number) => height / 2 - PLAYER.radius

/** @param start where a new game begins; the body is created there */
export function Player({ start }: { start: TeleportRequest }) {
  const { rapier, world } = useRapier()
  const body = useRef<RapierRigidBody>(null)
  const collider = useRef<RapierCollider>(null)
  const visual = useRef<Group>(null)
  const controller = useRef<KinematicCharacterController | null>(null)

  /** Simulation state that only the physics step touches. */
  const sim = useRef({
    vx: 0,
    vy: 0,
    vz: 0,
    grounded: false,
    /** Seconds since we last stood on something. */
    sinceGrounded: 1,
    /** Seconds since jump was pressed. */
    sinceJumpPressed: 1,
    crouching: false,
    steps: 0,
    safe: { x: start.x, y: 0, z: start.z },
  }).current

  useEffect(() => {
    const c = world.createCharacterController(SKIN)
    c.setUp(UP)
    c.setSlideEnabled(true)
    c.enableAutostep(PLAYER.stepHeight, 0.15, true)
    c.enableSnapToGround(0.35)
    c.setMaxSlopeClimbAngle((PLAYER.maxSlopeDeg * Math.PI) / 180)
    c.setMinSlopeSlideAngle(((PLAYER.maxSlopeDeg + 5) * Math.PI) / 180)
    // Lets the player shove loose objects once there are any.
    c.setApplyImpulsesToDynamicBodies(true)
    controller.current = c
    return () => {
      controller.current = null
      try {
        world.removeCharacterController(c)
      } catch {
        /* world already freed */
      }
    }
  }, [world])

  useEffect(() => {
    runtime.player.x = start.x
    runtime.player.y = 0
    runtime.player.z = start.z
    runtime.player.yaw = start.yaw
    runtime.camera.yaw = start.yaw
    runtime.camera.pitch = start.pitch ?? CAMERA.startPitch
    runtime.teleport = start
  }, [start])

  useBeforePhysicsStep((physics) => {
    const b = body.current
    const col = collider.current
    const c = controller.current
    if (!b || !col || !c) return
    const dt = physics.timestep
    const p = runtime.player

    // ------------------------------------------------------------- teleport
    // Ray casts only see colliders after the world has stepped once, hence the guard.
    const request = runtime.teleport
    if (request && sim.steps > 0) {
      runtime.teleport = null
      // Arriving somewhere on foot means leaving any vehicle where it stands.
      endDriving()
      let y = request.y
      if (y === undefined) {
        const from = request.onTop ? 600 : 2.5
        const ray = new rapier.Ray({ x: request.x, y: from, z: request.z }, DOWN)
        const hit = physics.castRay(ray, from + 20, true, undefined, NOT_PLAYER_GROUPS)
        y = (hit ? Math.max(0, from - hit.timeOfImpact) : 0) + 0.05
        runtime.camera.yaw = request.yaw
        // From a rooftop, look down over the city; otherwise look where the landmark says.
        runtime.camera.pitch = request.pitch ?? (request.onTop ? 0.3 : CAMERA.startPitch)
      }
      b.setTranslation({ x: request.x, y, z: request.z }, true)
      sim.vx = sim.vy = sim.vz = 0
      sim.safe = { x: request.x, y, z: request.z }
      p.yaw = request.yaw
      return
    }

    // ------------------------------------------------------------- at the wheel
    if (runtime.driving >= 0) {
      if (sim.crouching) {
        sim.crouching = false
        col.setHalfHeight(halfHeightFor(PLAYER.height))
        col.setTranslationWrtParent({ x: 0, y: PLAYER.height / 2, z: 0 })
      }
      // Ride along. Nothing the vehicle or the camera looks for can see this capsule
      // (see physics/groups.ts), so it is free to sit inside the bodywork.
      b.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z })
      sim.vx = sim.vy = sim.vz = 0
      sim.safe = { x: p.x, y: p.y, z: p.z }
      return
    }

    // ------------------------------------------------------------- crouch
    const wantsCrouch = input.crouch()
    if (wantsCrouch !== sim.crouching) {
      let allowed = true
      if (!wantsCrouch) {
        // Standing up needs headroom: test a ball where the head would be.
        const at = b.translation()
        const head = { x: at.x, y: at.y + PLAYER.height - PLAYER.radius, z: at.z }
        const ball = new rapier.Ball(PLAYER.radius - 0.03)
        allowed = !physics.intersectionWithShape(
          head,
          NO_ROTATION,
          ball,
          undefined,
          NOT_PLAYER_GROUPS,
        )
      }
      if (allowed) {
        sim.crouching = wantsCrouch
        const height = wantsCrouch ? PLAYER.crouchHeight : PLAYER.height
        const at = b.translation()
        col.setHalfHeight(halfHeightFor(height))
        // Keep the capsule's feet where they are. The offset from the body only takes
        // effect on the next physics step, but the move below reads the capsule's place
        // in the world right now, so that is set by hand as well. Without it the capsule
        // hangs in the air for one step and the character drops a few centimetres.
        col.setTranslationWrtParent({ x: 0, y: height / 2, z: 0 })
        col.setTranslation({ x: at.x, y: at.y + height / 2, z: at.z })
      }
    }

    // ------------------------------------------------------------- wanted velocity
    const move = input.move()
    const moving = move.x !== 0 || move.y !== 0
    const sprinting = input.sprint() && !sim.crouching && move.y > 0.1
    const topSpeed = sim.crouching
      ? PLAYER.crouchSpeed
      : sprinting
        ? PLAYER.sprintSpeed
        : PLAYER.jogSpeed

    // Movement is relative to where the camera looks: forward is "into the screen".
    const yaw = runtime.camera.yaw
    const forwardX = -Math.sin(yaw)
    const forwardZ = -Math.cos(yaw)
    const rightX = Math.cos(yaw)
    const rightZ = -Math.sin(yaw)
    const wantX = (forwardX * move.y + rightX * move.x) * topSpeed
    const wantZ = (forwardZ * move.y + rightZ * move.x) * topSpeed

    // Close the gap between current and wanted velocity at a fixed rate.
    const accel = (sim.grounded ? PLAYER.groundAccel : PLAYER.airAccel) * dt
    const dvx = wantX - sim.vx
    const dvz = wantZ - sim.vz
    const gap = Math.hypot(dvx, dvz)
    if (gap <= accel) {
      sim.vx = wantX
      sim.vz = wantZ
    } else {
      sim.vx += (dvx / gap) * accel
      sim.vz += (dvz / gap) * accel
    }

    // ------------------------------------------------------------- jump and gravity
    sim.sinceJumpPressed = input.consumeJump() ? 0 : sim.sinceJumpPressed + dt
    sim.sinceGrounded = sim.grounded ? 0 : sim.sinceGrounded + dt

    if (sim.grounded && sim.vy <= 0) {
      // A small downward push keeps us glued to slopes and lets the controller see the ground.
      sim.vy = -2
    } else {
      sim.vy = Math.max(-TERMINAL_SPEED, sim.vy - PLAYER.gravity * dt)
    }
    let jumped = false
    if (
      sim.sinceJumpPressed < PLAYER.jumpBuffer &&
      sim.sinceGrounded < PLAYER.coyoteTime &&
      !sim.crouching
    ) {
      sim.vy = PLAYER.jumpSpeed
      sim.sinceJumpPressed = 1
      sim.sinceGrounded = 1
      jumped = true
    }

    // ------------------------------------------------------------- move
    const fallSpeed = -sim.vy
    c.computeColliderMovement(
      col,
      { x: sim.vx * dt, y: sim.vy * dt, z: sim.vz * dt },
      rapier.QueryFilterFlags.EXCLUDE_SENSORS,
    )
    const moved = c.computedMovement()
    const wasGrounded = sim.grounded
    sim.grounded = !jumped && c.computedGrounded()

    const at = b.translation()
    const next = { x: at.x + moved.x, y: at.y + moved.y, z: at.z + moved.z }
    b.setNextKinematicTranslation(next)

    // If a wall stopped us, forget the speed we did not get to use.
    const actualX = moved.x / dt
    const actualZ = moved.z / dt
    if (Math.abs(actualX) < Math.abs(sim.vx)) sim.vx = actualX
    if (Math.abs(actualZ) < Math.abs(sim.vz)) sim.vz = actualZ
    // Bumped our head: stop rising.
    if (sim.vy > 0 && moved.y < sim.vy * dt * 0.5) sim.vy = 0

    if (sim.grounded && !wasGrounded && fallSpeed > PLAYER.hardLandingSpeed) {
      p.landedAgo = 0
      p.landingImpact = clamp((fallSpeed - PLAYER.hardLandingSpeed) / 25, 0.15, 1)
    }
    if (sim.grounded) sim.safe = next
    if (next.y < VOID_Y) {
      b.setTranslation(sim.safe, true)
      sim.vx = sim.vy = sim.vz = 0
    }

    p.speed = Math.hypot(actualX, actualZ)
    p.verticalSpeed = sim.grounded ? 0 : sim.vy
    p.grounded = sim.grounded
    p.crouching = sim.crouching
    p.sprinting = sprinting && moving
  })

  useAfterPhysicsStep(() => {
    sim.steps++
  })

  // Runs after the physics has placed the body for this frame (see GameCanvas).
  const position = useMemo(() => new Vector3(), [])
  useFrame((_, delta) => {
    // At the wheel the fleet reports where the player is. And with a teleport waiting,
    // the capsule is about to be somewhere else: do not report where it was.
    if (runtime.driving >= 0 || runtime.teleport) return
    const p = runtime.player
    if (visual.current) {
      visual.current.getWorldPosition(position)
      p.x = position.x
      p.y = position.y
      p.z = position.z
    }
    p.landedAgo += delta

    // Face the way we are moving; in first person, face the way we are looking.
    const firstPerson = useGame.getState().settings.cameraMode === 'first'
    if (firstPerson) {
      p.yaw = runtime.camera.yaw
    } else if (p.speed > 0.4) {
      const heading = Math.atan2(-sim.vx, -sim.vz)
      p.yaw = dampAngle(p.yaw, heading, 14, delta)
    }
  }, -20)

  return (
    <>
      <RigidBody
        ref={body}
        type="kinematicPosition"
        colliders={false}
        position={[start.x, 0.05, start.z]}
        enabledRotations={[false, false, false]}
      >
        <CapsuleCollider
          ref={collider}
          args={[halfHeightFor(PLAYER.height), PLAYER.radius]}
          position={[0, PLAYER.height / 2, 0]}
          collisionGroups={PLAYER_GROUPS}
        />
        {/* Marks the feet. The physics moves it smoothly between steps; we read it back above. */}
        <group ref={visual} />
      </RigidBody>
      {/* The figure stands wherever runtime.player says, which may be on a boda's seat. */}
      <PlayerModel />
    </>
  )
}
