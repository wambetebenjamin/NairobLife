import { describe, expect, it } from 'vitest'
import { PARK, SKYLINE_HAZE } from './parkPalette'
import { HAZE_FAR, HAZE_HORIZON, HAZE_SKY, hazeAt, hazed } from './haze'

/** Relative luminance, 0..1. */
function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/** HSV saturation, 0..1. */
function saturation(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max === 0 ? 0 : (max - min) / max
}

describe('distance haze', () => {
  it('thickens with distance and never leaves the 0..1 range', () => {
    expect(hazeAt(0, 0)).toBeLessThan(hazeAt(30, 0))
    expect(hazeAt(30, 0)).toBeLessThan(hazeAt(62, 0))
    for (const d of [-50, 0, 10, 62, 500, 1e6]) {
      const amount = hazeAt(d, 10)
      expect(amount).toBeGreaterThanOrEqual(0)
      expect(amount).toBeLessThanOrEqual(1)
    }
  })

  it('thins with height, so a tower base dissolves before its crown', () => {
    const base = hazeAt(62, 0)
    const crown = hazeAt(62, 26)
    expect(crown).toBeLessThan(base)
    // But not to nothing: the crown is still visibly hazed at the skyline.
    expect(crown).toBeGreaterThan(0.25)
  })

  it('makes the skyline LIGHTER than the ground it stands behind', () => {
    // The whole defect the references exposed: a hazed tower should sit slightly ABOVE the
    // straw in luminance (1.18x measured from the photograph). The shipped diorama rendered
    // them at 0.93x -- darker than the ground -- so the city read as a cutout painted on the
    // horizon. That was partly shading, not just palette: the bare colours are already within
    // 3% of each other, and the sun was darkening the boxes.
    const grass = '#a8894a'
    const tower = '#7d93a0'
    const washed = hazed(tower, hazeAt(62, 13))
    const ratio = luminance(washed) / luminance(grass)
    expect(ratio).toBeGreaterThan(1.1)
    expect(ratio).toBeLessThan(1.3)
    // Distant things must never come out darker than they started.
    expect(luminance(washed)).toBeGreaterThan(luminance(tower))
  })

  it('desaturates far things, which is what air does', () => {
    // Reference far-building saturation is 0.02; the raw tower colour is 0.22.
    expect(saturation('#7d93a0')).toBeGreaterThan(0.2)
    expect(saturation(hazed('#7d93a0', HAZE_FAR))).toBeLessThan(0.08)
    // Haze must wash out colour, never add it.
    for (const colour of ['#7d93a0', '#8f8371', '#48697a', '#6f7355']) {
      expect(saturation(hazed(colour, HAZE_FAR))).toBeLessThanOrEqual(saturation(colour) + 1e-9)
    }
  })

  it('is built from a near-neutral sky, not a saturated one', () => {
    // The old sky was #3e6b7e at saturation 0.29, roughly twice what the photographs show.
    expect(saturation(HAZE_SKY)).toBeLessThan(0.1)
    expect(saturation(HAZE_HORIZON)).toBeLessThan(0.1)
    expect(luminance(HAZE_SKY)).toBeGreaterThan(0.65)
  })

  it('clamps rather than overshooting the ends', () => {
    expect(hazed('#000000', -1)).toBe('#000000')
    expect(hazed('#000000', 2)).toBe(HAZE_HORIZON)
    expect(hazed(HAZE_HORIZON, 1)).toBe(HAZE_HORIZON)
  })

  it('returns a well-formed hex colour for every input it will see', () => {
    for (const colour of ['#000000', '#ffffff', '#7d93a0', HAZE_SKY]) {
      for (const amount of [0, 0.25, 0.5, 0.75, 1]) {
        expect(hazed(colour, amount)).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })
})

describe('skyline palette against the reference', () => {
  // The real constants, imported rather than copied. An earlier version of this test hardcoded
  // the palette and passed while the component shipped something else.
  const GRASS = PARK.grassLit

  it('keeps every shipped tower tone above the straw once hazed', () => {
    const tones = { tower: PARK.tower, towerLight: PARK.towerLight, towerGlass: PARK.towerGlass }
    for (const [name, colour] of Object.entries(tones)) {
      const ratio = luminance(hazed(colour, SKYLINE_HAZE)) / luminance(GRASS)
      // Regression guard: the shipped diorama measured 0.95x here -- towers DARKER than the
      // ground -- which is what made the city read as a cutout. Never let it go back under 1.
      expect(ratio, `${name} must sit above the grass in luminance`).toBeGreaterThan(1.02)
      expect(ratio, `${name} must not blow out to white`).toBeLessThan(1.35)
    }
  })

  it("lands in the reference photograph's measured band", () => {
    // giraffe-skyline-haze.jpg: buildings 1.17x the straw, saturation 0.02.
    const ratio = luminance(hazed(PARK.tower, SKYLINE_HAZE)) / luminance(GRASS)
    expect(ratio).toBeGreaterThan(1.1)
    expect(ratio).toBeLessThan(1.3)
    expect(saturation(hazed(PARK.tower, SKYLINE_HAZE))).toBeLessThan(0.08)
  })

  it('leaves every tower tone nearly colourless, as the photograph does', () => {
    for (const colour of [PARK.tower, PARK.towerLight, PARK.towerGlass, PARK.towerWarm]) {
      expect(saturation(hazed(colour, SKYLINE_HAZE))).toBeLessThan(0.11)
    }
  })
})
