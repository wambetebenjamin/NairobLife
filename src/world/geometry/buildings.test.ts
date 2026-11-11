import { describe, expect, it } from 'vitest'
import { loadBakedZone } from '../../testing/zoneFixture'
import type { ZoneBuilding } from '../zone/format'
import { buildBuildingMesh, styleFor, type BuildingMesh } from './buildings'

/** Counts triangles whose winding disagrees with their vertex normals (they would render inside out). */
function insideOut(mesh: BuildingMesh): number {
  const { positions: p, normals: n, indices } = mesh
  let bad = 0
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3
    const b = indices[t + 1] * 3
    const c = indices[t + 2] * 3
    const ux = p[b] - p[a]
    const uy = p[b + 1] - p[a + 1]
    const uz = p[b + 2] - p[a + 2]
    const vx = p[c] - p[a]
    const vy = p[c + 1] - p[a + 1]
    const vz = p[c + 2] - p[a + 2]
    const fx = uy * vz - uz * vy
    const fy = uz * vx - ux * vz
    const fz = ux * vy - uy * vx
    if (fx * n[a] + fy * n[a + 1] + fz * n[a + 2] < 0) bad++
  }
  return bad
}

describe('building meshes', () => {
  // A 10 m x 20 m box, 12 m tall, in the zone format: decimetres, and wound the way the
  // format calls "outer" (positive signed area).
  const box: ZoneBuilding = { id: 42, p: [0, 0, 100, 0, 100, 200, 0, 200], h: 12 }

  it('builds a closed box with outward-facing walls and an upward roof', () => {
    const mesh = buildBuildingMesh([box], 10)
    expect(insideOut(mesh)).toBe(0)

    const { positions, normals } = mesh
    let minY = Infinity
    let maxY = -Infinity
    for (let i = 0; i < positions.length; i += 3) {
      minY = Math.min(minY, positions[i + 1])
      maxY = Math.max(maxY, positions[i + 1])
      // Wall normals point away from the centre of the box (5, 10).
      if (normals[i + 1] === 0) {
        const outward = (positions[i] - 5) * normals[i] + (positions[i + 2] - 10) * normals[i + 2]
        expect(outward).toBeGreaterThan(0)
      }
    }
    expect(minY).toBe(0)
    expect(maxY).toBe(12)
  })

  it('gives every wall whole window bays and whole floors', () => {
    const { uvs } = buildBuildingMesh([box], 10)
    for (const value of uvs) expect(Number.isInteger(value)).toBe(true)
  })

  it('is deterministic: the same building always looks the same', () => {
    expect(styleFor(box)).toEqual(styleFor({ ...box }))
  })

  it('keeps shop fronts off courts and ministries', () => {
    const court: ZoneBuilding = { ...box, n: 'Milimani Law Courts' }
    expect(styleFor(court).shop).toBe(0)
  })

  it('builds the whole CBD without inside-out faces or bad numbers', () => {
    const zone = loadBakedZone()
    const mesh = buildBuildingMesh(zone.buildings, zone.q)
    expect(mesh.indices.length / 3).toBeGreaterThan(40_000)
    expect(insideOut(mesh)).toBe(0)
    expect(mesh.positions.every(Number.isFinite)).toBe(true)
    expect(mesh.normals.every(Number.isFinite)).toBe(true)
    let maxIndex = 0
    for (const index of mesh.indices) maxIndex = Math.max(maxIndex, index)
    expect(maxIndex).toBeLessThan(mesh.positions.length / 3)
  })
})
