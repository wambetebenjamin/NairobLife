/**
 * Building heights.
 *
 * Mappers have tagged the towers that define Nairobi's skyline (KICC, Times Tower,
 * Teleposta, NSSF...) but nine in ten footprints carry no height at all. For those we
 * make an educated guess from the building type, the footprint size and how tall the
 * tagged neighbours are, with a per-building jitter so a street does not come out as a
 * row of identical boxes. Guessed heights are flagged (`est`) in the baked file.
 */
import { hash01 } from '../../../src/core/random'
import { intTag, numTag, parseMetres } from './tags'
import type { Tags } from './osm'

/** Floor-to-floor height. The tagged CBD towers average 3.4 m per level. */
export const LEVEL_HEIGHT = 3.4
const PARAPET = 0.8
/** A guessed building is at most this many times as tall as its footprint is wide. */
const MAX_GUESSED_SLENDERNESS = 1.25

export interface TaggedHeight {
  /** Roof height in metres, if OSM says (directly, or via levels). */
  h?: number
  /** Where the part starts above the ground. */
  base: number
  levels?: number
}

export function taggedHeight(tags: Tags): TaggedHeight {
  let base = parseMetres(tags.min_height) ?? 0
  if (!base) {
    const minLevel = numTag(tags['building:min_level'])
    if (minLevel && minLevel > 0) base = minLevel * LEVEL_HEIGHT
  }
  const levels = numTag(tags['building:levels'])
  let h = parseMetres(tags.height)
  // Guard against typos (a 2 km tall kiosk) and zero heights.
  if (h !== undefined && (h <= 0 || h > 450)) h = undefined
  if (h === undefined && levels !== undefined && levels > 0 && levels < 120) {
    h = (levels + (intTag(tags['roof:levels']) ?? 0)) * LEVEL_HEIGHT + PARAPET
  }
  if (h !== undefined && h <= base) h = base + LEVEL_HEIGHT
  return { h, base, levels: levels ?? (h !== undefined ? Math.round(h / LEVEL_HEIGHT) : undefined) }
}

/** Heights for types where the number of floors is not the point. Metres. */
const FIXED_BY_TYPE: Record<string, number> = {
  roof: 4.2,
  carport: 3,
  shed: 3,
  garage: 3,
  garages: 3,
  hut: 3,
  kiosk: 3,
  toilets: 3,
  service: 3.5,
  guardhouse: 3,
  church: 14,
  chapel: 9,
  cathedral: 22,
  mosque: 14,
  temple: 12,
  train_station: 9,
  hangar: 10,
  industrial: 8,
  warehouse: 8,
  stadium: 14,
  grandstand: 12,
}

/** Typical floor counts for types that hint at their size. */
const LEVELS_BY_TYPE: Record<string, number> = {
  house: 1.4,
  detached: 1.4,
  residential: 2.5,
  apartments: 5,
  dormitory: 4,
  university: 3,
  college: 3,
  school: 2,
  hospital: 4,
  hotel: 6,
  retail: 2,
  supermarket: 1.5,
  mall: 3,
}

export interface KnownHeight {
  x: number
  z: number
  levels: number
}

export interface EstimateInput {
  id: number
  type: string | undefined
  area: number
  x: number
  z: number
}

/**
 * Returns a function that guesses a roof height. `known` are the buildings whose height
 * OSM does give; they set the tone for their neighbourhood.
 */
export function createHeightEstimator(known: readonly KnownHeight[]): (b: EstimateInput) => number {
  const RADIUS = 200
  const grid = new Map<string, KnownHeight[]>()
  for (const k of known) {
    const key = `${Math.floor(k.x / RADIUS)},${Math.floor(k.z / RADIUS)}`
    let bucket = grid.get(key)
    if (!bucket) grid.set(key, (bucket = []))
    bucket.push(k)
  }

  /** Distance-weighted floor count of tagged buildings within RADIUS, or undefined. */
  const neighbourhood = (x: number, z: number): number | undefined => {
    const cx = Math.floor(x / RADIUS)
    const cz = Math.floor(z / RADIUS)
    let sum = 0
    let weight = 0
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const k of grid.get(`${cx + dx},${cz + dz}`) ?? []) {
          const d = Math.hypot(k.x - x, k.z - z)
          if (d > RADIUS) continue
          const w = 1 / (d + 40)
          sum += Math.min(k.levels, 30) * w
          weight += w
        }
      }
    }
    return weight > 0 ? sum / weight : undefined
  }

  return ({ id, type, area, x, z }) => {
    if (type && FIXED_BY_TYPE[type] !== undefined) return FIXED_BY_TYPE[type]
    if (area < 40) return 3 // kiosks, guard huts, booths

    const jitter = 0.6 + hash01(id, 1) * 0.9 // 0.6 .. 1.5
    let levels: number
    if (type && LEVELS_BY_TYPE[type] !== undefined) {
      levels = LEVELS_BY_TYPE[type] * (0.8 + hash01(id, 2) * 0.4)
    } else {
      // Tagged buildings skew tall (people tag towers), so untagged neighbours get a
      // fraction of the local average rather than the average itself.
      const around = neighbourhood(x, z)
      const tone = around === undefined ? 2 : Math.min(Math.max(around * 0.36, 1.6), 9)
      const footprint = area < 120 ? 0.6 : area > 2500 ? 0.65 : 1
      levels = tone * footprint * jitter
      // A small footprint cannot carry many floors. Without this cap, every kiosk-sized
      // outline that happens to stand beside a tagged tower is guessed into a tower itself.
      const width = Math.sqrt(area)
      levels = Math.min(levels, (width * MAX_GUESSED_SLENDERNESS) / LEVEL_HEIGHT)
    }
    const whole = Math.max(1, Math.round(levels))
    return Math.round((whole * LEVEL_HEIGHT + PARAPET) * 10) / 10
  }
}
