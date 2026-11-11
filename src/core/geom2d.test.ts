import { describe, expect, it } from 'vitest'
import {
  clipRingToRect,
  distToOrientedRect,
  distToSegmentSq,
  orientedRectCorners,
  orientedRectsOverlap,
  pointInPolygon,
  pointInRing,
  ringCentroid,
  signedArea,
  type OrientedRect,
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

describe('oriented rectangles', () => {
  /** A car-sized rectangle at the origin, lying along the x axis. */
  const car: OrientedRect = { x: 0, z: 0, dx: 1, dz: 0, halfLength: 2, halfWidth: 1 }
  const at = (x: number, z: number, angle: number): OrientedRect => ({
    ...car,
    x,
    z,
    dx: Math.cos(angle),
    dz: Math.sin(angle),
  })

  it('measures distance from the edge, and zero inside', () => {
    expect(distToOrientedRect(0.5, 0.5, car)).toBe(0)
    expect(distToOrientedRect(5, 0, car)).toBeCloseTo(3)
    expect(distToOrientedRect(0, -4, car)).toBeCloseTo(3)
    // Off a corner: the diagonal.
    expect(distToOrientedRect(5, 5, car)).toBeCloseTo(5)
    // Turn it a quarter turn and the long side is the other way.
    expect(distToOrientedRect(0, 5, at(0, 0, Math.PI / 2))).toBeCloseTo(3)
  })

  it('lists its corners', () => {
    const corners = orientedRectCorners(at(10, 20, Math.PI / 2))
    const xs = [corners[0], corners[2], corners[4], corners[6]].map((v) => Math.round(v))
    const zs = [corners[1], corners[3], corners[5], corners[7]].map((v) => Math.round(v))
    expect(xs.sort((a, b) => a - b)).toEqual([9, 9, 11, 11])
    expect(zs.sort((a, b) => a - b)).toEqual([18, 18, 22, 22])
    // The rectangle keeps its area however it is turned.
    expect(Math.abs(signedArea(orientedRectCorners(at(3, -7, 0.7))))).toBeCloseTo(8)
  })

  it('tells overlapping rectangles from ones that only look close', () => {
    expect(orientedRectsOverlap(car, at(3.9, 0, 0))).toBe(true)
    expect(orientedRectsOverlap(car, at(4.1, 0, 0))).toBe(false)
    // Side by side, a hand apart.
    expect(orientedRectsOverlap(car, at(0, 2.1, 0))).toBe(false)
    expect(orientedRectsOverlap(car, at(0, 2.1, 0), 0.2)).toBe(true)
    // Nose to tail in an L: bounding boxes overlap, the rectangles do not.
    expect(orientedRectsOverlap(car, at(3.2, 3.2, Math.PI / 2))).toBe(false)
    // Diagonal across the first one's corner.
    expect(orientedRectsOverlap(car, at(2.5, 1.5, Math.PI / 4))).toBe(true)
    expect(orientedRectsOverlap(car, at(4, 3, Math.PI / 4))).toBe(false)
    // The answer does not depend on which is asked about which.
    const other = at(2.5, 1.5, 1.1)
    expect(orientedRectsOverlap(other, car)).toBe(orientedRectsOverlap(car, other))
  })
})
