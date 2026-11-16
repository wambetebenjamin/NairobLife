/**
 * Bridge and stair heights.
 *
 * This module had no tests at all, which is how a claim about it went unchecked: an
 * inspection of the baked zone reported the CBD's two stairways at "17 and 27 degrees"
 * and a change was nearly made on the back of it. Both figures came from dividing the
 * whole way's drop by its whole length, including the flat approach at each end. Measured
 * on the segments that actually drop, they are **27 and 24 degrees**, which is a stair and
 * not a ramp — the old code was already right, and the "fix" changed nothing in the bake.
 *
 * So these tests pin down the behaviour as it is. They are the ones that would have been
 * needed to catch the error before it reached a commit.
 */
import { describe, expect, it } from 'vitest'
import { computeElevations, type ElevWay } from './elevation'
import type { RoadInfo } from './tags'

function road(over: Partial<RoadInfo> = {}): RoadInfo {
  return {
    kind: 'residential',
    link: false,
    width: 8,
    oneway: false,
    bridge: false,
    viaduct: false,
    tunnel: false,
    layer: 0,
    ...over,
  }
}

/** A straight way east, `n` nodes `step` metres apart, starting at (0, 0). */
function way(id: number, n: number, step: number, info: RoadInfo, nodeIds: number[]): ElevWay {
  const xs: number[] = []
  const zs: number[] = []
  for (let i = 0; i < n; i++) {
    xs.push(i * step)
    zs.push(0)
  }
  return { id, nodeIds: nodeIds.slice(0, n), xs, zs, info }
}

/**
 * Steepest gradient actually used on a way — measured segment by segment, which is the
 * measurement the earlier inspection got wrong.
 */
function steepest(w: ElevWay, heights: Map<number, number>): number {
  let worst = 0
  for (let i = 0; i + 1 < w.nodeIds.length; i++) {
    const a = heights.get(w.nodeIds[i]) ?? 0
    const b = heights.get(w.nodeIds[i + 1]) ?? 0
    const run = Math.hypot(w.xs[i + 1] - w.xs[i], w.zs[i + 1] - w.zs[i])
    if (run > 1e-6) worst = Math.max(worst, Math.abs(b - a) / run)
  }
  return worst
}

/**
 * A footbridge over a carriageway, with a stair coming down off one end.
 *
 * The bridge has to pass over a road without sharing a node, or rule 1 in elevation.ts
 * says it is not a grade separation and the bridge stays on the ground — and then there is
 * nothing for the stair to descend from.
 */
function bridgeAndStair(stairStep: number, stairNodes: number) {
  const under = way(9, 3, 30, road({ kind: 'primary' }), [90, 91, 92])
  under.zs = [20, 0, -20]
  const bridge = way(1, 3, 10, road({ kind: 'footway', bridge: true, layer: 1 }), [1, 2, 3])
  bridge.zs = [-10, 0, 10]
  // The stair starts at node 3, the far end of the bridge.
  const ids = Array.from({ length: stairNodes }, (_, i) => 3 + i)
  const stair = way(2, stairNodes, stairStep, road({ kind: 'steps' }), ids)
  stair.zs = stair.xs.map(() => 10)
  const ways = [under, bridge, stair]
  return { ways, under, bridge, stair, ...computeElevations(ways) }
}

describe('bridges', () => {
  it('leaves a bridge that crosses nothing on the ground', () => {
    // A "bridge" over empty space is not a grade separation. This is rule 1, and getting it
    // wrong would lift roads into the air for no reason.
    const only = way(1, 3, 20, road({ bridge: true, layer: 1 }), [1, 2, 3])
    const { nodeHeight, decks } = computeElevations([only])
    expect(nodeHeight.size).toBe(0)
    expect(decks.size).toBe(0)
  })

  it('raises a footbridge and records only the bridge as a deck', () => {
    const { nodeHeight, decks } = bridgeAndStair(9, 3)
    // The stair has to reach the street, so it is not a deck; only the bridge is.
    expect(decks.has(1)).toBe(true)
    expect(decks.has(2)).toBe(false)
    // A footbridge sits at DECK_HEIGHT.foot, not the road or motorway height.
    expect(Math.max(...nodeHeight.values())).toBeCloseTo(5.5, 1)
  })

  it('does not raise the road being crossed', () => {
    const { nodeHeight, under } = bridgeAndStair(9, 3)
    for (const id of under.nodeIds) expect(nodeHeight.get(id) ?? 0).toBeLessThan(0.2)
  })
})

describe('stairs', () => {
  it('brings a footbridge down to the street', () => {
    const { stair, nodeHeight } = bridgeAndStair(9, 3)
    const bottom = stair.nodeIds[stair.nodeIds.length - 1]
    expect(nodeHeight.get(bottom) ?? 0).toBeLessThan(0.2)
  })

  it('never exceeds the stair gradient of 0.55 on any one segment', () => {
    // 0.55 is about 29 degrees. Whatever the layout, no single segment may be steeper,
    // which is what stops a stair rendering as a cliff.
    const { stair, nodeHeight } = bridgeAndStair(2, 8)
    expect(steepest(stair, nodeHeight)).toBeLessThanOrEqual(0.55 + 1e-6)
  })

  it('spends the fall over as few segments as it can, like a stair', () => {
    // On a short plan the drop happens in one segment at the full allowed gradient, rather
    // than being smeared evenly across a long gentle ramp. This is the behaviour that the
    // baked CBD shows at 27 and 24 degrees on its two stairways.
    const { stair, nodeHeight } = bridgeAndStair(9, 3)
    const heights = stair.nodeIds.map((id) => nodeHeight.get(id) ?? 0)
    expect(heights[0]).toBeGreaterThan(5)
    expect(heights[heights.length - 1]).toBeLessThan(0.2)
    expect(steepest(stair, nodeHeight)).toBeGreaterThan(0.2)
  })

  it('is allowed to be far steeper than a footway', () => {
    // The separation that matters: a stair may drop at 0.55, a footway at 0.14. If they
    // ever shared a gradient, stairways would render as ramps.
    const { stair, nodeHeight } = bridgeAndStair(4, 6)
    expect(steepest(stair, nodeHeight)).toBeGreaterThan(0.14)
  })
})
