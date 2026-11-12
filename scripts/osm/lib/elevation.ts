/**
 * Which roads are off the ground, and by how much.
 *
 * OSM has no heights for roads, only `bridge=yes` and a relative `layer`. Nairobi needs
 * better than "everything is flat": the Expressway runs on a viaduct above Uhuru Highway,
 * Globe Roundabout and Museum Hill have flyovers, and footbridges cross the highway.
 *
 * The rules:
 *
 * 1. A bridge is *raised* only if it passes over a road or railway without sharing a node
 *    with it (a real grade separation). A bridge over a river stays flat, because we
 *    have no terrain yet and the road on either side is at ground level.
 * 2. Bridges that share nodes form one structure. If any span of it is raised (or it is
 *    tagged viaduct) the whole structure is: the Expressway stays up between junctions.
 * 3. Deck nodes sit at a fixed height by road class. From there height falls away along
 *    every connected road at a maximum gradient until it reaches the ground. That one
 *    rule produces approach ramps, exit ramps and footbridge stairs.
 * 4. Slip roads (*_link) are never a deck themselves, even when tagged as a bridge: they
 *    are the ramp, so they descend along their own length.
 */
import { segmentsCross } from '../../../src/core/geom2d'
import type { RoadInfo } from './tags'

export interface ElevWay {
  id: number
  nodeIds: number[]
  xs: number[]
  zs: number[]
  /** Undefined for railways: they can be crossed over, but are never raised. */
  info?: RoadInfo
}

export interface Elevations {
  /** Height above ground in metres, for nodes that are off the ground. */
  nodeHeight: Map<number, number>
  /** Ways that are a bridge structure (drawn as a deck on piers). */
  decks: Set<number>
}

const DECK_HEIGHT = { motorway: 11, road: 7.5, foot: 5.5 }
const MAX_GRADIENT = { steps: 0.55, foot: 0.14, road: 0.065 }
const CELL = 60

const isFoot = (info: RoadInfo) =>
  info.kind === 'footway' || info.kind === 'steps' || info.kind === 'pedestrian'

function deckHeight(info: RoadInfo): number {
  const base = isFoot(info)
    ? DECK_HEIGHT.foot
    : info.kind === 'motorway'
      ? DECK_HEIGHT.motorway
      : DECK_HEIGHT.road
  return base * Math.min(Math.max(info.layer, 1), 2)
}

function gradient(info: RoadInfo): number {
  return info.kind === 'steps'
    ? MAX_GRADIENT.steps
    : isFoot(info)
      ? MAX_GRADIENT.foot
      : MAX_GRADIENT.road
}

export function computeElevations(ways: readonly ElevWay[]): Elevations {
  const nodeHeight = new Map<number, number>()
  const decks = new Set<number>()

  // Candidate structures: tagged as a bridge, or drawn on a higher layer.
  const candidates = ways.filter(
    (w) => w.info && !w.info.tunnel && (w.info.bridge || w.info.layer >= 1),
  )
  if (candidates.length === 0) return { nodeHeight, decks }
  const candidateSet = new Set(candidates)

  // ---- spatial index of everything a bridge could pass over: carriageways and rails
  const grid = new Map<string, { way: ElevWay; i: number }[]>()
  for (const way of ways) {
    if (way.info && (way.info.tunnel || isFoot(way.info))) continue
    for (let i = 0; i < way.nodeIds.length - 1; i++) {
      const x0 = Math.floor(Math.min(way.xs[i], way.xs[i + 1]) / CELL)
      const x1 = Math.floor(Math.max(way.xs[i], way.xs[i + 1]) / CELL)
      const z0 = Math.floor(Math.min(way.zs[i], way.zs[i + 1]) / CELL)
      const z1 = Math.floor(Math.max(way.zs[i], way.zs[i + 1]) / CELL)
      for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
          const key = `${cx},${cz}`
          let bucket = grid.get(key)
          if (!bucket) grid.set(key, (bucket = []))
          bucket.push({ way, i })
        }
      }
    }
  }

  const passesOver = (bridge: ElevWay): boolean => {
    const layer = bridge.info!.layer
    for (let i = 0; i < bridge.nodeIds.length - 1; i++) {
      const ax = bridge.xs[i]
      const az = bridge.zs[i]
      const bx = bridge.xs[i + 1]
      const bz = bridge.zs[i + 1]
      const a = bridge.nodeIds[i]
      const b = bridge.nodeIds[i + 1]
      const x0 = Math.floor(Math.min(ax, bx) / CELL)
      const x1 = Math.floor(Math.max(ax, bx) / CELL)
      const z0 = Math.floor(Math.min(az, bz) / CELL)
      const z1 = Math.floor(Math.max(az, bz) / CELL)
      for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
          for (const { way, i: j } of grid.get(`${cx},${cz}`) ?? []) {
            if (way === bridge) continue
            // Two structures on the same level do not pass over each other.
            if (candidateSet.has(way) && (way.info?.layer ?? 0) >= layer) continue
            const c = way.nodeIds[j]
            const d = way.nodeIds[j + 1]
            if (a === c || a === d || b === c || b === d) continue // a junction, not a crossing
            if (segmentsCross(ax, az, bx, bz, way.xs[j], way.zs[j], way.xs[j + 1], way.zs[j + 1]))
              return true
          }
        }
      }
    }
    return false
  }

  // ---- group candidates that share nodes into structures
  const parent = candidates.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const firstAtNode = new Map<number, number>()
  candidates.forEach((way, i) => {
    for (const node of way.nodeIds) {
      const other = firstAtNode.get(node)
      if (other === undefined) firstAtNode.set(node, i)
      else parent[find(i)] = find(other)
    }
  })
  const raised = new Set<number>()
  candidates.forEach((way, i) => {
    const info = way.info!
    if (info.bridge && (info.viaduct || passesOver(way))) raised.add(find(i))
  })

  // ---- deck nodes
  candidates.forEach((way, i) => {
    if (!raised.has(find(i))) return
    const info = way.info!
    if (info.bridge) decks.add(way.id)
    if (info.link) return // ramps descend; they are not held at deck height
    const h = deckHeight(info)
    for (const node of way.nodeIds) {
      if ((nodeHeight.get(node) ?? 0) < h) nodeHeight.set(node, h)
    }
  })
  if (nodeHeight.size === 0) return { nodeHeight, decks }

  // ---- let height fall away along connected roads (highest-first relaxation)
  // A footbridge must come down to the street; it may not lift the street to meet it.
  // So height never travels along a footpath onto a node that carries a carriageway.
  const carriageNodes = new Set<number>()
  for (const way of ways) {
    if (way.info && !way.info.tunnel && !isFoot(way.info))
      for (const id of way.nodeIds) carriageNodes.add(id)
  }
  const edges = new Map<number, { to: number; drop: number }[]>()
  const link = (from: number, to: number, drop: number) => {
    let list = edges.get(from)
    if (!list) edges.set(from, (list = []))
    list.push({ to, drop })
  }
  for (const way of ways) {
    if (!way.info || way.info.tunnel) continue
    const g = gradient(way.info)
    const foot = isFoot(way.info)
    for (let i = 0; i < way.nodeIds.length - 1; i++) {
      const a = way.nodeIds[i]
      const b = way.nodeIds[i + 1]
      const len = Math.hypot(way.xs[i + 1] - way.xs[i], way.zs[i + 1] - way.zs[i])
      if (!foot || !carriageNodes.has(b)) link(a, b, len * g)
      if (!foot || !carriageNodes.has(a)) link(b, a, len * g)
    }
  }

  const heap = new MaxHeap()
  for (const [node, h] of nodeHeight) heap.push(h, node)
  while (heap.size > 0) {
    const { key: h, value: node } = heap.pop()!
    if (h < (nodeHeight.get(node) ?? 0) - 1e-9) continue // stale entry
    for (const { to, drop } of edges.get(node) ?? []) {
      const next = h - drop
      if (next > 0.05 && next > (nodeHeight.get(to) ?? 0) + 1e-6) {
        nodeHeight.set(to, next)
        heap.push(next, to)
      }
    }
  }
  return { nodeHeight, decks }
}

class MaxHeap {
  private keys: number[] = []
  private values: number[] = []

  get size(): number {
    return this.keys.length
  }

  push(key: number, value: number): void {
    const { keys, values } = this
    let i = keys.length
    keys.push(key)
    values.push(value)
    while (i > 0) {
      const p = (i - 1) >> 1
      if (keys[p] >= keys[i]) break
      ;[keys[p], keys[i]] = [keys[i], keys[p]]
      ;[values[p], values[i]] = [values[i], values[p]]
      i = p
    }
  }

  pop(): { key: number; value: number } | undefined {
    const { keys, values } = this
    if (keys.length === 0) return undefined
    const top = { key: keys[0], value: values[0] }
    const lastKey = keys.pop()!
    const lastValue = values.pop()!
    if (keys.length > 0) {
      keys[0] = lastKey
      values[0] = lastValue
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < keys.length && keys[l] > keys[m]) m = l
        if (r < keys.length && keys[r] > keys[m]) m = r
        if (m === i) break
        ;[keys[m], keys[i]] = [keys[i], keys[m]]
        ;[values[m], values[i]] = [values[i], values[m]]
        i = m
      }
    }
    return top
  }
}
