import { describe, expect, it } from 'vitest'
import {
  OSM_ATTRIBUTION,
  Q,
  ZONE_FORMAT_VERSION,
  type ZoneFile,
  type ZoneRoad,
} from '../zone/format'
import { buildGroundMesh, lanesEachWay, offsetLine } from './ground'

const road = (patch: Partial<ZoneRoad>): ZoneRoad => ({ k: 'secondary', p: [], w: 7, ...patch })

/** A zone with nothing in it but the roads and points of interest given. */
function tinyZone(roads: ZoneRoad[], pois: ZoneFile['pois'] = []): ZoneFile {
  return {
    v: ZONE_FORMAT_VERSION,
    id: 'test',
    name: 'Test',
    origin: { lat: 0, lon: 0 },
    bbox: { south: 0, west: 0, north: 0, east: 0 },
    bounds: [-500, -500, 500, 500],
    q: Q,
    generated: 'test',
    attribution: OSM_ATTRIBUTION,
    buildings: [],
    roads,
    rails: [],
    waterways: [],
    areas: [],
    places: [],
    trees: [],
    pois,
  }
}

const triangles = (zone: ZoneFile) => buildGroundMesh(zone).indices.length / 3

/** A 200 m street running north along x = 0. */
const NORTHBOUND = [0, 1000, 0, -1000]

describe('lanes', () => {
  it('trusts the map when it gives a lane count', () => {
    expect(lanesEachWay(road({ ow: 1, ln: 3, w: 11 }))).toBe(3)
    // On a two-way road the count covers both directions.
    expect(lanesEachWay(road({ ln: 4, w: 14.4 }))).toBe(2)
    expect(lanesEachWay(road({ ln: 1, w: 4 }))).toBe(1)
  })

  it('goes by the width otherwise', () => {
    expect(lanesEachWay(road({ ow: 1, w: 7 }))).toBe(2)
    expect(lanesEachWay(road({ ow: 1, w: 5.5 }))).toBe(1)
    expect(lanesEachWay(road({ w: 9.5 }))).toBe(1)
    expect(lanesEachWay(road({ k: 'trunk', w: 14 }))).toBe(2)
    expect(lanesEachWay(road({ k: 'service', w: 3 }))).toBe(1)
  })
})

describe('offsetLine', () => {
  it('puts a positive offset on the true left of the direction of travel', () => {
    // Heading north (towards -z), left is west (-x).
    const left = offsetLine([0, 100, 0, -100], 2)
    expect(left[0]).toBeCloseTo(-2)
    expect(left[1]).toBeCloseTo(100)
    expect(left[2]).toBeCloseTo(-2)
    // Heading east, left is north (-z).
    const north = offsetLine([0, 0, 50, 0], 3)
    expect(north[1]).toBeCloseTo(-3)
    expect(north[3]).toBeCloseTo(-3)
    // Negative offsets go right.
    expect(offsetLine([0, 100, 0, -100], -2)[0]).toBeCloseTo(2)
  })

  it('returns the line itself for no offset', () => {
    const line = [0, 0, 10, 0]
    expect(offsetLine(line, 0)).toBe(line)
  })
})

describe('road paint', () => {
  it('draws kerbs along streets that have pavements', () => {
    const street = tinyZone([road({ k: 'residential', p: NORTHBOUND, w: 6 })])
    const lane = tinyZone([road({ k: 'service', p: NORTHBOUND, w: 6 })])
    // Same carriageway; the street adds a pavement and a kerb on top.
    expect(triangles(street)).toBeGreaterThan(triangles(lane))
  })

  it('divides a wide one-way street into lanes, and leaves a narrow one alone', () => {
    const narrow = tinyZone([road({ k: 'service', p: NORTHBOUND, w: 5, ow: 1 })])
    const wide = tinyZone([road({ k: 'service', p: NORTHBOUND, w: 7, ow: 1 })])
    const wider = tinyZone([road({ k: 'service', p: NORTHBOUND, w: 11, ow: 1 })])
    // 200 m of dashes at 9 m a time is about 22 dashes, two triangles each, per line.
    const perLine = triangles(wide) - triangles(narrow)
    expect(perLine).toBeGreaterThan(36)
    expect(perLine).toBeLessThan(48)
    expect(triangles(wider) - triangles(wide)).toBe(perLine)
  })

  it('paints a zebra crossing and a stop line where the map marks one', () => {
    const street = road({ k: 'secondary', p: NORTHBOUND, w: 7, ow: 1 })
    const without = buildGroundMesh(tinyZone([street]))
    const withCrossing = buildGroundMesh(tinyZone([street], [{ k: 'crossing', x: 10, z: 200 }]))
    const extra = (withCrossing.indices.length - without.indices.length) / 3
    // Six stripes across seven metres, and one stop line: seven bars.
    expect(extra).toBe(14)

    // The new paint is on the street, around the crossing, and nowhere else.
    const added = withCrossing.positions.slice(without.positions.length)
    for (let i = 0; i < added.length; i += 3) {
      expect(Math.abs(added[i])).toBeLessThanOrEqual(3.5 + 1e-6)
      expect(Math.abs(added[i + 2] - 20)).toBeLessThan(4)
    }
    // One way, running north: traffic arrives from the south, so the stop line is south.
    let southernmost = -Infinity
    for (let i = 2; i < added.length; i += 3) southernmost = Math.max(southernmost, added[i])
    expect(southernmost).toBeGreaterThan(22.5)
  })

  it('gives a two-way street a stop line on each side, each on its own half', () => {
    const street = road({ k: 'secondary', p: NORTHBOUND, w: 9.5 })
    const without = buildGroundMesh(tinyZone([street]))
    const withCrossing = buildGroundMesh(tinyZone([street], [{ k: 'crossing', x: 0, z: 0 }]))
    const added = withCrossing.positions.slice(without.positions.length)
    // Kenya drives on the left. Northbound traffic is on the west half and meets the
    // crossing from the south; southbound is on the east half and meets it from the north.
    const southBar: number[] = []
    const northBar: number[] = []
    for (let i = 0; i < added.length; i += 3) {
      if (added[i + 2] > 2) southBar.push(added[i])
      if (added[i + 2] < -2) northBar.push(added[i])
    }
    expect(southBar.length).toBe(4)
    expect(northBar.length).toBe(4)
    expect(Math.max(...southBar)).toBeLessThanOrEqual(1e-6)
    expect(Math.min(...northBar)).toBeGreaterThanOrEqual(-1e-6)
  })

  it('ignores a crossing that is nowhere near a street', () => {
    const street = road({ k: 'secondary', p: NORTHBOUND, w: 7 })
    const far = tinyZone([street], [{ k: 'crossing', x: 400, z: 0 }])
    expect(triangles(far)).toBe(triangles(tinyZone([street])))
  })
})
