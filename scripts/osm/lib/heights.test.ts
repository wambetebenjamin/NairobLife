import { describe, expect, it } from 'vitest'
import { LEVEL_HEIGHT, createHeightEstimator, taggedHeight } from './heights'

describe('heights from OSM tags', () => {
  it('prefers an explicit height', () => {
    expect(taggedHeight({ height: '105', 'building:levels': '33' }).h).toBe(105)
    expect(taggedHeight({ height: '45 m' }).h).toBe(45)
  })

  it('falls back to the number of levels', () => {
    const { h } = taggedHeight({ 'building:levels': '10' })
    expect(h).toBeGreaterThan(10 * LEVEL_HEIGHT)
    expect(h).toBeLessThan(11 * LEVEL_HEIGHT)
  })

  it('ignores nonsense', () => {
    expect(taggedHeight({ height: '0' }).h).toBeUndefined()
    expect(taggedHeight({ height: '2000' }).h).toBeUndefined()
    expect(taggedHeight({}).h).toBeUndefined()
  })

  it('reads where a floating part starts', () => {
    expect(taggedHeight({ height: '105', min_height: '93' }).base).toBe(93)
  })
})

describe('height estimates', () => {
  // A neighbourhood of tagged 30-storey towers, as around KICC.
  const towers = [0, 60, 120].map((x) => ({ x, z: 0, levels: 30 }))
  const estimate = createHeightEstimator(towers)

  it('keeps kiosks low, whatever stands next door', () => {
    expect(estimate({ id: 1, type: undefined, area: 30, x: 10, z: 10 })).toBe(3)
  })

  it('never guesses a skyscraper onto a kiosk-sized footprint', () => {
    // The old limit here was a hardcoded 1.25x height/width, which is less than the real median
    // slenderness of the 251 tagged buildings in this zone (1.35) and well under what the
    // towers reach (3.04). It did not stop implausible guesses, it stopped tall buildings
    // existing at all. The cap is now 3.2, the p90 of the measured set.
    for (let id = 1; id <= 200; id++) {
      const area = 150
      const height = estimate({ id, type: undefined, area, x: 20, z: 20 })
      // Cap * jitter ceiling (1.15) + parapet, since jitter is applied after the cap.
      expect(height).toBeLessThanOrEqual(Math.sqrt(area) * 3.2 * 1.15 + LEVEL_HEIGHT)
      // And still nothing absurd: a 150 m2 outline is a shop, not a 40-storey tower.
      expect(height).toBeLessThan(60)
    }
  })

  it('lets large footprints near towers be tall, but varied', () => {
    const heights = new Set<number>()
    for (let id = 1; id <= 200; id++)
      heights.add(estimate({ id, type: undefined, area: 1500, x: 20, z: 20 }))
    expect(Math.max(...heights)).toBeGreaterThan(30)
    expect(heights.size).toBeGreaterThan(4)
  })

  it('lets a tall core stay tall, and a low edge stay low', () => {
    // The defect this guards: 2,821 estimated buildings had a median of 11 m and a maximum of
    // 34.8 m while the 251 tagged ones ran to 140 m. The cliff between the two populations is
    // what made the skyline wrong, and it was caused by a 9-level ceiling plus that 1.25 cap.
    const core = createHeightEstimator([0, 50, 100].map((x) => ({ x, z: 0, levels: 30 })))
    const edge = createHeightEstimator([0, 50, 100].map((x) => ({ x, z: 0, levels: 4 })))
    const tall = [1, 2, 3, 4, 5, 6, 7, 8].map((id) =>
      core({ id, type: undefined, area: 600, x: 25, z: 0 }),
    )
    const low = [1, 2, 3, 4, 5, 6, 7, 8].map((id) =>
      edge({ id, type: undefined, area: 600, x: 25, z: 0 }),
    )
    const median = (a: number[]) => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)]
    expect(median(tall)).toBeGreaterThan(median(low) * 2)
    expect(median(tall)).toBeGreaterThan(45)
    // Not a single flat value either.
    expect(new Set(tall).size).toBeGreaterThan(3)
  })

  it('uses the building type when it says something', () => {
    expect(estimate({ id: 5, type: 'kiosk', area: 400, x: 0, z: 0 })).toBe(3)
    expect(estimate({ id: 5, type: 'cathedral', area: 400, x: 0, z: 0 })).toBe(22)
  })
})
