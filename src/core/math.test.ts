import { describe, expect, it } from 'vitest'
import { approach, clamp, damp, dampAngle, smoothstep, wrapAngle } from './math'

describe('math helpers', () => {
  it('wraps angles into (-PI, PI]', () => {
    expect(wrapAngle(0)).toBe(0)
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI)
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI)
    expect(wrapAngle(-5.41)).toBeCloseTo(-5.41 + Math.PI * 2)
  })

  it('turns the short way round', () => {
    // From just left of "behind" to just right of it is a small turn, not a full circle.
    const next = dampAngle(3.1, -3.1, 10, 0.016)
    expect(next).toBeGreaterThan(3.1)
  })

  it('damps towards a target without overshooting', () => {
    let value = 0
    for (let i = 0; i < 600; i++) value = damp(value, 1, 8, 1 / 60)
    expect(value).toBeGreaterThan(0.999)
    expect(value).toBeLessThanOrEqual(1)
  })

  it('clamps, steps and approaches', () => {
    expect(clamp(5, 0, 1)).toBe(1)
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5)
    expect(smoothstep(1, 0, 0.25)).toBeCloseTo(1 - smoothstep(0, 1, 0.25))
    expect(approach(0, 10, 3)).toBe(3)
    expect(approach(9, 10, 3)).toBe(10)
  })
})
