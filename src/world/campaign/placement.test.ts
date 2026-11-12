import { describe, expect, it } from 'vitest'
import { loadBakedZone } from '../../testing/zoneFixture'
import { planFleet } from '../../vehicles/placement'
import { scatterTrees, TREE_STRIDE, trunkRadius } from '../geometry/trees'
import { ZoneIndex } from '../zone/zoneIndex'
import { DRIVABLE } from '../zone/format'
import { distToSegmentSq } from '../../core/geom2d'
import { planCampaign } from './placement'

const zone = loadBakedZone(),
  index = new ZoneIndex(zone),
  trees = scatterTrees(zone)
const start = { x: -120.2, z: -109.5, yaw: -2.313 }
const fleet = planFleet(zone, index, { start, trees, edgeInset: 12 })

describe('fictional campaign placement', () => {
  it('finds a deterministic, open site near City Square away from parked vehicles', () => {
    const site = planCampaign(index, trees, fleet, start)
    expect(site).not.toBeNull()
    expect(site).toEqual(planCampaign(index, trees, fleet, start))
    expect(Math.hypot(site!.x - start.x, site!.z - start.z)).toBeLessThan(90)
    expect(fleet.every((p) => Math.hypot(p.x - site!.x, p.z - site!.z) >= 12)).toBe(true)
    const fx = -Math.sin(start.yaw),
      fz = -Math.cos(start.yaw),
      rx = Math.cos(start.yaw),
      rz = -Math.sin(start.yaw)
    for (let a = -7; a <= 7; a += 2)
      for (let b = -7; b <= 7; b += 2) {
        const x = site!.x + rx * a + fx * b,
          z = site!.z + rz * a + fz * b
        expect(index.buildingAt(x, z)).toBeUndefined()
        index.roadsNear(x, z, 2, ({ ax, az, bx, bz, road }) => {
          if (DRIVABLE[road.k] && !road.e)
            expect(distToSegmentSq(x, z, ax, az, bx, bz)).toBeGreaterThanOrEqual(
              (road.w / 2 + 1) ** 2,
            )
        })
        for (let i = 0; i < trees.length; i += TREE_STRIDE)
          expect(Math.hypot(x - trees[i], z - trees[i + 1])).toBeGreaterThanOrEqual(
            trunkRadius(trees[i + 2]) + 1.6,
          )
      }
  })
  it('omits the event when all candidate space is blocked', () => {
    const blocked = Object.create(index) as ZoneIndex
    blocked.buildingAt = () => zone.buildings[0]
    expect(planCampaign(blocked, new Float32Array(), [], start)).toBeNull()
  })
})
