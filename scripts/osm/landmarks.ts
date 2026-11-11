/**
 * Hand-written touch-ups for landmarks whose shape OSM tags cannot express.
 *
 * Keep this list short. The city is generated from OpenStreetMap, and the right fix for
 * most problems is to improve the map itself (https://www.openstreetmap.org) and re-run
 * `npm run osm`. An override belongs here only when the data is right but our generic
 * rules still get the landmark wrong.
 *
 * Keyed by OSM way id.
 *
 * TODO(landmarks): swap the most iconic of these for hand-modelled GLBs
 * (KICC, Parliament clock tower, Jamia Mosque domes, the Archives).
 */

export interface LandmarkOverride {
  /** Roof height in metres. */
  h?: number
  /** Height the piece starts at, in metres. */
  base?: number
  /**
   * Keep this outline even though its building:part pieces would normally replace it,
   * and leave those parts alone.
   */
  keepOutline?: boolean
  /** Why this override exists. */
  note: string
}

export const LANDMARK_OVERRIDES: Record<number, LandmarkOverride> = {
  // KICC. OSM maps the 20-sided shaft as a building:part and the wide saucer that crowns
  // it as the building outline. Rendered by the book, the outline is dropped and the tower
  // loses the crown that makes it KICC. Here the shaft stops under the crown, and the
  // outline becomes the crown: a slab from 93 m to the 105 m helipad deck.
  123414928: { h: 93, note: 'KICC shaft, stopping under the crown' },
  1396270912: { base: 93, h: 105, keepOutline: true, note: 'KICC crown and helipad deck' },
}
