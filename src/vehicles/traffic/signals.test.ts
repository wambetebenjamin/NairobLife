import { describe, expect, it } from 'vitest'
import { loadBakedZone } from '../../testing/zoneFixture'
import { buildRoadGraph, makeTraffic } from './graph'
import { greenAxis } from '../../core/trafficSignals'
import { signalClearance, signalNodes } from './signals'

describe('simple mapped traffic signals', () => {
  it('cycles two crossing axes with an all-red interval', () => {
    expect([0, 13, 15, 28, 30].map(greenAxis)).toEqual(['x', null, 'z', null, 'x'])
  })
  it('snaps real mapped signals and stops a red approach at its line', () => {
    const zone = loadBakedZone(),
      graph = buildRoadGraph(zone),
      nodes = signalNodes(zone, graph)
    expect(nodes.size).toBeGreaterThan(0)
    const edge = graph.edges.find((e) => nodes.has(e.to) && e.length > 10)!
    const agent = { ...makeTraffic(graph, { x: 0, z: 0 })[0], progress: 0 }
    const redTime = Math.abs(edge.bx - edge.ax) >= Math.abs(edge.bz - edge.az) ? 15 : 0
    expect(signalClearance(agent, edge, nodes, redTime)).toBe(edge.length - 4)
    agent.progress = edge.length - 2
    expect(signalClearance(agent, edge, nodes, redTime)).toBe(Infinity)
    expect(signalClearance({ ...agent, progress: 0 }, edge, nodes, 13)).toBe(edge.length - 4)
  })
})
