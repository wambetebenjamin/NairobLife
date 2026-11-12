import { describe, expect, it } from 'vitest'
import { advanceScenicTime, SCENIC_DURATION, scenicPose } from './scenicMotion'

describe('fictional scenic routes', () => {
  it('circles the park track once, with a forward-facing tangent', () => {
    const start = scenicPose('park', 0),
      quarter = scenicPose('park', 12),
      end = scenicPose('park', SCENIC_DURATION.park)
    expect(start.x).toBeCloseTo(10)
    expect(quarter.z).toBeCloseTo(10)
    expect(end.x).toBeCloseTo(start.x)
    expect(end.z).toBeCloseTo(start.z)
    for (const p of [start, quarter, end]) {
      expect(-Math.sin(p.yaw)).toBeCloseTo(p.dx)
      expect(-Math.cos(p.yaw)).toBeCloseTo(p.dz)
    }
  })
  it('moves the train from one end to the other and clamps elapsed time', () => {
    expect(scenicPose('sgr', -5)).toMatchObject({ x: 22, progress: 0 })
    expect(scenicPose('sgr', SCENIC_DURATION.sgr / 2).x).toBeCloseTo(0)
    expect(scenicPose('sgr', 100)).toMatchObject({ x: -22, progress: 1 })
  })
  it('pauses, limits large frame jumps and stops at the destination', () => {
    expect(advanceScenicTime('park', 5, 0.03, true)).toBe(5)
    expect(advanceScenicTime('park', 5, 2, false)).toBe(5.05)
    expect(advanceScenicTime('sgr', 37.99, 0.05, false)).toBe(38)
    expect(advanceScenicTime('sgr', 38, 0.05, false)).toBe(38)
  })
})
