import { describe, expect, it } from 'vitest'
import { WORLD_ORIGIN, getZone } from '../../config/zones'
import { createProjection } from '../../core/geo'
import { pointInRing, signedArea } from '../../core/geom2d'
import { loadBakedZone } from '../../testing/zoneFixture'
import { buildGroundMesh } from '../geometry/ground'
import { buildRaisedRoads } from '../geometry/raisedRoads'
import { TREE_STRIDE, scatterTrees } from '../geometry/trees'
import { Q, ZONE_FORMAT_VERSION } from './format'
import { ZoneIndex } from './zoneIndex'

/**
 * The baked zone file is generated, committed, and trusted by the game at run time.
 * These tests are the contract: if `npm run osm:bake` ever writes something the game
 * cannot use, this is where it shows.
 */
describe('baked CBD zone', () => {
  const zone = loadBakedZone()
  const index = new ZoneIndex(zone)
  const projection = createProjection(WORLD_ORIGIN)

  it('matches the format and projection the game expects', () => {
    expect(zone.v).toBe(ZONE_FORMAT_VERSION)
    expect(zone.q).toBe(Q)
    expect(zone.id).toBe('nairobi-cbd')
    expect(zone.origin).toEqual(WORLD_ORIGIN)
    expect(zone.attribution).toMatch(/OpenStreetMap/)
  })

  it('covers the area its config says it does', () => {
    const { bbox } = getZone('nairobi-cbd')
    const [west, north] = projection.toWorld(bbox.north, bbox.west)
    const [east, south] = projection.toWorld(bbox.south, bbox.east)
    const [minX, minZ, maxX, maxZ] = zone.bounds
    expect(minX).toBeCloseTo(west, 0)
    expect(minZ).toBeCloseTo(north, 0)
    expect(maxX).toBeCloseTo(east, 0)
    expect(maxZ).toBeCloseTo(south, 0)
  })

  it('is a real city, not an empty file', () => {
    expect(zone.buildings.length).toBeGreaterThan(2500)
    expect(zone.roads.length).toBeGreaterThan(1000)
    expect(new Set(zone.roads.map((road) => road.n).filter(Boolean)).size).toBeGreaterThan(100)
  })

  it('stores whole-number coordinates and sane buildings', () => {
    for (const building of zone.buildings) {
      expect(building.p.length).toBeGreaterThanOrEqual(6)
      expect(building.p.every(Number.isInteger)).toBe(true)
      expect(signedArea(building.p)).toBeGreaterThan(0)
      expect(building.h).toBeGreaterThan(building.b ?? 0)
      expect(building.h).toBeLessThan(450)
    }
  })

  it('has KICC at the origin, 105 m tall', () => {
    const kicc = zone.buildings.filter((building) =>
      building.n?.includes('Kenyatta International Convention'),
    )
    expect(kicc.length).toBeGreaterThan(0)
    expect(Math.max(...kicc.map((building) => building.h))).toBe(105)
    expect(index.buildingAt(0, 0)).toBeDefined()
  })

  it('crowns KICC with a saucer wider than its shaft', () => {
    const at = (x: number, z: number) =>
      zone.buildings.filter((building) => pointInRing(x * Q, z * Q, building.p))
    // Over the middle of the tower: the shaft, the recessed floor, the saucer and its rim.
    const stack = at(1, 6).sort((a, b) => (a.b ?? 0) - (b.b ?? 0))
    expect(stack.map((piece) => [piece.b ?? 0, piece.h])).toEqual([
      [0, 94],
      [94, 97.5],
      [97.5, 102.5],
      [102.5, 105],
    ])
    expect(stack[2].tp).toBeGreaterThan(1)
    // 19 m from the middle is past the shaft (17 m) but under the rim (21 m).
    expect(at(1, 6 + 19).map((piece) => piece.h)).toEqual([105])
  })

  it('has the landmarks the skyline is known by', () => {
    const named = (name: string) => zone.buildings.find((building) => building.n === name)
    expect(named('Times Tower')?.h).toBe(140)
    expect(named('Parliament clock tower')?.h).toBe(40)
    expect(named('KICC Amphitheater')?.rs).toBe('cone')
    expect(named('Bunge Tower')?.f).toBeDefined()
  })

  it('knows its streets: Kenyatta Avenue is west of Moi Avenue', () => {
    const centre = (name: string) => {
      const points = zone.roads.filter((road) => road.n === name).flatMap((road) => road.p)
      expect(points.length).toBeGreaterThan(0)
      let x = 0
      for (let i = 0; i < points.length; i += 2) x += points[i]
      return x / (points.length / 2) / zone.q
    }
    expect(centre('Kenyatta Avenue')).toBeLessThan(centre('Moi Avenue'))
  })

  it('answers "where am I?"', () => {
    expect(index.placeAt(-80, -90)).toBe('City Square')
    // The nearest street to the middle of the KICC tower is outside the tower.
    const road = index.nearestRoadPoint(0, 0, 250)
    expect(road).toBeDefined()
    expect(index.buildingAt(road![0], road![1])).toBeUndefined()
  })

  it('turns into ground, flyover and tree geometry without bad numbers', () => {
    const ground = buildGroundMesh(zone)
    const raised = buildRaisedRoads(zone)
    const trees = scatterTrees(zone)
    expect(ground.indices.length).toBeGreaterThan(10_000)
    expect(ground.positions.every(Number.isFinite)).toBe(true)
    expect(raised.positions.every(Number.isFinite)).toBe(true)
    expect(trees.length % TREE_STRIDE).toBe(0)
    expect(trees.length / TREE_STRIDE).toBeGreaterThan(500)
    expect(trees.every(Number.isFinite)).toBe(true)
  })
})
