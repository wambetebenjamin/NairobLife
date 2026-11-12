import { describe, expect, it } from 'vitest'
import { WORLD_ORIGIN } from '../config/zones'
import {
  bearingBetween,
  bearingDegToYaw,
  compassPoint,
  createProjection,
  yawToBearingDeg,
} from './geo'

/**
 * These pin down the one convention everything else leans on: x is east, z is south,
 * yaw 0 faces north. Get any of it backwards and the city renders as its mirror image,
 * which looks plausible to anyone who has not walked Moi Avenue.
 */
describe('projection', () => {
  const projection = createProjection(WORLD_ORIGIN)

  it('puts the origin at (0, 0)', () => {
    const [x, z] = projection.toWorld(WORLD_ORIGIN.lat, WORLD_ORIGIN.lon)
    expect(x).toBeCloseTo(0, 9)
    expect(z).toBeCloseTo(0, 9)
  })

  it('maps east to +x and north to -z', () => {
    const [east] = projection.toWorld(WORLD_ORIGIN.lat, WORLD_ORIGIN.lon + 0.001)
    const [, north] = projection.toWorld(WORLD_ORIGIN.lat + 0.001, WORLD_ORIGIN.lon)
    expect(east).toBeGreaterThan(100)
    expect(north).toBeLessThan(-100)
  })

  it('measures real metres near the equator', () => {
    // One thousandth of a degree is about 111 m in both directions at Nairobi's latitude.
    const [x, z] = projection.toWorld(WORLD_ORIGIN.lat - 0.001, WORLD_ORIGIN.lon + 0.001)
    expect(x).toBeGreaterThan(111.2)
    expect(x).toBeLessThan(111.4)
    expect(z).toBeGreaterThan(110.5)
    expect(z).toBeLessThan(110.7)
  })

  it('round-trips', () => {
    const { lat, lon } = projection.toLatLon(...projection.toWorld(-1.2841, 36.8155))
    expect(lat).toBeCloseTo(-1.2841, 9)
    expect(lon).toBeCloseTo(36.8155, 9)
  })
})

describe('bearings and yaw', () => {
  it('yaw 0 is north, and turning left (positive yaw) heads west', () => {
    expect(yawToBearingDeg(0)).toBeCloseTo(0)
    expect(yawToBearingDeg(Math.PI / 2)).toBeCloseTo(270)
    expect(yawToBearingDeg(-Math.PI / 2)).toBeCloseTo(90)
    expect(yawToBearingDeg(bearingDegToYaw(135))).toBeCloseTo(135)
  })

  it('names compass points', () => {
    expect(compassPoint(0)).toBe('N')
    expect(compassPoint(92)).toBe('E')
    expect(compassPoint(225)).toBe('SW')
    expect(compassPoint(359)).toBe('N')
  })

  it('finds the bearing between two places', () => {
    const kicc = WORLD_ORIGIN
    expect(bearingBetween(kicc, { lat: kicc.lat + 0.01, lon: kicc.lon })).toBeCloseTo(0, 3)
    expect(bearingBetween(kicc, { lat: kicc.lat, lon: kicc.lon + 0.01 })).toBeCloseTo(90, 3)
    expect(bearingBetween(kicc, { lat: kicc.lat - 0.01, lon: kicc.lon })).toBeCloseTo(180, 3)
  })
})
