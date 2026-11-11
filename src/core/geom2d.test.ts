import { describe, expect, it } from 'vitest'
import {
  clipRingToRect,
  distToSegmentSq,
  pointInPolygon,
  pointInRing,
  ringCentroid,
  signedArea,
} from './geom2d'

const SQUARE = [0, 0, 10, 0, 10, 10, 0, 10]

describe('rings', () => {
  it('measures area, with the sign following the winding', () => {
    expect(Math.abs(signedArea(SQUARE))).toBe(100)
    const reversed = [0, 10, 10, 10, 10, 0, 0, 0]
    expect(signedArea(reversed)).toBe(-signedArea(SQUARE))
  })

  it('finds the centroid', () => {
    expect(ringCentroid(SQUARE)).toEqual([5, 5])
  })

  it('tests points against rings and polygons with holes', () => {
    expect(pointInRing(5, 5, SQUARE)).toBe(true)
    expect(pointInRing(15, 5, SQUARE)).toBe(false)
    const courtyard = [4, 4, 4, 6, 6, 6, 6, 4]
    expect(pointInPolygon(5, 5, SQUARE, [courtyard])).toBe(false)
    expect(pointInPolygon(2, 2, SQUARE, [courtyard])).toBe(true)
  })

  it('clips to a rectangle', () => {
    const clipped = clipRingToRect(SQUARE, { minX: 5, minZ: -5, maxX: 20, maxZ: 20 })
    expect(Math.abs(signedArea(clipped))).toBeCloseTo(50)
  })

  it('measures distance to a segment', () => {
    expect(distToSegmentSq(5, 3, 0, 0, 10, 0)).toBeCloseTo(9)
    expect(distToSegmentSq(-4, 3, 0, 0, 10, 0)).toBeCloseTo(25)
  })
})
