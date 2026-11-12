/**
 * Polyline helpers for the bake: simplification and clipping that carry a height per
 * vertex along with them (for bridge decks and ramps).
 */
import type { Rect } from '../../../src/core/geom2d'

export interface P3 {
  x: number
  z: number
  /** Height above ground in metres. */
  e: number
  /** Never simplify this vertex away (junctions with other roads). */
  keep?: boolean
}

function distToSegment3(p: P3, a: P3, b: P3): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const de = b.e - a.e
  const lenSq = dx * dx + dz * dz + de * de
  let t = lenSq > 0 ? ((p.x - a.x) * dx + (p.z - a.z) * dz + (p.e - a.e) * de) / lenSq : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(a.x + t * dx - p.x, a.z + t * dz - p.z, a.e + t * de - p.e)
}

/** Douglas-Peucker in (x, z, height). End points and `keep` vertices always survive. */
export function simplifyLine(points: readonly P3[], tolerance: number): P3[] {
  const n = points.length
  if (n <= 2) return points.slice()
  const keep = new Uint8Array(n)
  keep[0] = keep[n - 1] = 1
  for (let i = 1; i < n - 1; i++) if (points[i].keep) keep[i] = 1

  const stack: [number, number][] = []
  let anchor = 0
  for (let i = 1; i < n; i++) {
    if (keep[i]) {
      stack.push([anchor, i])
      anchor = i
    }
  }
  while (stack.length) {
    const [a, b] = stack.pop()!
    let worst = -1
    let worstDist = tolerance
    for (let i = a + 1; i < b; i++) {
      const d = distToSegment3(points[i], points[a], points[b])
      if (d > worstDist) {
        worstDist = d
        worst = i
      }
    }
    if (worst >= 0) {
      keep[worst] = 1
      stack.push([a, worst], [worst, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

/**
 * Clip a polyline to a rectangle (Liang-Barsky per segment). A line that leaves and comes
 * back yields several pieces. Heights are interpolated at the cut points.
 */
export function clipLine(points: readonly P3[], rect: Rect): P3[][] {
  const pieces: P3[][] = []
  let current: P3[] = []
  const flush = () => {
    if (current.length >= 2) pieces.push(current)
    current = []
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const dx = b.x - a.x
    const dz = b.z - a.z
    let t0 = 0
    let t1 = 1
    let visible = true
    const tests: [number, number][] = [
      [-dx, a.x - rect.minX],
      [dx, rect.maxX - a.x],
      [-dz, a.z - rect.minZ],
      [dz, rect.maxZ - a.z],
    ]
    for (const [p, q] of tests) {
      if (p === 0) {
        if (q < 0) {
          visible = false
          break
        }
      } else {
        const r = q / p
        if (p < 0) {
          if (r > t1) {
            visible = false
            break
          }
          if (r > t0) t0 = r
        } else {
          if (r < t0) {
            visible = false
            break
          }
          if (r < t1) t1 = r
        }
      }
    }
    if (!visible) {
      flush()
      continue
    }
    const at = (t: number): P3 =>
      t === 0 ? a : t === 1 ? b : { x: a.x + dx * t, z: a.z + dz * t, e: a.e + (b.e - a.e) * t }
    if (t0 > 0) flush() // entered the rectangle part-way along this segment
    if (current.length === 0) current.push(at(t0))
    current.push(at(t1))
    if (t1 < 1) flush() // left the rectangle
  }
  flush()
  return pieces
}

export function lineLength(points: readonly P3[]): number {
  let len = 0
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z)
  }
  return len
}

/**
 * Drop near-collinear vertices from a closed ring (flat [x, z, ...]) in one pass.
 * Each vertex is tested against the line from the previous *kept* vertex to the next one,
 * so a run of tiny steps cannot erode a curve.
 */
export function simplifyRing(ring: readonly number[], tolerance: number): number[] {
  const n = ring.length / 2
  if (n <= 3) return Array.from(ring)
  const out: number[] = []
  let removed = 0
  for (let i = 0; i < n; i++) {
    const hasPrev = out.length >= 2
    const ax = hasPrev ? out[out.length - 2] : ring[(n - 1) * 2]
    const az = hasPrev ? out[out.length - 1] : ring[(n - 1) * 2 + 1]
    const cx = ring[i * 2]
    const cz = ring[i * 2 + 1]
    const bx = ring[((i + 1) % n) * 2]
    const bz = ring[((i + 1) % n) * 2 + 1]
    const dx = bx - ax
    const dz = bz - az
    const len = Math.hypot(dx, dz)
    const dist =
      len > 1e-9 ? Math.abs((cx - ax) * dz - (cz - az) * dx) / len : Math.hypot(cx - ax, cz - az)
    if (dist < tolerance && n - removed > 3) {
      removed++
      continue
    }
    out.push(cx, cz)
  }
  return out
}
