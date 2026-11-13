import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { PLAYER } from '../config/game'

/**
 * The player's own legs.
 *
 * The driving tests run vehicles up kerbs and into walls, but nothing tested the thing the
 * player walks with: Rapier's kinematic character controller, configured exactly as
 * `player/Player.tsx` configures it. That makes "can the player get onto a kerb, and can
 * they be stopped by something they should not climb?" an untested claim in the docs.
 *
 * The setup here deliberately copies `Player.tsx` rather than approximating it, including
 * the per-step vertical motion: a character controller's autostep is sensitive to how far
 * it is asked to fall each step, and pushing it down by a large amount (as a falling body
 * would) changes the answer. A grounded player accumulates gravity only, so that is what
 * this simulates.
 */

const DT = 1 / 60
const SPEED = PLAYER.jogSpeed
const SKIN = 0.02
const UP = { x: 0, y: 1, z: 0 }

/** A flat world with one raised slab ahead, walked over at a jog. */
function walkOver(step: number): { climbed: number; reachedZ: number } {
  const world = new RAPIER.World({ x: 0, y: -PLAYER.gravity, z: 0 })
  world.createCollider(new RAPIER.ColliderDesc(new RAPIER.HalfSpace(UP)))
  if (step > 0) {
    // 60 m square, its near edge 5 m ahead, top exactly `step` above the ground.
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(30, step / 2, 30).setTranslation(0, step / 2, -35),
    )
  }

  const startY = PLAYER.height / 2 + 0.05
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, startY, 0),
  )
  const collider = world.createCollider(
    RAPIER.ColliderDesc.capsule(PLAYER.height / 2 - PLAYER.radius, PLAYER.radius),
    body,
  )

  const controller = world.createCharacterController(SKIN)
  controller.setUp(UP)
  controller.setSlideEnabled(true)
  controller.enableAutostep(PLAYER.stepHeight, 0.15, true)
  controller.enableSnapToGround(0.35)
  controller.setMaxSlopeClimbAngle((PLAYER.maxSlopeDeg * Math.PI) / 180)
  controller.setMinSlopeSlideAngle(((PLAYER.maxSlopeDeg + 5) * Math.PI) / 180)
  world.step()

  let y = startY
  let z = 0
  let vy = 0
  let climbed = 0
  for (let i = 0; i < 900; i++) {
    vy -= PLAYER.gravity * DT
    controller.computeColliderMovement(collider, { x: 0, y: vy * DT, z: -SPEED * DT })
    const moved = controller.computedMovement()
    if (controller.computedGrounded()) vy = 0
    y += moved.y
    z += moved.z
    climbed = Math.max(climbed, y - startY)
    body.setTranslation({ x: 0, y, z }, true)
    world.step()
  }
  world.free()
  return { climbed, reachedZ: z }
}

describe('the player on kerbs and ledges', () => {
  beforeAll(async () => {
    await RAPIER.init()
  })

  it('walks over a kerb without being stopped', () => {
    // The tallest pavement in the city is 0.2 m; real Nairobi kerbs are about 0.15 m.
    for (const step of [0.05, 0.1, 0.15, 0.2]) {
      const { climbed, reachedZ } = walkOver(step)
      // Up and over: the capsule ends higher than the slab and has crossed its near edge.
      expect(climbed, `a ${step} m kerb`).toBeGreaterThan(step - 0.02)
      expect(reachedZ, `a ${step} m kerb`).toBeLessThan(-6)
    }
  })

  it('has a step limit at PLAYER.stepHeight, measured either side of it', () => {
    // The interesting boundary is the configured one, not some arbitrary wall: below it the
    // player steps up, above it they do not, and both sides are tied to the constant so the
    // test fails if `stepHeight` is raised as well as if it is lowered.
    //
    // Measured, the real boundary is about 0.51 m for a 0.45 m step height: Rapier's
    // autostep also spends its step offset, and snap-to-ground pulls the capsule down onto
    // the ledge once it is over. So the comfortable case is checked just under the constant
    // and the stopped case a little above the measured boundary, not just above the
    // constant -- asserting 0.51 m against 0.45 m would be a fiction.
    const below = walkOver(PLAYER.stepHeight - 0.05)
    expect(below.climbed, 'a step under the limit').toBeGreaterThan(PLAYER.stepHeight - 0.08)
    expect(below.reachedZ).toBeLessThan(-6)

    const above = walkOver(PLAYER.stepHeight + 0.2)
    expect(above.climbed, 'a step over the limit').toBeLessThan(0.05)
    // Never gets past the near edge of the slab, which starts at z = -5.
    expect(above.reachedZ).toBeGreaterThan(-5.6)
  })

  it('is stopped by a loading dock, however high the step limit is', () => {
    // Independent of autostep: a chest-high ledge is a wall, not a step.
    const { climbed, reachedZ } = walkOver(PLAYER.height * 0.6)
    expect(climbed).toBeLessThan(0.2)
    expect(reachedZ).toBeGreaterThan(-5.6)
  })
})
