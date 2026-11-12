/**
 * Roads that leave the ground: the Nairobi Expressway viaduct, the Globe Roundabout
 * flyover on Murang'a Road, footbridges, and the ramps and stairs that climb up to them.
 *
 * The bake gives every road vertex a height (ZoneRoad.e). Here those polylines become
 * solid geometry: a deck with crash barriers, an underside, piers below the bridge spans
 * and retaining walls under the low ends of ramps. The same triangles are used as the
 * physics collider, so everything you can see you can walk (and later drive) on.
 */
import type { RoadKind, ZoneFile } from '../zone/format'
import type { FlatMesh } from './ground'
import { GROUND, scale, type RGB } from './palette'
import { cumulativeLength, ribbonEdges } from './ribbon'

/** The deck surface sits this far above its nominal height so it never fights the ground decals. */
const LIFT = 0.06
/** Longest segment after resampling, in metres. Keeps ramps smooth and junction gaps tight. */
const MAX_SEGMENT = 10
/** Below this height a ramp is drawn as a solid, earth-filled wedge; above it, on piers. */
const SOLID_MAX_HEIGHT = 4.5
/** No barriers below this deck height, so side roads can join the foot of a ramp. */
const BARRIER_MIN_HEIGHT = 1.4
/** Barrier-free distance from the end of a ramp that merges into another deck. */
const JUNCTION_CLEARANCE = 15

const DECK_COLOUR: Record<RoadKind, RGB> = {
  motorway: GROUND.asphaltMajor,
  trunk: GROUND.asphaltMajor,
  primary: GROUND.asphaltMajor,
  secondary: GROUND.asphalt,
  tertiary: GROUND.asphalt,
  residential: GROUND.asphalt,
  service: GROUND.asphaltWorn,
  pedestrian: GROUND.paving,
  footway: GROUND.paving,
  steps: GROUND.steps,
}

const isFoot = (kind: RoadKind) => kind === 'footway' || kind === 'steps' || kind === 'pedestrian'

interface Chain {
  kind: RoadKind
  width: number
  /** Flat [x, z, ...] in metres. */
  line: number[]
  /** Height above ground per vertex, in metres. */
  e: number[]
  /** Per segment: part of a bridge structure. */
  bridge: boolean[]
  /** Per vertex: present in the source data (resampling adds vertices that are not). */
  original: boolean[]
}

class SolidWriter {
  pos: number[] = []
  nor: number[] = []
  col: number[] = []
  idx: number[] = []
  count = 0

  /**
   * A flat-shaded quad through four corners given in order around its edge, facing the
   * same way as the hint vector.
   */
  quad(p: number[], hx: number, hy: number, hz: number, c: RGB): void {
    // Normal from the two diagonals, which also copes with slightly twisted quads.
    const ux = p[6] - p[0]
    const uy = p[7] - p[1]
    const uz = p[8] - p[2]
    const vx = p[9] - p[3]
    const vy = p[10] - p[4]
    const vz = p[11] - p[5]
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz)
    if (len < 1e-9) return
    nx /= len
    ny /= len
    nz /= len
    const flip = nx * hx + ny * hy + nz * hz < 0
    if (flip) {
      nx = -nx
      ny = -ny
      nz = -nz
    }
    const first = this.count
    for (let i = 0; i < 12; i += 3) {
      this.pos.push(p[i], p[i + 1], p[i + 2])
      this.nor.push(nx, ny, nz)
      this.col.push(c[0], c[1], c[2])
    }
    this.count += 4
    if (flip) this.idx.push(first, first + 2, first + 1, first, first + 3, first + 2)
    else this.idx.push(first, first + 1, first + 2, first, first + 2, first + 3)
  }

  /** An upright box: centre (x, z), half extents along (dx, dz) and across it, from y0 to y1. */
  box(
    x: number,
    z: number,
    dx: number,
    dz: number,
    along: number,
    across: number,
    y0: number,
    y1: number,
    c: RGB,
  ): void {
    const ax = dx * along
    const az = dz * along
    const bx = -dz * across
    const bz = dx * across
    const corners = [
      [x - ax - bx, z - az - bz],
      [x + ax - bx, z + az - bz],
      [x + ax + bx, z + az + bz],
      [x - ax + bx, z - az + bz],
    ]
    for (let i = 0; i < 4; i++) {
      const [px, pz] = corners[i]
      const [qx, qz] = corners[(i + 1) % 4]
      this.quad(
        [px, y0, pz, qx, y0, qz, qx, y1, qz, px, y1, pz],
        (px + qx) / 2 - x,
        0,
        (pz + qz) / 2 - z,
        c,
      )
    }
    // Boxes that hang in the air (pier crossheads) are seen from below.
    if (y0 > 0.05)
      this.quad(
        corners.flatMap(([px, pz]) => [px, y0, pz]),
        0,
        -1,
        0,
        c,
      )
  }

  finish(): FlatMesh {
    return {
      positions: new Float32Array(this.pos),
      normals: new Float32Array(this.nor),
      colors: new Float32Array(this.col),
      indices: new Uint32Array(this.idx),
    }
  }
}

/** Join pieces that simply continue one another, so corners between them can be mitred. */
function stitch(zone: ZoneFile): Chain[] {
  const q = zone.q
  const pieces: Chain[] = zone.roads
    .filter((road) => road.e !== undefined)
    .map((road) => ({
      kind: road.k,
      width: road.w,
      line: road.p.map((value) => value / q),
      e: road.e!.map((value) => value / q),
      bridge: new Array<boolean>(road.p.length / 2 - 1).fill(road.br === 1),
      original: new Array<boolean>(road.p.length / 2).fill(true),
    }))

  const key = (x: number, z: number) => `${Math.round(x * q)},${Math.round(z * q)}`
  const endKey = (c: Chain, atEnd: boolean) => {
    const i = atEnd ? c.line.length - 2 : 0
    return key(c.line[i], c.line[i + 1])
  }
  /** Unit direction pointing out of the chain at one of its ends. */
  const outward = (c: Chain, atEnd: boolean): [number, number] => {
    const n = c.line.length
    const [ax, az, bx, bz] = atEnd
      ? [c.line[n - 4], c.line[n - 3], c.line[n - 2], c.line[n - 1]]
      : [c.line[2], c.line[3], c.line[0], c.line[1]]
    const len = Math.hypot(bx - ax, bz - az) || 1
    return [(bx - ax) / len, (bz - az) / len]
  }
  const reverse = (c: Chain) => {
    const line: number[] = []
    for (let i = c.line.length - 2; i >= 0; i -= 2) line.push(c.line[i], c.line[i + 1])
    c.line = line
    c.e.reverse()
    c.bridge.reverse()
    c.original.reverse()
  }

  let merged = true
  while (merged) {
    merged = false
    const ends = new Map<string, { chain: Chain; atEnd: boolean }[]>()
    for (const chain of pieces) {
      for (const atEnd of [false, true]) {
        const k = endKey(chain, atEnd)
        const list = ends.get(k)
        if (list) list.push({ chain, atEnd })
        else ends.set(k, [{ chain, atEnd }])
      }
    }
    for (const list of ends.values()) {
      if (list.length !== 2) continue // a real junction (or a dead end)
      const [a, b] = list
      if (a.chain === b.chain) continue
      if (a.chain.kind !== b.chain.kind || Math.abs(a.chain.width - b.chain.width) > 2.5) continue
      const da = outward(a.chain, a.atEnd)
      const db = outward(b.chain, b.atEnd)
      if (da[0] * db[0] + da[1] * db[1] > -0.5) continue // a sharp turn: leave as a junction
      // Arrange as: a ...end] [start... b
      if (!a.atEnd) reverse(a.chain)
      if (b.atEnd) reverse(b.chain)
      a.chain.line.push(...b.chain.line.slice(2))
      a.chain.e.push(...b.chain.e.slice(1))
      a.chain.bridge.push(...b.chain.bridge)
      a.chain.original.push(...b.chain.original.slice(1))
      a.chain.width = Math.max(a.chain.width, b.chain.width)
      pieces.splice(pieces.indexOf(b.chain), 1)
      merged = true
      break // the end map is stale now; rebuild it
    }
  }
  return pieces
}

function resample(chain: Chain): void {
  const line: number[] = []
  const e: number[] = []
  const bridge: boolean[] = []
  const original: boolean[] = []
  const n = chain.line.length / 2
  for (let i = 0; i < n - 1; i++) {
    const ax = chain.line[i * 2]
    const az = chain.line[i * 2 + 1]
    const bx = chain.line[i * 2 + 2]
    const bz = chain.line[i * 2 + 3]
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / MAX_SEGMENT))
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      line.push(ax + (bx - ax) * t, az + (bz - az) * t)
      e.push(chain.e[i] + (chain.e[i + 1] - chain.e[i]) * t)
      bridge.push(chain.bridge[i])
      original.push(s === 0 && chain.original[i])
    }
  }
  line.push(chain.line[(n - 1) * 2], chain.line[(n - 1) * 2 + 1])
  e.push(chain.e[n - 1])
  original.push(chain.original[n - 1])
  chain.line = line
  chain.e = e
  chain.bridge = bridge
  chain.original = original
}

export function buildRaisedRoads(zone: ZoneFile): FlatMesh {
  const w = new SolidWriter()
  const chains = stitch(zone)
  chains.forEach(resample)

  // ---- junctions: where the end of one chain meets another chain, barriers must open up
  const q = zone.q
  const key = (x: number, z: number) => `${Math.round(x * q)},${Math.round(z * q)}`
  const dists = new Map<Chain, number[]>()
  const vertexAt = new Map<string, { chain: Chain; i: number }[]>()
  for (const chain of chains) {
    dists.set(chain, cumulativeLength(chain.line))
    for (let i = 0; i < chain.original.length; i++) {
      if (!chain.original[i]) continue
      const k = key(chain.line[i * 2], chain.line[i * 2 + 1])
      const list = vertexAt.get(k)
      if (list) list.push({ chain, i })
      else vertexAt.set(k, [{ chain, i }])
    }
  }
  /** Per chain: no barriers at all on these segments (the mouth of a ramp). */
  const noBarrier = new Map<Chain, Set<number>>()
  /** Per chain: barrier removed on one side. +1 = left of travel, -1 = right. */
  const openSide = new Map<Chain, Map<number, number>>()
  for (const chain of chains) {
    noBarrier.set(chain, new Set())
    openSide.set(chain, new Map())
  }
  for (const chain of chains) {
    const n = chain.line.length / 2
    const dist = dists.get(chain)!
    const clearance = isFoot(chain.kind) ? 2.5 : JUNCTION_CLEARANCE
    for (const atEnd of [false, true]) {
      const i = atEnd ? n - 1 : 0
      if (chain.e[i] < 0.3) continue
      const j = atEnd ? n - 2 : 1
      const leaveX = chain.line[j * 2] - chain.line[i * 2]
      const leaveZ = chain.line[j * 2 + 1] - chain.line[i * 2 + 1]
      const leaveLen = Math.hypot(leaveX, leaveZ) || 1
      let merges = false
      for (const other of vertexAt.get(key(chain.line[i * 2], chain.line[i * 2 + 1])) ?? []) {
        if (other.chain === chain) continue
        const on = other.chain.line.length / 2
        const a = Math.max(0, other.i - 1)
        const b = Math.min(on - 1, other.i + 1)
        const dirX = other.chain.line[b * 2] - other.chain.line[a * 2]
        const dirZ = other.chain.line[b * 2 + 1] - other.chain.line[a * 2 + 1]
        // "Left" is +90° from the direction of travel: (-dz, dx).
        const sideways =
          (-dirZ * leaveX + dirX * leaveZ) / ((Math.hypot(dirX, dirZ) || 1) * leaveLen)
        const otherEnds = other.i === 0 || other.i === on - 1
        if (otherEnds && Math.abs(sideways) < 0.35) continue // one road carrying straight on into the next
        merges = true
        // Open the other chain's barrier on the side this one leaves from.
        const side = Math.sign(sideways) || 1
        const odist = dists.get(other.chain)!
        const reach = chain.width / 2 + (isFoot(chain.kind) ? 0.5 : 5)
        for (let s = 0; s < on - 1; s++) {
          const mid = (odist[s] + odist[s + 1]) / 2
          if (Math.abs(mid - odist[other.i]) < reach) {
            const sides = openSide.get(other.chain)!
            sides.set(s, sides.has(s) && sides.get(s) !== side ? 0 : side)
          }
        }
      }
      // Keep this chain's own mouth clear where it runs across the other deck.
      if (!merges) continue
      for (let s = 0; s < n - 1; s++) {
        const mid = (dist[s] + dist[s + 1]) / 2
        if ((atEnd ? dist[n - 1] - mid : mid) < clearance) noBarrier.get(chain)!.add(s)
      }
    }
  }

  // ---- geometry
  for (const chain of chains) {
    const n = chain.line.length / 2
    const foot = isFoot(chain.kind)
    const half = chain.width / 2
    const thickness = foot ? 0.35 : 1.3
    const barrierHeight = foot ? 1.1 : 0.9
    const barrierWidth = foot ? 0.12 : 0.3
    const deckColour = DECK_COLOUR[chain.kind]
    const concrete = GROUND.concrete
    const shade = GROUND.concreteDark
    const outer = ribbonEdges(chain.line, half)
    const inner = ribbonEdges(chain.line, half - barrierWidth)
    const dist = dists.get(chain)!
    const clear = noBarrier.get(chain)!
    const open = openSide.get(chain)!

    const solidAt = (s: number) =>
      chain.kind === 'steps' ||
      (!chain.bridge[s] && Math.max(chain.e[s], chain.e[s + 1]) <= SOLID_MAX_HEIGHT)
    const undersideAt = (i: number, solid: boolean) => (solid ? 0 : chain.e[i] - thickness)

    /** A wall across the full width under the deck at vertex i, closing a solid wedge. */
    const endWall = (i: number, facing: number) => {
      if (chain.e[i] < 0.3) return
      // Direction of travel at vertex i, pointed out of the wedge.
      const a = Math.max(0, i - 1)
      const b = Math.min(n - 1, i + 1)
      const hx = (chain.line[b * 2] - chain.line[a * 2]) * facing
      const hz = (chain.line[b * 2 + 1] - chain.line[a * 2 + 1]) * facing
      const y = chain.e[i] + LIFT
      w.quad(
        [
          outer[i * 4],
          0,
          outer[i * 4 + 1],
          outer[i * 4 + 2],
          0,
          outer[i * 4 + 3],
          outer[i * 4 + 2],
          y,
          outer[i * 4 + 3],
          outer[i * 4],
          y,
          outer[i * 4 + 1],
        ],
        hx,
        0,
        hz,
        shade,
      )
    }

    for (let s = 0; s < n - 1; s++) {
      const i0 = s
      const i1 = s + 1
      const y0 = chain.e[i0] + LIFT
      const y1 = chain.e[i1] + LIFT
      const solid = solidAt(s)
      const b0 = undersideAt(i0, solid)
      const b1 = undersideAt(i1, solid)
      const lx0 = outer[i0 * 4]
      const lz0 = outer[i0 * 4 + 1]
      const rx0 = outer[i0 * 4 + 2]
      const rz0 = outer[i0 * 4 + 3]
      const lx1 = outer[i1 * 4]
      const lz1 = outer[i1 * 4 + 1]
      const rx1 = outer[i1 * 4 + 2]
      const rz1 = outer[i1 * 4 + 3]
      // Sideways direction: from the right edge to the left edge.
      const sx = lx0 - rx0
      const sz = lz0 - rz0

      // Deck surface.
      w.quad([lx0, y0, lz0, lx1, y1, lz1, rx1, y1, rz1, rx0, y0, rz0], 0, 1, 0, deckColour)
      // Underside of a span.
      if (!solid) w.quad([lx0, b0, lz0, lx1, b1, lz1, rx1, b1, rz1, rx0, b0, rz0], 0, -1, 0, shade)

      const high = Math.max(chain.e[i0], chain.e[i1]) >= BARRIER_MIN_HEIGHT
      const barriers = high && !clear.has(s)
      const opened = open.get(s)
      for (const side of [1, -1]) {
        const left = side === 1
        const ox0 = left ? lx0 : rx0
        const oz0 = left ? lz0 : rz0
        const ox1 = left ? lx1 : rx1
        const oz1 = left ? lz1 : rz1
        const barrier = barriers && opened !== side && opened !== 0
        const t0 = y0 + (barrier ? barrierHeight : 0)
        const t1 = y1 + (barrier ? barrierHeight : 0)
        // Outer face: the edge of the deck (or the retaining wall of a solid ramp) and the barrier above it.
        if (t0 - b0 > 0.01 || t1 - b1 > 0.01) {
          w.quad(
            [ox0, b0, oz0, ox1, b1, oz1, ox1, t1, oz1, ox0, t0, oz0],
            sx * side,
            0,
            sz * side,
            concrete,
          )
        }
        if (!barrier) continue
        const ix0 = inner[i0 * 4 + (left ? 0 : 2)]
        const iz0 = inner[i0 * 4 + (left ? 1 : 3)]
        const ix1 = inner[i1 * 4 + (left ? 0 : 2)]
        const iz1 = inner[i1 * 4 + (left ? 1 : 3)]
        w.quad(
          [ix0, y0, iz0, ix1, y1, iz1, ix1, t1, iz1, ix0, t0, iz0],
          -sx * side,
          0,
          -sz * side,
          concrete,
        )
        w.quad(
          [ox0, t0, oz0, ox1, t1, oz1, ix1, t1, iz1, ix0, t0, iz0],
          0,
          1,
          0,
          scale(concrete, 1.08),
        )
      }

      // Close the open end of a solid wedge where it meets a span, or where the chain stops.
      if (solid) {
        if (s === 0 || !solidAt(s - 1)) endWall(i0, -1)
        if (s === n - 2 || !solidAt(s + 1)) endWall(i1, 1)
      }
    }

    // ---- piers under the spans
    // TODO(roads): keep piers out of the carriageways they stand over.
    const spacing = foot ? 18 : 30
    for (let at = spacing / 2; at < dist[n - 1]; at += spacing) {
      let s = 0
      while (s < n - 2 && dist[s + 1] < at) s++
      if (solidAt(s)) continue
      const t = (at - dist[s]) / (dist[s + 1] - dist[s] || 1)
      const x = chain.line[s * 2] + (chain.line[s * 2 + 2] - chain.line[s * 2]) * t
      const z = chain.line[s * 2 + 1] + (chain.line[s * 2 + 3] - chain.line[s * 2 + 1]) * t
      const top = chain.e[s] + (chain.e[s + 1] - chain.e[s]) * t - thickness
      if (top < 1.5) continue
      const len = dist[s + 1] - dist[s] || 1
      const dx = (chain.line[s * 2 + 2] - chain.line[s * 2]) / len
      const dz = (chain.line[s * 2 + 3] - chain.line[s * 2 + 1]) / len
      if (foot) {
        w.box(x, z, dx, dz, 0.3, 0.3, 0, top, concrete)
      } else {
        w.box(x, z, dx, dz, 0.9, Math.min(half * 0.45, 1.6), 0, top - 1, concrete)
        w.box(x, z, dx, dz, 1.1, half * 0.9, top - 1, top, concrete) // crosshead
      }
    }
  }
  return w.finish()
}
