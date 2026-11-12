import { describe, expect, it } from 'vitest'
import { orientedRectsOverlap } from '../../core/geom2d'
import { loadBakedZone } from '../../testing/zoneFixture'
import {
  buildRoadGraph,
  makeTraffic,
  sameEdgeClearance,
  stepTraffic,
  trafficPose,
  trafficRect,
  type TrafficAgent,
} from './graph'

const fixture = loadBakedZone()
const zone = {
  ...fixture,
  q: 1,
  roads: [
    { k: 'primary' as const, p: [0, 0, 30, 0, 60, 0], w: 8, ow: 1 as const, ln: 2 },
    { k: 'residential' as const, p: [60, 0, 60, 30], w: 6 },
    { k: 'footway' as const, p: [0, 0, 0, 30], w: 5 },
    { k: 'primary' as const, p: [0, 0, -30, 0], w: 8, br: 1 as const },
  ],
  pois: [{ k: 'stage' as const, x: 15, z: 0 }],
}
const graph = buildRoadGraph(zone)
const agent = (kind: TrafficAgent['kind'] = 'car'): TrafficAgent => ({
  edge: 0,
  progress: 0,
  speed: 10,
  kind,
  seed: 1,
  wait: 0,
  stopped: false,
  turns: 0,
})

describe('ambient traffic graph', () => {
  it('respects one-way streets, lane metadata, shared vertices and excludes footways and bridges', () => {
    expect(graph.edges).toHaveLength(4)
    expect(graph.edges[0]).toMatchObject({
      from: '0,0',
      to: '30,0',
      lanes: 2,
      oneWay: true,
      stage: true,
    })
    expect(graph.outgoing.get('30,0')).toEqual([1])
    expect(graph.outgoing.get('60,30')).toEqual([3])
  })
  it('places opposing traffic to its left', () => {
    const forward = trafficPose(graph.edges[2], 15)
    const reverse = trafficPose(graph.edges[3], 15)
    expect(forward.x).toBeGreaterThan(60)
    expect(reverse.x).toBeLessThan(60)
  })
  it('makes deterministic agents and advances through connected edges', () => {
    expect(makeTraffic(graph, { x: 0, z: 0 })).toEqual(makeTraffic(graph, { x: 0, z: 0 }))
    const car = agent()
    stepTraffic(car, graph, 4)
    expect(car.edge).toBe(1)
    expect(car.progress).toBe(10)
    expect(car.turns).toBe(1)
  })
  it('starts traffic clear of other traffic and the player, including crossing streets', () => {
    for (const g of [graph, buildRoadGraph(fixture)]) {
      const start = { x: 0, z: 0 }
      const agents = makeTraffic(g, start)
      expect(agents.length).toBeGreaterThan(0)
      const rectangles = agents.map((a) => {
        const pose = trafficPose(g.edges[a.edge], a.progress)
        const rect = trafficRect(a.kind, pose)
        expect(Math.hypot(pose.x - start.x, pose.z - start.z)).toBeGreaterThanOrEqual(
          10 + rect.halfLength,
        )
        return rect
      })
      for (let i = 0; i < rectangles.length; i++) {
        for (let j = i + 1; j < rectangles.length; j++) {
          expect(orientedRectsOverlap(rectangles[i], rectangles[j], 1)).toBe(false)
        }
      }
    }
  })
  it('rejects duplicate and crossing candidate boxes even without a shared graph node', () => {
    const crossing = buildRoadGraph({
      ...zone,
      roads: [
        ...Array.from({ length: 12 }, () => ({
          k: 'primary' as const,
          p: [-15, 0, 15, 0],
          w: 8,
          ow: 1 as const,
        })),
        { k: 'primary', p: [0, -15, 0, 15], w: 8, ow: 1 },
      ],
      pois: [],
    })
    const agents = makeTraffic(crossing, { x: 500, z: 500 })
    expect(agents.length).toBeLessThan(13)
    for (const [i, a] of agents.entries()) {
      for (const b of agents.slice(i + 1)) {
        expect(
          orientedRectsOverlap(
            trafficRect(a.kind, trafficPose(crossing.edges[a.edge], a.progress)),
            trafficRect(b.kind, trafficPose(crossing.edges[b.edge], b.progress)),
            1,
          ),
        ).toBe(false)
      }
    }
  })
  it('can return fewer cars when every candidate is occupied or too close to the start', () => {
    const single = buildRoadGraph({
      ...zone,
      roads: [{ k: 'primary', p: [0, 0, 30, 0], w: 6, ow: 1 }],
      pois: [],
    })
    const far = makeTraffic(single, { x: 500, z: 500 })
    expect(far).toHaveLength(1)
    const pose = trafficPose(single.edges[0], far[0].progress)
    expect(makeTraffic(single, pose)).toHaveLength(0)
    expect(makeTraffic(single, { x: 500, z: 500 }, 0)).toHaveLength(0)
  })
  it('adds up to three marked patrol motorcycles to the regular traffic simulation', () => {
    const real = buildRoadGraph(fixture)
    const agents = makeTraffic(real, { x: 0, z: 0 })
    const patrol = agents.filter((a) => a.patrol)
    expect(patrol).toHaveLength(3)
    expect(patrol.every((a) => a.kind === 'boda')).toBe(true)
    const before = patrol[0].progress
    stepTraffic(patrol[0], real, 0.1)
    expect(patrol[0].progress).toBeGreaterThan(before)
    expect(makeTraffic(real, { x: 0, z: 0 }, 2).filter((a) => a.patrol)).toHaveLength(0)
  })
  it('stops matatus at stages, waits, and resumes; bodas do not stop', () => {
    const matatu = agent('matatu')
    stepTraffic(matatu, graph, 2)
    expect(matatu).toMatchObject({ progress: 15, wait: 3, stopped: true })
    stepTraffic(matatu, graph, 3)
    expect(matatu.progress).toBe(15)
    stepTraffic(matatu, graph, 0.5)
    expect(matatu.progress).toBe(20)
    const boda = agent('boda')
    stepTraffic(boda, graph, 2)
    expect(boda.progress).toBe(20)
    expect(boda.wait).toBe(0)
  })
  it('pauses when blocked and safely restarts at a dead end', () => {
    const car = agent()
    stepTraffic(car, graph, 1, true)
    expect(car.progress).toBe(0)
    car.edge = 2
    car.progress = 29
    stepTraffic(car, graph, 1)
    expect(car.edge).toBe(2)
    expect(car.progress).toBe(30)
    expect(car.wait).toBe(3)
    expect(car.respawn).toBe(true)
  })
  it('keeps a same-edge following gap but ignores opposing or behind vehicles', () => {
    const follower = agent('matatu')
    const ahead = { ...agent(), progress: 22 }
    const behind = { ...agent(), progress: 1, edge: 1 }
    expect(sameEdgeClearance(follower, [follower, ahead, behind])).toBe(12)
    stepTraffic(follower, graph, sameEdgeClearance(follower, [follower, ahead]) / follower.speed)
    expect(follower.progress).toBe(12)
    expect(sameEdgeClearance(follower, [follower, ahead])).toBe(0)
  })
})
