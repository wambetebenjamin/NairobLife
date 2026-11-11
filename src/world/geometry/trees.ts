/**
 * Where the trees stand.
 *
 * OSM has a few hundred individually mapped trees in the CBD (the avenues, the
 * university). Parks and woods are mapped only as areas, so we plant those ourselves:
 * seeded-random points inside each polygon, kept clear of buildings, roads and water.
 * The result is the same on every load.
 */
import { distToSegmentSq, pointInPolygon, ringBounds } from '../../core/geom2d'
import { hash01, seededRandom } from '../../core/random'
import { SpatialGrid } from '../../core/spatialGrid'
import type { AreaKind, ZoneFile } from '../zone/format'
import { TREE_FLAME, TREE_GREENS, TREE_JACARANDA, pick, scale } from './palette'

/** Floats per tree: x, z, height, canopy radius, r, g, b, yaw. */
export const TREE_STRIDE = 8

/** Trunk radius at the ground, in metres, for a tree of the given height. */
export const trunkRadius = (height: number) => 0.12 + height * 0.017

/** Square metres of area per planted tree. */
const DENSITY: Partial<Record<AreaKind, number>> = { wood: 110, park: 520, garden: 330 }
const MAX_TREES = 2600
const MIN_SPACING = 4

interface Polygon {
  outer: number[]
  holes: number[][]
}

export function scatterTrees(zone: ZoneFile): Float32Array {
  const q = zone.q
  const toMetres = (ring: number[]) => ring.map((value) => value / q)

  // ---- obstacles
  const buildings = new SpatialGrid<Polygon>(40)
  for (const b of zone.buildings) {
    if ((b.b ?? 0) > 3) continue // floating parts do not block the ground
    const outer = toMetres(b.p)
    const box = ringBounds(outer)
    buildings.insert({ outer, holes: [] }, box.minX - 2, box.minZ - 2, box.maxX + 2, box.maxZ + 2)
  }
  const roads = new SpatialGrid<[number, number, number, number, number]>(40)
  const addLine = (p: number[], clearance: number) => {
    for (let i = 0; i < p.length - 2; i += 2) {
      const ax = p[i] / q
      const az = p[i + 1] / q
      const bx = p[i + 2] / q
      const bz = p[i + 3] / q
      roads.insert(
        [ax, az, bx, bz, clearance],
        Math.min(ax, bx) - clearance,
        Math.min(az, bz) - clearance,
        Math.max(ax, bx) + clearance,
        Math.max(az, bz) + clearance,
      )
    }
  }
  for (const road of zone.roads)
    addLine(road.p, road.w / 2 + (road.k === 'footway' || road.k === 'steps' ? 0.8 : 2))
  for (const rail of zone.rails) addLine(rail.p, 3.5)
  const water = zone.areas
    .filter((a) => a.k === 'water' || a.k === 'pitch')
    .map((a) => ({ outer: toMetres(a.p), holes: [] }))

  const blocked = (x: number, z: number): boolean => {
    for (const b of buildings.at(x, z)) if (pointInPolygon(x, z, b.outer)) return true
    for (const [ax, az, bx, bz, clearance] of roads.at(x, z)) {
      if (distToSegmentSq(x, z, ax, az, bx, bz) < clearance * clearance) return true
    }
    for (const w of water) if (pointInPolygon(x, z, w.outer)) return true
    return false
  }

  // ---- planting
  const out: number[] = []
  const planted = new SpatialGrid<[number, number]>(MIN_SPACING * 2)
  const tooClose = (x: number, z: number): boolean => {
    let close = false
    planted.near(x, z, MIN_SPACING, ([px, pz]) => {
      if ((px - x) * (px - x) + (pz - z) * (pz - z) < MIN_SPACING * MIN_SPACING) close = true
    })
    return close
  }
  const plant = (x: number, z: number, seed: number, wild: boolean) => {
    const height = 6 + hash01(seed, 31) * (wild ? 9 : 6)
    const radius = height * (0.34 + hash01(seed, 32) * 0.12)
    const roll = hash01(seed, 33)
    const base =
      roll < (wild ? 0.04 : 0.1)
        ? pick(TREE_JACARANDA, seed, 34)
        : roll > 0.985
          ? TREE_FLAME[0]
          : pick(TREE_GREENS, seed, 34)
    const c = scale(base, 0.85 + hash01(seed, 35) * 0.3)
    out.push(x, z, height, radius, c[0], c[1], c[2], hash01(seed, 36) * Math.PI * 2)
    planted.insert([x, z], x, z, x, z)
  }

  for (let i = 0; i < zone.trees.length; i += 2) {
    const x = zone.trees[i] / q
    const z = zone.trees[i + 1] / q
    if (!tooClose(x, z)) plant(x, z, i + 1, false)
  }

  zone.areas.forEach((area, index) => {
    const perTree = DENSITY[area.k]
    if (!perTree) return
    const polygon: Polygon = { outer: toMetres(area.p), holes: (area.hs ?? []).map(toMetres) }
    const box = ringBounds(polygon.outer)
    const boxArea = (box.maxX - box.minX) * (box.maxZ - box.minZ)
    // Throw darts at the bounding box; the polygon keeps its share of them.
    const attempts = Math.min(4000, Math.ceil(boxArea / perTree))
    const random = seededRandom(0x7ee5 + index * 7919)
    for (let n = 0; n < attempts && out.length < MAX_TREES * TREE_STRIDE; n++) {
      const x = box.minX + random() * (box.maxX - box.minX)
      const z = box.minZ + random() * (box.maxZ - box.minZ)
      if (!pointInPolygon(x, z, polygon.outer, polygon.holes)) continue
      if (blocked(x, z) || tooClose(x, z)) continue
      plant(x, z, index * 100003 + n, area.k === 'wood')
    }
  })

  return new Float32Array(out)
}
