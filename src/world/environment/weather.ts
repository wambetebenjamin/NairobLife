/**
 * Rain, and the two seasons that bring it.
 *
 * Nairobi has no summer and winter, it has **rains**: the long rains from late March to
 * early June, and the short rains from late October into the new year. Between them the
 * city is dry and dusty. This file turns a date into the weather of that day, and the
 * weather into numbers a renderer can use: how grey the sky is, how much light gets
 * through, how wet the road is, how hard it is coming down.
 *
 * Everything is a pure function of the date and the clock, so the same day always looks
 * the same and the tests can ask what the sky will do on 3 November without a GPU. The
 * weather is deliberately *not* a random event that starts and stops mid-drive: a day is
 * wet or dry, and within a wet day the rain eases on and off.
 *
 * The rain itself is drawn by `Rain.tsx`, which reads `WeatherState`.
 */
import { smoothstep } from '../../core/math'

/**
 * `season` follows the real calendar and is the default, so a November visit is wet and
 * a January one is not. The others force the weather for anyone who wants it.
 */
export type WeatherSetting = 'season' | 'off' | 'long-rains' | 'short-rains'

export const WEATHER_ORDER: readonly WeatherSetting[] = [
  'season',
  'long-rains',
  'short-rains',
  'off',
]

export interface WeatherState {
  /** 0 = dry, 1 = pouring. */
  intensity: number
  /** How wet this whole day is, 0..1: a wet day can still have a dry hour. */
  wet: number
  /** What to call it in the HUD, e.g. "Short rains". Empty when dry. */
  season: string
  /** How much of the sun reaches the ground: 1 clear, about 0.4 in heavy rain. */
  light: number
  /** 0 is the usual sky; 1 is a flat wet-season overcast. */
  overcast: number
  /** How wet the ground is; darkens the tarmac and brings up reflections. */
  wetness: number
  /** Multiplier on the fog: below 1 shortens how far you can see. */
  visibility: number
}

export function createWeatherState(): WeatherState {
  return { intensity: 0, wet: 0, season: '', light: 1, overcast: 0, wetness: 0, visibility: 1 }
}

/**
 * The rainy seasons, by month and day. The long rains arrive late March and drain away
 * in early June; the short rains come with the jacarandas in late October and stop with
 * the new year.
 */
const SEASONS = {
  long: { start: [3, 20], end: [6, 5], name: 'Long rains' },
  short: { start: [10, 20], end: [12, 31], name: 'Short rains' },
} as const

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Day of the year, 1-based. */
export function dayOfYear(month: number, day: number): number {
  let total = day
  for (let i = 0; i < month - 1; i++) total += MONTH_LENGTHS[i]
  return total
}

/** Which rainy season a date falls in, or null for the dry months. */
export function seasonOf(date: Date): 'long' | 'short' | null {
  const doy = dayOfYear(date.getMonth() + 1, date.getDate())
  for (const key of ['long', 'short'] as const) {
    const { start, end } = SEASONS[key]
    const from = dayOfYear(start[0], start[1])
    const to = dayOfYear(end[0], end[1])
    if (doy >= from && doy <= to) return key
  }
  return null
}

/**
 * How wet a given day is, 0..1. A season is not weeks of constant downpour: wet days
 * alternate with dry ones. Seeded by the date, so 3 November always has the same weather.
 */
export function dayWetness(date: Date): number {
  const key = dayOfYear(date.getMonth() + 1, date.getDate()) * 7 + date.getFullYear()
  const roll = Math.abs(Math.sin(key * 12.9898 + 78.233) * 43758.5453) % 1
  // About a third of a wet season is genuinely wet.
  return roll > 0.64 ? smoothstep(0.64, 1, roll) : 0
}

/**
 * The weather right now.
 *
 * @param date     the real date, in Nairobi's own time zone
 * @param hours    the in-game hour, 0..24, so the rain can build through the afternoon
 * @param setting  `season` follows the calendar; the rest force a season or turn it off
 */
export function computeWeather(
  date: Date,
  hours: number,
  setting: WeatherSetting,
  out: WeatherState = createWeatherState(),
): WeatherState {
  const season =
    setting === 'off'
      ? null
      : setting === 'long-rains'
        ? 'long'
        : setting === 'short-rains'
          ? 'short'
          : seasonOf(date)

  if (!season) {
    out.intensity = out.wet = out.overcast = out.wetness = 0
    out.season = ''
    out.light = 1
    out.visibility = 1
    return out
  }

  const wet = dayWetness(date)
  // Storms build through the afternoon and ease towards morning.
  const daily = 0.5 + 0.5 * Math.sin(((hours - 9) / 24) * Math.PI * 2)
  out.wet = wet
  out.intensity = Math.min(1, wet * Math.max(0.2, daily))
  out.season = SEASONS[season].name
  out.overcast = Math.min(1, 0.22 + wet * 0.78)
  out.wetness = smoothstep(0.05, 0.7, out.intensity)
  out.light = 1 - 0.58 * out.overcast - 0.12 * out.intensity
  out.visibility = 1 - 0.45 * out.overcast
  return out
}
