/**
 * Where roads meet, as small boxes inside which only one direction of travel may be at
 * a time.
 *
 * The road graph is built from mapped road ways, and two ways meet in one of three ways:
 *
 *  - **They share a vertex.** Then the graph knows: both ways have an edge starting or
 *    ending at the same node. Much of central Nairobi is like this.
 *  - **They cross without sharing a vertex.** A dual carriageway, a service lane beside a
 *    main road, or two sources stitched together in the bake: the lines cross on the map,
 *    but the graph shows no connection at all. Left alone, traffic drives through itself.
 *  - **One ends on the other.** The end of a clipped way lies in the middle of another
 *    road: a T junction the graph does not know about.
 *
 * This finds all three. Each meeting becomes one `Crossing`: a box, the approaches that
 * arrive at it, and the pairs of approaches that may not be inside it at once. Meeting
 * points within a few metres of each other (a crossroads drawn as four separate lines, a
 * slip lane clipping a junction) merge into one box, so a junction is guarded once and
 * not four times.
 *
 * Nothing here decides who goes first: that is `junctions.ts`.
 *
 * No DOM and no three.js: the tests run this on the real baked zone.
 */
import { SpatialGrid } from '../../core/spatialGrid'
import type { Edge, RoadGraph } from './graph'

/** One direction of travel arriving at a junction box. */
export interface Approach {
  edge: number
  /** How far along the edge the box is, in metres. */
  progress: number
}

export interface Crossing {
  id: number
  x: number
  z: number
  approaches: Approach[]
  /** Pairs of approaches that may not be in the box at once, as indices into `approaches`. */
  conflicts: [number, number][]
}

/** Two roads at a shallower angle (sine) than this are parallel, not crossing. */
export const MIN_ANGLE_SINE = 0.25
/** A crossing must be at least this far from the end of either edge, in metres. */
const END_MARGIN = 4
/** An end this close to another road's centre line joins it. */
const TOUCH_DISTANCE = 2.5
/** Meeting points nearer than this, in metres, may be one junction. */
const MERGE_RADIUS = 9
/** Along-edge margin added to the merge test, so a wide road's two kerbs merge. */
const MERGE_ALONG = 10
/** Spatial hash cell for candidate edge pairs. Coarse: shortlist pairs by true distance. */
const CELL = 160
/** Only edges whose lines come this close are tested against each other, in metres. */
const NEAR = 1
/** Long edges are tested in pieces this long, so meeting points stay local. */
const PIECE = 18

/** Unit travel direction of an edge. */
export function travel(edge: Edge): [number, number] {
  const length = Math.hypot(edge.bx - edge.ax, edge.bz - edge.az)
  return length > 1e-9 ? [(edge.bx - edge.ax) / length, (edge.bz - edge.az) / length] : [0, 0]
}

/** True when the two edges are the same stretch of tarmac: the same way, either direction. */
export function sameCarriageway(a: Edge, b: Edge): boolean {
  return a === b || (a.from === b.to && a.to === b.from) || (a.from === b.from && a.to === b.to)
}

/**
 * Where two straight segments properly cross, as fractions along each. Null for parallel
 * lines and for meetings within `END_MARGIN` of an end: those are joins, not crossings.
 */
export function segmentCrossing(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number,
): { t: number; u: number; sine: number } | null {
  const rx = bx - ax
  const rz = bz - az
  const sx = dx - cx
  const sz = dz - cz
  const lengthA = Math.hypot(rx, rz)
  const lengthB = Math.hypot(sx, sz)
  if (lengthA < 1e-9 || lengthB < 1e-9) return null
  const denominator = rx * sz - rz * sx
  const sine = Math.abs(denominator) / (lengthA * lengthB)
  if (sine < MIN_ANGLE_SINE) return null
  const qx = cx - ax
  const qz = cz - az
  const t = (qx * sz - qz * sx) / denominator
  const u = (qx * rz - qz * rx) / denominator
  const margin = Math.min(END_MARGIN / lengthA, 0.45)
  if (t <= margin || t >= 1 - margin || u <= margin || u >= 1 - margin) return null
  return { t, u, sine }
}

/** Closest distance between two segments, in metres. Zero when they touch or cross. */
export function segmentDistance(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number,
): number {
  const pointSegment = (px: number, pz: number, qx: number, qz: number, rx: number, rz: number) => {
    const ex = rx - qx
    const ez = rz - qz
    const lengthSq = ex * ex + ez * ez
    const t =
      lengthSq > 1e-12 ? Math.max(0, Math.min(1, ((px - qx) * ex + (pz - qz) * ez) / lengthSq)) : 0
    return Math.hypot(qx + ex * t - px, qz + ez * t - pz)
  }
  if (segmentCrossing(ax, az, bx, bz, cx, cz, dx, dz)) return 0
  // An endpoint lying on the other segment.
  const near = Math.min(
    pointSegment(ax, az, cx, cz, dx, dz),
    pointSegment(bx, bz, cx, cz, dx, dz),
    pointSegment(cx, cz, ax, az, bx, bz),
    pointSegment(dx, dz, ax, az, bx, bz),
  )
  return near
}

interface Meeting {
  x: number
  z: number
  /** Edges arriving here, with how far along each the meeting is. */
  arrivals: { edge: number; progress: number }[]
  /** The graph's own junction node, when this is one: its position wins when merging. */
  node?: string
}

export function findCrossings(graph: RoadGraph): Crossing[] {
  const edges = graph.edges
  const key = (x: number, z: number) => `${x},${z}`

  // The opposite direction of each edge, where the graph has one.
  const reverse = new Map<number, number>()
  const lookup = new Map<string, number>()
  edges.forEach((edge, index) =>
    lookup.set(`${key(edge.ax, edge.az)}>${key(edge.bx, edge.bz)}`, index),
  )
  edges.forEach((edge, index) => {
    if (reverse.has(index)) return
    const match = lookup.get(`${key(edge.bx, edge.bz)}>${key(edge.ax, edge.az)}`)
    if (match !== undefined && match !== index) {
      reverse.set(index, match)
      reverse.set(match, index)
    }
  })

  const meetings: Meeting[] = []

  // ---- 1. shared vertices with three or more roads: the graph's own junctions
  const neighbours = new Map<string, Set<string>>()
  const incident = new Map<string, number[]>()
  for (const [index, edge] of edges.entries()) {
    const from = key(edge.ax, edge.az)
    const to = key(edge.bx, edge.bz)
    for (const [node, other] of [
      [from, to],
      [to, from],
    ]) {
      const set = neighbours.get(node) ?? new Set<string>()
      set.add(other)
      neighbours.set(node, set)
      const list = incident.get(node) ?? []
      list.push(index)
      incident.set(node, list)
    }
  }
  for (const [node, set] of neighbours) {
    if (set.size < 3) continue
    const arrivals: Meeting['arrivals'] = []
    let x = 0
    let z = 0
    for (const index of incident.get(node) ?? []) {
      const edge = edges[index]
      const atEnd = key(edge.bx, edge.bz) === node
      arrivals.push({ edge: index, progress: atEnd ? edge.length : 0 })
      x += atEnd ? edge.bx : edge.ax
      z += atEnd ? edge.bz : edge.az
    }
    if (arrivals.length)
      meetings.push({ x: x / arrivals.length, z: z / arrivals.length, arrivals, node })
  }

  // ---- 2. geometric crossings and 3. ends landing on another road
  // A plain cell map of the edges' bounding boxes. The generic SpatialGrid would do,
  // but its `near` returns every item in every cell of a circle, and a long avenue
  // would visit millions of candidates; this visits only the cells the box touches.
  const cells = new Map<number, number[]>()
  const cellKey = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768)
  const bbox = edges.map((edge) => [
    Math.min(edge.ax, edge.bx),
    Math.min(edge.az, edge.bz),
    Math.max(edge.ax, edge.bx),
    Math.max(edge.az, edge.bz),
  ])
  bbox.forEach(([minX, minZ, maxX, maxZ], index) => {
    for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++) {
      for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
        const key = cellKey(cx, cz)
        const bucket = cells.get(key)
        if (bucket) bucket.push(index)
        else cells.set(key, [index])
      }
    }
  })
  const tested = new Set<string>()
  const addCrossing = (a: Edge, ai: number, b: Edge, bi: number) => {
    const length = Math.hypot(a.bx - a.ax, a.bz - a.az)
    const pieces = Math.max(1, Math.ceil(length / PIECE))
    for (let piece = 0; piece < pieces; piece++) {
      const t0 = piece / pieces
      const t1 = (piece + 1) / pieces
      const ax = a.ax + (a.bx - a.ax) * t0
      const az = a.az + (a.bz - a.az) * t0
      const bx = a.ax + (a.bx - a.ax) * t1
      const bz = a.az + (a.bz - a.az) * t1
      const hit = segmentCrossing(ax, az, bx, bz, b.ax, b.az, b.bx, b.bz)
      if (!hit) continue
      meetings.push({
        x: ax + (bx - ax) * hit.t,
        z: az + (bz - az) * hit.t,
        arrivals: [
          { edge: ai, progress: length * (t0 + (t1 - t0) * hit.t) },
          { edge: bi, progress: b.length * hit.u },
        ],
      })
    }
  }
  edges.forEach((a, ai) => {
    const [minX, minZ, maxX, maxZ] = bbox[ai]
    const candidates = new Set<number>()
    for (
      let cx = Math.floor((minX - TOUCH_DISTANCE) / CELL);
      cx <= Math.floor((maxX + TOUCH_DISTANCE) / CELL);
      cx++
    ) {
      for (
        let cz = Math.floor((minZ - TOUCH_DISTANCE) / CELL);
        cz <= Math.floor((maxZ + TOUCH_DISTANCE) / CELL);
        cz++
      ) {
        for (const bi of cells.get(cellKey(cx, cz)) ?? []) {
          if (bi === ai) continue
          // Only the cell the candidate is actually in, not every cell it touches.
          const [bx0, bz0, bx1, bz1] = bbox[bi]
          if (bx1 < minX - TOUCH_DISTANCE || bx0 > maxX + TOUCH_DISTANCE) continue
          if (bz1 < minZ - TOUCH_DISTANCE || bz0 > maxZ + TOUCH_DISTANCE) continue
          candidates.add(bi)
        }
      }
    }
    for (const bi of candidates) {
      const b = edges[bi]
      if (sameCarriageway(a, b)) continue
      if (a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to) continue
      const id = ai < bi ? `${ai},${bi}` : `${bi},${ai}`
      if (tested.has(id)) continue
      tested.add(id)
      // A coarse cell holds many pairs. Only lines that truly touch can meet.
      if (segmentDistance(a.ax, a.az, a.bx, a.bz, b.ax, b.az, b.bx, b.bz) > NEAR) continue
      addCrossing(a, ai, b, bi)
      for (const [p, pi, q, qi] of [
        [a, ai, b, bi],
        [b, bi, a, ai],
      ] as const) {
        for (const atStart of [true, false]) {
          const px = atStart ? p.ax : p.bx
          const pz = atStart ? p.az : p.bz
          const dx = q.bx - q.ax
          const dz = q.bz - q.az
          const lengthSq = dx * dx + dz * dz
          if (lengthSq < 1e-9) continue
          const t = Math.max(0, Math.min(1, ((px - q.ax) * dx + (pz - q.az) * dz) / lengthSq))
          if (Math.hypot(q.ax + dx * t - px, q.az + dz * t - pz) > TOUCH_DISTANCE) continue
          meetings.push({
            x: q.ax + dx * t,
            z: q.az + dz * t,
            arrivals: [
              { edge: pi, progress: atStart ? 0 : p.length },
              { edge: qi, progress: q.length * t },
            ],
          })
        }
      }
    }
  })

  // ---- every two-way arrival is also an approach from the other direction
  for (const meeting of meetings) {
    const extra: Meeting['arrivals'] = []
    for (const arrival of meeting.arrivals) {
      const other = reverse.get(arrival.edge)
      if (other === undefined) continue
      if (meeting.arrivals.some((item) => item.edge === other)) continue
      extra.push({ edge: other, progress: edges[other].length - arrival.progress })
    }
    meeting.arrivals.push(...extra)
  }

  // ---- merge meetings into junction boxes
  const parent = meetings.map((_, index) => index)
  const find = (index: number): number => {
    let root = index
    while (parent[root] !== root) root = parent[root]
    while (parent[index] !== root) {
      const next = parent[index]
      parent[index] = root
      index = next
    }
    return root
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra === rb) return
    // The lower index wins, so a node meeting (added first) keeps its position.
    if (ra < rb) parent[rb] = ra
    else parent[ra] = rb
  }
  const near = new SpatialGrid<number>(MERGE_RADIUS * 2)
  meetings.forEach((meeting, index) =>
    near.insert(index, meeting.x, meeting.z, meeting.x, meeting.z),
  )
  const considered = new Set<string>()
  meetings.forEach((meeting, index) => {
    near.near(meeting.x, meeting.z, MERGE_RADIUS, (other) => {
      if (other === index) return
      const id = index < other ? `${index},${other}` : `${other},${index}`
      if (considered.has(id)) return
      considered.add(id)
      const that = meetings[other]
      if (Math.hypot(that.x - meeting.x, that.z - meeting.z) > MERGE_RADIUS) return
      // Along a shared edge, two meetings far apart are two junctions, not one.
      for (const arrival of meeting.arrivals) {
        const twin = that.arrivals.find((item) => item.edge === arrival.edge)
        if (twin && Math.abs(twin.progress - arrival.progress) > MERGE_ALONG) return
      }
      union(index, other)
    })
  })

  const groups = new Map<number, Meeting[]>()
  meetings.forEach((meeting, index) => {
    const root = find(index)
    const list = groups.get(root) ?? []
    list.push(meeting)
    groups.set(root, list)
  })

  const crossings: Crossing[] = []
  for (const group of groups.values()) {
    const anchor = group.find((meeting) => meeting.node) ?? group[0]
    const approaches: Approach[] = []
    for (const meeting of group) {
      for (const arrival of meeting.arrivals) {
        const existing = approaches.find((item) => item.edge === arrival.edge)
        if (existing) existing.progress = Math.max(existing.progress, arrival.progress)
        else approaches.push({ ...arrival })
      }
    }
    const conflicts: [number, number][] = []
    for (let i = 0; i < approaches.length; i++) {
      for (let j = i + 1; j < approaches.length; j++) {
        const a = edges[approaches[i].edge]
        const b = edges[approaches[j].edge]
        if (sameCarriageway(a, b)) continue
        const [ax, az] = travel(a)
        const [bx, bz] = travel(b)
        if (Math.abs(ax * bz - az * bx) < MIN_ANGLE_SINE) continue
        conflicts.push([i, j])
      }
    }
    crossings.push({ id: crossings.length, x: anchor.x, z: anchor.z, approaches, conflicts })
  }
  return crossings
}
