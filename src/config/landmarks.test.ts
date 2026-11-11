import { describe, expect, it } from 'vitest'
import { distToSegmentSq } from '../core/geom2d'
import { resolveLandmark } from '../player/teleport'
import { loadBakedZone } from '../testing/zoneFixture'
import type { LoadedZone } from '../world/zone/loadZone'
import { ZoneIndex } from '../world/zone/zoneIndex'
import { START_LANDMARK } from './game'
import { LANDMARKS, getLandmark } from './landmarks'
import { ZONES } from './zones'

/**
 * A teleport that drops you inside a wall, or beside a rooftop instead of on it, is the
 * kind of bug nobody notices until a player does. Every landmark is checked against the
 * building footprints in the baked map.
 */
describe('landmarks', () => {
  const file = loadBakedZone()
  const index = new ZoneIndex(file)
  // resolveLandmark only needs the lookup index.
  const zone = { id: file.id, file, index } as LoadedZone
  const here = LANDMARKS.filter((landmark) => landmark.zone === file.id)

  /** True over the carriageway of a road that is at least 2 m off the ground there. */
  const onRaisedDeck = (x: number, z: number): boolean =>
    file.roads.some((road) => {
      if (!road.e) return false
      for (let i = 0; i < road.p.length - 2; i += 2) {
        const raised = Math.min(road.e[i / 2], road.e[i / 2 + 1]) / file.q >= 2
        const ax = road.p[i] / file.q
        const az = road.p[i + 1] / file.q
        const bx = road.p[i + 2] / file.q
        const bz = road.p[i + 3] / file.q
        if (raised && distToSegmentSq(x, z, ax, az, bx, bz) < (road.w / 2) ** 2) return true
      }
      return false
    })

  it('have unique ids and belong to a known zone', () => {
    expect(new Set(LANDMARKS.map((landmark) => landmark.id)).size).toBe(LANDMARKS.length)
    for (const landmark of LANDMARKS)
      expect(ZONES.some((def) => def.id === landmark.zone)).toBe(true)
  })

  it('include the place a new game starts', () => {
    expect(getLandmark(START_LANDMARK)).toBeDefined()
  })

  it.each(here.map((landmark) => [landmark.id, landmark] as const))(
    '%s lands somewhere sensible',
    (_, landmark) => {
      const spot = resolveLandmark(landmark, zone)
      const { minX, minZ, maxX, maxZ } = index.bounds
      expect(spot.x).toBeGreaterThan(minX + 15)
      expect(spot.x).toBeLessThan(maxX - 15)
      expect(spot.z).toBeGreaterThan(minZ + 15)
      expect(spot.z).toBeLessThan(maxZ - 15)
      expect(Math.abs(spot.yaw)).toBeLessThanOrEqual(Math.PI)

      if (landmark.onTop) {
        // "On top" spawns need something under them, with a little room to stand: a roof,
        // or the deck of a flyover.
        for (const [dx, dz] of [
          [0, 0],
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const x = spot.x + dx
          const z = spot.z + dz
          expect(index.buildingAt(x, z) !== undefined || onRaisedDeck(x, z)).toBe(true)
        }
      } else {
        // Ground spawns need open ground, and must not have been nudged far to find it.
        for (const [dx, dz] of [
          [0, 0],
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          expect(index.buildingAt(spot.x + dx, spot.z + dz)).toBeUndefined()
        }
      }
    },
  )
})
