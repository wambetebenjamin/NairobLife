/**
 * Time of day -> light. A small, hand-tuned model of Nairobi's sky.
 *
 * Nairobi is 1.3° south of the equator: the sun comes up due east around 06:30, climbs
 * almost straight overhead and sets due west around 18:30, all year. Twilight is short.
 * Everything visual (sky gradient, sun colour, ambient light, fog) is keyed off the
 * sun's height above the horizon, then pushed around by the haze setting.
 *
 * Pure functions, no three.js: the numbers are applied in Environment.tsx.
 *
 * TODO(weather): rain. The long rains (March to May) and short rains (October to
 * December) deserve overcast skies, wet roads and puddles.
 */
import { TIME } from '../../config/game'
import { smoothstep } from '../../core/math'
import type { Haze } from '../../state/gameStore'
import { hexToLinear, type RGB } from '../geometry/palette'

export interface SkyState {
  /** Unit vector pointing at the sun (below the horizon at night). */
  sunDir: [number, number, number]
  /** Unit vector pointing at whichever body lights the scene: sun by day, moon by night. */
  lightDir: [number, number, number]
  lightColor: [number, number, number]
  lightIntensity: number
  zenith: [number, number, number]
  horizon: [number, number, number]
  hemiSky: [number, number, number]
  hemiGround: [number, number, number]
  hemiIntensity: number
  fogDensity: number
  /** 0 by day, 1 in full night. Drives stars and lit windows. */
  night: number
  /** 0..1 brightness of the sun disc. */
  sunVisible: number
  /** Colour of the sun disc and its glow (set even when the moon is the key light). */
  sunColor: [number, number, number]
  /** Colour of sunlit cloud. */
  cloud: [number, number, number]
}

export function createSkyState(): SkyState {
  return {
    sunDir: [0, 1, 0],
    lightDir: [0, 1, 0],
    lightColor: [1, 1, 1],
    lightIntensity: 1,
    zenith: [0, 0, 0],
    horizon: [0, 0, 0],
    hemiSky: [0, 0, 0],
    hemiGround: [0, 0, 0],
    hemiIntensity: 1,
    fogDensity: 0,
    night: 0,
    sunVisible: 1,
    sunColor: [1, 1, 1],
    cloud: [1, 1, 1],
  }
}

interface Key {
  /** Sine of the sun's elevation at which this look applies. */
  alt: number
  zenith: RGB
  horizon: RGB
  hemiSky: RGB
  hemiGround: RGB
  hemi: number
  sun: RGB
  sunIntensity: number
}

const key = (
  alt: number,
  zenith: string,
  horizon: string,
  hemiSky: string,
  hemiGround: string,
  hemi: number,
  sun: string,
  sunIntensity: number,
): Key => ({
  alt,
  zenith: hexToLinear(zenith),
  horizon: hexToLinear(horizon),
  hemiSky: hexToLinear(hemiSky),
  hemiGround: hexToLinear(hemiGround),
  hemi,
  sun: hexToLinear(sun),
  sunIntensity,
})

/** Ordered by sun height: night, deep dusk, sun on the horizon, golden hour, full day. */
/*
 * A note on the numbers. three.js lights a matte surface with
 *   colour = paint * (hemisphere colour * hemisphere intensity + sun colour * sun intensity * cos(angle)) / PI
 * so a sun of 3.3 puts a surface facing it at about 1.05x its paint colour, and the
 * hemisphere values below put shade at roughly a third of that: bright equatorial sun
 * with shadows you can still see into.
 */
const KEYS: readonly Key[] = [
  key(-0.26, '#050914', '#131b2e', '#5a6da0', '#2a2e3d', 1.5, '#ff9a55', 0),
  key(-0.09, '#16224a', '#5b4a6e', '#6d74a6', '#3d3846', 1.5, '#ff9a55', 0),
  key(0.0, '#2f4f8f', '#f0915a', '#a39bbb', '#6d5d56', 1.6, '#ff9a55', 1.3),
  key(0.13, '#3d74c4', '#f2c59a', '#b4c6e2', '#94806c', 1.85, '#ffd2a0', 2.7),
  key(0.36, '#2f7fe0', '#a9cdf0', '#c2d9f5', '#a3927c', 2.1, '#fff3dc', 3.3),
]

const MOON = hexToLinear('#a9c0ff')
const MOON_INTENSITY = 0.9
/** The colour of dust in sunlight, normalised below so it only changes hue, not brightness. */
const DUST = hexToLinear('#dcc7a0')
const luminance = (c: RGB | number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
const DUST_HUE: RGB = [
  DUST[0] / luminance(DUST),
  DUST[1] / luminance(DUST),
  DUST[2] / luminance(DUST),
]

const HAZE: Record<Haze, { amount: number; fog: number }> = {
  clear: { amount: 0, fog: 0.0002 },
  hazy: { amount: 0.35, fog: 0.00033 },
  // Dry-season dust: the far towers fade to silhouettes.
  dusty: { amount: 0.85, fog: 0.00085 },
}

/** The sun sits this far north of straight overhead at noon (as it does mid-year). */
const SUN_TILT = (16 * Math.PI) / 180

function mix3(out: number[], a: RGB | number[], b: RGB | number[], t: number): void {
  out[0] = a[0] + (b[0] - a[0]) * t
  out[1] = a[1] + (b[1] - a[1]) * t
  out[2] = a[2] + (b[2] - a[2]) * t
}

/** Angle of the sun along its daily arc: 0 at sunrise, PI at sunset, 2 PI at the next sunrise. */
export function sunAngle(hours: number): number {
  const day = TIME.sunsetHour - TIME.sunriseHour
  const night = 24 - day
  const h = (((hours - TIME.sunriseHour) % 24) + 24) % 24
  return h <= day ? (h / day) * Math.PI : Math.PI + ((h - day) / night) * Math.PI
}

export function computeSky(hours: number, haze: Haze, out: SkyState): SkyState {
  const angle = sunAngle(hours)
  // East is +X, up is +Y, north is -Z.
  const sx = Math.cos(angle)
  const sy = Math.sin(angle) * Math.cos(SUN_TILT)
  const sz = -Math.sin(angle) * Math.sin(SUN_TILT)
  out.sunDir[0] = sx
  out.sunDir[1] = sy
  out.sunDir[2] = sz
  const alt = sy

  // ---- look up the two nearest keys
  let i = 0
  while (i < KEYS.length - 2 && alt > KEYS[i + 1].alt) i++
  const a = KEYS[i]
  const b = KEYS[i + 1]
  const t = Math.min(1, Math.max(0, (alt - a.alt) / (b.alt - a.alt)))
  mix3(out.zenith, a.zenith, b.zenith, t)
  mix3(out.horizon, a.horizon, b.horizon, t)
  mix3(out.hemiSky, a.hemiSky, b.hemiSky, t)
  mix3(out.hemiGround, a.hemiGround, b.hemiGround, t)
  out.hemiIntensity = a.hemi + (b.hemi - a.hemi) * t

  // ---- key light: the sun fades out at the horizon, the moon fades in after it
  const sunUp = smoothstep(0, 0.14, alt)
  const moonUp = smoothstep(0.02, 0.2, -alt)
  if (alt >= 0) {
    mix3(out.lightColor, a.sun, b.sun, t)
    out.lightIntensity = (a.sunIntensity + (b.sunIntensity - a.sunIntensity) * t) * sunUp
    out.lightDir[0] = sx
    out.lightDir[1] = sy
    out.lightDir[2] = sz
  } else {
    out.lightColor[0] = MOON[0]
    out.lightColor[1] = MOON[1]
    out.lightColor[2] = MOON[2]
    out.lightIntensity = MOON_INTENSITY * moonUp
    out.lightDir[0] = -sx
    out.lightDir[1] = -sy
    out.lightDir[2] = -sz
  }
  // Keep the light from going fully horizontal, which would stretch shadows to infinity.
  if (out.lightDir[1] < 0.12) {
    out.lightDir[1] = 0.12
    const len = Math.hypot(out.lightDir[0], out.lightDir[1], out.lightDir[2])
    out.lightDir[0] /= len
    out.lightDir[1] /= len
    out.lightDir[2] /= len
  }

  out.night = smoothstep(0.04, -0.2, alt)
  out.sunVisible = smoothstep(-0.06, 0.03, alt)
  mix3(out.sunColor, a.sun, b.sun, t)

  // ---- haze: dust tints the horizon, washes out the zenith and softens the sun
  const { amount, fog } = HAZE[haze]
  if (amount > 0) {
    const lum = luminance(out.horizon)
    const dusty = [DUST_HUE[0] * lum, DUST_HUE[1] * lum, DUST_HUE[2] * lum]
    mix3(out.horizon, out.horizon, dusty, amount * 0.8)
    mix3(out.zenith, out.zenith, out.horizon, amount * 0.45)
    mix3(out.hemiSky, out.hemiSky, out.horizon, amount * 0.4)
    out.lightIntensity *= 1 - 0.3 * amount
    out.hemiIntensity *= 1 + 0.12 * amount
  }
  out.fogDensity = fog

  // Clouds take the sky's own colour plus whatever direct light reaches them.
  const cloudLight = 0.2 + 0.72 * smoothstep(-0.05, 0.3, alt)
  out.cloud[0] = out.horizon[0] * 0.35 + (0.4 + 0.6 * out.sunColor[0]) * cloudLight
  out.cloud[1] = out.horizon[1] * 0.35 + (0.4 + 0.6 * out.sunColor[1]) * cloudLight
  out.cloud[2] = out.horizon[2] * 0.35 + (0.4 + 0.6 * out.sunColor[2]) * cloudLight
  const cloudNight = 1 - 0.86 * out.night
  out.cloud[0] *= cloudNight
  out.cloud[1] *= cloudNight
  out.cloud[2] *= cloudNight
  return out
}

/** "07:15" */
export function formatClock(hours: number): string {
  const h = Math.floor((((hours % 24) + 24) % 24) + 1e-6)
  const m = Math.floor(((((hours % 24) + 24) % 24) - h) * 60 + 1e-6)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
