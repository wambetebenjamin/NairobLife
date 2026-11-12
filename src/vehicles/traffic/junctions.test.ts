import { describe, expect, it } from 'vitest'
import { orientedRectsOverlap } from '../../core/geom2d'
import { VEHICLES } from '../../config/vehicles'
import { loadBakedZone } from '../../testing/zoneFixture'
import { buildRoadGraph, trafficPose, type TrafficAgent } from './graph'
import { findJunctions, JUNCTION_STOP, JunctionController } from './junctions'
import { TrafficSimulation } from './simulation'

const zone = loadBakedZone()
const graph = buildRoadGraph({
  ...zone,
  q: 1,
  pois: [],
  roads: [
    { k: 'primary', p: [-40, 0, 0, 0], w: 8, ow: 1 },
    { k: 'primary', p: [0, 0, 40, 0], w: 8, ow: 1 },
    { k: 'primary', p: [0, 40, 0, 0], w: 8, ow: 1 },
    { k: 'primary', p: [0, 0, 0, -40], w: 8, ow: 1 },
  ],
})
const agent = (edge: number, seed: number, progress = 25): TrafficAgent => ({
  edge,
  seed,
  progress,
  speed: 6,
  kind: 'car',
  wait: 0,
  stopped: false,
  turns: 0,
})

describe('junction arbitration', () => {
  it('detects intersections, not ordinary two-way road points', () => {
    expect([...findJunctions(graph)]).toEqual(['0,0'])
  })
  it('chooses by arrival and seed rather than array order, and releases on an obstacle before entry', () => {
    const a = agent(0, 1),
      b = agent(2, 2)
    const controller = new JunctionController(graph)
    let blocked = new Set<TrafficAgent>()
    let rules = controller.clearances([b, a], 0.1, (x) => !blocked.has(x))
    expect(rules.has(a)).toBe(false)
    expect(rules.get(b)).toBe(40 - b.progress - JUNCTION_STOP)
    blocked = new Set([a])
    rules = controller.clearances([b, a], 0.1, (x) => !blocked.has(x))
    expect(rules.has(b)).toBe(false)
    expect(rules.has(a)).toBe(true)
  })
  it('does not let perpendicular traffic occupy the same junction; both eventually get through', () => {
    const a = agent(0, 1),
      b = agent(2, 2)
    const sim = new TrafficSimulation(graph, [b, a], new Set())
    let aCrossed = false,
      bCrossed = false
    for (let i = 0; i < 240; i++) {
      sim.step(0.05, i * 0.05)
      aCrossed ||= a.edge !== 0
      bCrossed ||= b.edge !== 2
      if (aCrossed && bCrossed) break
      const rect = (v: TrafficAgent) => {
        const p = trafficPose(graph.edges[v.edge], v.progress),
          spec = VEHICLES[v.kind]
        return {
          x: p.x,
          z: p.z,
          dx: -Math.sin(p.yaw),
          dz: -Math.cos(p.yaw),
          halfLength: spec.length / 2,
          halfWidth: spec.width / 2,
        }
      }
      expect(orientedRectsOverlap(rect(a), rect(b))).toBe(false)
    }
    expect(aCrossed).toBe(true)
    expect(bCrossed).toBe(true)
  })
  it('holds red approaches and permits a committed vehicle to clear after the light changes', () => {
    const a = agent(0, 1, 30),
      sim = new TrafficSimulation(graph, [a], new Set(['0,0']))
    sim.step(0.1, 15) // x-facing road is red
    expect(a.progress).toBeLessThanOrEqual(32)
    sim.step(0.1, 0) // green
    expect(a.progress).toBeGreaterThan(30)
    a.progress = 33
    sim.step(0.1, 15) // already inside the reserved area
    expect(a.progress).toBeGreaterThan(33)
  })
  it('keeps ownership after leaving on a short edge until physically clear', () => {
    const small = buildRoadGraph({
      ...zone,
      q: 1,
      pois: [],
      roads: [
        { k: 'primary', p: [-40, 0, 0, 0, 4, 0, 40, 0], w: 8, ow: 1 },
        { k: 'primary', p: [0, 40, 0, 0, 0, -40], w: 8, ow: 1 },
      ],
    })
    const a = agent(0, 1, 39),
      b = agent(3, 2, 25),
      c = new JunctionController(small)
    expect(c.clearances([a, b], 0.1, () => true).has(a)).toBe(false)
    a.edge = 2
    a.progress = 0.5 // beyond the short first exit segment, still near the junction
    const rules = c.clearances([a, b], 0.1, () => true)
    expect(rules.has(b)).toBe(true)
  })
  it('waits at a dead end and restarts only when the candidate is clear', () => {
    const a = agent(1, 3, 39),
      sim = new TrafficSimulation(graph, [a], new Set())
    sim.step(1, 0)
    expect(a).toMatchObject({ edge: 1, progress: 40, wait: 3, respawn: true })
    sim.step(3, 3)
    sim.step(0.1, 3.1, new Set(), () => false)
    expect(a).toMatchObject({ edge: 1, progress: 40, respawn: true })
    sim.step(1.1, 4.3, new Set(), () => true)
    expect(a.respawn).toBe(false)
    expect(a.progress).toBe(20)
    expect([0, 2]).toContain(a.edge)
  })
  it('does not restart on top of another simulated vehicle', () => {
    const dead = agent(1, 3, 40)
    dead.wait = 0
    dead.respawn = true
    const first = agent(0, 1, 20),
      second = agent(2, 2, 20)
    const sim = new TrafficSimulation(graph, [dead, first, second], new Set())
    sim.step(0.01, 0, new Set(), () => true)
    expect(dead.respawn).toBe(true)
    expect(dead.edge).toBe(1)
  })
})
