/**
 * Where the vehicles are parked when a zone loads.
 *
 * Nothing here is hand-placed. The map says where the matatu stages, car parks, filling
 * stations and streets are, and these rules fill them in:
 *
 *  - **Matatus** queue at the kerb beside every stage, with the stage's route or SACCO
 *    as their name.
 *  - **Boda bodas** wait in a row on the pavement at the stages and the filling stations,
 *    the way riders really do.
 *  - **Cars** stand in the car parks in rows, and along the kerbs of the quieter streets.
 *  - One of each is left near where a new game starts, so the first thing a player
 *    finds is something to drive.
 *
 * Every spot is checked: clear of buildings, trees, junctions and other vehicles, and
 * inside the playable area. The choices are seeded by the map itself, so the same zone
 * always parks the same vehicles in the same places.
 *
 * No DOM or three.js imports: the tests run this against the real baked zone.
 */
import {
  BODA_PAINT,
  CAR_PAINT,
  FLEET_LIMITS,
  MATATU_PAINT,
  VEHICLES,
  type VehicleKind,
} from '../config/vehicles'
import {
  distToOrientedRect,
  distToSegmentSq,
  orientedRectCorners,
  orientedRectsOverlap,
  pointInPolygon,
  type OrientedRect,
  type Rect,
} from '../core/geom2d'
import { hash01 } from '../core/random'
import { SpatialGrid } from '../core/spatialGrid'
import { PAVEMENT } from '../world/geometry/ground'
import { cumulativeLength } from '../world/geometry/ribbon'
import { TREE_STRIDE, trunkRadius } from '../world/geometry/trees'
import { DRIVABLE, type RoadKind, type ZoneFile, type ZoneRoad } from '../world/zone/format'
import type { ZoneIndex } from '../world/zone/zoneIndex'

export interface Placement {
  kind: VehicleKind
  x: number
  z: number
  /** Heading: 0 faces north, positive turns left. */
  yaw: number
  /** Index into the kind's paint list in config/vehicles.ts. */
  paint: number
  /** Matatus: the route or SACCO of the stage they wait at, straight from the map. */
  label?: string
}

/** Where a new game starts, in metres, and which way the player faces there. */
export interface StartSpot {
  x: number
  z: number
  yaw: number
}

export interface PlacementOptions {
  /**
   * Where a new game starts. One vehicle of each kind is left in view just ahead, or on
   * the nearest street if there is no room.
   */
  start?: StartSpot
  /** Every tree in the zone, TREE_STRIDE floats each (see world/geometry/trees.ts). */
  trees?: Float32Array
  /** How far inside the zone's edge the invisible walls stand, in metres. */
  edgeInset?: number
}

/** Space kept clear around every parked vehicle, in metres. */
const GAP = 0.3
/** Space between a parked vehicle and the kerb. */
const KERB_GAP = 0.35
/** Bumper-to-bumper space when parked in a line. */
const QUEUE_GAP = 1.3
/** Kerbside parking stays this far from the end of its street. */
const JUNCTION_CLEARANCE = 13
/** ...and this far from the edge of any other street that crosses or joins it. */
const SIDE_ROAD_CLEARANCE = 3

/** When a kerbside spot is taken, look this far along the street for a free one, in steps. */
const KERB_SEARCH_STEP = 2.5
const KERB_SEARCH_STEPS = 12

/** A stage further than this from any street gets its matatus parked around it instead. */
const STAGE_REACH = 45
const START_REACH = 90

/** Car-park bays: a car's width plus door room, and its length plus a little. */
const BAY_WIDTH = 2.7
const BAY_DEPTH = 5.2
const AISLE = 6.4
/** Bays fill in runs of this many: a run is either popular or left empty. */
const BAY_RUN = 5

/** Paint for the car and matatu left at the start: easy to spot against the square. */
const STARTER_CAR = '#c9302c'
const STARTER_MATATU = '#1f4e9c'

/** Share of the car budget that goes to kerbside parking; the rest fills car parks. */
const KERBSIDE_SHARE = 0.42

const KERB_PARKING: Partial<Record<RoadKind, number>> = {
  // Share of streets of each kind that have cars parked along them.
  residential: 0.62,
  tertiary: 0.4,
  secondary: 0.22,
}

const PAINT: Record<VehicleKind, readonly string[]> = {
  car: CAR_PAINT,
  boda: BODA_PAINT,
  matatu: MATATU_PAINT,
}

/** Heading that faces along a direction on the ground. */
export function yawOf(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz)
}

/** A road with its centre line in metres and the distance along it at each vertex. */
interface Street {
  road: ZoneRoad
  line: number[]
  dist: number[]
  length: number
}

interface NearbyStreet {
  street: Street
  /** Distance along the street, from its start, of the point on it nearest the query. */
  along: number
  /** Which side of the street the query point is on: 1 is the left of the way the line runs. */
  side: 1 | -1
  distance: number
}

interface Spot {
  x: number
  z: number
  dx: number
  dz: number
}

class Planner {
  readonly placements: Placement[] = []
  private readonly taken = new SpatialGrid<OrientedRect>(12)
  private readonly trunks = new SpatialGrid<[number, number, number]>(20)
  private readonly counts: Record<VehicleKind, number> = { car: 0, boda: 0, matatu: 0 }
  private readonly limits: Rect
  private readonly streets = new Map<ZoneRoad, Street>()
  private readonly index: ZoneIndex
  private readonly file: ZoneFile

  constructor(file: ZoneFile, index: ZoneIndex, options: PlacementOptions) {
    this.file = file
    this.index = index
    const inset = (options.edgeInset ?? 12) + 2
    const b = index.bounds
    this.limits = {
      minX: b.minX + inset,
      minZ: b.minZ + inset,
      maxX: b.maxX - inset,
      maxZ: b.maxZ - inset,
    }
    const trees = options.trees
    if (trees) {
      for (let o = 0; o < trees.length; o += TREE_STRIDE) {
        const r = trunkRadius(trees[o + 2])
        this.trunks.insert(
          [trees[o], trees[o + 1], r],
          trees[o] - r,
          trees[o + 1] - r,
          trees[o] + r,
          trees[o + 1] + r,
        )
      }
    }
  }

  full(kind: VehicleKind): boolean {
    return this.counts[kind] >= FLEET_LIMITS[kind]
  }

  count(kind: VehicleKind): number {
    return this.counts[kind]
  }

  street(road: ZoneRoad): Street {
    let street = this.streets.get(road)
    if (!street) {
      const line = road.p.map((value) => value / this.file.q)
      const dist = cumulativeLength(line)
      street = { road, line, dist, length: dist[dist.length - 1] }
      this.streets.set(road, street)
    }
    return street
  }

  /** True when a vehicle's footprint would be clear of everything solid. */
  private clear(rect: OrientedRect): boolean {
    const corners = orientedRectCorners(rect)
    const l = this.limits
    for (let i = 0; i < 8; i += 2) {
      const x = corners[i]
      const z = corners[i + 1]
      if (x < l.minX || x > l.maxX || z < l.minZ || z > l.maxZ) return false
    }
    // Buildings: the corners, the middle of each side and the centre. A wall would have
    // to slip between two of those to be missed, and they are under 2.5 m apart.
    if (this.index.buildingAt(rect.x, rect.z)) return false
    for (let i = 0; i < 8; i += 2) {
      const j = (i + 2) % 8
      if (this.index.buildingAt(corners[i], corners[i + 1])) return false
      if (
        this.index.buildingAt((corners[i] + corners[j]) / 2, (corners[i + 1] + corners[j + 1]) / 2)
      )
        return false
    }
    for (const [x, z, r] of this.trunks.at(rect.x, rect.z)) {
      if (distToOrientedRect(x, z, rect) < r + 0.25) return false
    }
    let free = true
    this.taken.near(rect.x, rect.z, 8, (other) => {
      if (free && orientedRectsOverlap(rect, other, GAP)) free = false
    })
    return free
  }

  /** Park a vehicle at a spot, facing along (dx, dz), if there is room. */
  park(kind: VehicleKind, spot: Spot, seed: number, label?: string, paint?: number): boolean {
    if (this.full(kind)) return false
    const spec = VEHICLES[kind]
    const rect: OrientedRect = {
      x: spot.x,
      z: spot.z,
      dx: spot.dx,
      dz: spot.dz,
      halfLength: spec.length / 2,
      halfWidth: spec.width / 2,
    }
    if (!this.clear(rect)) return false
    const reach = Math.hypot(rect.halfLength, rect.halfWidth)
    this.taken.insert(rect, rect.x - reach, rect.z - reach, rect.x + reach, rect.z + reach)
    this.counts[kind]++
    const placement: Placement = {
      kind,
      x: round2(spot.x),
      z: round2(spot.z),
      yaw: round4(yawOf(spot.dx, spot.dz)),
      paint: paint ?? Math.floor(hash01(seed, 91) * PAINT[kind].length),
    }
    if (label) placement.label = label
    this.placements.push(placement)
    return true
  }

  /**
   * The streets a vehicle could park on within reach of a point, nearest first, each with
   * where along it the point falls and on which side.
   */
  streetsNear(x: number, z: number, reach: number, minWidth: number): NearbyStreet[] {
    const found = new Map<ZoneRoad, NearbyStreet>()
    this.index.roadsNear(x, z, reach, ({ road }) => {
      if (found.has(road) || !parkable(road) || road.w < minWidth) return
      const street = this.street(road)
      const { line, dist } = street
      let best: NearbyStreet | undefined
      let bestSq = reach * reach
      for (let i = 0; i < line.length - 2; i += 2) {
        const ax = line[i]
        const az = line[i + 1]
        const dx = line[i + 2] - ax
        const dz = line[i + 3] - az
        const lenSq = dx * dx + dz * dz
        if (lenSq < 1e-6) continue
        const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / lenSq))
        const px = ax + dx * t
        const pz = az + dz * t
        const dSq = (px - x) * (px - x) + (pz - z) * (pz - z)
        if (dSq >= bestSq) continue
        bestSq = dSq
        // Which side of the street the point is on: positive is the left of the way the line runs.
        const left = dz * (x - ax) - dx * (z - az)
        best = {
          street,
          along: dist[i / 2] + Math.sqrt(lenSq) * t,
          side: left >= 0 ? 1 : -1,
          distance: Math.sqrt(dSq),
        }
      }
      if (best) found.set(road, best)
    })
    return [...found.values()].sort((a, b) => a.distance - b.distance)
  }

  /**
   * A spot beside a street: `along` metres from its start, on its left (side 1) or right
   * (side -1), `offset` metres out from the centre line, facing the way traffic flows there.
   */
  beside(street: Street, along: number, side: 1 | -1, offset: number): Spot | undefined {
    if (along < 0 || along > street.length) return undefined
    const { line, dist } = street
    let i = 0
    while (i < dist.length - 2 && dist[i + 1] < along) i++
    const len = dist[i + 1] - dist[i]
    if (len < 1e-6) return undefined
    const dx = (line[i * 2 + 2] - line[i * 2]) / len
    const dz = (line[i * 2 + 3] - line[i * 2 + 1]) / len
    const t = along - dist[i]
    // The true left of a direction on the map is (dz, -dx): heading north, that is west.
    const x = line[i * 2] + dx * t + dz * side * offset
    const z = line[i * 2 + 1] + dz * t - dx * side * offset
    // Kenya drives on the left: on the left of the line traffic runs with it, on the
    // right against it. A one-way street runs with its line on both sides.
    const flow = street.road.ow || side === 1 ? 1 : -1
    return { x, z, dx: dx * flow, dz: dz * flow }
  }

  /** True when a kerbside spot would block the mouth of another street. */
  blocksJunction(spot: Spot, own: ZoneRoad): boolean {
    let blocked = false
    this.index.roadsNear(spot.x, spot.z, 30, ({ ax, az, bx, bz, road }) => {
      if (blocked || road === own || !DRIVABLE[road.k] || road.e) return
      const reach = road.w / 2 + SIDE_ROAD_CLEARANCE
      if (distToSegmentSq(spot.x, spot.z, ax, az, bx, bz) < reach * reach) blocked = true
    })
    return blocked
  }

  /** True when a point is on, or right beside, any carriageway. */
  onRoad(x: number, z: number, margin: number): boolean {
    let on = false
    this.index.roadsNear(x, z, 20, ({ ax, az, bx, bz, road }) => {
      if (on || !DRIVABLE[road.k] || road.e) return
      const reach = road.w / 2 + margin
      if (distToSegmentSq(x, z, ax, az, bx, bz) < reach * reach) on = true
    })
    return on
  }
}

/** Streets a vehicle can be parked on: on the ground, open to cars, not a slip road. */
function parkable(road: ZoneRoad): boolean {
  return DRIVABLE[road.k] && !road.e && !road.br && !road.lk && road.k !== 'motorway'
}

const round2 = (value: number) => Math.round(value * 100) / 100
const round4 = (value: number) => Math.round(value * 10000) / 10000

/** Deterministic shuffle: order by a hash of each item's position in the list. */
function shuffled<T>(items: T[], salt: number): T[] {
  return items
    .map((item, i) => ({ item, key: hash01(i, salt) }))
    .sort((a, b) => a.key - b.key)
    .map(({ item }) => item)
}

export function planFleet(
  file: ZoneFile,
  index: ZoneIndex,
  options: PlacementOptions = {},
): Placement[] {
  const plan = new Planner(file, index, options)
  const q = file.q
  const car = VEHICLES.car
  const boda = VEHICLES.boda
  const matatu = VEHICLES.matatu
  const kerbOffset = (road: ZoneRoad, width: number) => road.w / 2 - width / 2 - KERB_GAP

  /** A row of bodas on the pavement, noses to the street. */
  const bodaRank = (street: Street, along: number, side: 1 | -1, count: number, seed: number) => {
    const pavement = PAVEMENT[street.road.k] ?? 0
    const onPavement = pavement >= boda.length * 0.5
    const offset = onPavement
      ? street.road.w / 2 + Math.min(pavement, boda.length) / 2 + 0.1
      : kerbOffset(street.road, boda.width)
    for (let k = 0; k < count; k++) {
      const spot = plan.beside(street, along + k * (boda.width + 0.25), side, offset)
      if (!spot) continue
      if (onPavement) {
        // Turn to face the street, a little askew, as a rank of waiting riders sits.
        const lean = (hash01(seed, 40 + k) - 0.5) * 0.5
        const nx = -spot.dz * 1
        const nz = spot.dx * 1
        // (nx, nz) is the right of the flow direction, which points into the carriageway
        // on the left-hand side of the road and away from it on a one-way street's right.
        const inward = street.road.ow && side === -1 ? -1 : 1
        const cos = Math.cos(lean)
        const sin = Math.sin(lean)
        const fx = nx * inward
        const fz = nz * inward
        spot.dx = fx * cos - fz * sin
        spot.dz = fx * sin + fz * cos
      }
      plan.park('boda', spot, seed * 31 + k)
    }
  }

  /**
   * Park at the kerb as near as possible to a point along a street: the exact spot if
   * it is free, otherwise the closest free one within a few car lengths either way.
   */
  const kerbPark = (
    kind: VehicleKind,
    street: Street,
    along: number,
    side: 1 | -1,
    seed: number,
    label?: string,
    paint?: number,
  ): boolean => {
    const offset = kerbOffset(street.road, VEHICLES[kind].width)
    for (let n = 0; n <= KERB_SEARCH_STEPS; n++) {
      for (const way of n === 0 ? [0] : [-1, 1]) {
        const spot = plan.beside(street, along + way * n * KERB_SEARCH_STEP, side, offset)
        if (!spot || plan.blocksJunction(spot, street.road)) continue
        if (plan.park(kind, spot, seed, label, paint)) return true
      }
    }
    return false
  }

  // ------------------------------------------------------------------ at the start
  if (options.start) {
    const { x, z, yaw } = options.start
    const fx = -Math.sin(yaw)
    const fz = -Math.cos(yaw)
    const rx = Math.cos(yaw)
    const rz = -Math.sin(yaw)
    const ahead = (forward: number, right: number): Spot => ({
      x: x + fx * forward + rx * right,
      z: z + fz * forward + rz * right,
      dx: fx,
      dz: fz,
    })
    // Either side of the opening view, so they frame it instead of blocking it, and
    // none of them hides another.
    const starters: { kind: VehicleKind; spot: Spot; paint: number; label?: string }[] = [
      { kind: 'car', spot: ahead(9, -5.5), paint: CAR_PAINT.indexOf(STARTER_CAR) },
      { kind: 'boda', spot: ahead(6.5, 3.6), paint: 0 },
      {
        kind: 'matatu',
        spot: ahead(15, 9.5),
        paint: MATATU_PAINT.indexOf(STARTER_MATATU),
        label: 'City Square',
      },
    ]
    const near = plan.streetsNear(x, z, START_REACH, 5.5)[0]
    starters.forEach(({ kind, spot, paint, label }, i) => {
      if (plan.park(kind, spot, i, label, paint) || !near) return
      // No room there: queue at the kerb of the nearest street instead.
      const { street, along, side } = near
      const step = street.road.ow || side === 1 ? 1 : -1
      kerbPark(kind, street, along - step * i * (matatu.length + QUEUE_GAP), side, i, label, paint)
    })
  }

  // ------------------------------------------------------------------ matatus (and bodas) at the stages
  file.pois.forEach((poi, i) => {
    if (poi.k !== 'stage') return
    const x = poi.x / q
    const z = poi.z / q
    const label = poi.r ?? poi.n
    const queue = 1 + Math.floor(hash01(i, 11) * 2.7)
    const pitch = matatu.length + QUEUE_GAP
    // The street beside the marker is often a short stub between two junctions with no
    // legal kerb at all, so work outwards: nearest street first, the marker's own side
    // of it first, and stop at the first place a matatu fits.
    let rank: { street: Street; along: number; side: 1 | -1; step: 1 | -1 } | undefined
    for (const { street, along, side: nearSide } of plan.streetsNear(x, z, STAGE_REACH, 5.5)) {
      for (const side of [nearSide, -nearSide] as (1 | -1)[]) {
        const step = street.road.ow || side === 1 ? 1 : -1
        let parked = 0
        for (let k = 0; k < queue; k++) {
          if (kerbPark('matatu', street, along - step * k * pitch, side, i * 7 + k, label)) parked++
        }
        if (parked) {
          rank = { street, along, side, step }
          break
        }
      }
      if (rank) break
    }
    if (!rank) {
      // A stage off the street (inside a bus station): park around the marker itself.
      for (let k = 0; k < queue; k++) {
        const angle = hash01(i, 12) * Math.PI * 2
        const dx = Math.cos(angle)
        const dz = Math.sin(angle)
        const across = (k - (queue - 1) / 2) * (matatu.width + 0.9)
        plan.park('matatu', { x: x - dz * across, z: z + dx * across, dx, dz }, i * 7 + k, label)
      }
      return
    }
    const { street, along, side, step } = rank
    // Riders wait just ahead of the front matatu.
    const riders = 2 + Math.floor(hash01(i, 13) * 3)
    bodaRank(street, along + step * (matatu.length / 2 + 1.6), side, riders, i)
  })

  // ------------------------------------------------------------------ filling stations
  file.pois.forEach((poi, i) => {
    if (poi.k !== 'fuel') return
    const x = poi.x / q
    const z = poi.z / q
    // The marker is usually the canopy. Try spots in a ring around it, on the forecourt.
    let cars = 0
    let bodas = 0
    for (let k = 0; k < 14 && (cars < 2 || bodas < 2); k++) {
      const angle = (k / 14 + hash01(i, 50)) * Math.PI * 2
      const radius = 9 + hash01(i * 17 + k, 51) * 9
      const px = x + Math.cos(angle) * radius
      const pz = z + Math.sin(angle) * radius
      if (plan.onRoad(px, pz, 1.5)) continue
      const heading = hash01(i * 17 + k, 52) * Math.PI * 2
      const spot = { x: px, z: pz, dx: Math.cos(heading), dz: Math.sin(heading) }
      if (bodas < 2 && k % 2 === 0) {
        if (plan.park('boda', spot, i * 13 + k)) bodas++
      } else if (cars < 2 && plan.park('car', spot, i * 13 + k)) cars++
    }
  })

  // ------------------------------------------------------------------ cars at the kerb
  const kerbside: { spot: Spot; seed: number }[] = []
  file.roads.forEach((road, r) => {
    const share = KERB_PARKING[road.k]
    if (!share || !parkable(road) || road.w < 6.4 || hash01(r, 20) > share) return
    const street = plan.street(road)
    const pitch = car.length + QUEUE_GAP
    const sides: (1 | -1)[] = [1, -1]
    for (const side of sides) {
      // Parked cars come in runs with gaps between, not evenly spaced.
      let run = 0
      for (
        let along = JUNCTION_CLEARANCE, n = 0;
        along < street.length - JUNCTION_CLEARANCE;
        along += pitch, n++
      ) {
        const seed = r * 977 + n * 2 + (side === 1 ? 0 : 1)
        if (run <= 0) {
          if (hash01(seed, 21) < 0.22) run = 1 + Math.floor(hash01(seed, 22) * 5)
          else continue
        }
        run--
        const spot = plan.beside(street, along, side, kerbOffset(road, car.width))
        if (spot && !plan.blocksJunction(spot, road)) kerbside.push({ spot, seed })
      }
    }
  })
  const kerbBudget = plan.count('car') + Math.round(FLEET_LIMITS.car * KERBSIDE_SHARE)
  for (const { spot, seed } of shuffled(kerbside, 23)) {
    if (plan.count('car') >= kerbBudget) break
    plan.park('car', spot, seed)
  }

  // ------------------------------------------------------------------ cars in the car parks
  const bays: { spot: Spot; seed: number }[] = []
  file.areas.forEach((area, a) => {
    if (area.k !== 'parking') return
    const outer = area.p.map((value) => value / q)
    const holes = (area.hs ?? []).map((hole) => hole.map((value) => value / q))
    // Rows run along the car park's longest side.
    let ux = 1
    let uz = 0
    let longest = 0
    for (let i = 0; i < outer.length; i += 2) {
      const j = (i + 2) % outer.length
      const ex = outer[j] - outer[i]
      const ez = outer[j + 1] - outer[i + 1]
      const len = Math.hypot(ex, ez)
      if (len > longest) {
        longest = len
        ux = ex / len
        uz = ez / len
      }
    }
    const vx = -uz
    const vz = ux
    let minU = Infinity
    let maxU = -Infinity
    let minV = Infinity
    let maxV = -Infinity
    for (let i = 0; i < outer.length; i += 2) {
      const u = outer[i] * ux + outer[i + 1] * uz
      const v = outer[i] * vx + outer[i + 1] * vz
      minU = Math.min(minU, u)
      maxU = Math.max(maxU, u)
      minV = Math.min(minV, v)
      maxV = Math.max(maxV, v)
    }
    // Rows come in pairs, nose to nose, with an aisle between pairs.
    let row = 0
    for (let v = minV + 0.6 + BAY_DEPTH / 2; v < maxV - BAY_DEPTH / 2; row++) {
      const facing = row % 2 === 0 ? 1 : -1
      let column = 0
      for (let u = minU + 0.6 + BAY_WIDTH / 2; u < maxU - BAY_WIDTH / 2; u += BAY_WIDTH, column++) {
        const seed = a * 7919 + row * 131 + column
        const run = a * 7919 + row * 131 + Math.floor(column / BAY_RUN)
        if (hash01(run, 30) > 0.34 || hash01(seed, 31) > 0.78) continue
        const x = u * ux + v * vx
        const z = u * uz + v * vz
        const spot = { x, z, dx: vx * facing, dz: vz * facing }
        const corners = orientedRectCorners({
          ...spot,
          halfLength: BAY_DEPTH / 2,
          halfWidth: BAY_WIDTH / 2,
        })
        let inside = true
        for (let i = 0; i < 8 && inside; i += 2) {
          inside = pointInPolygon(corners[i], corners[i + 1], outer, holes)
        }
        // The lanes through a car park are mapped as service roads: leave them open.
        if (inside && !plan.onRoad(x, z, car.length / 2 - 0.4)) bays.push({ spot, seed })
      }
      v += row % 2 === 0 ? BAY_DEPTH : BAY_DEPTH + AISLE
    }
  })
  for (const { spot, seed } of shuffled(bays, 32)) {
    if (plan.full('car')) break
    plan.park('car', spot, seed)
  }

  return plan.placements
}
