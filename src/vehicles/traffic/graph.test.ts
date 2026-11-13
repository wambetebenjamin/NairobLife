import { describe, expect, it } from 'vitest'
import { VEHICLES } from '../../config/vehicles'
import { orientedRectsOverlap } from '../../core/geom2d'
import { loadBakedZone } from '../../testing/zoneFixture'
import {
  buildRoadGraph,
  makeTraffic,
  sameEdgeClearance,
  stepTraffic,
  trafficPose,
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
  it('never starts two vehicles inside each other, wherever the player is standing', () => {
    // A spawn used to place a vehicle on its edge without looking at what was already
    // there, so two cars could start overlapping and stay locked together until one
    // happened to reach a junction. The whole city is checked, not one lucky start.
    const real = buildRoadGraph(fixture)
    // The first of these used to place two cars inside each other.
    for (const start of [
      { x: -1440, z: -900 },
      { x: 0, z: 0 },
      { x: 600.9, z: 335 },
      { x: 311.4, z: -407.8 },
    ]) {
      const agents = makeTraffic(real, start)
      expect(agents).toHaveLength(65)
      const bodies = agents.map((a) => {
        const pose = trafficPose(real.edges[a.edge], a.progress)
        const spec = VEHICLES[a.kind]
        return {
          x: pose.x,
          z: pose.z,
          dx: -Math.sin(pose.yaw),
          dz: -Math.cos(pose.yaw),
          halfLength: spec.length / 2,
          halfWidth: spec.width / 2,
        }
      })
      for (let i = 0; i < bodies.length; i++)
        for (let j = i + 1; j < bodies.length; j++)
          expect(
            orientedRectsOverlap(bodies[i], bodies[j], 1.2),
            `vehicles ${i} and ${j} overlap near (${start.x}, ${start.z})`,
          ).toBe(false)
    }
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
  it('keeps a same-edge following gap sized to both vehicles, ignoring opponents', () => {
    const follower = agent('matatu')
    const ahead = { ...agent(), progress: 22 }
    const behind = { ...agent(), progress: 1, edge: 1 }
    // The gap kept is half of each vehicle's length plus two metres of air.
    const gap = VEHICLES.matatu.length / 2 + VEHICLES.car.length / 2 + 2
    expect(sameEdgeClearance(follower, [follower, ahead, behind])).toBeCloseTo(22 - gap, 5)
    const available = sameEdgeClearance(follower, [follower, ahead])
    // `stepTraffic` moves along whole edges and stops at each vertex, so ask for a little
    // less than the whole gap: this is a following distance, not an exact target.
    stepTraffic(follower, graph, (available - 0.5) / follower.speed)
    expect(follower.progress).toBeCloseTo(available - 0.5, 5)
    expect(follower.progress).toBeLessThan(available)
    // Half a metre of the two metres of air is gone, but it may still creep that last
    // little way: 0.5 m of air remains.
    expect(sameEdgeClearance(follower, [follower, ahead])).toBeCloseTo(0.5, 5)
  })
})
