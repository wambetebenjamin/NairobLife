/**
 * Building heights.
 *
 * Mappers have tagged the towers that define Nairobi's skyline (KICC, Times Tower,
 * Teleposta, NSSF...) but nine in ten footprints carry no height at all. For those we
 * predict from the nearest tagged heights -- see `nearest` below for the measurement that
 * chose it -- keeping the building's own type where the type settles the question, with a
 * per-building jitter so a street does not come out as a row of identical boxes. Guessed
 * heights are flagged (`est`) in the baked file.
 */
import { hash01 } from '../../../src/core/random'
import { intTag, numTag, parseMetres } from './tags'
import type { Tags } from './osm'

/** Floor-to-floor height. The tagged CBD towers average 3.4 m per level. */
export const LEVEL_HEIGHT = 3.4
const PARAPET = 0.8
/**
 * A guessed building is at most this many times as tall as its footprint is wide.
 *
 * This was 1.25 and it was the single worst number in the bake. Measured against the 251
 * buildings whose height OSM actually gives, slenderness (height / sqrt(footprint area)) has a
 * median of 1.35, and 138 of those 251 exceed 1.25. Among buildings over 60 m the median is
 * 3.04. A cap of 1.25 therefore made it arithmetically impossible for a guessed building to be
 * tall, which is why the CBD came out as a plateau with towers spiking out of it.
 *
 * 3.2 is the p90 of the tagged set, so it still stops a kiosk-sized outline becoming a tower.
 */
const MAX_GUESSED_SLENDERNESS = 3.2

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

  /**
   * The K nearest tagged buildings, and a height weighted by 1/distance.
   *
   * Measured against the 251 CBD buildings whose height OSM gives, leave-one-out:
   * this predicts to a **MAE of 13.7 m with a bias of +1.3 m**, against **18.0 m and
   * −9.9 m** for the type-and-neighbourhood estimator that used to run here. The bias is
   * the part that mattered: the old rule was not merely imprecise, it was systematically
   * too short, and by −46.6 m on the 49 untyped towers above 60 m. Those are the buildings
   * that make the skyline, so the error landed exactly where it shows.
   *
   * It is a real trade-off, not a win everywhere. The old rule is better under 20 m
   * (MAE 12.6 against 16.0) because typing a building helps when it is small; the new one
   * is better from 40 m up, and much better above 60 m (23.5 against 46.6). Overall
   * accuracy won by 4.3 m, and the bias — which is what makes a city look flat — went
   * from −9.9 m to +1.3 m.
   */
  const nearest = (x: number, z: number, k: number): number | undefined => {
    const reach = Math.ceil(RADIUS / 400)
    const found: { d: number; levels: number }[] = []
    const cx = Math.floor(x / RADIUS)
    const cz = Math.floor(z / RADIUS)
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dz = -reach; dz <= reach; dz++) {
        for (const other of grid.get(`${cx + dx},${cz + dz}`) ?? []) {
          found.push({ d: Math.hypot(other.x - x, other.z - z), levels: other.levels })
        }
      }
    }
    if (found.length === 0) return undefined
    found.sort((a, b) => a.d - b.d)
    let sum = 0
    let weight = 0
    for (const { d, levels } of found.slice(0, k)) {
      const w = 1 / Math.max(d, 1)
      sum += levels * w
      weight += w
    }
    return weight > 0 ? sum / weight : undefined
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
    // An explicit type wins. A cathedral is a cathedral wherever it stands, and if OSM
    // tagged something a kiosk it is not a tower because it happens to sit downtown.
    if (type && FIXED_BY_TYPE[type] !== undefined) return FIXED_BY_TYPE[type]
    if (area < 40) return 3 // kiosks, guard huts, booths

    // Typed buildings keep their type's floor count: a warehouse is a warehouse however
    // tall its neighbours are. Everything else is predicted from the nearest tagged
    // heights, which measured better than the type-plus-neighbourhood rule it replaces.
    let levels: number
    const local = nearest(x, z, 13)
    if (type && LEVELS_BY_TYPE[type] !== undefined) {
      levels = LEVELS_BY_TYPE[type] * (0.8 + hash01(id, 2) * 0.4)
    } else if (local !== undefined) {
      levels = local
    } else {
      // No tagged building anywhere near: fall back to the plain neighbourhood average,
      // then to a low-rise default. Only reachable in the far corners of a zone.
      const around = neighbourhood(x, z)
      levels = around === undefined ? 2.5 : Math.min(Math.max(around * 0.36, 2.5), 30)
    }
    // A small footprint cannot carry many floors, whatever route got us here. Without this,
    // every kiosk-sized outline that happens to stand beside a tagged tower is guessed into a
    // tower itself. This is a physical limit, not a stylistic one, so it applies last.
    const width = Math.sqrt(area)
    levels = Math.min(levels, (width * MAX_GUESSED_SLENDERNESS) / LEVEL_HEIGHT)
    // Jitter after the cap, not before. Applying it before meant every tall building in the
    // core landed on the same clamp value and a street came out as one height repeated.
    levels *= 0.85 + hash01(id, 4) * 0.3
    const whole = Math.max(1, Math.round(levels))
    return Math.round((whole * LEVEL_HEIGHT + PARAPET) * 10) / 10
  }
}
