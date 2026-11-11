/**
 * The baked zone format: the contract between the data pipeline and the game.
 *
 *   scripts/osm/bake.ts  --writes-->  data/zones/<id>.json  --read by-->  world/zone/zoneWorker.ts
 *
 * Design goals: small on the wire (integers, short keys, no repeated strings where a
 * default will do) and cheap to turn into meshes. All geometry is already projected into
 * world space (see core/geo.ts), so the game never touches latitude/longitude to build
 * the city.
 *
 * Coordinates are integers in units of 1/Q metres (decimetres), packed flat as
 * [x0, z0, x1, z1, ...]. Rings are not closed (the first point is not repeated).
 * Outer rings have positive signed area in (x, z); holes are wound the other way.
 *
 * Bump ZONE_FORMAT_VERSION on any breaking change and re-run `npm run osm:bake`.
 */
import type { BBox, LatLon } from '../../core/geo'

export const ZONE_FORMAT_VERSION = 1

/** Fixed-point scale: stored integer = metres * Q. */
export const Q = 10

export type RoadKind =
  | 'motorway'
  | 'trunk'
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'residential'
  | 'service'
  | 'pedestrian'
  | 'footway'
  | 'steps'

export interface ZoneRoad {
  k: RoadKind
  /** Centre line. */
  p: number[]
  /** Carriageway width in metres. */
  w: number
  /** Street name, straight from OSM. */
  n?: string
  /** One-way, in point order. */
  ow?: 1
  /** Lane count when OSM has it. */
  ln?: number
  /** A slip road or ramp (OSM *_link). */
  lk?: 1
  /** Speed limit in km/h. */
  ms?: number
  /** A bridge deck raised above the ground (flyover, viaduct, footbridge). */
  br?: 1
  /**
   * Height above ground per vertex, in 1/Q metres. Present only when some vertex is off
   * the ground: bridge decks, and the ramps that climb up to them.
   */
  e?: number[]
}

export interface ZoneBuilding {
  /** OSM way id (negative ids were synthesised). Handy for landmark overrides. */
  id: number
  /** Footprint outer ring. */
  p: number[]
  /** Courtyards. */
  hs?: number[][]
  /** Roof height in metres. */
  h: number
  /** Base height in metres, for parts that start above the ground. */
  b?: number
  n?: string
  /** OSM building type when it says more than "yes": commercial, university, church… */
  t?: string
  /** Facade colour as #rrggbb when OSM has building:colour. */
  c?: string
  /** Roof colour as #rrggbb when OSM has roof:colour. */
  rc?: string
  /** Roof shape when OSM gives one we can build. Absent means flat. */
  rs?: RoofShape
  /** Height of that roof in metres, included in `h` (walls stop at h - rh). */
  rh?: number
  /** 1 when the height is our estimate (OSM had neither height nor levels). */
  est?: 1
}

export type RoofShape = 'cone' | 'dome'

export type AreaKind =
  'park' | 'garden' | 'grass' | 'wood' | 'water' | 'parking' | 'pitch' | 'plaza'

export interface ZoneArea {
  k: AreaKind
  p: number[]
  hs?: number[][]
  n?: string
}

/** A named region with no surface of its own: a campus, a square, a district. For "where am I". */
export interface ZonePlace {
  n: string
  p: number[]
  /** Area in square metres. The smallest place containing a point is the most specific. */
  a: number
}

export type PoiKind = 'stage' | 'signal' | 'lamp' | 'fuel' | 'sight' | 'fountain'

export interface ZonePoi {
  k: PoiKind
  x: number
  z: number
  n?: string
  /** Matatu stages: the route or SACCO network OSM lists, e.g. "Githurai 45". */
  r?: string
}

export interface ZoneLine {
  p: number[]
  /** Width in metres. */
  w: number
  n?: string
}

export interface ZoneFile {
  v: typeof ZONE_FORMAT_VERSION
  id: string
  name: string
  /** The projection origin this file was baked with. Must equal WORLD_ORIGIN. */
  origin: LatLon
  bbox: BBox
  /** [minX, minZ, maxX, maxZ] in metres. */
  bounds: [number, number, number, number]
  /** Fixed-point scale used by every coordinate in this file. */
  q: number
  generated: string
  attribution: string
  buildings: ZoneBuilding[]
  roads: ZoneRoad[]
  rails: ZoneLine[]
  waterways: ZoneLine[]
  areas: ZoneArea[]
  places: ZonePlace[]
  /** Individually mapped trees, flat [x, z, ...]. Parks get more, scattered at load time. */
  trees: number[]
  pois: ZonePoi[]
}

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors (ODbL)'

/** Roads a car can drive on (Phase 2 traffic uses these). */
export const DRIVABLE: Record<RoadKind, boolean> = {
  motorway: true,
  trunk: true,
  primary: true,
  secondary: true,
  tertiary: true,
  residential: true,
  service: true,
  pedestrian: false,
  footway: false,
  steps: false,
}
