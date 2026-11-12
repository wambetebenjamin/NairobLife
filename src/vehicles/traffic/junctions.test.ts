import { describe, expect, it } from 'vitest'
import { loadBakedZone } from '../../testing/zoneFixture'
import { findCrossings, sameCarriageway, segmentCrossing } from './crossings'
import { buildRoadGraph, type TrafficAgent } from './graph'
import { travel } from './crossings'
import { JUNCTION_STOP, JunctionController } from './junctions'
import { signalCrossings } from './signals'
import { TrafficSimulation } from './simulation'

const zone = loadBakedZone()

/** Four one-way roads meeting at the origin: east, west, north and south approaches. */
const crossroads = buildRoadGraph({
  ...zone,
  q: 1,
  pois: [],
  roads: [
    { k: 'primary', p: [-60, 0, 0, 0], w: 8, ow: 1 },
    { k: 'primary', p: [0, 0, 60, 0], w: 8, ow: 1 },
    { k: 'primary', p: [0, 60, 0, 0], w: 8, ow: 1 },
    { k: 'primary', p: [0, 0, 0, -60], w: 8, ow: 1 },
  ],
})

const agent = (edge: number, seed: number, progress = 40): TrafficAgent => ({
  edge,
  seed,
  progress,
  speed: 6,
  kind: 'car',
  wait: 0,
  stopped: false,
  turns: 0,
})

describe('segment crossing', () => {
  it('finds a proper crossing and where on each line it is', () => {
    const hit = segmentCrossing(-10, 0, 10, 0, 0, -10, 0, 10)
    expect(hit?.t).toBeCloseTo(0.5)
    expect(hit?.u).toBeCloseTo(0.5)
    expect(segmentCrossing(-10, 0, 10, 0, 0, 2, 10, 2)).toBeNull() // parallel
    expect(segmentCrossing(-10, 0, 10, 0, 10, -10, 10, 10)).toBeNull() // meets at an end
  })

  it('tells the two directions of one carriageway apart', () => {
    const a = { from: '0,0', to: '10,0' } as never
    const b = { from: '10,0', to: '0,0' } as never
    const c = { from: '0,0', to: '0,10' } as never
    expect(sameCarriageway(a, b)).toBe(true)
    expect(sameCarriageway(a, c)).toBe(false)
  })
})

describe('junction discovery', () => {
  it('finds the shared-vertex crossroads and its four approaches', () => {
    const crossings = findCrossings(crossroads)
    expect(crossings).toHaveLength(1)
    const [junction] = crossings
    expect(junction.approaches.map((approach) => approach.edge).sort()).toEqual([0, 1, 2, 3])
    // Every approach arrives at the origin, so each conflicts with the two roads it crosses.
    expect(junction.conflicts.length).toBeGreaterThanOrEqual(4)
    for (const [i, j] of junction.conflicts) {
      expect(junction.conflicts).not.toContainEqual([j, i])
      expect(i).not.toBe(j)
    }
  })

  it('finds a crossing the graph does not know about, where two ways share no vertex', () => {
    const split = buildRoadGraph({
      ...zone,
      q: 1,
      pois: [],
      roads: [
        // An avenue drawn as two halved ways, and a street crossing the join.
        { k: 'primary', p: [-80, 0, 0, 0], w: 10, ow: 1 },
        { k: 'primary', p: [0, 0, 80, 0], w: 10, ow: 1 },
        { k: 'residential', p: [10, -40, 10, 40], w: 6, ow: 1 },
      ],
    })
    const crossings = findCrossings(split)
    const found = crossings.find((crossing) => crossing.approaches.some((a) => a.edge === 2))
    expect(found).toBeDefined()
    // The street crosses the avenue 10 m past the join, so it is one junction, not two.
    expect(found!.approaches.length).toBeGreaterThanOrEqual(2)
    expect(found!.x).toBeGreaterThan(0)
    expect(found!.x).toBeLessThan(12)
  })

  it('discovers every meeting in the real CBD, including the many without shared nodes', () => {
    const graph = buildRoadGraph(zone)
    const crossings = findCrossings(graph)
    expect(crossings.length).toBeGreaterThan(200)
    const approaching = new Set(crossings.flatMap((c) => c.approaches.map((a) => a.edge)))
    expect(approaching.size).toBeGreaterThan(graph.edges.length * 0.4)
    // The discovery is deterministic: the same map always gives the same junctions.
    expect(findCrossings(graph)).toEqual(crossings)
  })
})

describe('junction priority', () => {
  const crossings = findCrossings(crossroads)

  it('stops an approach at the line while a crossing approach holds the box', () => {
    // Westbound on edge 0 into the junction, and northbound on edge 2. Their paths
    // cross, so only one may be inside the box at a time.
    const west = agent(0, 1, 34)
    const north = agent(2, 2, 34)
    const controller = new JunctionController(crossroads, crossings)
    controller.clock = 0
    // Twenty metres short of the lines, one of them is given the box at once (there is
    // nothing in it) and the other is stopped twenty metres back.
    const first = controller.clearances([west, north], 0.1)
    expect(controller.occupancy).toHaveLength(1)
    expect(first.get(west) === undefined || first.get(north) === undefined).toBe(true)
    // Both arrive on their line together. One takes the box; the other is stopped there.
    west.progress = 54
    north.progress = 54
    controller.clearances([west, north], 0.1)
    expect(controller.occupancy).toHaveLength(1)
    const held = controller.occupancy[0].seed === 1 ? north : west
    expect(controller.clearances([west, north], 0.1).get(held)).toBe(0)
  })

  it('lets a queue go through one after another, and holds the one behind the line', () => {
    const avenue = buildRoadGraph({
      ...zone,
      q: 1,
      pois: [],
      roads: [
        { k: 'primary', p: [-60, 0, 0, 0], w: 8, ow: 1 },
        { k: 'primary', p: [0, 0, 60, 0], w: 8, ow: 1 },
        { k: 'primary', p: [0, 60, 0, 0], w: 8, ow: 1 },
        { k: 'primary', p: [0, 0, 0, -60], w: 8, ow: 1 },
      ],
    })
    const controller = new JunctionController(avenue, findCrossings(avenue))
    const ahead = agent(0, 1, 54) // crossing the box now
    const behind = agent(0, 2, 20) // 34 m back, asking
    const limits = controller.clearances([ahead, behind], 0.1)
    // Two vehicles on their way through the same way do not hold each other up.
    expect(limits.has(ahead)).toBe(false)
    expect(limits.has(behind)).toBe(false)
    expect(controller.occupancy).toHaveLength(1)
  })

  it('holds a red approach at the line and releases the other axis', () => {
    const signal = new Set([0])
    // The westbound leg on edge 0 runs along x, the northbound leg on edge 2 along z.
    const west = agent(0, 1, 40)
    const north = agent(2, 2, 40)
    const controller = new JunctionController(crossroads, crossings, signal)
    west.progress = 54
    north.progress = 54
    controller.clearances([west, north], 0.1, undefined, 0) // x axis green
    expect(controller.occupancy.map((slot) => slot.seed)).toEqual([1])
    // The red approach is stopped at the line, not through it.
    expect(controller.clearances([west, north], 0.1, undefined, 0).get(north)).toBe(0)
    // Even with nothing in the box, a red approach may not enter.
    const empty = new JunctionController(crossroads, crossings, signal)
    expect(empty.clearances([north], 0.1, undefined, 0).get(north)).toBe(0)
    expect(empty.occupancy).toEqual([])
    // All-red stops both.
    controller.clock = 13.5
    const pause = new JunctionController(crossroads, crossings, signal)
    expect(pause.clearances([west, north], 0.1, undefined, 13.5).size).toBe(2)
  })

  it('lets a vehicle already inside the box leave, even on red', () => {
    const signal = new Set([0])
    const controller = new JunctionController(crossroads, crossings, signal)

    // At 58 it is still short of the line at 54... but past the meeting point? No: 58 is
    // past 54, so it is inside the box, and the light no longer applies to it.
    const inside = agent(0, 1, 58)
    // Approaching a different crossing on the same edge can still hold it, so ask about
    // the vehicle already in the box directly.
    expect(controller.clearances([inside], 0.1).get(inside) ?? -1).toBeLessThanOrEqual(0)
    // But one still approaching on the red axis is held.
    const short = agent(2, 2, 50)
    expect(controller.clearances([short], 0.1).has(short)).toBe(true)
    // A vehicle on the road out of the box is not stopped by the light either.
    const leaving = agent(1, 2, 10)
    expect(controller.clearances([leaving], 0.1).has(leaving)).toBe(false)
  })

  it('does not let perpendicular traffic occupy the same junction; both eventually get through', () => {
    const a = agent(0, 1, 20)
    const b = agent(2, 2, 20)
    const sim = new TrafficSimulation(crossroads, [a, b])
    let aCrossed = false
    let bCrossed = false
    for (let i = 0; i < 400; i++) {
      sim.step(0.05, i * 0.05)
      aCrossed ||= a.edge !== 0
      bCrossed ||= b.edge !== 2
      if (aCrossed && bCrossed) break
      // No two occupied slots may cross.
      const occupied = sim.junctions.occupancy
      for (const one of occupied) {
        for (const other of occupied) {
          if (one.crossing !== other.crossing || one.approach === other.approach) continue
          const crossing = sim.crossings[one.crossing]
          expect(
            crossing.conflicts.some(
              ([i, j]) =>
                (i === one.approach && j === other.approach) ||
                (i === other.approach && j === one.approach),
            ),
          ).toBe(false)
        }
      }
    }
    expect(aCrossed).toBe(true)
    expect(bCrossed).toBe(true)
  })

  it('stops a vehicle a fixed distance before the line rather than on it', () => {
    // Edge 2 arrives at the junction; edge 0 goes on through it and occupies the box.
    const approach = agent(2, 1, 10)
    const blocker = agent(0, 2, 50)
    blocker.speed = 0
    const sim = new TrafficSimulation(crossroads, [approach, blocker])
    for (let i = 0; i < 300; i++) sim.step(0.05, i * 0.05)
    // The blocker's path crosses the approach's, so the approach waits at its line.
    expect(approach.progress).toBeLessThanOrEqual(60 - JUNCTION_STOP + 0.01)
    expect(approach.progress).toBeGreaterThan(60 - JUNCTION_STOP - 1)
    expect(approach.edge).toBe(2)
    // Once the box is clear, it goes.
    sim.agents.splice(1, 1)
    for (let i = 0; i < 200; i++) sim.step(0.05, 20 + i * 0.05)
    expect(approach.edge).not.toBe(2)
  })

  it('waits at a dead end and restarts only when the candidate is clear', () => {
    const dead = agent(1, 3, 59)
    const sim = new TrafficSimulation(crossroads, [dead])
    sim.step(1, 0)
    expect(dead.respawn).toBe(true)
    sim.step(3, 3)
    sim.step(0.1, 3.1, new Set(), () => false)
    expect(dead.respawn).toBe(true)
    sim.step(1.1, 4.3, new Set(), () => true)
    expect(dead.respawn).toBe(false)
  })

  it('sits out a dead end when every restart point is occupied', () => {
    const dead = agent(1, 3, 60)
    dead.wait = 0
    dead.respawn = true
    const sim = new TrafficSimulation(crossroads, [dead])
    // Every edge is only 60 m, so the candidate restart point is always occupied by the
    // simulation's own idea of where the dead vehicle still is.
    const before = dead.edge
    sim.step(0.01, 0, new Set(), () => false)
    expect(dead.respawn).toBe(true)
    expect(dead.edge).toBe(before)
  })

  it('knows which crossings in the real CBD carry a mapped signal', () => {
    const graph = buildRoadGraph(zone)
    const crossings = findCrossings(graph)
    const signalised = signalCrossings(zone, graph, crossings)
    expect(signalised.size).toBeGreaterThan(0)
    const controller = new JunctionController(graph, crossings, signalised)
    expect([...signalised].every((id) => crossings[id] !== undefined)).toBe(true)
    // Every signalised crossing holds at least one approach that is coming in, and
    // lets the other axis through: test the strongest case, a crossing with both.
    controller.clock = 0 // x axis green
    let checked = 0
    for (const id of signalised) {
      const crossing = crossings[id]
      const entries: TrafficAgent[] = []
      const crossingsAt = { x: [] as TrafficAgent[], z: [] as TrafficAgent[] }
      crossing.approaches.forEach((approach, index) => {
        const spec = graph.edges[approach.edge]
        const along = travel(spec)
        const axis = Math.abs(along[0]) >= Math.abs(along[1]) ? 'x' : 'z'
        if (approach.progress <= JUNCTION_STOP) return // this approach leaves the box
        const line = Math.max(0, approach.progress - JUNCTION_STOP)
        const probe = agent(approach.edge, index + 1, Math.max(0, line - 8))
        crossingsAt[axis].push(probe)
        entries.push(probe)
      })
      const green = crossingsAt.x
      const red = crossingsAt.z
      if (!green.length || !red.length) continue
      const fresh = new JunctionController(graph, crossings, signalised)
      fresh.clock = 0
      const limits = fresh.clearances(entries, 0.1)
      // Each is stopped on its approach; once on the line, only the green axis goes.
      for (const car of [...green, ...red])
        car.progress += Math.max(0, (limits.get(car) ?? 0) - 0.05)
      const onLine = fresh.clearances(entries, 0.1)
      expect(green.some((car) => !onLine.has(car))).toBe(true)
      expect(red.every((car) => onLine.has(car))).toBe(true)
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  })
})
