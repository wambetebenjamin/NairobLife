import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { VEHICLES, type VehicleKind } from '../config/vehicles'
import { loadBakedZone } from '../testing/zoneFixture'
import { buildRaisedRoads } from '../world/geometry/raisedRoads'
import { DRIVABLE, type ZoneRoad } from '../world/zone/format'
import { Fleet, type Vehicle } from './fleet'
import { yawOf } from './placement'
import type { DriveInput } from './sim/vehicleSim'

/**
 * Driving on the real flyovers: the ramps, decks and crash barriers exactly as the game
 * builds them from the baked zone, with a simple autopilot at the wheel.
 */

const STEP = 1 / 60
const zone = loadBakedZone()
const q = zone.q

interface Route {
  /** Flat [x, z, ...] in metres. */
  line: number[]
  /** Deck height at each point, in metres. */
  height: number[]
  /** Narrowest carriageway along the way, in metres. */
  width: number
}

/** Follow a ramp from the ground up, along whatever it joins, and back down to the ground. */
function findRoute(): Route {
  const raised = zone.roads.filter((road) => road.e && DRIVABLE[road.k])
  const length = (road: ZoneRoad) => {
    let total = 0
    for (let i = 2; i < road.p.length; i += 2) {
      total += Math.hypot(road.p[i] - road.p[i - 2], road.p[i + 1] - road.p[i - 1]) / q
    }
    return total
  }
  for (const first of raised) {
    const e = first.e!
    if (e[0] !== 0 || e[e.length - 1] < 50 || length(first) < 60) continue
    const pieces = [first]
    for (let current = first; pieces.length < 8;) {
      const lastE = current.e![current.e!.length - 1]
      if (lastE === 0) break
      const endX = current.p[current.p.length - 2]
      const endZ = current.p[current.p.length - 1]
      const next = raised.find(
        (road) =>
          !pieces.includes(road) &&
          road.p[0] === endX &&
          road.p[1] === endZ &&
          road.e![0] === lastE,
      )
      if (!next) break
      pieces.push(next)
      current = next
    }
    const last = pieces[pieces.length - 1]
    if (pieces.length < 2 || last.e![last.e!.length - 1] !== 0) continue
    const route: Route = { line: [], height: [], width: Infinity }
    pieces.forEach((road, index) => {
      // Shared end points appear once.
      for (let i = index === 0 ? 0 : 1; i < road.e!.length; i++) {
        route.line.push(road.p[i * 2] / q, road.p[i * 2 + 1] / q)
        route.height.push(road.e![i] / q)
      }
      route.width = Math.min(route.width, road.w)
    })
    return route
  }
  throw new Error('no ramp in the baked zone leads up, across and down again')
}

/** Where on a route a point is: how far along, how far off to the side, the deck height there. */
function locate(route: Route, x: number, z: number) {
  let best = { along: 0, off: Infinity, height: 0 }
  let travelled = 0
  for (let i = 0; i < route.line.length - 2; i += 2) {
    const ax = route.line[i]
    const az = route.line[i + 1]
    const dx = route.line[i + 2] - ax
    const dz = route.line[i + 3] - az
    const span = Math.hypot(dx, dz)
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (span * span)))
    const off = Math.hypot(x - ax - dx * t, z - az - dz * t)
    if (off < best.off) {
      const h0 = route.height[i / 2]
      const h1 = route.height[i / 2 + 1]
      best = { along: travelled + span * t, off, height: h0 + (h1 - h0) * t }
    }
    travelled += span
  }
  return best
}

/** The point a given distance along a route. */
function pointAt(route: Route, distance: number): [number, number] {
  let travelled = 0
  for (let i = 0; i < route.line.length - 2; i += 2) {
    const dx = route.line[i + 2] - route.line[i]
    const dz = route.line[i + 3] - route.line[i + 1]
    const span = Math.hypot(dx, dz)
    if (travelled + span >= distance || i === route.line.length - 4) {
      const t = (distance - travelled) / span
      return [route.line[i] + dx * t, route.line[i + 1] + dz * t]
    }
    travelled += span
  }
  return [route.line[0], route.line[1]]
}

/** Steer at a point a little way ahead on the route; hold a steady speed. */
function autopilot(route: Route, vehicle: Vehicle, cruise: number, input: DriveInput): void {
  const s = vehicle.state
  const here = locate(route, s.x, s.z)
  const [tx, tz] = pointAt(route, here.along + 7 + Math.abs(s.speed) * 0.45)
  const forwardX = -Math.sin(s.yaw)
  const forwardZ = -Math.cos(s.yaw)
  const ahead = (tx - s.x) * forwardX + (tz - s.z) * forwardZ
  // Right of the heading is (cos yaw, -sin yaw); positive steer turns right.
  const right = (tx - s.x) * Math.cos(s.yaw) + (tz - s.z) * -Math.sin(s.yaw)
  input.steer = Math.min(1, Math.max(-1, Math.atan2(right, ahead) * 2.4))
  input.throttle = Math.min(1, Math.max(-1, (cruise - s.speed) * 0.6))
  input.handbrake = false
}

describe('on the real flyovers', () => {
  let route: Route
  const mesh = buildRaisedRoads(zone)

  beforeAll(async () => {
    await RAPIER.init()
    route = findRoute()
  })

  /** A world with the ground and every raised road in it, and one vehicle at the foot of the ramp. */
  function setUp(kind: VehicleKind) {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    world.createCollider(new RAPIER.ColliderDesc(new RAPIER.HalfSpace({ x: 0, y: 1, z: 0 })))
    world.createCollider(RAPIER.ColliderDesc.trimesh(mesh.positions, mesh.indices))
    const dx = route.line[2] - route.line[0]
    const dz = route.line[3] - route.line[1]
    const span = Math.hypot(dx, dz)
    // Ten metres short of the ramp, on the flat, pointing up it.
    const fleet = new Fleet(world, RAPIER, [
      {
        kind,
        x: route.line[0] - (dx / span) * 10,
        z: route.line[1] - (dz / span) * 10,
        yaw: yawOf(dx, dz),
        paint: 0,
      },
    ])
    const vehicle = fleet.vehicles[0]
    world.step()
    fleet.wake(vehicle)
    return { world, fleet, vehicle }
  }

  it('finds a route up, across and down in the baked zone', () => {
    expect(route.line.length / 2).toBeGreaterThan(10)
    expect(Math.max(...route.height)).toBeGreaterThan(6)
    expect(route.height[0]).toBe(0)
    expect(route.height[route.height.length - 1]).toBe(0)
  })

  it.each(['car', 'boda', 'matatu', 'nganya'] as const)(
    'a %s drives up the ramp, along the deck and down the far side',
    (kind) => {
      const { world, fleet, vehicle } = setUp(kind)
      const input: DriveInput = { throttle: 0, steer: 0, handbrake: false }
      const total = locate(
        route,
        route.line[route.line.length - 2],
        route.line[route.line.length - 1],
      ).along
      const s = vehicle.state
      let highest = 0
      let widest = 0
      let worstGap = 0
      let airborne = 0
      let steps = 0
      for (; steps < 120 / STEP; steps++) {
        autopilot(route, vehicle, 15, input)
        fleet.step(STEP, 0, input)
        world.step()
        const here = locate(route, s.x, s.z)
        highest = Math.max(highest, s.y)
        // On the route proper it keeps to its lane, and the wheels are on the deck: not
        // under it, not floating over it.
        if (here.along > 1 && here.along < total - 1) {
          widest = Math.max(widest, here.off)
          worstGap = Math.max(worstGap, Math.abs(s.y - here.height))
        }
        if (!s.groundedFront && !s.groundedRear) airborne++
        if (here.along > total - 3) break
      }
      expect(steps).toBeLessThan(120 / STEP) // got there
      expect(highest).toBeGreaterThan(Math.max(...route.height) - 0.2)
      expect(highest).toBeLessThan(Math.max(...route.height) + 0.4)
      // Stayed in lane, between the barriers.
      expect(widest).toBeLessThan(route.width / 2 - VEHICLES[kind].width / 2 + 0.3)
      expect(worstGap).toBeLessThan(0.45)
      expect(airborne).toBeLessThan(20)
      // Back on the ground at the far end.
      expect(s.y).toBeLessThan(0.4)
      expect(Number.isFinite(s.x + s.y + s.z + s.yaw + s.speed)).toBe(true)
    },
  )

  it('is kept on the deck by the crash barriers, whatever the driver does', () => {
    for (const steer of [1, -1]) {
      const { world, fleet, vehicle } = setUp('car')
      const input: DriveInput = { throttle: 0, steer: 0, handbrake: false }
      const s = vehicle.state
      const top = Math.max(...route.height)
      // Drive properly until well up on the deck...
      let steps = 0
      while (locate(route, s.x, s.z).height < top - 0.01 && steps++ < 60 / STEP) {
        autopilot(route, vehicle, 15, input)
        fleet.step(STEP, 0, input)
        world.step()
      }
      for (let i = 0; i < 2 / STEP; i++) {
        autopilot(route, vehicle, 24, input)
        fleet.step(STEP, 0, input)
        world.step()
      }
      expect(s.y).toBeGreaterThan(top - 0.2)
      // ...then floor it with the wheel hard over, for ten seconds.
      let lowest = Infinity
      let furthest = 0
      let knocks = 0
      for (let i = 0; i < 10 / STEP; i++) {
        fleet.step(STEP, 0, { throttle: 1, steer, handbrake: false })
        world.step()
        const here = locate(route, s.x, s.z)
        lowest = Math.min(lowest, s.y - here.height)
        furthest = Math.max(furthest, here.off)
        if (s.impact > 1) knocks++
      }
      expect(knocks).toBeGreaterThan(0) // it did hit the barrier
      expect(lowest).toBeGreaterThan(-0.5) // and did not go through it and fall
      expect(furthest).toBeLessThan(route.width / 2 + 0.6)
    }
  })
})
