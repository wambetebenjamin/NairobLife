import { describe, expect, it } from 'vitest'
import { MeshLambertMaterial, PlaneGeometry, DoubleSide, BufferAttribute } from 'three'
import { buildParkTerrain } from './parkTerrain'

/**
 * The park's ground is a displaced plane. Getting the order wrong -- displacing Y before
 * rotating the plane flat -- produces geometry whose normals are all zero, which lights pure
 * black and reads as a missing mesh rather than a lighting bug. It cost a long time to find,
 * so it is pinned against the real module rather than a copy of it.
 */
const terrain = buildParkTerrain()
const geometry = terrain.geometry as PlaneGeometry
const normal = geometry.getAttribute('normal')
const position = geometry.getAttribute('position')

const zeroNormals = () => {
  let zeros = 0
  for (let i = 0; i < normal.count; i++)
    if (Math.abs(normal.getX(i)) + Math.abs(normal.getY(i)) + Math.abs(normal.getZ(i)) < 1e-6)
      zeros++
  return zeros
}

describe('park terrain', () => {
  it('has real upward normals, so the ground is lit rather than black', () => {
    expect(normal.count).toBeGreaterThan(4000)
    expect(zeroNormals()).toBe(0)
    for (let i = 0; i < normal.count; i++) expect(normal.getY(i)).toBeGreaterThan(0.5)
  })

  it('is flat where the animals stand and under the skyline', () => {
    for (let i = 0; i < position.count; i++) {
      const r = Math.hypot(position.getX(i), position.getZ(i))
      if (r < 16 || r > 82) expect(Math.abs(position.getY(i))).toBeLessThan(0.02)
      expect(Math.abs(position.getY(i))).toBeLessThan(1)
    }
  })

  it('is drawn from both sides, so it cannot vanish as the tour camera swings round', () => {
    expect((terrain.material as MeshLambertMaterial).side).toBe(DoubleSide)
  })

  it('would be black if the plane were displaced before being rotated flat', () => {
    // The actual bug, reproduced: this is what the previous code did.
    const wrong = new PlaneGeometry(210, 210, 64, 64)
    const p = wrong.getAttribute('position') as BufferAttribute
    for (let i = 0; i < p.count; i++) p.setY(i, Math.sin(p.getX(i) * 0.05) * 0.85)
    wrong.computeVertexNormals()
    const n = wrong.getAttribute('normal')
    let zeros = 0
    for (let i = 0; i < n.count; i++)
      if (Math.abs(n.getX(i)) + Math.abs(n.getY(i)) + Math.abs(n.getZ(i)) < 1e-6) zeros++
    expect(zeros).toBe(n.count)
  })
})
