/**
 * The zone registry: which slices of Nairobi exist, and where they are.
 *
 * A zone is one bounding box of OpenStreetMap data, baked into one compact file
 * (data/zones/<id>.json) by `npm run osm:bake`. The game streams zones in; the data
 * pipeline in scripts/osm reads this same file, so adding a zone is:
 *
 *   1. add an entry here with status 'planned'
 *   2. npm run osm:fetch -- <id>      (downloads from Overpass)
 *   3. npm run osm:bake  -- <id>
 *   4. flip status to 'live'
 *
 * No DOM or three.js imports here: Node scripts import this file.
 */
import type { BBox, LatLon } from '../core/geo'

/**
 * (0, 0, 0) of the game world: the KICC tower. Every zone projects from this one point.
 * Changing it invalidates every baked zone file.
 */
export const WORLD_ORIGIN: LatLon = { lat: -1.28862, lon: 36.82316 }

/**
 * Ground elevation of the CBD above sea level, in metres. Nairobi is a mile-high city;
 * the HUD adds this to the player's height so the altimeter reads true.
 * TODO(terrain): replace the flat ground with SRTM heights per zone.
 */
export const BASE_ELEVATION_M = 1661

export interface ZoneDef {
  id: string
  name: string
  /** One line for menus and the README. */
  blurb: string
  bbox: BBox
  /** 'live' zones ship with baked data. 'planned' ones are placeholders for the roadmap. */
  status: 'live' | 'planned'
}

export const ZONES: readonly ZoneDef[] = [
  {
    id: 'nairobi-cbd',
    name: 'CBD & University of Nairobi',
    blurb: 'KICC, City Square, Kenyatta Avenue, River Road, Uhuru Park and the UoN main campus.',
    bbox: { south: -1.2955, west: 36.8095, north: -1.2745, east: 36.8305 },
    status: 'live',
  },

  // --- Roadmap zones. The boxes are first guesses; tune them before the first fetch. ---
  {
    id: 'upper-hill',
    name: 'Upper Hill',
    blurb:
      'The financial district: UAP Old Mutual Tower, Britam Tower, Kenyatta National Hospital.',
    bbox: { south: -1.3075, west: 36.805, north: -1.2955, east: 36.8235 },
    status: 'planned',
  },
  {
    id: 'westlands',
    name: 'Westlands',
    blurb: 'Sarit Centre, Westgate, Waiyaki Way, the GTC towers and the Expressway terminus.',
    bbox: { south: -1.273, west: 36.795, north: -1.255, east: 36.8165 },
    status: 'planned',
  },
  {
    id: 'kilimani',
    name: 'Kilimani',
    blurb: 'Yaya Centre, Argwings Kodhek Road, Ngong Road and the apartment-block skyline.',
    bbox: { south: -1.302, west: 36.774, north: -1.283, east: 36.8 },
    status: 'planned',
  },
  {
    id: 'jkia',
    name: 'JKIA & Mombasa Road',
    blurb: 'Jomo Kenyatta International Airport: the runway, the terminals and the Expressway.',
    bbox: { south: -1.346, west: 36.895, north: -1.312, east: 36.945 },
    status: 'planned',
  },
]

export const DEFAULT_ZONE_ID = 'nairobi-cbd'

export function getZone(id: string): ZoneDef {
  const zone = ZONES.find((z) => z.id === id)
  if (!zone)
    throw new Error(`Unknown zone "${id}". Known zones: ${ZONES.map((z) => z.id).join(', ')}`)
  return zone
}
