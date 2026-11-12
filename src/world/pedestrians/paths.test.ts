import { describe, expect, it } from 'vitest'
import { loadBakedZone } from '../../testing/zoneFixture'
import { ZoneIndex } from '../zone/zoneIndex'
import { scatterTrees } from '../geometry/trees'
import { crowdHotspots, pedestrianPose, planPedestrians } from './paths'

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
  it('includes pavement crowds near mapped stages and City Market', () => {
    const hotspots = crowdHotspots(zone)
    const market = zone.places.find((p) => p.n === 'City Market')!
    const cx =
      market.p.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0) /
      (market.p.length / 2) /
      zone.q
    const cz =
      market.p.filter((_, i) => i % 2 === 1).reduce((a, b) => a + b, 0) /
      (market.p.length / 2) /
      zone.q
    expect(hotspots.some((h) => Math.hypot(h.x - cx, h.z - cz) < 1)).toBe(true)
    expect(
      paths.filter((p) => Math.hypot((p.ax + p.bx) / 2 - cx, (p.az + p.bz) / 2 - cz) < 90).length,
    ).toBeGreaterThan(3)
  })
  it('pauses at the ends of a walking path before turning back', () => {
    const p = { ax: 0, az: 0, bx: 10, bz: 0, length: 10, speed: 1, phase: 0, seed: 0, pause: 2 }
    expect(pedestrianPose(p, 11)).toMatchObject({ x: 10, walking: false })
    expect(pedestrianPose(p, 13)).toMatchObject({ x: 9, walking: true })
    expect(pedestrianPose(p, 23)).toMatchObject({ x: 0, walking: false })
  })
})
