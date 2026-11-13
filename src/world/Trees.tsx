/**
 * Trees, drawn with instancing: one draw call for wood and one for foliage.
 *
 * Every tree in the zone is baked into two merged meshes when the zone loads (see
 * geometry/trees.ts), so a few thousand of them cost two draw calls, not a few thousand
 * draw calls. Each is a real little model: a tapered, leaning trunk with fork branches,
 * and a canopy of overlapping lumps that carries the light on top and the shade
 * underneath. Palms get arcing fronds, acacias a flat umbrella, cypresses a spire.
 *
 * The foliage sways in the wind: one shared uniform and each tree's own position, so an
 * avenue moves together in a gust. Rain brings more wind with it.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry } from 'three'
import { useGame } from '../state/gameStore'
import { runtime } from '../state/runtime'
import { TREE_STRIDE, trunkRadius, type TreeChunk, type TreeMesh } from './geometry/trees'
import { createFoliageMaterial, foliageUniforms } from './materials/foliageMaterial'
import { useStaticColliders } from './physics/useStaticColliders'

/** A BufferGeometry from the plain arrays the tree builder made. */
function toGeometry(mesh: TreeMesh): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3))
  geometry.setAttribute('color', new BufferAttribute(mesh.colors, 3))
  geometry.setIndex(new BufferAttribute(mesh.indices, 1))
  geometry.computeBoundingSphere()
  geometry.computeBoundingBox()
  return geometry
}

export function Trees({ trees, chunks }: { trees: Float32Array; chunks: TreeChunk[] }) {
  const count = trees.length / TREE_STRIDE
  const phase = useGame((state) => state.phase)

  const assets = useMemo(
    () => ({
      chunks: chunks.map((chunk) => ({
        key: `${chunk.cx},${chunk.cz}`,
        wood: toGeometry(chunk.wood),
        leaves: toGeometry(chunk.leaves),
      })),
      bark: createFoliageMaterial({ sway: false }),
      foliage: createFoliageMaterial(),
    }),
    [chunks],
  )

  useEffect(
    () => () => {
      for (const chunk of assets.chunks) {
        chunk.wood.dispose()
        chunk.leaves.dispose()
      }
      assets.bark.dispose()
      assets.foliage.dispose()
    },
    [assets],
  )

  // The wind moves while the city is alive, and stops dead when the game is paused. It
  // blows harder in the rain.
  useFrame((_, delta) => {
    if (phase !== 'playing' && phase !== 'menu') return
    foliageUniforms.uTime.value += Math.min(delta, 0.05)
    foliageUniforms.uWind.value = 0.55 + runtime.rain * 0.9
  })

  // Trunks are solid; canopies are not, so you can walk under any tree.
  useStaticColliders(
    (rapier) => {
      const colliders = []
      for (let i = 0; i < count; i++) {
        const o = i * TREE_STRIDE
        const r = trunkRadius(trees[o + 2]) * 0.9
        colliders.push(
          rapier.ColliderDesc.cylinder(1.5, r).setTranslation(trees[o], 1.5, trees[o + 1]),
        )
      }
      return colliders
    },
    [trees, count],
  )

  if (count === 0) return null
  return (
    <group name="trees">
      {assets.chunks.map((chunk) => (
        <group key={chunk.key}>
          <mesh geometry={chunk.wood} material={assets.bark} castShadow receiveShadow />
          <mesh geometry={chunk.leaves} material={assets.foliage} castShadow receiveShadow />
        </group>
      ))}
    </group>
  )
}
