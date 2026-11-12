import { describe, expect, it } from 'vitest'
import { START_LANDMARK } from '../config/game'
import { getLandmark } from '../config/landmarks'
import {
  FLEET_LIMITS,
  LIVERIES,
  LIVERY,
  NGANYA_NAMES,
  VEHICLES,
  VEHICLE_KINDS,
  type VehicleKind,
} from '../config/vehicles'
import { WORLD_ORIGIN } from '../config/zones'
import { bearingBetween, bearingDegToYaw, createProjection } from '../core/geo'
import {
  orientedRectCorners,
  orientedRectsOverlap,
  pointInPolygon,
  type OrientedRect,
} from '../core/geom2d'
import { loadBakedZone } from '../testing/zoneFixture'
import { TREE_STRIDE, scatterTrees, trunkRadius } from '../world/geometry/trees'
import { ZoneIndex } from '../world/zone/zoneIndex'
import { planFleet, yawOf, type Placement } from './placement'

/**
 * The parking plan for the real CBD. Nothing is hand-placed, so these are the checks a
 * person would make walking round the map: is every vehicle somewhere a vehicle could
 * be, and are they where the map says vehicles gather?
 */
describe('planFleet on the baked CBD', () => {
  const zone = loadBakedZone()
  const index = new ZoneIndex(zone)
  const trees = scatterTrees(zone)
  const landmark = getLandmark(START_LANDMARK)!
  const [startX, startZ] = createProjection(WORLD_ORIGIN).toWorld(
    landmark.spawn.lat,
    landmark.spawn.lon,
  )
  const start = {
    x: startX,
    z: startZ,
    yaw: bearingDegToYaw(bearingBetween(landmark.spawn, landmark.lookAt)),
  }
  const EDGE = 12
  const plan = planFleet(zone, index, { start, trees, edgeInset: EDGE })

  const footprint = (p: Placement): OrientedRect => ({
    x: p.x,
    z: p.z,
    dx: -Math.sin(p.yaw),
    dz: -Math.cos(p.yaw),
    halfLength: VEHICLES[p.kind].length / 2,
    halfWidth: VEHICLES[p.kind].width / 2,
  })
  const count = (kind: VehicleKind) => plan.filter((p) => p.kind === kind).length

  it('fills the city without going over budget', () => {
    for (const kind of VEHICLE_KINDS) expect(count(kind)).toBeLessThanOrEqual(FLEET_LIMITS[kind])
    expect(count('car')).toBeGreaterThan(150)
    // The stages hold a mix of 14-seaters and nganyas.
    expect(count('matatu')).toBeGreaterThan(18)
    expect(count('nganya')).toBeGreaterThan(10)
    expect(count('matatu') + count('nganya')).toBeGreaterThan(36)
    expect(count('boda')).toBeGreaterThan(25)
  })

  it('plans the same city every time', () => {
    expect(planFleet(zone, index, { start, trees, edgeInset: EDGE })).toEqual(plan)
  })

  it('keeps every vehicle inside the playable area and out of the buildings', () => {
    const [minX, minZ, maxX, maxZ] = zone.bounds
    for (const p of plan) {
      const corners = orientedRectCorners(footprint(p))
      for (let i = 0; i < 8; i += 2) {
        const x = corners[i]
        const z = corners[i + 1]
        expect(x).toBeGreaterThan(minX + EDGE)
        expect(x).toBeLessThan(maxX - EDGE)
        expect(z).toBeGreaterThan(minZ + EDGE)
        expect(z).toBeLessThan(maxZ - EDGE)
        expect(index.buildingAt(x, z), `${p.kind} at ${p.x}, ${p.z}`).toBeUndefined()
      }
      expect(index.buildingAt(p.x, p.z)).toBeUndefined()
    }
  })

  it('never parks two vehicles on top of each other', () => {
    const rects = plan.map(footprint)
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        if (Math.abs(rects[i].x - rects[j].x) > 8 || Math.abs(rects[i].z - rects[j].z) > 8) continue
        expect(orientedRectsOverlap(rects[i], rects[j]), `${i} and ${j}`).toBe(false)
      }
    }
  })

  it('never parks a vehicle round a tree', () => {
    for (const p of plan) {
      const rect = footprint(p)
      for (let o = 0; o < trees.length; o += TREE_STRIDE) {
        const dx = trees[o] - p.x
        const dz = trees[o + 1] - p.z
        if (Math.abs(dx) > 4 || Math.abs(dz) > 4) continue
        const along = Math.abs(dx * rect.dx + dz * rect.dz) - rect.halfLength
        const across = Math.abs(dx * -rect.dz + dz * rect.dx) - rect.halfWidth
        const gap = Math.hypot(Math.max(along, 0), Math.max(across, 0))
        expect(gap).toBeGreaterThan(trunkRadius(trees[o + 2]))
      }
    }
  })

  it('leaves one of each kind in view where a new game starts', () => {
    const starters = plan.slice(0, 4)
    expect(starters.map((p) => p.kind).sort()).toEqual(['boda', 'car', 'matatu', 'nganya'])
    for (const p of starters) {
      const dx = p.x - start.x
      const dz = p.z - start.z
      expect(Math.hypot(dx, dz)).toBeLessThan(30)
      expect(Math.hypot(dx, dz)).toBeGreaterThan(4)
      // Ahead of the player, not behind: the first thing they see.
      expect(dx * -Math.sin(start.yaw) + dz * -Math.cos(start.yaw)).toBeGreaterThan(3)
    }
  })

  it('puts a matatu at every named stage, carrying its route', () => {
    const runsRoutes = (p: Placement) => p.kind === 'matatu' || p.kind === 'nganya'
    const labels = new Set(plan.filter(runsRoutes).map((p) => p.label))
    const stages = zone.pois.filter((poi) => poi.k === 'stage' && (poi.r ?? poi.n))
    expect(stages.length).toBeGreaterThan(15)
    for (const stage of stages) expect(labels, stage.n).toContain(stage.r ?? stage.n)
    expect(labels).toContain('Githurai 45')
    expect(labels).toContain('Kencom')
    // Routes belong to matatus and nganyas only.
    expect(plan.some((p) => !runsRoutes(p) && p.label)).toBe(false)
  })

  it('names every nganya, and nothing else', () => {
    for (const p of plan) {
      if (p.kind === 'nganya') expect(NGANYA_NAMES).toContain(p.name)
      else expect(p.name).toBeUndefined()
    }
    // The one waiting at the start is Moto: fire, to go with its flames.
    const starter = plan.slice(0, 4).find((p) => p.kind === 'nganya')
    expect(starter?.name).toBe('Moto')
    expect(LIVERIES.nganya[starter?.paint ?? -1].pattern).toBe(LIVERY.flames)
    // Many names and many paint jobs, not one copied thirty times.
    const nganyas = plan.filter((p) => p.kind === 'nganya')
    expect(new Set(nganyas.map((p) => p.name)).size).toBeGreaterThan(6)
    expect(new Set(nganyas.map((p) => p.paint)).size).toBeGreaterThan(5)
  })

  it('parks matatus within a short walk of their stage', () => {
    for (const stage of zone.pois) {
      const label = stage.k === 'stage' ? (stage.r ?? stage.n) : undefined
      if (!label) continue
      const nearest = Math.min(
        ...plan
          .filter((p) => p.label === label)
          .map((p) => Math.hypot(p.x - stage.x / zone.q, p.z - stage.z / zone.q)),
      )
      expect(nearest, label).toBeLessThan(75)
    }
  })

  it('gives every vehicle a colour from its own list and a tidy position', () => {
    for (const p of plan) {
      expect(Number.isInteger(p.paint)).toBe(true)
      expect(p.paint).toBeGreaterThanOrEqual(0)
      expect(p.paint).toBeLessThan(LIVERIES[p.kind].length)
      expect(Math.abs(p.yaw)).toBeLessThanOrEqual(Math.PI + 1e-9)
      expect(Number.isFinite(p.x + p.z + p.yaw)).toBe(true)
    }
    // Only a nganya or a safari van wears a pattern.
    for (const kind of ['car', 'boda'] as const) {
      expect(LIVERIES[kind].every((livery) => livery.pattern === LIVERY.plain)).toBe(true)
    }
    expect(LIVERIES.nganya.every((livery) => livery.pattern !== LIVERY.plain)).toBe(true)
    // A mix of colours, not a fleet of one.
    expect(new Set(plan.filter((p) => p.kind === 'car').map((p) => p.paint)).size).toBeGreaterThan(
      5,
    )
  })

  it('uses the car parks, and the kerbs of the streets', () => {
    const carParks = zone.areas
      .filter((area) => area.k === 'parking')
      .map((area) => ({
        outer: area.p.map((value) => value / zone.q),
        holes: (area.hs ?? []).map((hole) => hole.map((value) => value / zone.q)),
      }))
    const inCarPark = (p: Placement) =>
      carParks.some(({ outer, holes }) => pointInPolygon(p.x, p.z, outer, holes))
    const cars = plan.filter((p) => p.kind === 'car')
    const parked = cars.filter(inCarPark).length
    expect(parked).toBeGreaterThan(60)
    expect(cars.length - parked).toBeGreaterThan(60)
  })

  it('still works with nothing to go on', () => {
    const bare = planFleet(zone, index)
    expect(bare.length).toBeGreaterThan(200)
    expect(bare[0]).not.toEqual(plan[0])
  })
})

describe('yawOf', () => {
  it('turns a direction on the map into a heading', () => {
    expect(yawOf(0, -1)).toBeCloseTo(0) // north
    expect(yawOf(-1, 0)).toBeCloseTo(Math.PI / 2) // west: a quarter turn to the left
    expect(yawOf(1, 0)).toBeCloseTo(-Math.PI / 2) // east
    expect(Math.abs(yawOf(0, 1))).toBeCloseTo(Math.PI) // south
  })
})
