/**
 * Geography <-> world space.
 *
 * World space is a local tangent plane in metres, anchored at one origin for the whole
 * game (see WORLD_ORIGIN in config/zones.ts), using three.js axes:
 *
 *      +X = east      +Y = up      +Z = south   (so north is -Z)
 *
 * Every zone is projected with the same origin, so zones line up with each other and a
 * coordinate means the same thing everywhere. Nairobi is small enough (JKIA is ~14 km from
 * the CBD) that a flat projection stays well under a metre of error and float32 keeps
 * millimetre precision.
 *
 * This module has no DOM or three.js dependency: the Node data pipeline imports it too.
 */

export interface LatLon {
  lat: number
  lon: number
}

/** south/west/north/east in degrees, the order Overpass uses. */
export interface BBox {
  south: number
  west: number
  north: number
  east: number
}

export interface Projection {
  readonly origin: LatLon
  readonly metresPerDegLat: number
  readonly metresPerDegLon: number
  /** Degrees to world metres, returned as [x, z]. */
  toWorld(lat: number, lon: number): [number, number]
  toLatLon(x: number, z: number): LatLon
}

const DEG2RAD = Math.PI / 180
// WGS84 ellipsoid
const SEMI_MAJOR = 6378137.0
const ECC_SQ = 6.69437999014e-3

export function createProjection(origin: LatLon): Projection {
  const phi = origin.lat * DEG2RAD
  const sin = Math.sin(phi)
  const w = Math.sqrt(1 - ECC_SQ * sin * sin)
  // Radii of curvature at the origin latitude: along the meridian, and along the parallel.
  const meridional = (SEMI_MAJOR * (1 - ECC_SQ)) / (w * w * w)
  const primeVertical = SEMI_MAJOR / w
  const metresPerDegLat = meridional * DEG2RAD
  const metresPerDegLon = primeVertical * Math.cos(phi) * DEG2RAD

  return {
    origin,
    metresPerDegLat,
    metresPerDegLon,
    toWorld(lat, lon) {
      return [(lon - origin.lon) * metresPerDegLon, -(lat - origin.lat) * metresPerDegLat]
    },
    toLatLon(x, z) {
      return { lat: origin.lat - z / metresPerDegLat, lon: origin.lon + x / metresPerDegLon }
    },
  }
}

/**
 * Yaw convention used across the game: yaw 0 faces north (-Z) and positive yaw turns left
 * (counter-clockwise seen from above), which matches Object3D.rotation.y.
 * A compass bearing is clockwise from north, so it is simply the negated yaw.
 */
export function yawToBearingDeg(yaw: number): number {
  const deg = (-yaw / DEG2RAD) % 360
  return deg < 0 ? deg + 360 : deg
}

export function bearingDegToYaw(bearing: number): number {
  return -bearing * DEG2RAD
}

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const

export function compassPoint(bearingDeg: number): (typeof COMPASS_POINTS)[number] {
  return COMPASS_POINTS[Math.round(bearingDeg / 45) & 7]
}

/** Compass bearing in degrees from one point to another. */
export function bearingBetween(from: LatLon, to: LatLon): number {
  const dx = (to.lon - from.lon) * Math.cos(from.lat * DEG2RAD)
  const dy = to.lat - from.lat
  const deg = Math.atan2(dx, dy) / DEG2RAD
  return deg < 0 ? deg + 360 : deg
}

/** "1.28862° S, 36.82316° E" */
export function formatLatLon({ lat, lon }: LatLon, digits = 5): string {
  const ns = lat < 0 ? 'S' : 'N'
  const ew = lon < 0 ? 'W' : 'E'
  return `${Math.abs(lat).toFixed(digits)}° ${ns}, ${Math.abs(lon).toFixed(digits)}° ${ew}`
}
