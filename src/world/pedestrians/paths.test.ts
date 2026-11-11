import { describe, expect, it } from 'vitest'
import { loadBakedZone } from '../../testing/zoneFixture'
import { ZoneIndex } from '../zone/zoneIndex'
import { scatterTrees } from '../geometry/trees'
import { pedestrianPose, planPedestrians } from './paths'

describe('ambient pedestrians', () => {
  const zone = loadBakedZone()
  const index = new ZoneIndex(zone)
  const trees = scatterTrees(zone)
  const start = { x: -120.2, z: -109.5, yaw: -2.313 }
  const paths = planPedestrians(zone, index, trees, start)
  it('places a bounded and deterministic crowd across the city and near the start', () => {
    expect(paths.length).toBeGreaterThan(100)
    expect(paths.some((path) => path.seed < 0)).toBe(true)
    expect(paths.length).toBeLessThanOrEqual(300)
    expect(paths).toEqual(planPedestrians(zone, index, trees, start))
    expect(
      paths.filter((p) => Math.hypot(p.ax - start.x, p.az - start.z) < 120).length,
    ).toBeGreaterThan(4)
  })
  it('keeps sampled route points out of building footprints', () => {
    for (const p of paths)
      for (let i = 0; i <= 8; i++) {
        const t = i / 8
        expect(index.buildingAt(p.ax + (p.bx - p.ax) * t, p.az + (p.bz - p.az) * t)).toBeUndefined()
      }
  })
  it('moves within a route and reverses at the ends', () => {
    const p = { ax: 0, az: 0, bx: 10, bz: 0, length: 10, speed: 1, phase: 0, seed: 0 }
    expect(pedestrianPose(p, 0).x).toBe(0)
    expect(pedestrianPose(p, 10).x).toBe(10)
    expect(pedestrianPose(p, 15).x).toBe(5)
    expect(pedestrianPose(p, 20).x).toBe(0)
  })
})
