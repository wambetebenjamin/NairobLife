import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ZoneFile } from '../../src/world/zone/format'
import { LANDMARK_OVERRIDES, LANDMARK_PARTS, type LandmarkLook } from './landmarks'

/**
 * The landmark touch-ups are written by hand against OSM ids, and the zone file is baked
 * from them and committed. These tests catch the two ways they drift apart: a typo in
 * the list, and a list that was edited without baking again.
 */
describe('landmark touch-ups', () => {
  const zone = JSON.parse(readFileSync(resolve('data/zones/nairobi-cbd.json'), 'utf8')) as ZoneFile
  const baked = new Map(zone.buildings.map((building) => [building.id, building]))
  const looks: [string, LandmarkLook][] = [
    ...Object.entries(LANDMARK_OVERRIDES).map(([id, o]): [string, LandmarkLook] => [id, o]),
    ...LANDMARK_PARTS.map((part): [string, LandmarkLook] => [String(part.id), part]),
  ]

  it('writes colours as #rrggbb', () => {
    for (const [id, look] of looks) {
      for (const colour of [look.colour, look.roofColour]) {
        if (colour !== undefined) expect(colour, `piece ${id}`).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })

  it('gives every added piece its own negative id, and a body', () => {
    const ids = LANDMARK_PARTS.map((part) => part.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const part of LANDMARK_PARTS) {
      expect(part.id).toBeLessThan(0)
      expect(part.h).toBeGreaterThan(part.base)
      // OSM ids are positive; the seed's own made-up ids stay above -100000.
      expect(part.id).toBeLessThan(-100000)
    }
  })

  it('is what the committed zone file was baked from', () => {
    for (const part of LANDMARK_PARTS) {
      const piece = baked.get(part.id)
      expect(piece, `part ${part.id} is missing: run "npm run osm:bake"`).toBeDefined()
      expect(piece?.h).toBe(part.h)
      expect(piece?.b ?? 0).toBe(part.base)
      expect(piece?.c).toBe(part.colour)
    }
    for (const [id, override] of Object.entries(LANDMARK_OVERRIDES)) {
      const piece = baked.get(Number(id))
      if (override.drop) {
        expect(piece, `piece ${id} should have been dropped`).toBeUndefined()
        continue
      }
      expect(piece, `override ${id} matches nothing in the zone`).toBeDefined()
      if (override.h !== undefined) expect(piece?.h).toBe(override.h)
      if (override.colour) expect(piece?.c).toBe(override.colour)
    }
  })
})
