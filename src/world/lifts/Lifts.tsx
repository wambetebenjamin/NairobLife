/**
 * The city's lifts.
 *
 * 2,476 cars is far too many to draw, and all but one are invisible to a player at any
 * moment. So one reusable car is drawn, moved to whichever lift is awake, and only that
 * lift's state is stepped. Every other car costs nothing but its entry in the plan.
 *
 * The player rides by having their capsule written onto the car's floor each frame.
 * `Player.tsx` skips its own movement while a lift is being ridden, so a moving car and a
 * character controller falling do not fight over the same position.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BoxGeometry, Group, MeshBasicMaterial, MeshLambertMaterial } from 'three'
import { input } from '../../input/input'
import { useGame } from '../../state/gameStore'
import { runtime } from '../../state/runtime'
import type { LoadedZone } from '../zone/loadZone'
import {
  LIFT_REACH,
  floorAt,
  floorLabel,
  goTo,
  initialLiftState,
  planLifts,
  stepLift,
  type LiftState,
} from './lifts'

/** Beyond this a car is not simulated or drawn at all. */
const AWAKE = 90

export function Lifts({ zone }: { zone: LoadedZone }) {
  const lifts = useMemo(() => planLifts(zone.file), [zone.file])
  /** Stepped cars, created on demand: a lift nobody has visited costs only its plan entry. */
  const states = useRef(new Map<number, LiftState>())
  /** The one drawn car. */
  const car = useRef<Group>(null)
  /** The doors, so they can slide. */
  const doors = useRef<Group>(null)

  // A cabin, not a block: three walls and a ceiling, open at the front (+z) so the player
  // can see out and step in. The first version drew a solid 2.2 m box and put the camera
  // inside it, which is a grey screen.
  const carMaterial = useMemo(() => new MeshLambertMaterial({ color: '#b9c2c7' }), [])
  const doorMaterial = useMemo(
    () => new MeshLambertMaterial({ color: '#d7dee2', transparent: true, opacity: 0.72 }),
    [],
  )
  const wallMaterial = useMemo(() => new MeshLambertMaterial({ color: '#8e979d' }), [])
  // The floor of the car is lit, so a rider can see they are standing on something.
  const floorMaterial = useMemo(() => new MeshBasicMaterial({ color: '#6f7a80' }), [])
  const wall = useMemo(() => new BoxGeometry(0.08, 2.4, 2.2), [])
  const back = useMemo(() => new BoxGeometry(2.2, 2.4, 0.08), [])
  const roof = useMemo(() => new BoxGeometry(2.2, 0.08, 2.2), [])
  const floor = useMemo(() => new BoxGeometry(2.16, 0.06, 2.16), [])
  const doorGeometry = useMemo(() => new BoxGeometry(1.0, 2.2, 0.06), [])

  const stateOf = (index: number): LiftState => {
    let state = states.current.get(index)
    if (!state) {
      state = initialLiftState(lifts[index])
      states.current.set(index, state)
    }
    return state
  }

  /** The doorway: the front of the car, which faces the street. */
  const doorway = (index: number) => {
    const lift = lifts[index]
    return {
      x: lift.x - Math.sin(lift.yaw) * 1.6,
      z: lift.z - Math.cos(lift.yaw) * 1.6,
    }
  }

  useFrame((_, rawDelta) => {
    if (useGame.getState().phase !== 'playing') return
    const dt = Math.min(rawDelta, 0.05)
    const player = runtime.player

    // ---- the nearest car worth simulating
    // Distance is to the doorway rather than the middle of the car: the player stands on the
    // pavement, and the middle of the car is a metre and a half inside the wall.
    let near = -1
    let nearDistance = Infinity
    for (let i = 0; i < lifts.length; i++) {
      const door = doorway(i)
      const d = Math.hypot(door.x - player.x, door.z - player.z)
      if (d < AWAKE && d < nearDistance) {
        nearDistance = d
        near = i
      }
    }

    // ---- boarding and leaving
    if (runtime.liftButton) {
      runtime.liftButton = false
      const riding = runtime.lift
      if (riding) {
        const lift = lifts[riding.id]
        const state = stateOf(riding.id)
        // You can only get out where the car has stopped and opened.
        if (lift && (state.phase === 'open' || state.phase === 'opening')) {
          const stop = lift.stops[state.at]
          runtime.lift = null
          // Step out beside the car, at an exact height so the floor that was just arrived
          // at is the floor stood on.
          // Step out of the doors, which face the street: the car's front is local -z, so
          // after its yaw the doorway is at (-sin yaw, -cos yaw).
          runtime.teleport = {
            x: lift.x - Math.sin(lift.yaw) * 1.9,
            z: lift.z - Math.cos(lift.yaw) * 1.9,
            y: stop.y + 0.05,
            yaw: player.yaw,
            onTop: false,
          }
        }
      } else if (near >= 0 && nearDistance <= LIFT_REACH) {
        const lift = lifts[near]
        const state = stateOf(near)
        // Call the car to this floor if it is parked somewhere else. The doors are held at
        // this landing so the rider can walk in; `goTo` will not move a car with open doors,
        // so the call is queued and starts the moment they shut.
        const here = floorAt(lift, player.y)
        if (state.at !== here) {
          states.current.set(near, goTo(lift, state, here))
        }
        runtime.lift = { id: near, wants: null }
      }
    }

    // ---- riding
    const riding = runtime.lift
    if (riding) {
      const lift = lifts[riding.id]
      if (!lift) {
        runtime.lift = null
      } else {
        // ---- the floor buttons
        // Held, so the rider stops at the floor they chose: the next press moves one floor
        // from wherever the car is now, not from where the last trip ended.
        const pressed = input.liftFloor()
        if (pressed !== 0) {
          const state = stateOf(riding.id)
          const wanted = Math.max(0, Math.min(lift.stops.length - 1, state.at + pressed))
          if (wanted !== riding.wants) riding.wants = wanted
        }
        let state = stateOf(riding.id)
        // A queued floor becomes a call once the doors are shut, so the car never starts
        // moving with somebody half in it.
        if (riding.wants !== null && state.phase === 'idle' && state.doors === 0) {
          const wanted = riding.wants
          states.current.set(riding.id, goTo(lift, state, wanted))
          riding.wants = null
          state = stateOf(riding.id)
        }
        runtime.player.x = lift.x
        runtime.player.z = lift.z
        runtime.player.y = state.y
        runtime.player.verticalSpeed = 0
        runtime.player.grounded = true
      }
    }

    // ---- step and draw the nearby car
    if (near >= 0) {
      const lift = lifts[near]
      const before = stateOf(near)
      const after = stepLift(lift, before, dt)
      states.current.set(near, after)
      const shown = car.current
      if (shown) {
        shown.visible = true
        shown.position.set(lift.x, after.y + 1.2, lift.z)
        // The doors face the street, so the whole car is turned with the plan.
        shown.rotation.y = lift.yaw
        if (doors.current) {
          // Two leaves parting to the sides, on the open face of the car.
          for (const [i, child] of doors.current.children.entries()) {
            const side = i === 0 ? -1 : 1
            child.position.x = side * (0.55 + after.doors * 0.55)
          }
        }
      }
    }

    // ---- the prompt the HUD draws
    if (near >= 0) {
      const lift = lifts[near]
      const state = stateOf(near)
      runtime.liftNear = {
        id: near,
        x: lift.x,
        z: lift.z,
        y: state.y,
        distance: riding ? 0 : nearDistance,
        floor: floorLabel(lift, state),
        floors: lift.stops.length - 1,
        phase: state.phase,
      }
    } else if (runtime.liftNear) {
      runtime.liftNear = null
    }
  })

  return (
    <group name="lifts">
      <group ref={car} visible={false}>
        <mesh geometry={floor} material={floorMaterial} position={[0, -1.17, 0]} />
        <mesh geometry={roof} material={carMaterial} position={[0, 1.2, 0]} />
        <mesh geometry={back} material={wallMaterial} position={[0, 0, -1.06]} />
        <mesh geometry={wall} material={wallMaterial} position={[-1.1, 0, 0]} />
        <mesh geometry={wall} material={wallMaterial} position={[1.1, 0, 0]} />
        <group ref={doors}>
          <mesh geometry={doorGeometry} material={doorMaterial} position={[-0.55, 0, 1.08]} />
          <mesh geometry={doorGeometry} material={doorMaterial} position={[0.55, 0, 1.08]} />
        </group>
      </group>
    </group>
  )
}
