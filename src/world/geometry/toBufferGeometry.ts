/**
 * Wraps the plain typed arrays produced by the geometry builders (which run in a worker
 * and know nothing about three.js) into a three.js BufferGeometry.
 */
import { BufferAttribute, BufferGeometry } from 'three'

interface MeshArrays {
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  indices: Uint32Array
  uvs?: Float32Array
  facades?: Float32Array
}

export function toBufferGeometry(mesh: MeshArrays): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3))
  geometry.setAttribute('color', new BufferAttribute(mesh.colors, 3))
  if (mesh.uvs) geometry.setAttribute('uv', new BufferAttribute(mesh.uvs, 2))
  if (mesh.facades) geometry.setAttribute('facade', new BufferAttribute(mesh.facades, 3))
  geometry.setIndex(new BufferAttribute(mesh.indices, 1))
  // Needed for frustum culling: off-screen chunks are skipped entirely.
  geometry.computeBoundingSphere()
  geometry.computeBoundingBox()
  return geometry
}
