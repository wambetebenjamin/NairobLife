/**
 * Hand-written touch-ups for landmarks whose look OSM tags cannot express.
 *
 * Keep this list short. The city is generated from OpenStreetMap, and the right fix for
 * most problems is to improve the map itself (https://www.openstreetmap.org) and re-run
 * `npm run osm`. A touch-up belongs here only when the data is right but our generic
 * rules still get the landmark wrong: the crown of KICC, the collar of Times Tower, a
 * clock tower nobody has mapped.
 *
 * Where the colours and proportions come from: reference footage of the CBD skyline, read
 * frame by frame (docs/DATA.md, "Landmarks"). Nothing from that footage is in the game;
 * it only told us what colour the walls are and how wide a crown is.
 *
 * Two lists:
 *  - LANDMARK_OVERRIDES changes a building OSM already has, by OSM way id.
 *  - LANDMARK_PARTS adds pieces OSM does not have, each with a made-up negative id.
 *
 * The bake warns when an id here matches nothing, so the list cannot rot quietly when
 * the map data is refreshed.
 *
 * TODO(landmarks): swap the most iconic of these for hand-modelled GLBs
 * (KICC, Jamia Mosque domes, the Archives).
 */
import type { LatLon } from '../../src/core/geo'
import type { RoofShape } from '../../src/world/zone/format'

/** The glazing styles of geometry/buildings.ts (FACADE), by name. */
export type FacadeName = 'blank' | 'punched' | 'ribbon' | 'curtain' | 'piers'

/** What a touch-up can say about how a piece looks. Anything left out stays as it was. */
export interface LandmarkLook {
  /** Wall colour, #rrggbb. */
  colour?: string
  /** Roof colour, #rrggbb. */
  roofColour?: string
  facade?: FacadeName
  roof?: { shape: RoofShape; height: number }
  /**
   * How wide the top of the walls is compared with the footprint: above 1 the piece
   * flares out as it rises, below 1 it narrows.
   */
  taper?: number
}

export interface LandmarkOverride extends LandmarkLook {
  /** Roof height in metres. */
  h?: number
  /** `h` is read off photographs rather than measured: the building stays marked as estimated. */
  guess?: boolean
  /** Height the piece starts at, in metres. */
  base?: number
  /**
   * Keep this outline even though its building:part pieces would normally replace it,
   * and leave those parts alone.
   */
  keepOutline?: boolean
  /** Leave this piece out: pieces in LANDMARK_PARTS stand in for it. */
  drop?: boolean
  name?: string
  /** Why this override exists. */
  note: string
}

export interface LandmarkPart extends LandmarkLook {
  /** Made up, negative and unique. A piece's look is seeded by its id, so never reuse one. */
  id: number
  name?: string
  /**
   * The footprint: a copy of another building's (by OSM way id), made wider or narrower
   * about its centre, or a regular polygon around a point. `turn` is the compass bearing
   * one of the polygon's corners points along, in degrees.
   */
  outline:
    | { like: number; scale?: number }
    | { centre: LatLon; radius: number; sides: number; turn?: number }
  /** Height the piece starts at, in metres. */
  base: number
  /** Roof height in metres. */
  h: number
  /** Why this piece exists. */
  note: string
}

const KICC_SHAFT = 123414928
const TIMES_TOWER_SHAFT = 1431934015
/**
 * The foot of the clock tower. Nobody has mapped the tower itself; this is the small bay
 * on the east side of the Parliament outline where it stands, which agrees with where it
 * sits in the footage to within about 20 m.
 */
const PARLIAMENT_CLOCK_TOWER: LatLon = { lat: -1.28988, lon: 36.82042 }
/** Lines the tower's faces up with the building, which sits 25 degrees off north. */
const PARLIAMENT_TURN = 109.8

const KICC_DARK = '#6b5a54'
const TIMES_CONCRETE = '#b4aea5'
const STEEL = '#5d5a56'

export const LANDMARK_OVERRIDES: Record<number, LandmarkOverride> = {
  // ---- KICC. OSM maps the 20-sided shaft as a building:part and the outline of the crown
  // as the building. The shaft is dusty rose concrete with a dark band of glass on every
  // floor; the crown is rebuilt below, because the outline is half as wide again as the
  // saucer really is.
  [KICC_SHAFT]: {
    h: 94,
    colour: '#a8857c',
    facade: 'ribbon',
    note: 'KICC shaft: rose concrete, banded, stopping under the crown',
  },
  1396270912: { drop: true, note: 'KICC crown outline: replaced by the saucer in LANDMARK_PARTS' },
  123414930: {
    colour: '#b78f66',
    roofColour: '#c99c6f',
    note: 'KICC amphitheatre: OSM says grey, but the cone is sand-coloured',
  },

  // ---- Times Tower. OSM has the shaft, a core that rises above it and a collar near the
  // top. The collar is mapped almost twice the width of the shaft; the real one steps out
  // by a sixth. Bare concrete piers with glass between them, top to bottom.
  [TIMES_TOWER_SHAFT]: {
    h: 125,
    colour: '#beb8af',
    facade: 'piers',
    note: 'Times Tower shaft: concrete piers, stopping under the collar',
  },
  1436349700: { drop: true, note: 'Times Tower collar as mapped: replaced in LANDMARK_PARTS' },
  1429682196: {
    colour: '#aaa49b',
    facade: 'blank',
    note: 'Times Tower core: only its top shows, above the collar',
  },

  // ---- Parliament. Red brick under flat concrete roofs, two and three storeys.
  [-10937]: {
    h: 13,
    guess: true,
    colour: '#a9694d',
    roofColour: '#c4baa8',
    facade: 'punched',
    note: 'Parliament Buildings: brick and concrete, lower than our estimate',
  },

  // ---- Bunge Tower, finished in 2024: peach concrete frame, bronze glass in strips.
  699407926: {
    colour: '#d3a985',
    roofColour: '#b7aea2',
    facade: 'piers',
    note: 'Bunge Tower: peach frame, glass in strips',
  },
}

export const LANDMARK_PARTS: readonly LandmarkPart[] = [
  // ---- KICC: a recessed dark floor, then the saucer flaring out to the helipad deck.
  {
    id: -900101,
    outline: { like: KICC_SHAFT, scale: 0.9 },
    base: 94,
    h: 97.5,
    colour: '#4a3e3a',
    facade: 'blank',
    note: 'KICC: the recessed floor between the shaft and the saucer',
  },
  {
    id: -900102,
    outline: { like: KICC_SHAFT, scale: 0.94 },
    base: 97.5,
    h: 102.5,
    taper: 1.32,
    colour: KICC_DARK,
    facade: 'blank',
    note: 'KICC: the underside of the saucer',
  },
  {
    id: -900103,
    name: 'Kenyatta International Convention Centre',
    outline: { like: KICC_SHAFT, scale: 1.24 },
    base: 102.5,
    h: 105,
    colour: KICC_DARK,
    roofColour: '#8b867f',
    facade: 'blank',
    note: 'KICC: the rim of the saucer. Its roof is the helipad, 105 m up',
  },

  // ---- Times Tower: the collar steps out, runs straight for two floors, and the core
  // carries on above it.
  {
    id: -900201,
    outline: { like: TIMES_TOWER_SHAFT },
    base: 125,
    h: 129,
    taper: 1.16,
    colour: TIMES_CONCRETE,
    facade: 'blank',
    note: 'Times Tower: where the collar steps out',
  },
  {
    id: -900202,
    outline: { like: TIMES_TOWER_SHAFT, scale: 1.16 },
    base: 129,
    h: 135,
    colour: TIMES_CONCRETE,
    roofColour: '#8d8a84',
    facade: 'ribbon',
    note: 'Times Tower: the collar',
  },

  // ---- Parliament's clock tower: sandstone, about twelve storeys, with a flat cap and a
  // steel frame on top (drawn as a slim block, since the mesh has no see-through parts).
  {
    id: -900301,
    name: 'Parliament clock tower',
    outline: { centre: PARLIAMENT_CLOCK_TOWER, radius: 5.2, sides: 4, turn: PARLIAMENT_TURN },
    base: 0,
    h: 40,
    colour: '#bfa274',
    facade: 'punched',
    note: 'Parliament clock tower: the shaft',
  },
  {
    id: -900302,
    outline: { centre: PARLIAMENT_CLOCK_TOWER, radius: 6.2, sides: 4, turn: PARLIAMENT_TURN },
    base: 40,
    h: 41.2,
    colour: '#b9b0a0',
    facade: 'blank',
    note: 'Parliament clock tower: the cap',
  },
  {
    id: -900303,
    outline: { centre: PARLIAMENT_CLOCK_TOWER, radius: 2.6, sides: 4, turn: PARLIAMENT_TURN },
    base: 41.2,
    h: 48.5,
    colour: STEEL,
    facade: 'blank',
    note: 'Parliament clock tower: the steel frame',
  },
  {
    id: -900304,
    outline: { centre: PARLIAMENT_CLOCK_TOWER, radius: 0.5, sides: 4, turn: PARLIAMENT_TURN },
    base: 48.5,
    h: 54,
    colour: STEEL,
    facade: 'blank',
    note: 'Parliament clock tower: the mast',
  },
]
