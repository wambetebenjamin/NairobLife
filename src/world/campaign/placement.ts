/** Choose a clear spot for the fictional City Square campaign, not a real event location. */
import { distToSegmentSq } from '../../core/geom2d'
import type { Placement, StartSpot } from '../../vehicles/placement'
import { TREE_STRIDE, trunkRadius } from '../geometry/trees'
import { DRIVABLE } from '../zone/format'
import type { ZoneIndex } from '../zone/zoneIndex'

export interface CampaignSite {
  x: number
  z: number
  yaw: number
}

export function planCampaign(
  index: ZoneIndex,
  trees: Float32Array,
  parked: Placement[],
  start: StartSpot,
): CampaignSite | null {
  const fx = -Math.sin(start.yaw),
    fz = -Math.cos(start.yaw)
  const rx = Math.cos(start.yaw),
    rz = -Math.sin(start.yaw)
  const clear = (x: number, z: number) => {
    const b = index.bounds
    if (
      x < b.minX + 15 ||
      x > b.maxX - 15 ||
      z < b.minZ + 15 ||
      z > b.maxZ - 15 ||
      index.buildingAt(x, z)
    )
      return false
    let road = false
    index.roadsNear(x, z, 2, ({ ax, az, bx, bz, road: r }) => {
      if (DRIVABLE[r.k] && !r.e && distToSegmentSq(x, z, ax, az, bx, bz) < (r.w / 2 + 1) ** 2)
        road = true
    })
    if (road) return false
    for (let i = 0; i < trees.length; i += TREE_STRIDE)
      if (Math.hypot(trees[i] - x, trees[i + 1] - z) < trunkRadius(trees[i + 2]) + 1.6) return false
    return true
  }
  // This is an optional set piece: omit it if no open patch fits rather than placing it in a road or building.
  for (const forward of [40, 45, 50, 35, 55, 60, 65, 70])
    for (const side of [-25, -20, -30, -15, 25, 20, 30, 15]) {
      const x = start.x + fx * forward + rx * side,
        z = start.z + fz * forward + rz * side
      if (parked.some((p) => Math.hypot(p.x - x, p.z - z) < 12)) continue
      let valid = true
      for (let a = -7; a <= 7; a += 2)
        for (let b = -7; b <= 7; b += 2)
          if (!clear(x + rx * a + fx * b, z + rz * a + fz * b)) valid = false
      if (valid) return { x, z, yaw: Math.atan2(start.x - x, start.z - z) }
    }
  return null
}
