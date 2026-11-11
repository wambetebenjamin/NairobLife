/**
 * Turning OSM tags into the handful of things the game cares about.
 * This is the one place that knows OSM tagging conventions.
 */
import type { AreaKind, PoiKind, RoadKind } from '../../../src/world/zone/format'
import type { Tags } from './osm'

// ------------------------------------------------------------------ roads

const HIGHWAY_KIND: Record<string, RoadKind> = {
  motorway: 'motorway',
  motorway_link: 'motorway',
  trunk: 'trunk',
  trunk_link: 'trunk',
  primary: 'primary',
  primary_link: 'primary',
  secondary: 'secondary',
  secondary_link: 'secondary',
  tertiary: 'tertiary',
  tertiary_link: 'tertiary',
  unclassified: 'residential',
  residential: 'residential',
  living_street: 'residential',
  road: 'residential',
  service: 'service',
  pedestrian: 'pedestrian',
  footway: 'footway',
  path: 'footway',
  cycleway: 'footway',
  bridleway: 'footway',
  track: 'footway',
  steps: 'steps',
}

export interface RoadInfo {
  kind: RoadKind
  link: boolean
  width: number
  name?: string
  oneway: boolean
  lanes?: number
  maxspeed?: number
  /** OSM says this is a bridge (bridge=yes/viaduct/...). */
  bridge: boolean
  viaduct: boolean
  tunnel: boolean
  layer: number
}

/** Returns undefined for highways the game does not draw (proposed, construction, corridors...). */
export function roadInfo(tags: Tags): RoadInfo | undefined {
  const hw = tags.highway
  const kind = hw ? HIGHWAY_KIND[hw] : undefined
  if (!kind) return undefined
  if (tags.area === 'yes') return undefined // plazas are handled as areas
  if (tags.access === 'no' && kind === 'service' && tags.indoor) return undefined

  const link = hw.endsWith('_link')
  const lanes = intTag(tags.lanes)
  const oneway =
    tags.oneway === 'yes' ||
    tags.oneway === '1' ||
    tags.junction === 'roundabout' ||
    hw === 'motorway'
  const tunnel = !!tags.tunnel && tags.tunnel !== 'no' && tags.tunnel !== 'building_passage'
  const bridge = !!tags.bridge && tags.bridge !== 'no'

  return {
    kind,
    link,
    width: roadWidth(kind, link, oneway, lanes, tags),
    name: cleanName(tags.name),
    oneway,
    lanes,
    maxspeed: intTag(tags.maxspeed),
    bridge,
    viaduct: tags.bridge === 'viaduct',
    tunnel,
    layer: intTag(tags.layer) ?? 0,
  }
}

function roadWidth(
  kind: RoadKind,
  link: boolean,
  oneway: boolean,
  lanes: number | undefined,
  tags: Tags,
): number {
  const explicit = parseMetres(tags.width)
  if (explicit && explicit > 1 && explicit < 40) return round1(explicit)
  if (kind === 'steps') return 2.4
  if (kind === 'footway') return 2.2
  if (kind === 'pedestrian') return 6
  if (kind === 'service') {
    return tags.service === 'parking_aisle' ||
      tags.service === 'driveway' ||
      tags.service === 'alley'
      ? 3.4
      : 4.2
  }
  if (lanes && lanes > 0 && lanes < 9) return round1(lanes * 3.4 + 0.8)
  if (link) return 5
  switch (kind) {
    case 'motorway':
      return 8
    case 'trunk':
      return oneway ? 8 : 12
    case 'primary':
      return oneway ? 7.5 : 10.5
    case 'secondary':
      return oneway ? 7 : 9.5
    case 'tertiary':
      return oneway ? 6 : 8
    default:
      return tags.highway === 'living_street' ? 5.5 : 6.5
  }
}

// ------------------------------------------------------------------ areas

/** Ground cover for a closed way or multipolygon, or undefined if we do not draw it. */
export function areaKind(tags: Tags): AreaKind | undefined {
  if (tags.natural === 'water' || tags.waterway === 'riverbank' || tags.leisure === 'swimming_pool')
    return 'water'
  if (tags.amenity === 'fountain') return 'water'
  if (tags.leisure === 'park' || tags.leisure === 'nature_reserve') return 'park'
  if (tags.leisure === 'garden') return 'garden'
  if (tags.leisure === 'pitch' || tags.leisure === 'playground' || tags.leisure === 'track')
    return 'pitch'
  if (tags.landuse === 'forest' || tags.natural === 'wood') return 'wood'
  if (
    tags.landuse === 'grass' ||
    tags.landuse === 'meadow' ||
    tags.landuse === 'recreation_ground' ||
    tags.landuse === 'village_green' ||
    tags.landuse === 'cemetery' ||
    tags.natural === 'scrub' ||
    tags.natural === 'grassland' ||
    tags.leisure === 'golf_course'
  ) {
    return 'grass'
  }
  if (
    tags.amenity === 'parking' &&
    tags.parking !== 'underground' &&
    tags.parking !== 'multi-storey'
  )
    return 'parking'
  if ((tags.highway === 'pedestrian' || tags.highway === 'footway') && tags.area === 'yes')
    return 'plaza'
  if (tags.place === 'square') return 'plaza'
  return undefined
}

/** A named region worth showing in the HUD ("University of Nairobi - Main Campus"). */
export function isNamedPlace(tags: Tags): boolean {
  if (!tags.name) return false
  if (tags.building || tags['building:part'] || tags.highway) return false
  if (tags.amenity === 'parking' || tags.amenity === 'fuel' || tags.leisure === 'swimming_pool')
    return false
  return true
}

// ------------------------------------------------------------------ points of interest

export function poiKind(tags: Tags): PoiKind | undefined {
  if (
    tags.highway === 'bus_stop' ||
    tags.amenity === 'bus_station' ||
    tags.public_transport === 'platform' ||
    tags.public_transport === 'station' ||
    tags.public_transport === 'stop_position'
  ) {
    return 'stage'
  }
  if (tags.highway === 'traffic_signals') return 'signal'
  if (tags.highway === 'street_lamp') return 'lamp'
  if (tags.amenity === 'fuel') return 'fuel'
  if (tags.amenity === 'fountain') return 'fountain'
  if (
    tags.historic === 'monument' ||
    tags.historic === 'memorial' ||
    tags.tourism === 'artwork' ||
    tags.tourism === 'attraction' ||
    tags.tourism === 'museum' ||
    tags.tourism === 'viewpoint'
  ) {
    return 'sight'
  }
  return undefined
}

// ------------------------------------------------------------------ value parsing

/** "140", "140 m", "45.5m", "12,5". Feet and other units are ignored. */
export function parseMetres(value: string | undefined): number | undefined {
  if (!value) return undefined
  const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*(m|metres?|meters?)?\s*$/i.exec(value)
  if (!m) return undefined
  const n = Number(m[1].replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

export function numTag(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const n = Number(value.trim().replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

export function intTag(value: string | undefined): number | undefined {
  const n = numTag(value)
  return n === undefined ? undefined : Math.trunc(n)
}

export function cleanName(value: string | undefined): string | undefined {
  const name = value?.replace(/\s+/g, ' ').trim()
  return name ? name : undefined
}

const NAMED_COLOURS: Record<string, string> = {
  white: '#f2f0ea',
  black: '#2a2a2c',
  grey: '#9a9a9a',
  gray: '#9a9a9a',
  lightgrey: '#c9c9c7',
  lightgray: '#c9c9c7',
  darkgrey: '#5f6063',
  darkgray: '#5f6063',
  silver: '#bfc3c7',
  red: '#b5463a',
  maroon: '#7a2f2b',
  brown: '#8a5a3c',
  beige: '#d8c8a8',
  cream: '#e9dfc4',
  tan: '#c9a77a',
  yellow: '#e3c04e',
  orange: '#d9813a',
  green: '#4f8a5b',
  blue: '#4b78b0',
  lightblue: '#8fb7d9',
  pink: '#d99aa5',
  purple: '#7b5ea7',
}

/** OSM colour value (CSS name or hex) to #rrggbb, or undefined if unrecognised. */
export function parseColour(value: string | undefined): string | undefined {
  if (!value) return undefined
  const v = value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, '')
  if (/^#[0-9a-f]{6}$/.test(v)) return v
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
  return NAMED_COLOURS[v]
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
