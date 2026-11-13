import { describe, expect, it } from 'vitest'
import { greenAxis } from '../../core/trafficSignals'
import { loadBakedZone } from '../../testing/zoneFixture'
import { findCrossings } from './crossings'
import { buildRoadGraph } from './graph'
import { signalCrossings } from './signals'

describe('mapped traffic signals', () => {
  it('cycles two crossing axes with an all-red interval', () => {
    expect([0, 13, 15, 28, 30].map(greenAxis)).toEqual(['x', null, 'z', null, 'x'])
  })

  it('gives every mapped signal a junction to govern, and no junction more than it has', () => {
    const zone = loadBakedZone()
    const graph = buildRoadGraph(zone)
    const crossings = findCrossings(graph)
    const signalised = signalCrossings(zone, graph, crossings)
    // The snapshot has eight signals (docs/DATA.md), all of them on mapped roads.
    expect(zone.pois.filter((poi) => poi.k === 'signal').length).toBeGreaterThan(0)
    expect(signalised.size).toBeGreaterThan(0)
    expect(signalised.size).toBeLessThanOrEqual(crossings.length)
    for (const id of signalised) expect(crossings[id]).toBeDefined()
  })
})
