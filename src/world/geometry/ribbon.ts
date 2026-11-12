/**
 * Polyline -> ribbon. Shared by flat ground roads and by raised decks.
 */

/**
 * Left and right edge of a ribbon around a polyline, with mitred corners.
 * Input is flat [x0, z0, x1, z1, ...]; output is flat [lx, lz, rx, rz] per input vertex.
 * "Left" is +90° from the direction of travel in the (x, z) plane.
 */
export function ribbonEdges(line: ArrayLike<number>, halfWidth: number): number[] {
  const n = line.length / 2
  const out: number[] = new Array(n * 4)
  let prevNx = 0
  let prevNz = 0
  for (let i = 0; i < n; i++) {
    let nx = prevNx
    let nz = prevNz
    let hasNext = false
    if (i < n - 1) {
      const dx = line[(i + 1) * 2] - line[i * 2]
      const dz = line[(i + 1) * 2 + 1] - line[i * 2 + 1]
      const len = Math.hypot(dx, dz)
      if (len > 1e-9) {
        nx = -dz / len
        nz = dx / len
        hasNext = true
      }
    }
    let mx = nx
    let mz = nz
    let stretch = 1
    if (i > 0 && hasNext) {
      // Mitre: bisect the two segment normals and lengthen to keep the width constant.
      mx = prevNx + nx
      mz = prevNz + nz
      const len = Math.hypot(mx, mz)
      if (len > 1e-6) {
        mx /= len
        mz /= len
        stretch = 1 / Math.max(mx * nx + mz * nz, 0.4) // cap spikes on hairpins
      } else {
        mx = nx
        mz = nz
      }
    }
    const x = line[i * 2]
    const z = line[i * 2 + 1]
    const k = halfWidth * stretch
    out[i * 4] = x + mx * k
    out[i * 4 + 1] = z + mz * k
    out[i * 4 + 2] = x - mx * k
    out[i * 4 + 3] = z - mz * k
    if (hasNext) {
      prevNx = nx
      prevNz = nz
    }
  }
  return out
}

/** Distance along a polyline at each vertex. */
export function cumulativeLength(line: ArrayLike<number>): number[] {
  const n = line.length / 2
  const out = new Array<number>(n)
  out[0] = 0
  for (let i = 1; i < n; i++) {
    out[i] =
      out[i - 1] +
      Math.hypot(line[i * 2] - line[(i - 1) * 2], line[i * 2 + 1] - line[(i - 1) * 2 + 1])
  }
  return out
}
