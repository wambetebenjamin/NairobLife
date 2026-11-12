import { describe, expect, it } from 'vitest'
import { computeSky, createSkyState, formatClock } from './skyModel'

describe('sky model', () => {
  const at = (hours: number) => computeSky(hours, 'clear', createSkyState())

  it('raises the sun in the east and sets it in the west', () => {
    expect(at(7).sunDir[0]).toBeGreaterThan(0.8) // +x is east
    expect(at(18).sunDir[0]).toBeLessThan(-0.8)
  })

  it('puts the sun nearly overhead at midday, as on the equator', () => {
    expect(at(12.5).sunDir[1]).toBeGreaterThan(0.9)
  })

  it('knows day from night', () => {
    expect(at(12).night).toBe(0)
    expect(at(0).night).toBe(1)
    expect(at(12).lightIntensity).toBeGreaterThan(at(0).lightIntensity)
  })

  it('always lights the scene from above the horizon', () => {
    for (let hours = 0; hours < 24; hours += 0.25) {
      const sky = at(hours)
      expect(sky.lightDir[1]).toBeGreaterThan(0.1)
      expect(Math.hypot(...sky.lightDir)).toBeCloseTo(1, 5)
    }
  })

  it('thickens the air with the haze setting', () => {
    const clear = computeSky(12, 'clear', createSkyState())
    const dusty = computeSky(12, 'dusty', createSkyState())
    expect(dusty.fogDensity).toBeGreaterThan(clear.fogDensity)
  })

  it('formats the clock', () => {
    expect(formatClock(9.25)).toBe('09:15')
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(23.99)).toBe('23:59')
    expect(formatClock(24.5)).toBe('00:30')
  })
})
