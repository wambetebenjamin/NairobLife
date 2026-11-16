import { describe, expect, it } from 'vitest'
import { loadBakedZone } from '../../testing/zoneFixture'
import { ZoneIndex } from '../zone/zoneIndex'
import { distToSegmentSq } from '../../core/geom2d'
import { DRIVABLE } from '../zone/format'
import { scatterTrees } from '../geometry/trees'
import { crowdHotspots, isMoving, pedestrianPose, planPedestrians, planStageWaiters } from './paths'

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

describe('the crowd is doing things, not just walking', () => {
  const zone = loadBakedZone()
  const index = new ZoneIndex(zone)
  const trees = scatterTrees(zone)
  const start = { x: -120.2, z: -109.5, yaw: -2.313 }
  const walkers = planPedestrians(zone, index, trees, start)
  const waiters = planStageWaiters(zone, index, trees, 90)

  it('has joggers among the walkers, at a runner’s pace', () => {
    const joggers = walkers.filter((p) => p.activity === 'jog')
    expect(joggers.length).toBeGreaterThan(10)
    for (const jogger of joggers) expect(jogger.speed).toBeGreaterThan(2.4)
    // The walking majority is untouched.
    expect(walkers.filter((p) => (p.activity ?? 'walk') === 'walk').length).toBeGreaterThan(200)
  })

  it('puts people at the mapped stages: standing, queueing and sitting', () => {
    expect(waiters.length).toBeGreaterThan(60)
    const kinds = new Set(waiters.map((p) => p.activity))
    expect(kinds).toContain('wait')
    expect(kinds).toContain('queue')
    expect(kinds).toContain('sit')
    for (const person of waiters) expect(isMoving(person.activity)).toBe(false)
  })

  it('does not leave anyone standing in the carriageway', () => {
    for (const person of waiters) {
      let onRoad = false
      index.roadsNear(person.stand!.x, person.stand!.z, 2, ({ ax, az, bx, bz, road }) => {
        if (road.e || !DRIVABLE[road.k]) return
        // The same standard the placement uses: a person may stand at the kerb, not in the
        // traffic, with a 0.3 m allowance for the kerb itself.
        if (
          distToSegmentSq(person.stand!.x, person.stand!.z, ax, az, bx, bz) <
          Math.max(0, road.w / 2 - 0.3) ** 2
        )
          onRoad = true
      })
      expect(onRoad, `${person.seed} stands on a road`).toBe(false)
    }
  })

  it('keeps a waiting person where they were put, and turns them to the road', () => {
    const person = waiters[0]
    const a = pedestrianPose(person, 0)
    const b = pedestrianPose(person, 60)
    expect(a).toMatchObject({ x: b.x, z: b.z, walking: false })
    // Facing is not arbitrary: the road they are waiting for is in front of them.
    expect(Number.isFinite(a.yaw)).toBe(true)
  })
})
