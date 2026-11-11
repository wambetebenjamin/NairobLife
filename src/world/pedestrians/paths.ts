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
      const count = Math.max(1, Math.floor((length - 4) / 22))
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
  const remainder = candidates
    .filter((p) => !used.has(p))
    .sort((a, b) => hash01(a.seed, 77) - hash01(b.seed, 77))
  return [...plaza, ...nearby, ...remainder].slice(0, Math.max(0, limit))
}

/** Ping-pong along a path, returning position and direction. */
export function pedestrianPose(path: WalkingPath, seconds: number) {
  const cycle = (((path.phase + (seconds * path.speed) / (2 * path.length)) % 1) + 1) % 1
  const forward = cycle < 0.5
  const t = forward ? cycle * 2 : 2 - cycle * 2
  const dx = path.bx - path.ax,
    dz = path.bz - path.az
  return {
    x: path.ax + dx * t,
    z: path.az + dz * t,
    yaw: Math.atan2(-dx, -dz) + (forward ? 0 : Math.PI),
  }
}
