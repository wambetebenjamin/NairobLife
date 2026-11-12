import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { DROPS, RainField, rainVisible } from './rainField'

/** A field with a fixed sequence, so its numbers can be asserted exactly. */
function seeded() {
  let value = 0
  return new RainField(() => (value = (value * 16807 + 0.37) % 1))
}

describe('rain field', () => {
  it('draws two ends for every drop', () => {
    const field = seeded()
    expect(field.positions.length).toBe(DROPS * 6)
    expect(field.colours.length).toBe(DROPS * 6)
  })

  it('falls, and wraps inside its box instead of falling away', () => {
    const field = seeded()
    const before = Array.from(field.positions)
    field.step(0.2, 1)
    const after = Array.from(field.positions)
    expect(after).not.toEqual(before)
    // Every drop stays in the box above the ground, however long it rains.
    for (let i = 0; i < 400; i++) field.step(0.05, 1)
    for (let i = 0; i < DROPS; i++) {
      expect(field.positions[i * 6 + 1]).toBeGreaterThanOrEqual(0)
      expect(field.positions[i * 6 + 1]).toBeLessThanOrEqual(70)
      expect(field.positions[i * 6 + 4]).toBeGreaterThanOrEqual(0)
      expect(field.positions[i * 6 + 4]).toBeLessThanOrEqual(70)
    }
  })

  it('keeps its streaks short, and its heads below its tails', () => {
    const field = seeded()
    for (let i = 0; i < DROPS; i++) {
      const tail = field.positions[i * 6 + 1]
      const head = field.positions[i * 6 + 4]
      expect(tail).toBeGreaterThan(head)
      expect(tail - head).toBeLessThan(1.2)
    }
  })

  it('fades with the intensity of the weather, to nothing when it is dry', () => {
    const field = seeded()
    field.step(0, 1)
    const wet = field.colours.reduce((sum, value) => sum + value, 0)
    field.step(0, 0.25)
    const drizzle = field.colours.reduce((sum, value) => sum + value, 0)
    field.step(0, 0)
    const dry = field.colours.reduce((sum, value) => sum + value, 0)
    expect(wet).toBeGreaterThan(0)
    expect(drizzle).toBeGreaterThan(0)
    expect(drizzle).toBeLessThan(wet)
    expect(dry).toBe(0)
  })

  it('walks a tall camera up with it, without lifting rain off the ground', () => {
    const field = seeded()
    field.focus(new Vector3(0, 0, 0))
    field.step(0, 1)
    const ground = Math.min(...Array.from(field.positions).filter((_, i) => i % 3 === 1))
    field.focus(new Vector3(0, 100, 0))
    field.step(0, 1)
    const lifted = Math.min(...Array.from(field.positions).filter((_, i) => i % 3 === 1))
    expect(lifted).toBeGreaterThan(ground)
    expect(lifted).toBeLessThan(100)
  })

  it('follows the camera sideways, so the city is always rained on', () => {
    const field = seeded()
    field.focus(new Vector3(0, 0, 0))
    field.step(0, 1)
    const before = Array.from(field.positions)
    field.focus(new Vector3(500, 0, 500))
    field.step(0.001, 1)
    // The drops that were around the origin are now around the camera.
    let moved = 0
    for (let i = 0; i < DROPS; i++) {
      if (Math.abs(field.positions[i * 6] - before[i * 6]) > 400) moved++
    }
    expect(moved).toBeGreaterThan(DROPS * 0.8)
    for (let i = 0; i < DROPS; i++) {
      expect(Math.abs(field.positions[i * 6] - 500)).toBeLessThanOrEqual(40)
      expect(Math.abs(field.positions[i * 6 + 2] - 500)).toBeLessThanOrEqual(40)
    }
  })

  it('only draws when there is rain to draw', () => {
    expect(rainVisible(0)).toBe(false)
    expect(rainVisible(0.005)).toBe(false)
    expect(rainVisible(0.02)).toBe(true)
    expect(rainVisible(1)).toBe(true)
  })
})
