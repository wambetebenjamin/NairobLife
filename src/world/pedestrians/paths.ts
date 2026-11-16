/** Deterministic short walking routes on mapped ground-level pavements. */
import { distToSegmentSq } from '../../core/geom2d'
import { hash01 } from '../../core/random'
import { SpatialGrid } from '../../core/spatialGrid'
import { PAVEMENT } from '../geometry/ground'
import { TREE_STRIDE, trunkRadius } from '../geometry/trees'
import { DRIVABLE, type ZoneFile } from '../zone/format'
import type { ZoneIndex } from '../zone/zoneIndex'

/**
 * What a person is doing, which decides how they move and how they stand.
 *
 * This is the difference between a crowd that reads as people and one that reads as a
 * animation loop: on a Nairobi pavement somebody is jogging for fitness, somebody is
 * standing at a stage waiting for a matatu with their weight on one hip, and somebody is
 * sitting on the kerb. The model is still simple -- each person is one route and one
 * behaviour, with no interaction between people -- but it is not uniform.
 */
export type Activity =
  /** Walking at an ordinary pace, the default. */
  | 'walk'
  /** Running: longer stride, bigger arm swing, leaning forward. */
  | 'jog'
  /** Standing at a stage, facing the road, shifting weight. */
  | 'wait'
  /** Standing in a loose queue, as at a matatu stage with a full vehicle. */
  | 'queue'
  /** Sitting on a low wall or a kerb, one knee up. */
  | 'sit'

export interface WalkingPath {
  ax: number
  az: number
  bx: number
  bz: number
  length: number
  speed: number
  phase: number
  seed: number
  /** Idle briefly at the end of a walking segment. */
  pause?: number
  /** What this person is doing. Absent means 'walk'. */
  activity?: Activity
  /** Where the person stands when not walking — the stage or the kerb. */
  stand?: { x: number; z: number }
}

/** How fast each activity moves, in m/s, before the per-person variation. */
export const PACE: Record<Activity, number> = {
  walk: 1.15,
  jog: 2.9,
  wait: 0,
  queue: 0,
  sit: 0,
}

/** Whether an activity moves at all. */
export const isMoving = (activity: Activity | undefined): boolean =>
  (activity ?? 'walk') === 'walk' || activity === 'jog'

/**
 * Whether a person can stand at a point: inside the map, clear of buildings, clear of
 * tree trunks, and off the carriageway. One predicate, used both for people walking
 * along a pavement and for people waiting at a stage, so nobody ends up standing in the
 * middle of a road.
 */
export function pavementClear(
  index: ZoneIndex,
  trunks: SpatialGrid<[number, number, number]>,
): (x: number, z: number) => boolean {
  return (x, z) => {
    const b = index.bounds
    if (x < b.minX + 14 || x > b.maxX - 14 || z < b.minZ + 14 || z > b.maxZ - 14) return false
    for (const [dx, dz] of [
      [0, 0],
      [0.45, 0],
      [-0.45, 0],
      [0, 0.45],
      [0, -0.45],
    ]) {
      if (index.buildingAt(x + dx, z + dz)) return false
    }
    if (trunks.at(x, z).some(([tx, tz, r]) => Math.hypot(tx - x, tz - z) < r)) return false
    let blocked = false
    index.roadsNear(x, z, 2, ({ ax, az, bx, bz, road }) => {
      if (
        !road.e &&
        DRIVABLE[road.k] &&
        distToSegmentSq(x, z, ax, az, bx, bz) < (road.w / 2 + 0.3) ** 2
      )
        blocked = true
    })
    return !blocked
  }
}

/** The nearest point on a drivable road to `x`,`z`, or null if there isn't one close by. */
export function nearestCarriageway(
  index: ZoneIndex,
  x: number,
  z: number,
  radius = 24,
): { x: number; z: number } | null {
  // `as` rather than a plain annotation: TypeScript narrows a `let` to null when the only
  // assignment is inside a callback, and then calls the property access an error.
  let best = null as { x: number; z: number; d: number } | null
  index.roadsNear(x, z, radius, ({ ax, az, bx, bz, road }) => {
    if (road.e || !DRIVABLE[road.k]) return
    const dx = bx - ax,
      dz = bz - az
    const length2 = dx * dx + dz * dz
    const t = length2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length2)) : 0
    const px = ax + dx * t,
      pz = az + dz * t
    const d = Math.hypot(px - x, pz - z)
    if (!best || d < best.d) best = { x: px, z: pz, d }
  })
  return best ? { x: best.x, z: best.z } : null
}

/** Build a bounded crowd, distributed across the city, with clear paths near the start. */
export function planPedestrians(
  zone: ZoneFile,
  index: ZoneIndex,
  trees: Float32Array,
  start: { x: number; z: number; yaw?: number },
  limit = 300,
): WalkingPath[] {
  const trunks = new SpatialGrid<[number, number, number]>(20)
  for (let i = 0; i < trees.length; i += TREE_STRIDE) {
    const x = trees[i],
      z = trees[i + 1],
      r = trunkRadius(trees[i + 2]) + 0.5
    trunks.insert([x, z, r], x - r, z - r, x + r, z + r)
  }
  const clear = pavementClear(index, trunks)
  const hotspots = crowdHotspots(zone)
  const nearHotspot = (x: number, z: number) =>
    hotspots.some((h) => Math.hypot(h.x - x, h.z - z) < 90)
  const candidates: WalkingPath[] = []
  let seed = 0
  for (const road of zone.roads) {
    const pavement = PAVEMENT[road.k]
    if (!pavement || road.e || road.br || road.lk) continue
    for (let i = 0; i < road.p.length - 2; i += 2) {
      const ax = road.p[i] / zone.q,
        az = road.p[i + 1] / zone.q
      const dx = road.p[i + 2] / zone.q - ax,
        dz = road.p[i + 3] / zone.q - az
      const length = Math.hypot(dx, dz)
      if (length < 12) continue
      const ux = dx / length,
        uz = dz / length
      const busy = nearHotspot((ax + road.p[i + 2] / zone.q) / 2, (az + road.p[i + 3] / zone.q) / 2)
      const count = Math.max(1, Math.floor((length - 4) / (busy ? 11 : 22)))
      for (let j = 0; j < count; j++)
        for (const side of [-1, 1]) {
          const id = seed++
          const middle = ((j + 0.5) * length) / count
          const half = Math.min(7, (length / count) * 0.38)
          const offset = side * (road.w / 2 + pavement * 0.55)
          const x = ax + ux * middle - uz * offset,
            z = az + uz * middle + ux * offset
          // One in nine jogs. Fitness running on a Nairobi pavement is common enough that
          // a crowd without it looks like a still photograph.
          const activity: Activity = hash01(id, 61) < 0.11 ? 'jog' : 'walk'
          const path: WalkingPath = {
            activity,
            ax: x - ux * half,
            az: z - uz * half,
            bx: x + ux * half,
            bz: z + uz * half,
            length: 2 * half,
            // Joggers run at a runner's pace, not a fast walk; the speed also sets how far
            // the limbs swing and how long the stride is, so it has to be honest.
            speed: activity === 'jog' ? 2.6 + hash01(id, 3) * 0.9 : 0.85 + hash01(id, 3) * 0.55,
            phase: hash01(id, 4),
            seed: id,
            pause: 0.4 + hash01(id, 9) * 1.6,
          }
          let valid = true
          for (let n = 0; n <= 8; n++) {
            const t = n / 8
            if (!clear(path.ax + (path.bx - path.ax) * t, path.az + (path.bz - path.az) * t)) {
              valid = false
              break
            }
          }
          if (valid) candidates.push(path)
        }
    }
  }
  // City Square is an open plaza rather than a pavement. Give the opening view a few
  // walkers as well, but only when the entire short route is clear of mapped obstacles.
  const plaza: WalkingPath[] = []
  if (start.yaw !== undefined) {
    const fx = -Math.sin(start.yaw),
      fz = -Math.cos(start.yaw)
    const rx = Math.cos(start.yaw),
      rz = -Math.sin(start.yaw)
    for (const forward of [30, 40, 50])
      for (const side of [-12, -3, 7, 16]) {
        const x = start.x + fx * forward + rx * side
        const z = start.z + fz * forward + rz * side
        const id = -1 - plaza.length
        const path: WalkingPath = {
          ax: x - rx * 3,
          az: z - rz * 3,
          bx: x + rx * 3,
          bz: z + rz * 3,
          length: 6,
          speed: 0.9 + hash01(id, 3) * 0.4,
          phase: hash01(id, 4),
          seed: id,
          pause: 0.4 + hash01(id, 9) * 1.6,
        }
        if (
          Array.from({ length: 9 }, (_, n) => n / 8).every((t) =>
            clear(path.ax + (path.bx - path.ax) * t, path.az + (path.bz - path.az) * t),
          )
        )
          plaza.push(path)
      }
  }
  // Reserve some paths close to the spawn, then choose from the rest across the whole map.
  const distance = (p: WalkingPath) =>
    Math.hypot((p.ax + p.bx) / 2 - start.x, (p.az + p.bz) / 2 - start.z)
  const nearby = candidates
    .filter((p) => distance(p) < 120)
    .sort((a, b) => distance(a) - distance(b))
    .slice(0, 24)
  const used = new Set(nearby)
  const midpoint = (p: WalkingPath) => ({ x: (p.ax + p.bx) / 2, z: (p.az + p.bz) / 2 })
  const busy = candidates
    .filter((p) => !used.has(p) && nearHotspot(midpoint(p).x, midpoint(p).z))
    .sort((a, b) => hash01(a.seed, 75) - hash01(b.seed, 75))
    .slice(0, 80)
  busy.forEach((p) => used.add(p))
  const score = (p: WalkingPath) =>
    hash01(p.seed, 77) / (nearHotspot(midpoint(p).x, midpoint(p).z) ? 2.5 : 1)
  const remainder = candidates.filter((p) => !used.has(p)).sort((a, b) => score(a) - score(b))
  return [...plaza, ...nearby, ...busy, ...remainder].slice(0, Math.max(0, limit))
}

/** Mapped stage points and named market areas used to bias the pavement crowd. */
export function crowdHotspots(zone: ZoneFile): { x: number; z: number }[] {
  const points = zone.pois
    .filter((p) => p.k === 'stage')
    .map((p) => ({ x: p.x / zone.q, z: p.z / zone.q }))
  for (const place of zone.places) {
    if (!/market/i.test(place.n) || place.p.length < 6) continue
    let x = 0,
      z = 0
    for (let i = 0; i < place.p.length; i += 2) {
      x += place.p[i] / zone.q
      z += place.p[i + 1] / zone.q
    }
    const n = place.p.length / 2
    points.push({ x: x / n, z: z / n })
  }
  return points
}

/**
 * Where a person is and what they are doing at `seconds`.
 *
 * Walkers and joggers pace along their route and turn at the ends. People waiting, queueing
 * or sitting stay where they were put: `x`/`z` are constant and the *activity* is what
 * changes over time, not the position. That is the whole difference between a pavement full
 * of people and a pavement full of pendulums.
 */
export function pedestrianPose(path: WalkingPath, seconds: number) {
  const activity = path.activity ?? 'walk'

  // Standing about: no travel at all. A waiting person faces the road they are waiting for.
  if (activity === 'wait' || activity === 'queue' || activity === 'sit') {
    const at = path.stand ?? { x: (path.ax + path.bx) / 2, z: (path.az + path.bz) / 2 }
    const dx = path.bx - path.ax
    const dz = path.bz - path.az
    return { x: at.x, z: at.z, yaw: Math.atan2(-dx, -dz), walking: false }
  }

  const travel = path.length / path.speed
  const pause = path.pause ?? 0
  const period = 2 * (travel + pause)
  const time = (((path.phase * period + seconds) % period) + period) % period
  const forward = time < travel + pause
  const walking = time < travel || (time >= travel + pause && time < 2 * travel + pause)
  const t =
    time < travel
      ? time / travel
      : time < travel + pause
        ? 1
        : time < 2 * travel + pause
          ? 1 - (time - travel - pause) / travel
          : 0
  const dx = path.bx - path.ax,
    dz = path.bz - path.az
  return {
    x: path.ax + dx * t,
    z: path.az + dz * t,
    yaw: Math.atan2(-dx, -dz) + (forward ? 0 : Math.PI),
    walking,
  }
}

/**
 * People at the matatu stages: some standing, some sitting on the kerb, a loose queue.
 *
 * Stages are where a Nairobi pavement is busiest and where people are most obviously
 * *doing nothing*: waiting is the activity, not walking in circles. Each stage gets a
 * handful, placed on the pavement side of the road rather than in the carriageway.
 */
export function planStageWaiters(
  zone: ZoneFile,
  index: ZoneIndex,
  trees: Float32Array,
  limit = 90,
): WalkingPath[] {
  const trunks = new SpatialGrid<[number, number, number]>(20)
  for (let i = 0; i < trees.length; i += TREE_STRIDE) {
    const x = trees[i],
      z = trees[i + 1],
      r = trunkRadius(trees[i + 2]) + 0.5
    trunks.insert([x, z, r], x - r, z - r, x + r, z + r)
  }
  const clear = pavementClear(index, trunks)
  const out: WalkingPath[] = []
  let seed = 500_000
  for (const poi of zone.pois) {
    if (poi.k !== 'stage') continue
    const x = poi.x / zone.q
    const z = poi.z / zone.q
    // Six per stage: two sitting, the rest standing or queueing, spread along the kerb.
    // A stage marker sits in the carriageway, so most points on a small ring around it are
    // rejected; try enough of them to fill the pavement without standing anyone in a road.
    let placed = 0
    for (let n = 0; n < 16 && placed < 6 && out.length < limit; n++) {
      const id = seed++
      const angle = (n / 16) * Math.PI * 2 + hash01(id, 3) * 0.4
      const radius = 1.4 + (n % 4) * 1.5 + hash01(id, 4) * 1.2
      const px = x + Math.cos(angle) * radius
      const pz = z + Math.sin(angle) * radius
      if (!clear(px, pz)) continue
      // Face the road *from where the person is standing*: a person waiting for a matatu
      // looks at the carriageway, not at the pavement. Measuring from the stage marker
      // instead puts people on a corner facing the wrong street; the first version did
      // exactly that and one in three ended up with their back to the road.
      const kerb = nearestCarriageway(index, px, pz)
      if (!kerb) continue
      const fx = kerb.x - px
      const fz = kerb.z - pz
      const length = Math.hypot(fx, fz) || 1
      const ux = fx / length,
        uz = fz / length
      const roll = hash01(id, 5)
      const activity: Activity = roll < 0.18 ? 'sit' : roll < 0.45 ? 'queue' : 'wait'
      out.push({
        activity,
        ax: px - ux * 0.5,
        az: pz - uz * 0.5,
        bx: px + ux * 0.5,
        bz: pz + uz * 0.5,
        length: 1,
        speed: 0,
        phase: hash01(id, 7),
        seed: id,
        stand: { x: px, z: pz },
      })
      placed++
    }
  }
  return out
}
