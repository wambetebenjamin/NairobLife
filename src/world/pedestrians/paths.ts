/** Deterministic short walking routes on mapped ground-level pavements. */
import { distToSegmentSq } from '../../core/geom2d'
import { hash01 } from '../../core/random'
import { SpatialGrid } from '../../core/spatialGrid'
import { PAVEMENT } from '../geometry/ground'
import { TREE_STRIDE, trunkRadius } from '../geometry/trees'
import { DRIVABLE, type ZoneFile } from '../zone/format'
import type { ZoneIndex } from '../zone/zoneIndex'

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
  const clear = (x: number, z: number) => {
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
          const path = {
            ax: x - ux * half,
            az: z - uz * half,
            bx: x + ux * half,
            bz: z + uz * half,
            length: 2 * half,
            speed: 0.85 + hash01(id, 3) * 0.55,
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

/** Walk back and forth with brief, seeded pauses at the ends of a pavement route. */
export function pedestrianPose(path: WalkingPath, seconds: number) {
  const travel = path.length / path.speed,
    pause = path.pause ?? 0
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
