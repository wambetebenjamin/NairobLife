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

  it('never guesses a tower onto a small footprint', () => {
    for (let id = 1; id <= 200; id++) {
      const area = 150
      const height = estimate({ id, type: undefined, area, x: 20, z: 20 })
      expect(height).toBeLessThanOrEqual(Math.sqrt(area) * 1.25 + LEVEL_HEIGHT)
    }
  })

  it('lets large footprints near towers be tall, but varied', () => {
    const heights = new Set<number>()
    for (let id = 1; id <= 200; id++)
      heights.add(estimate({ id, type: undefined, area: 1500, x: 20, z: 20 }))
    expect(Math.max(...heights)).toBeGreaterThan(30)
    expect(heights.size).toBeGreaterThan(4)
  })

  it('uses the building type when it says something', () => {
    expect(estimate({ id: 5, type: 'kiosk', area: 400, x: 0, z: 0 })).toBe(3)
    expect(estimate({ id: 5, type: 'cathedral', area: 400, x: 0, z: 0 })).toBe(22)
  })
})
