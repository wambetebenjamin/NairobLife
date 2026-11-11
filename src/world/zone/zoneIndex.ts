/**
 * Questions about the map that gameplay asks every frame or so:
 * "which street am I on?", "what is this place called?", "is this point inside a building?"
 *
 * Built once per zone from the baked file. No three.js or DOM, so tests can use it.
 */
import {
  distToSegmentSq,
  pointInPolygon,
  pointInRing,
  ringBounds,
  type Rect,
} from '../../core/geom2d'
import { SpatialGrid } from '../../core/spatialGrid'
import type { ZoneBuilding, ZoneFile, ZoneRoad } from './format'

interface Segment {
  ax: number
  az: number
  bx: number
  bz: number
  road: ZoneRoad
}

interface Footprint {
  outer: number[]
  holes: number[][]
  building: ZoneBuilding
}

export class ZoneIndex {
  readonly bounds: Rect
  private readonly segments = new SpatialGrid<Segment>(50)
  private readonly footprints = new SpatialGrid<Footprint>(50)
  private readonly places: { name: string; ring: number[]; box: Rect }[]
  readonly file: ZoneFile

  constructor(file: ZoneFile) {
    this.file = file
    const q = file.q
    const toMetres = (ring: number[]) => ring.map((value) => value / q)
    const [minX, minZ, maxX, maxZ] = file.bounds
    this.bounds = { minX, minZ, maxX, maxZ }

    for (const road of file.roads) {
      const p = road.p
      for (let i = 0; i < p.length - 2; i += 2) {
        const ax = p[i] / q
        const az = p[i + 1] / q
        const bx = p[i + 2] / q
        const bz = p[i + 3] / q
        const pad = road.w / 2 + 8
        this.segments.insert(
          { ax, az, bx, bz, road },
          Math.min(ax, bx) - pad,
          Math.min(az, bz) - pad,
          Math.max(ax, bx) + pad,
          Math.max(az, bz) + pad,
        )
      }
    }

    for (const building of file.buildings) {
      const outer = toMetres(building.p)
      const box = ringBounds(outer)
      this.footprints.insert(
        { outer, holes: (building.hs ?? []).map(toMetres), building },
        box.minX,
        box.minZ,
        box.maxX,
        box.maxZ,
      )
    }

    // Already sorted smallest first by the bake, so the first hit is the most specific.
    this.places = file.places.map((place) => {
      const ring = toMetres(place.p)
      return { name: place.n, ring, box: ringBounds(ring) }
    })
  }

  /** The named street under (or right beside) a point. */
  streetAt(x: number, z: number): string | undefined {
    let best: string | undefined
    let bestScore = Infinity
    for (const { ax, az, bx, bz, road } of this.segments.at(x, z)) {
      if (!road.n) continue
      const reach = road.w / 2 + 6
      const d = Math.sqrt(distToSegmentSq(x, z, ax, az, bx, bz))
      if (d > reach) continue
      // Standing on the carriageway beats being merely near a wider road.
      const score = Math.max(0, d - road.w / 2)
      if (score < bestScore) {
        bestScore = score
        best = road.n
      }
    }
    return best
  }

  /** The most specific named area containing a point: a park, a campus, a district. */
  placeAt(x: number, z: number): string | undefined {
    for (const place of this.places) {
      const b = place.box
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue
      if (pointInRing(x, z, place.ring)) return place.name
    }
    return undefined
  }

  /** The building whose footprint contains a point, if any. Floating parts do not count. */
  buildingAt(x: number, z: number): ZoneBuilding | undefined {
    for (const fp of this.footprints.at(x, z)) {
      if ((fp.building.b ?? 0) > 3) continue
      if (pointInPolygon(x, z, fp.outer, fp.holes)) return fp.building
    }
    return undefined
  }

  /** Nearest point on any ground-level road within maxDist, for un-sticking spawns. */
  nearestRoadPoint(x: number, z: number, maxDist: number): [number, number] | undefined {
    let best: [number, number] | undefined
    let bestSq = maxDist * maxDist
    this.segments.near(x, z, maxDist, ({ ax, az, bx, bz, road }) => {
      if (road.e) return
      const dx = bx - ax
      const dz = bz - az
      const lenSq = dx * dx + dz * dz
      const t = lenSq > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / lenSq)) : 0
      const px = ax + dx * t
      const pz = az + dz * t
      const dSq = (px - x) * (px - x) + (pz - z) * (pz - z)
      if (dSq < bestSq && !this.buildingAt(px, pz)) {
        bestSq = dSq
        best = [px, pz]
      }
    })
    return best
  }

  /**
   * A point you can stand on, as close as possible to the one asked for: the point itself
   * if it is clear of buildings, otherwise the nearest stretch of road.
   */
  safeSpawn(x: number, z: number): [number, number] {
    const b = this.bounds
    const cx = Math.min(b.maxX - 5, Math.max(b.minX + 5, x))
    const cz = Math.min(b.maxZ - 5, Math.max(b.minZ + 5, z))
    if (!this.buildingAt(cx, cz)) return [cx, cz]
    return this.nearestRoadPoint(cx, cz, 250) ?? [cx, cz]
  }
}
