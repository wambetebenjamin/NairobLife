/**
 * Lifts: where a building's lift is, and where it stops.
 *
 * Every building tall enough to have one gets a lift. The game is not a lift simulator, so
 * the model is the smallest one that behaves: a car that travels between floors at a fixed
 * speed, opening and closing its doors between them, and a player who is either inside it
 * or not.
 *
 * This file has no three.js and no Rapier, so the rules below are tested in Node. The
 * component that draws the car reads the state this produces.
 *
 * Coordinates are metres in world space. `y` is the world height of the *floor*, which for
 * a building standing on the ground is the same as the height above ground.
 */
import { hash01 } from '../../core/random'
import { pointInRing, ringCentroid } from '../../core/geom2d'
import { DRIVABLE } from '../zone/format'
import type { ZoneBuilding, ZoneFile } from '../zone/format'
import type { RoadSegment } from '../zone/zoneIndex'

/** Floor-to-floor height, matching the bake's `LEVEL_HEIGHT`. */
export const FLOOR_HEIGHT = 3.4
/** A car will not stop higher than this above the ground, to keep a spire out of reach. */
const MAX_SERVED = 140
/**
 * How close the player must be to a lift's doorway to use it, in metres. Shared with the
 * HUD so the prompt cannot appear at a distance the key does not work at.
 */
export const LIFT_REACH = 2.8

/** The shortest building worth a lift. Two floors of stairs is not a lift. */
export const MIN_SERVED_FLOORS = 3

export interface LiftStop {
  /** World height of the floor surface. */
  y: number
  /** 0-based floor number, ground being 0. */
  floor: number
}

export interface Lift {
  /** The building the lift is in: always a ground-level one, never a stacked part. */
  buildingId: number
  /** Where the car's middle stands, in world space, on the street side of the building. */
  x: number
  z: number
  /** Which way the doors face, as a three.js yaw: 0 looks down +z. */
  yaw: number
  /** Height of the ground floor, i.e. the building's base. */
  base: number
  stops: LiftStop[]
  /** Seconds the doors take to open or close. */
  doorTime: number
  /** Metres per second. Slower in a tall, old building, faster in a new one. */
  speed: number
}

export type LiftPhase = 'idle' | 'opening' | 'open' | 'closing' | 'moving'

export interface LiftState {
  /** Index into `lift.stops`, the floor the car is at or last was at. */
  at: number
  /** The floor the car is heading for. Equal to `at` unless moving. */
  target: number
  /**
   * A floor that has been asked for but not yet started for, because the doors are open
   * or closing. The car goes there as soon as it is shut.
   */
  queued: number | null
  phase: LiftPhase
  /** 0..1 door opening progress. 1 is fully open. */
  doors: number
  /** How long the car has been in its current phase, in seconds. */
  phaseTime: number
  /** Current car height, which is between stops while moving. */
  y: number
}

/** How long the doors hold open, in seconds, before the player is asked to get out. */
export const DOOR_HOLD = 2.4

/**
 * The floors a building's lift serves.
 *
 * A building with an OSM height gets floors at the bake's floor height up to that height,
 * which is the only honest source for how many storeys there are. The last floor is not
 * put right under the roof: a car that opens onto the inside of a parapet is worse than
 * one that stops a floor short.
 */
export function liftStops(height: number, base = 0): LiftStop[] {
  if (!(height > 0)) return []
  const served = Math.min(height, MAX_SERVED) - base
  const floors = Math.floor(served / FLOOR_HEIGHT)
  if (floors <= 0) return []
  const stops: LiftStop[] = []
  for (let floor = 0; floor <= floors; floor++) {
    stops.push({ floor, y: base + floor * FLOOR_HEIGHT })
  }
  return stops
}

/**
 * Where the car stands, and which way its doors face.
 *
 * **The car stays on the footprint's centroid.** That is deliberate. Buildings here are
 * solid trimesh colliders, so the car is a solid box standing where nobody can walk — and a
 * first version "solved" that by dragging it towards the street, which moved it up to
 * 10.4 m, put 107 cars outside their own building, and reached fewer of them than leaving
 * it alone. The centroid is at least always inside, so it is what the player rides in.
 *
 * **The doors face the street.** That is the part that makes a car usable: the player
 * boards from the pavement, and the lift is drawn with an open front. The direction is the
 * one towards the nearest point of a drivable road, or the longest wall where there is no
 * road close by.
 */
export function carPosition(
  ring: number[],
  q: number,
  street?: { x: number; z: number },
): { x: number; z: number; yaw: number } {
  const metres = ring.map((value) => value / q)
  const [cx, cz] = ringCentroid(metres)
  const centre = insidePoint(cx, cz, ring, q)
  return { ...centre, yaw: streetYaw(centre, street, ring, q) }
}

/**
 * A point inside a footprint, starting from its centroid.
 *
 * A centroid is inside a convex shape and not always inside a concave one: 107 of the CBD's
 * 2,474 lifts landed outside their own building on the centroid, in L-shaped and thin
 * footprints. The fix is the standard one — walk from the centroid towards the middle of
 * every triangle the footprint can be cut into, and take the first that is actually inside.
 * If none is, the centroid is returned, because a car slightly wrong is better than none.
 */
export function insidePoint(
  cx: number,
  cz: number,
  ring: readonly number[],
  q: number,
): { x: number; z: number } {
  if (pointInRing(cx * q, cz * q, ring)) return { x: cx, z: cz }
  const metres = ring.map((value) => value / q)
  const n = metres.length / 2
  // Triangle fans from each vertex: their centroids sample the shape densely enough for
  // building footprints, and each one is inside if the shape is simple.
  let best = { x: cx, z: cz }
  let bestDistance = Infinity
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const px = (metres[i * 2] + metres[j * 2] + cx) / 3
    const pz = (metres[i * 2 + 1] + metres[j * 2 + 1] + cz) / 3
    if (!pointInRing(px * q, pz * q, ring)) continue
    const distance = Math.hypot(px - cx, pz - cz)
    if (distance < bestDistance) {
      bestDistance = distance
      best = { x: px, z: pz }
    }
  }
  return best
}

/**
 * Which way the doors face, as a three.js yaw.
 *
 * The convention matters and bit once already: the lift's front is local -z, so the yaw
 * that turns local -z towards a direction (dx, dz) is `atan2(-dx, -dz)`. The street branch
 * used `atan2(dx, dz)`, which is the opposite way round, and faced the doors at the back of
 * the car. Both branches now use the same one.
 */
function streetYaw(
  centre: { x: number; z: number },
  street: { x: number; z: number } | undefined,
  ring: number[],
  q: number,
): number {
  if (street) {
    const dx = street.x - centre.x
    const dz = street.z - centre.z
    if (Math.hypot(dx, dz) > 1e-6) return Math.atan2(-dx, -dz)
  }
  // The outward normal of the longest edge, which is the most likely face to have a door.
  let best = 0
  let bestLength = 0
  const ringMetres = ring.map((value) => value / q)
  const n = ringMetres.length / 2
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const ax = ringMetres[i * 2],
      az = ringMetres[i * 2 + 1]
    const bx = ringMetres[j * 2],
      bz = ringMetres[j * 2 + 1]
    const length = Math.hypot(bx - ax, bz - az)
    if (length <= bestLength) continue
    bestLength = length
    let nx = -(bz - az) / length
    let nz = (bx - ax) / length
    const mx = (ax + bx) / 2 - centre.x
    const mz = (az + bz) / 2 - centre.z
    if (nx * mx + nz * mz < 0) {
      nx = -nx
      nz = -nz
    }
    best = Math.atan2(-nx, -nz)
  }
  return best
}

/**
 * The point on a drivable road nearest to a building, for aiming its doors. Null when the
 * building is more than `radius` from any road, which the CBD has very few of.
 */
export function streetFor(
  index: { roadsNear: (x: number, z: number, r: number, visit: (s: RoadSegment) => void) => void },
  x: number,
  z: number,
  radius = 60,
): { x: number; z: number } | undefined {
  let best: { x: number; z: number; d: number } | undefined
  index.roadsNear(x, z, radius, ({ ax, az, bx, bz, road }) => {
    if (road.e || !DRIVABLE[road.k]) return
    const dx = bx - ax
    const dz = bz - az
    const length2 = dx * dx + dz * dz
    const t = length2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length2)) : 0
    const px = ax + dx * t
    const pz = az + dz * t
    const d = Math.hypot(px - x, pz - z)
    if (!best || d < best.d) best = { x: px, z: pz, d }
  })
  return best ? { x: best.x, z: best.z } : undefined
}

/**
 * Every building in a zone that should have a lift, with its stops.
 *
 * A tower is often mapped as a ground-level footprint with `building:part`s above it. A part
 * has no ground floor of its own, so it gets no shaft: instead the buildings it stands over
 * share the extra height.
 *
 * KICC is the case that proves this matters. It is two OSM ways — a 94 m octagon and a
 * 72 m plinth beside it, both estimated — with the tower's four parts stacked over the
 * octagon and reaching 105 m. A lift that stops at 72 m cannot reach the tower it was put
 * in, and the tower's own footprint has no ground floor for a shaft. So the tallest of the
 * overlapping buildings gets the full height, and its neighbour keeps what it has; the two
 * are one complex and the player can walk between them on the plinth roof either way.
 */
export function planLifts(zone: ZoneFile, index?: StreetIndex): Lift[] {
  const [ground, parts] = splitParts(zone.buildings)
  const top = new Map<ZoneBuilding, number>()
  for (const building of ground) top.set(building, building.h)
  for (const part of parts) {
    const hosts = hostsOf(part, ground)
    if (!hosts.length) continue
    // The tallest of them, because that is the one the tower is actually built on.
    const host = hosts.reduce((tallest, b) =>
      (top.get(b) ?? b.h) > (top.get(tallest) ?? tallest.h) ? b : tallest,
    )
    top.set(host, Math.max(top.get(host) ?? 0, part.h))
  }
  const lifts: Lift[] = []
  for (const building of ground) {
    const lift = liftFor(building, zone.q, top.get(building) ?? building.h, index)
    if (lift) lifts.push(lift)
  }
  return lifts
}

/** The part of the zone index a lift needs: roads, so its doors can face one. */
export interface StreetIndex {
  roadsNear: (x: number, z: number, r: number, visit: (segment: RoadSegment) => void) => void
}

/** A building stands on the ground if it has no base, or a base within 3 m of it. */
const grounded = (building: ZoneBuilding) => (building.b ?? 0) <= 3

/**
 * The buildings split into those standing on the ground and those stacked on top of them,
 * in the order they appear in the zone.
 */
export function splitParts(buildings: readonly ZoneBuilding[]): [ZoneBuilding[], ZoneBuilding[]] {
  const ground: ZoneBuilding[] = []
  const parts: ZoneBuilding[] = []
  for (const building of buildings) (grounded(building) ? ground : parts).push(building)
  return [ground, parts]
}

/** Bounding box of a ring, as [minX, minZ, maxX, maxZ]. */
function ringBox(ring: readonly number[]): [number, number, number, number] {
  let minX = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxZ = -Infinity
  for (let i = 0; i < ring.length; i += 2) {
    minX = Math.min(minX, ring[i])
    maxX = Math.max(maxX, ring[i])
    minZ = Math.min(minZ, ring[i + 1])
    maxZ = Math.max(maxZ, ring[i + 1])
  }
  return [minX, minZ, maxX, maxZ]
}

/**
 * The ground-level buildings a part stands over: those whose footprints overlap the part's
 * and reach it. "Over" is an overlap of outlines rather than containment, because a part is
 * often drawn a little wider than the wall below it and a ring-shaped building has nothing
 * inside it at all.
 *
 * Every part has at least one host in the CBD; a part with none is over open ground, such as
 * a skybridge deck, and correctly has no shaft under it.
 */
export function hostsOf(part: ZoneBuilding, ground: readonly ZoneBuilding[]): ZoneBuilding[] {
  const [minX, minZ, maxX, maxZ] = ringBox(part.p)
  const [cx, cz] = ringCentroid(part.p)
  const hosts: ZoneBuilding[] = []
  for (const building of ground) {
    const [bx0, bz0, bx1, bz1] = ringBox(building.p)
    if (bx1 < minX || bx0 > maxX || bz1 < minZ || bz0 > maxZ) continue
    // Overlapping boxes is a cheap first test; the part must also be within a footprint
    // length of the walls, which rejects the building across the street.
    const reach = Math.max(bx1 - bx0, bz1 - bz0)
    if (edgeDistance(cx, cz, building.p) > reach) continue
    hosts.push(building)
  }
  return hosts
}

/** Distance from a point to the nearest edge of a ring, in the ring's own units. */
function edgeDistance(x: number, z: number, ring: readonly number[]): number {
  let best = Infinity
  const n = ring.length / 2
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const ax = ring[i * 2],
      az = ring[i * 2 + 1]
    const bx = ring[j * 2],
      bz = ring[j * 2 + 1]
    const dx = bx - ax,
      dz = bz - az
    const length2 = dx * dx + dz * dz
    const t = length2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length2)) : 0
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)))
  }
  return best
}

/** One building to one lift, or none if it is too short or its footprint is degenerate. */
export function liftFor(
  building: ZoneBuilding,
  q: number,
  top = building.h,
  index?: StreetIndex,
): Lift | undefined {
  const base = building.b ?? 0
  const height = building.h - base
  if (height < MIN_SERVED_FLOORS * FLOOR_HEIGHT) return undefined
  if (building.p.length < 6) return undefined
  const ring = building.p
  // Where the street is, measured from the middle of the footprint. Without a road index the
  // car keeps the centroid and faces the longest wall, which is the best guess available.
  // Quantised units to metres exactly once: the road index is in metres, the ring is not.
  const metres = ring.map((value) => value / q)
  const [middleX, middleZ] = ringCentroid(metres)
  const street = index ? streetFor(index, middleX, middleZ) : undefined
  const car = carPosition(ring, q, street)
  // The shaft runs to the top of the highest part standing on this building, so a stack of
  // parts is served by the one car in the ground-level footprint.
  const stops = liftStops(Math.max(building.h, top), base)
  if (stops.length < MIN_SERVED_FLOORS) return undefined
  // A new tall tower gets a fast car; a low old walk-up gets a slow one.
  const speed = Math.max(building.h, top) - base > 60 ? 2.2 : 1.4
  return {
    buildingId: building.id,
    x: car.x,
    z: car.z,
    // Which way the doors face, so they open towards the street rather than a wall.
    yaw: car.yaw,
    base,
    stops,
    doorTime: 0.9,
    speed,
  }
}

/** A lift's car at rest, at the ground floor. */
export function initialLiftState(lift: Lift): LiftState {
  return {
    at: 0,
    target: 0,
    queued: null,
    phase: 'idle',
    doors: 0,
    phaseTime: 0,
    y: lift.stops[0]?.y ?? lift.base,
  }
}

/**
 * Which floor is closest to a world height. Used when the player gets in from a roof.
 */
export function floorAt(lift: Lift, y: number): number {
  let best = 0
  let bestD = Infinity
  lift.stops.forEach((stop, i) => {
    const d = Math.abs(stop.y - y)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

/**
 * Advance a car by `dt` seconds.
 *
 * The phases run idle -> opening -> open -> closing -> idle, and a call to `goTo` puts it
 * into moving. Doors are only open at a stop; the car will not move with them open, and
 * will not open them while moving. That is the whole safety model.
 */
export function stepLift(lift: Lift, state: LiftState, dt: number): LiftState {
  const next: LiftState = { ...state, phaseTime: state.phaseTime + dt }
  switch (state.phase) {
    case 'idle':
      return next
    case 'opening': {
      next.doors = Math.min(1, state.doors + dt / lift.doorTime)
      if (next.doors >= 1) {
        next.phase = 'open'
        next.phaseTime = 0
      }
      return next
    }
    case 'open': {
      if (next.phaseTime >= DOOR_HOLD) {
        next.phase = 'closing'
        next.phaseTime = 0
      }
      return next
    }
    case 'closing': {
      next.doors = Math.max(0, state.doors - dt / lift.doorTime)
      if (next.doors <= 0) {
        // Shut, and something is waiting: go now rather than idling first.
        if (state.queued !== null && state.queued !== state.at) {
          next.phase = 'moving'
          next.target = state.queued
          next.queued = null
          next.phaseTime = 0
        } else {
          if (state.queued !== null) next.queued = null
          next.phase = 'idle'
          next.phaseTime = 0
        }
        next.at = state.at
        next.doors = 0
      }
      return next
    }
    case 'moving': {
      const target = lift.stops[state.target] ?? lift.stops[0]
      const distance = target.y - state.y
      const travel = Math.sign(distance) * lift.speed * dt
      if (Math.abs(travel) >= Math.abs(distance)) {
        next.y = target.y
        next.at = state.target
        next.phase = 'opening'
        next.phaseTime = 0
        next.doors = 0
      } else {
        next.y = state.y + travel
      }
      return next
    }
  }
}

/**
 * Ask a car to go somewhere. Ignored while moving, so a player mashing the button cannot
 * make the car do anything except finish the trip it is on.
 */
export function goTo(lift: Lift, state: LiftState, floor: number): LiftState {
  // A car already on its way finishes its trip. A player mashing the button cannot make it
  // stop between floors, which is the one thing a lift must never do.
  if (state.phase === 'moving') return state
  const target = Math.max(0, Math.min(lift.stops.length - 1, floor))
  if (target === state.at) {
    // Already here: open up rather than doing nothing, which is what a real call does.
    if (state.phase === 'idle') return { ...state, phase: 'opening', phaseTime: 0 }
    return state
  }
  // The doors must be shut before the car moves. If they are open or closing, the call
  // waits: `stepLift` picks it up when they finish. Without this the car went straight to
  // `moving` with its doors snapping to zero, which is exactly the thing the comment above
  // claimed could not happen.
  if (state.phase === 'open' || state.phase === 'closing' || state.doors > 0) {
    return { ...state, queued: target }
  }
  return { ...state, target, phase: 'moving', doors: 0, phaseTime: 0 }
}

/** Which floor the car is at, as a number, for the HUD. */
export function floorLabel(lift: Lift, state: LiftState): number {
  const stop = lift.stops[state.at]
  return stop ? stop.floor : 0
}

/** A stable per-lift seed so a car's small details do not change between visits. */
export function liftSeed(lift: Lift): number {
  return Math.floor(hash01(lift.buildingId, 17) * 1000)
}
