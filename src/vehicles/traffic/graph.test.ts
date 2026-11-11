import { describe, expect, it } from 'vitest'
import { loadBakedZone } from '../../testing/zoneFixture'
import { buildRoadGraph, makeTraffic, stepTraffic, trafficPose, type TrafficAgent } from './graph'

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
    expect(car.edge).toBe(1)
    expect(car.progress).toBe(0)
    expect(car.wait).toBe(3)
  })
})
