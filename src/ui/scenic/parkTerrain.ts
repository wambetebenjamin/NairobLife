/** The park diorama's ground, kept out of the component so it can be tested on its own. */
import { BufferAttribute, DoubleSide, Mesh, MeshLambertMaterial, PlaneGeometry } from 'three'

export const TERRAIN_SIZE = 210
export const TERRAIN_SEGMENTS = 64

/**
 * A gently rolling ground for the park.
 *
 * The order of operations matters. A `PlaneGeometry` lies in its own XY plane, so displacing
 * Y first and rotating the mesh afterwards leaves every triangle edge-on to the plane it was
 * generated from. `computeVertexNormals()` then returns all zeros -- 4,225 of 4,225 -- and
 * the ground is lit pure black, which reads as a missing mesh rather than a lighting bug.
 * Rotating the geometry flat *before* displacing it gives correct upward normals.
 *
 * The displacement is a band, not a slope: flat where the animals stand, rolling between
 * 18 m and 62 m, and flat again under the skyline so the towers neither sink in nor float.
 */
export function buildParkTerrain(): Mesh {
  const geometry = new PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS)
  geometry.rotateX(-Math.PI / 2)
  const position = geometry.getAttribute('position') as BufferAttribute
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const z = position.getZ(i)
    const r = Math.hypot(x, z)
    const band = Math.min(1, Math.max(0, (r - 18) / 16)) * Math.min(1, Math.max(0, (78 - r) / 22))
    position.setY(i, Math.sin(x * 0.05) * Math.cos(z * 0.055) * band * 0.85)
  }
  geometry.computeVertexNormals()
  // DoubleSide: a plane is invisible from behind, and the tour camera swings around.
  return new Mesh(geometry, new MeshLambertMaterial({ color: '#9c814a', side: DoubleSide }))
}
