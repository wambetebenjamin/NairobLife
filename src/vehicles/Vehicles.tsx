/**
 * The fleet, in the scene: parks the vehicles when the zone loads, steps the moving ones
 * with the physics, and draws them all.
 *
 * The work is in three plain modules; this component only wires them to React:
 *   placement.ts        where the vehicles are parked
 *   fleet.ts            how they move and what they hit
 *   view/fleetView.ts   how they are drawn
 *
 * Must be rendered inside <Physics>.
 */
import { useFrame } from '@react-three/fiber'
import { useBeforePhysicsStep, useRapier } from '@react-three/rapier'
import { useEffect, useMemo, useRef } from 'react'
import type { Group } from 'three'
import { DRIVING } from '../config/vehicles'
import { clamp } from '../core/math'
import { input } from '../input/input'
import { expose } from '../state/debugHandle'
import { useGame, useQuality, type Quality } from '../state/gameStore'
import { runtime } from '../state/runtime'
import { BOUNDARY_INSET } from '../world/Boundary'
import { stepFraction } from '../world/physics/stepFraction'
import type { LoadedZone } from '../world/zone/loadZone'
import { endDriving, pressEnterExit } from './driving'
import { Fleet, type Pose } from './fleet'
import { planFleet, type StartSpot } from './placement'
import type { DriveInput } from './sim/vehicleSim'
import { FleetView, type DrawRanges } from './view/fleetView'

/** How far out vehicles are drawn in full, and at all, in metres from the camera. */
const RANGES: Record<Exclude<Quality, 'auto'>, DrawRanges> = {
  high: { near: 170, far: 1100 },
  medium: { near: 130, far: 700 },
  low: { near: 90, far: 380 },
}

/** Seconds between looking again at which vehicles are near the camera. */
const SORT_EVERY = 0.3
/** Seconds between checks for a vehicle within reach, for the "press F" prompt. */
const PROMPT_EVERY = 0.12

/** Knocks and landings softer than this (m/s) are not worth shaking the camera for. */
const MIN_KNOCK = 1.5
const MIN_LANDING = 5

/** @param start where a new game begins; one vehicle of each kind is parked just ahead of it */
export function Vehicles({ zone, start }: { zone: LoadedZone; start?: StartSpot }) {
  const { rapier, world } = useRapier()
  const quality = useQuality()
  const root = useRef<Group>(null)
  const live = useRef<{ fleet: Fleet; view: FleetView } | null>(null)

  const placements = useMemo(
    () =>
      planFleet(zone.file, zone.index, {
        start,
        trees: zone.geometry.trees,
        edgeInset: BOUNDARY_INSET,
      }),
    [zone, start],
  )

  useEffect(() => {
    const parent = root.current
    const fleet = new Fleet(world, rapier, placements)
    const view = new FleetView(fleet)
    parent?.add(view.group)
    live.current = { fleet, view }
    expose('fleet', fleet)
    return () => {
      live.current = null
      expose('fleet', undefined)
      endDriving()
      useGame.getState().setNearVehicle(null)
      parent?.remove(view.group)
      view.dispose()
      fleet.dispose()
    }
  }, [world, rapier, placements])

  const drive = useRef<DriveInput>({ throttle: 0, steer: 0, handbrake: false }).current

  useBeforePhysicsStep((physics) => {
    const scene = live.current
    if (!scene) return
    const { fleet } = scene

    if (runtime.enterExit) {
      runtime.enterExit = false
      pressEnterExit(fleet)
    }

    const driven = runtime.driving
    if (driven >= 0) {
      const pedals = input.drive()
      drive.throttle = pedals.throttle
      drive.steer = pedals.steer
      // The jump key is the handbrake at the wheel. Leaving for the menu pulls it too, so
      // the vehicle does not roll on with nobody watching.
      drive.handbrake = input.jumpHeld() || useGame.getState().phase !== 'playing'
    }
    fleet.step(physics.timestep, driven, drive)

    // Knocks and hard landings are felt through the camera.
    const state = fleet.vehicles[driven]?.state
    if (state) {
      if (state.impact > MIN_KNOCK) {
        runtime.vehicle.impact = state.impact
        runtime.vehicle.impactAgo = 0
      }
      if (state.landing > MIN_LANDING) {
        runtime.player.landedAgo = 0
        runtime.player.landingImpact = clamp((state.landing - MIN_LANDING) / 18, 0.2, 1)
      }
    }
  })

  const timers = useRef({ sort: 0, prompt: 0, near: -1 }).current
  const pose = useRef<Pose>({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }).current

  // Runs after the physics has stepped and before the player and the camera (see GameCanvas).
  useFrame(({ camera }, delta) => {
    const scene = live.current
    if (!scene) return
    const { fleet, view } = scene
    const dt = Math.min(delta, 0.1)

    timers.sort -= delta
    if (timers.sort <= 0 || view.stale) {
      timers.sort = SORT_EVERY
      view.refresh(camera.position.x, camera.position.y, camera.position.z, RANGES[quality])
    }

    const drawn = view.update(stepFraction(), dt, runtime.driving, runtime.night, pose)
    const vehicle = fleet.vehicles[runtime.driving]
    if (drawn && vehicle) {
      // At the wheel, "where the player is" means where the vehicle is.
      const { state } = vehicle
      const airborne = !state.groundedFront && !state.groundedRear
      const v = runtime.vehicle
      v.kind = vehicle.kind
      v.x = drawn.x
      v.y = drawn.y
      v.z = drawn.z
      v.yaw = drawn.yaw
      v.pitch = drawn.pitch
      v.roll = view.rollOf(vehicle.id)
      v.speed = state.speed
      v.airborne = airborne
      v.impactAgo += dt
      const p = runtime.player
      p.x = drawn.x
      p.y = drawn.y
      p.z = drawn.z
      p.yaw = drawn.yaw
      p.speed = Math.hypot(state.vx, state.vz)
      p.verticalSpeed = 0
      p.grounded = !airborne
      p.crouching = false
      p.sprinting = false
      p.landedAgo += dt
    }

    // The "press F" prompt: is there a vehicle within reach?
    timers.prompt -= delta
    if (timers.prompt <= 0) {
      timers.prompt = PROMPT_EVERY
      const game = useGame.getState()
      const p = runtime.player
      const near =
        runtime.driving < 0 && game.phase === 'playing'
          ? fleet.nearest(p.x, p.y, p.z, DRIVING.reach)
          : undefined
      const id = near ? near.id : -1
      if (id !== timers.near) {
        timers.near = id
        game.setNearVehicle(near ? { kind: near.kind, label: near.label } : null)
      }
    }
  }, -30)

  return <group ref={root} name="fleet" />
}
