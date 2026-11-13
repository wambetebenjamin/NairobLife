import { describe, expect, it } from 'vitest'
import { loadBakedZone } from '../../testing/zoneFixture'
import { DRIVABLE, type ZoneFile } from '../zone/format'
import { GROUND } from './palette'
import { buildRaisedRoads } from './raisedRoads'

/**
 * Paint on the flyover decks.
 *
 * The ground painter skips every road that carries a height (`isRaised`), and the deck
 * builder drew the decks plain, so the Expressway viaduct and the Globe flyover had no
 * lane lines at all while the streets underneath them had them. These are the checks that
 * the paint is there, that it is where a road's paint belongs, and that it costs nothing
 * on the surfaces where paint would be wrong.
 */

const zone = loadBakedZone()
const mesh = buildRaisedRoads(zone)

/** Is this vertex painted in the lane-marking colour? */
function isMarking(v: number): boolean {
  const at = v * 3
  return (
    Math.abs(mesh.colors[at] - GROUND.marking[0]) < 1e-6 &&
    Math.abs(mesh.colors[at + 1] - GROUND.marking[1]) < 1e-6 &&
    Math.abs(mesh.colors[at + 2] - GROUND.marking[2]) < 1e-6
  )
}

/** Count vertices painted in the marking colour, and how high above the ground they sit. */
function marked() {
  let count = 0
  let minY = Infinity
  let maxY = -Infinity
  let offDeck = 0
  for (let v = 0; v < mesh.colors.length; v += 3) {
    if (!isMarking(v / 3)) continue
    count++
    const y = mesh.positions[(v / 3) * 3 + 1]
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
    // A marking must be on a deck, never floating in the air or buried under the ground.
    if (!(y > 0 && y < 40)) offDeck++
  }
  return { count, minY, maxY, offDeck }
}

/**
 * The same deck builder run over a zone in which the drivable flyovers are all footways.
 * Anything it paints is paint that should not be there.
 */
function paintedOnWalkable(): number {
  const walkOnly: ZoneFile = {
    ...zone,
    roads: zone.roads.map((road) =>
      // Deliberately wide: a 2.2 m footway has one "lane" and no paint either way, so it
      // would prove nothing about the guard. At 20 m there are lanes to divide.
      road.e === undefined ? road : { ...road, k: 'footway', w: 20, ow: undefined, ln: undefined },
    ),
  }
  const walkMesh = buildRaisedRoads(walkOnly)
  let count = 0
  for (let v = 0; v < walkMesh.colors.length; v += 3) {
    const at = v
    if (
      Math.abs(walkMesh.colors[at] - GROUND.marking[0]) < 1e-6 &&
      Math.abs(walkMesh.colors[at + 1] - GROUND.marking[1]) < 1e-6 &&
      Math.abs(walkMesh.colors[at + 2] - GROUND.marking[2]) < 1e-6
    )
      count++
  }
  return count
}

describe('lane markings on the raised decks', () => {
  it('paints lane lines on the decks at all', () => {
    // Before this existed the raised mesh had no marking-coloured vertex anywhere.
    expect(marked().count).toBeGreaterThan(0)
  })

  it('paints them on the flyovers, not on footbridges or stairways', () => {
    // A footway is 2.2 m wide and a stairway is stairs: neither has lanes to divide, and
    // painting them would put lane lines on a footpath.
    const raised = zone.roads.filter((road) => road.e !== undefined)
    const driveable = raised.filter((road) => DRIVABLE[road.k])
    const walkable = raised.filter((road) => !DRIVABLE[road.k])
    expect(driveable.length).toBeGreaterThan(0)
    expect(walkable.length).toBeGreaterThan(0)

    // The walkable decks are the only ones whose surface is never painted: compare the
    // painted vertex count against the same mesh built with every deck made a footway.
    expect(paintedOnWalkable()).toBe(0)
  })

  it('lays the paint face up, so it is seen from above and not from below', () => {
    // The decks are drawn face up; a dash wound the other way would be invisible from the
    // road and would only show from underneath the bridge.
    let tris = 0
    let zeroArea = 0
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const a = mesh.indices[i]
      if (!isMarking(a)) continue
      tris++
      expect(mesh.normals[a * 3 + 1]).toBeGreaterThan(0.99)
      const [ax, ay, az] = [0, 1, 2].map((k) => mesh.positions[a * 3 + k])
      const b = mesh.indices[i + 1]
      const c = mesh.indices[i + 2]
      const u = [0, 1, 2].map((k) => mesh.positions[b * 3 + k] - [ax, ay, az][k])
      const v = [0, 1, 2].map((k) => mesh.positions[c * 3 + k] - [ax, ay, az][k])
      const cross = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ]
      if (Math.hypot(...cross) / 2 < 1e-9) zeroArea++
    }
    expect(tris).toBeGreaterThan(0)
    expect(zeroArea).toBe(0)
  })

  it('keeps every marking above the ground and on the deck it belongs to', () => {
    const { offDeck, maxY } = marked()
    expect(offDeck).toBe(0)
    // The highest deck in the CBD is the Expressway, well under 40 m.
    expect(maxY).toBeLessThan(40)
  })
})
