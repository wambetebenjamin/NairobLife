/**
 * Tells the rest of the game how far the frame being drawn is between two physics steps.
 *
 * Physics runs at a fixed 60 steps a second; screens refresh at whatever rate they like.
 * To look smooth, anything that moves has to be drawn part-way between its last two
 * physics positions. The physics library does that for the bodies it manages (the
 * player), but it keeps the fraction to itself, and the fleet moves its vehicles by hand.
 *
 * So this component gives the library one invisible body to manage, far below the
 * ground, and moves it exactly one metre on every step: 0 to 1, then back. Where the
 * library draws it, between 0 and 1, *is* the fraction. It cannot drift out of step
 * with the library, because it is the library's own answer.
 *
 * Mount once, inside <Physics>. Read the result with stepFraction() (stepFraction.ts).
 */
import { useFrame } from '@react-three/fiber'
import { RigidBody, useBeforePhysicsStep, type RapierRigidBody } from '@react-three/rapier'
import { useRef } from 'react'
import { Vector3, type Group } from 'three'
import { clamp } from '../../core/math'
import { setStepFraction } from './stepFraction'

/** Well out of the way of anything that looks for the ground. */
const DEPTH = -500

export function StepClock() {
  const body = useRef<RapierRigidBody>(null)
  const hand = useRef<Group>(null)
  /** Which end of its metre the body was sent to on the latest step. */
  const side = useRef(0)
  const at = useRef(new Vector3()).current

  useBeforePhysicsStep(() => {
    side.current = 1 - side.current
    body.current?.setNextKinematicTranslation({ x: side.current, y: DEPTH, z: 0 })
  })

  // Runs right after the physics has placed its bodies for this frame (see GameCanvas).
  useFrame(() => {
    if (!hand.current) return
    const x = hand.current.getWorldPosition(at).x
    setStepFraction(clamp(side.current === 1 ? x : 1 - x, 0, 1))
  }, -45)

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[0, DEPTH, 0]}>
      <group ref={hand} />
    </RigidBody>
  )
}
