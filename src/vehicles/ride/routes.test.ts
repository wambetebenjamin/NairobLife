import { describe, expect, it } from 'vitest'
import { loadBakedZone } from '../../testing/zoneFixture'
import { buildRoadGraph } from '../traffic/graph'
import { buildRideNetwork, planRide, ridePose, type Stop } from './routes'

const zone = loadBakedZone()
const network = buildRideNetwork(zone)

describe('stage-to-stage ride planning', () => {
  it('finds a connected directed road journey between real mapped stops', () => {
    const from = network.stops.find((s) => s.name === 'Kencom')!,
      to = network.stops.find((s) => s.name === 'Koja')!
    const route = planRide(network.graph, from, to)!
    expect(route).not.toBeNull()
    expect(route.length).toBeGreaterThan(100)
    expect(route.edges[0].from).toBe(from.node)
    expect(route.edges.at(-1)?.to).toBe(to.node)
    for (let i = 1; i < route.edges.length; i++)
      expect(route.edges[i - 1].to).toBe(route.edges[i].from)
    expect(ridePose(route, -1)).toEqual(ridePose(route, 0))
    expect(ridePose(route, route.length + 100)).toEqual(ridePose(route, route.length))
    const before = ridePose(route, route.edges[0].length - 0.001),
      after = ridePose(route, route.edges[0].length + 0.001)
    expect(Math.hypot(before.x - after.x, before.z - after.z)).toBeLessThan(0.02)
  })
  it('rejects same stop and unreachable directed trips', () => {
    const from: Stop = { id: 'a', name: 'A', x: 0, z: 0, node: '0,0', snapDistance: 0 }
    const to: Stop = { id: 'b', name: 'B', x: 30, z: 0, node: '30,0', snapDistance: 0 }
    const graph = buildRoadGraph({
      ...zone,
      q: 1,
      roads: [{ k: 'primary', p: [0, 0, 30, 0], w: 8, ow: 1 }],
      pois: [],
    })
    expect(planRide(graph, from, from)).toBeNull()
    expect(planRide(graph, from, to)?.length).toBe(30)
    expect(planRide(graph, to, from)).toBeNull()
  })
})
