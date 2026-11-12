/**
 * Every building in the zone: one mesh per 400 m chunk, all sharing one material.
 *
 * The same triangles double as the collision shape, so what you see is exactly what you
 * bump into (and what you can stand on, if you find a way up).
 */
import { useEffect, useMemo } from 'react'
import { toBufferGeometry } from './geometry/toBufferGeometry'
import { createBuildingMaterial } from './materials/buildingMaterial'
import { useStaticColliders } from './physics/useStaticColliders'
import type { BuildingChunk } from './zone/protocol'

export function Buildings({ chunks }: { chunks: BuildingChunk[] }) {
  const material = useMemo(() => createBuildingMaterial(), [])
  const geometries = useMemo(() => chunks.map((chunk) => toBufferGeometry(chunk.mesh)), [chunks])

  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries])
  useEffect(() => () => material.dispose(), [material])

  useStaticColliders(
    (rapier) =>
      chunks
        .filter((chunk) => chunk.mesh.indices.length > 0)
        .map((chunk) => rapier.ColliderDesc.trimesh(chunk.mesh.positions, chunk.mesh.indices)),
    [chunks],
  )

  return (
    <group name="buildings">
      {chunks.map((chunk, i) => (
        <mesh
          key={`${chunk.cx},${chunk.cz}`}
          geometry={geometries[i]}
          material={material}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  )
}
