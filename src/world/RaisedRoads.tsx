/**
 * Flyovers, ramps and footbridges: the Nairobi Expressway deck, the Murang'a Road
 * viaduct at Globe Roundabout, the Museum Hill ramps. Solid, so you can walk on them
 * and under them.
 */
import { useEffect, useMemo } from 'react'
import { toBufferGeometry } from './geometry/toBufferGeometry'
import { createStructureMaterial } from './materials/groundMaterials'
import { useStaticColliders } from './physics/useStaticColliders'
import type { FlatMesh } from './geometry/ground'

export function RaisedRoads({ mesh }: { mesh: FlatMesh }) {
  const material = useMemo(() => createStructureMaterial(), [])
  const geometry = useMemo(() => toBufferGeometry(mesh), [mesh])

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  useStaticColliders(
    (rapier) =>
      mesh.indices.length > 0 ? [rapier.ColliderDesc.trimesh(mesh.positions, mesh.indices)] : [],
    [mesh],
  )

  if (mesh.indices.length === 0) return null
  return (
    <mesh name="raised-roads" geometry={geometry} material={material} castShadow receiveShadow />
  )
}
