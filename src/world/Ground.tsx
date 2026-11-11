/**
 * The ground: one big earth-coloured plane, with roads, parks and water painted on top
 * as a single decal mesh. Phase 1 Nairobi is flat; see docs/ROADMAP.md for terrain.
 *
 * TODO(terrain): the CBD really falls about 30 m from Upper Hill down to the Nairobi
 * River. Add a heightfield (SRTM) and drape the decals over it.
 */
import { useEffect, useMemo } from 'react'
import { toBufferGeometry } from './geometry/toBufferGeometry'
import { createDecalMaterial, createEarthMaterial } from './materials/groundMaterials'
import { useStaticColliders } from './physics/useStaticColliders'
import type { LoadedZone } from './zone/loadZone'

/** The plane runs far past the zone so the horizon is never empty; fog hides the rest. */
const GROUND_SIZE = 16_000

export function Ground({ zone }: { zone: LoadedZone }) {
  const earth = useMemo(() => createEarthMaterial(zone.file.bounds), [zone])
  const paint = useMemo(() => createDecalMaterial(), [])
  const decals = useMemo(() => toBufferGeometry(zone.geometry.ground), [zone])

  useEffect(() => () => decals.dispose(), [decals])
  useEffect(
    () => () => {
      earth.dispose()
      paint.dispose()
    },
    [earth, paint],
  )

  const [minX, minZ, maxX, maxZ] = zone.file.bounds
  const centreX = (minX + maxX) / 2
  const centreZ = (minZ + maxZ) / 2

  // The ground is an infinite plane, solid all the way down. (A box big enough to cover
  // the map would be so large that collision maths against it loses precision, and the
  // player ends up standing a hand's width inside it.)
  useStaticColliders(
    (rapier) => [new rapier.ColliderDesc(new rapier.HalfSpace({ x: 0, y: 1, z: 0 }))],
    [],
  )

  return (
    <group name="ground">
      <mesh
        position={[centreX, 0, centreZ]}
        rotation-x={-Math.PI / 2}
        material={earth}
        receiveShadow
      >
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
      </mesh>
      {/* renderOrder 1: painted after everything solid, so the depth test can sort it out. */}
      <mesh geometry={decals} material={paint} renderOrder={1} receiveShadow />
    </group>
  )
}
