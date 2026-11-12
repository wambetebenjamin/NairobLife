import { describe, expect, it } from 'vitest'
import { computeWeather, createWeatherState, dayOfYear, dayWetness, seasonOf } from './weather'

const date = (month: number, day: number) => new Date(2026, month - 1, day, 12)
const at = (
  month: number,
  day: number,
  hours = 15,
  setting: 'season' | 'off' | 'long-rains' | 'short-rains' = 'season',
) => computeWeather(date(month, day), hours, setting)

describe('Nairobi weather', () => {
  it('counts days and finds the two rainy seasons', () => {
    expect(dayOfYear(1, 1)).toBe(1)
    expect(dayOfYear(3, 1)).toBe(60)
    expect(dayOfYear(12, 31)).toBe(365)
    expect(seasonOf(date(4, 15))).toBe('long')
    expect(seasonOf(date(11, 3))).toBe('short')
    expect(seasonOf(date(1, 15))).toBeNull()
    expect(seasonOf(date(7, 15))).toBeNull()
    expect(seasonOf(date(9, 30))).toBeNull()
  })

  it('keeps the dry months dry', () => {
    const july = at(7, 15)
    expect(july.intensity).toBe(0)
    expect(july.season).toBe('')
    expect(july.light).toBe(1)
    expect(july.visibility).toBe(1)
    expect(july.overcast).toBe(0)
  })

  it('gives the wet seasons their names, some wet days and some dry ones', () => {
    // Across a whole season there must be both, and every wet day names its season.
    const november = Array.from({ length: 30 }, (_, i) => at(11, i + 1))
    expect(november.every((day) => day.season === 'Short rains')).toBe(true)
    expect(november.some((day) => day.intensity === 0)).toBe(true)
    expect(november.some((day) => day.intensity > 0.3)).toBe(true)
    expect(at(4, 15).season).toBe('Long rains')
  })

  it('makes rain dim the light, grey the sky, wet the road and shorten the view', () => {
    const wet = Array.from({ length: 30 }, (_, i) => at(4, i + 1)).sort(
      (a, b) => b.intensity - a.intensity,
    )[0]
    expect(wet.intensity).toBeGreaterThan(0.4)
    expect(wet.light).toBeLessThan(0.85)
    expect(wet.overcast).toBeGreaterThan(0.4)
    expect(wet.wetness).toBeGreaterThan(0.4)
    expect(wet.visibility).toBeLessThan(0.9)
  })

  it('builds in the afternoon and eases overnight on a wet day', () => {
    // Find a wet day, then compare its afternoon with its small hours.
    const wetDay = Array.from({ length: 30 }, (_, i) => i + 1).find(
      (day) => dayWetness(date(11, day)) > 0.5,
    )!
    const afternoon = at(11, wetDay, 15)
    const night = at(11, wetDay, 2)
    expect(afternoon.intensity).toBeGreaterThan(night.intensity)
    // The same always holds for the same date: no dice rolls.
    expect(at(11, wetDay, 15)).toEqual(afternoon)
  })

  it('obeys the setting: off is dry everywhere, forcing a season ignores the date', () => {
    const off = at(11, 3, 15, 'off')
    expect(off.intensity).toBe(0)
    expect(off.season).toBe('')
    expect(at(7, 15, 15, 'short-rains').season).toBe('Short rains')
    expect(at(4, 15, 15, 'short-rains').season).toBe('Short rains')
    expect(at(11, 3, 15, 'long-rains').season).toBe('Long rains')
    expect(at(11, 3, 15, 'season').season).toBe('Short rains')
  })

  it('reuses the state object it is given, for the per-frame path', () => {
    const state = createWeatherState()
    expect(computeWeather(date(11, 3), 15, 'season', state)).toBe(state)
  })
})
