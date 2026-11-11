/**
 * Small 2D geometry kit on the ground plane (x east, z south).
 *
 * Shapes are flat number arrays [x0, z0, x1, z1, ...] to match the baked zone format and
 * to keep the hot paths (point-in-polygon for "where am I", minimap culling) allocation
 * free. Rings are open: the first point is not repeated at the end.
 *
 * DOM-free: used by the game, the zone worker and the Node bake script.
 */

export type Flat = ArrayLike<number>

export interface Rect {
  minX: number
  minZ: number
  maxX: number
  maxZ: number
}

/** Twice-area sign convention: positive for the winding the zone format calls "outer". */
export function signedArea(ring: Flat): number {
  const n = ring.length
  let sum = 0
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n
    sum += ring[i] * ring[j + 1] - ring[j] * ring[i + 1]
  }
  return sum / 2
}

/** Area-weighted centroid, falling back to the vertex average for slivers. */
export function ringCentroid(ring: Flat): [number, number] {
  const n = ring.length
  let a = 0
  let cx = 0
  let cz = 0
  for (let i = 0; i < n; i += 2) {
    const j = (i + 2) % n
    const cross = ring[i] * ring[j + 1] - ring[j] * ring[i + 1]
    a += cross
    cx += (ring[i] + ring[j]) * cross
    cz += (ring[i + 1] + ring[j + 1]) * cross
  }
  if (Math.abs(a) < 1e-9) {
    let sx = 0
    let sz = 0
    for (let i = 0; i < n; i += 2) {
      sx += ring[i]
      sz += ring[i + 1]
    }
    return [sx / (n / 2), sz / (n / 2)]
  }
  return [cx / (3 * a), cz / (3 * a)]
}

export function ringBounds(ring: Flat): Rect {
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  for (let i = 0; i < ring.length; i += 2) {
    const x = ring[i]
    const z = ring[i + 1]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  return { minX, minZ, maxX, maxZ }
}

/** Even-odd ray cast. Points exactly on an edge may land either side. */
export function pointInRing(x: number, z: number, ring: Flat): boolean {
  const n = ring.length
  let inside = false
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = ring[i]
    const zi = ring[i + 1]
    const xj = ring[j]
    const zj = ring[j + 1]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

export function pointInPolygon(
  x: number,
  z: number,
  outer: Flat,
  holes?: readonly Flat[],
): boolean {
  if (!pointInRing(x, z, outer)) return false
  if (holes) for (const hole of holes) if (pointInRing(x, z, hole)) return false
  return true
}

export function polylineLength(line: Flat): number {
  let len = 0
  for (let i = 2; i < line.length; i += 2) {
    len += Math.hypot(line[i] - line[i - 2], line[i + 1] - line[i - 1])
  }
  return len
}

/** Squared distance from P to segment AB. */
export function distToSegmentSq(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax
  const dz = bz - az
  const lenSq = dx * dx + dz * dz
  let t = lenSq > 0 ? ((px - ax) * dx + (pz - az) * dz) / lenSq : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const qx = ax + t * dx - px
  const qz = az + t * dz - pz
  return qx * qx + qz * qz
}

/** True when AB and CD cross at a single interior point (touching ends do not count). */
export function segmentsCross(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number,
): boolean {
  const d1 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx)
  const d2 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx)
  const d3 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax)
  const d4 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax)
  return d1 * d2 < 0 && d3 * d4 < 0
}

export function reverseRing(ring: Flat): number[] {
  const out: number[] = new Array(ring.length)
  const n = ring.length
  for (let i = 0; i < n; i += 2) {
    out[i] = ring[n - 2 - i]
    out[i + 1] = ring[n - 1 - i]
  }
  return out
}

/** Drop repeated neighbours (within eps), including a repeated closing point. */
export function cleanRing(ring: Flat, eps = 0): number[] {
  const out: number[] = []
  for (let i = 0; i < ring.length; i += 2) {
    const x = ring[i]
    const z = ring[i + 1]
    const m = out.length
    if (m >= 2 && Math.abs(out[m - 2] - x) <= eps && Math.abs(out[m - 1] - z) <= eps) continue
    out.push(x, z)
  }
  while (
    out.length >= 4 &&
    Math.abs(out[0] - out[out.length - 2]) <= eps &&
    Math.abs(out[1] - out[out.length - 1]) <= eps
  ) {
    out.length -= 2
  }
  return out
}

/**
 * Sutherland-Hodgman clip of a ring against an axis-aligned rectangle.
 * Concave rings that leave and re-enter can come back with edges running along the
 * boundary; that is fine for flat ground cover.
 */
export function clipRingToRect(ring: Flat, rect: Rect): number[] {
  let pts: number[] = Array.from(ring)
  const edges: [
    (x: number, z: number) => boolean,
    (ax: number, az: number, bx: number, bz: number) => [number, number],
  ][] = [
    [
      (x) => x >= rect.minX,
      (ax, az, bx, bz) => [rect.minX, az + ((bz - az) * (rect.minX - ax)) / (bx - ax)],
    ],
    [
      (x) => x <= rect.maxX,
      (ax, az, bx, bz) => [rect.maxX, az + ((bz - az) * (rect.maxX - ax)) / (bx - ax)],
    ],
    [
      (_x, z) => z >= rect.minZ,
      (ax, az, bx, bz) => [ax + ((bx - ax) * (rect.minZ - az)) / (bz - az), rect.minZ],
    ],
    [
      (_x, z) => z <= rect.maxZ,
      (ax, az, bx, bz) => [ax + ((bx - ax) * (rect.maxZ - az)) / (bz - az), rect.maxZ],
    ],
  ]
  for (const [inside, cut] of edges) {
    const n = pts.length
    if (n < 6) return []
    const out: number[] = []
    for (let i = 0; i < n; i += 2) {
      const j = (i + 2) % n
      const ax = pts[i]
      const az = pts[i + 1]
      const bx = pts[j]
      const bz = pts[j + 1]
      const aIn = inside(ax, az)
      const bIn = inside(bx, bz)
      if (aIn) out.push(ax, az)
      if (aIn !== bIn) out.push(...cut(ax, az, bx, bz))
    }
    pts = out
  }
  return pts.length >= 6 ? pts : []
}

export function rectContains(rect: Rect, x: number, z: number): boolean {
  return x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ
}
