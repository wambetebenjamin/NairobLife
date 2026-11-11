/**
 * Trees, drawn with instancing: two draw calls (trunks, canopies) for a few thousand
 * trees. Shapes are deliberately simple; colour and silhouette do the work.
 *
 * About one tree in three gets the flat-topped umbrella shape of an acacia.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  Color,
  CylinderGeometry,
  IcosahedronGeometry,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
  type InstancedMesh,
} from 'three'
import { hash01 } from '../core/random'
import { TREE_TRUNK } from './geometry/palette'
import { TREE_STRIDE, trunkRadius } from './geometry/trees'
import { useStaticColliders } from './physics/useStaticColliders'

const UP = new Vector3(0, 1, 0)

export function Trees({ trees }: { trees: Float32Array }) {
  const count = trees.length / TREE_STRIDE
  const trunks = useRef<InstancedMesh>(null)
  const canopies = useRef<InstancedMesh>(null)

  const assets = useMemo(() => {
    // A unit trunk: 1 m tall, 1 m radius at the base, standing on the origin.
    const trunk = new CylinderGeometry(0.7, 1, 1, 6, 1, true)
    trunk.translate(0, 0.5, 0)
    const canopy = new IcosahedronGeometry(1, 1)
    const bark = new MeshLambertMaterial()
    bark.color.setRGB(TREE_TRUNK[0], TREE_TRUNK[1], TREE_TRUNK[2])
    // White base colour: each instance tints it with its own leaf colour.
    const leaves = new MeshLambertMaterial({ flatShading: true })
    return { trunk, canopy, bark, leaves }
  }, [])

  useEffect(
    () => () => {
      assets.trunk.dispose()
      assets.canopy.dispose()
      assets.bark.dispose()
      assets.leaves.dispose()
    },
    [assets],
  )

  useLayoutEffect(() => {
    const trunkMesh = trunks.current
    const canopyMesh = canopies.current
    if (!trunkMesh || !canopyMesh) return

    const matrix = new Matrix4()
    const position = new Vector3()
    const rotation = new Quaternion()
    const size = new Vector3()
    const colour = new Color()

    for (let i = 0; i < count; i++) {
      const o = i * TREE_STRIDE
      const x = trees[o]
      const z = trees[o + 1]
      const height = trees[o + 2]
      const radius = trees[o + 3]
      rotation.setFromAxisAngle(UP, trees[o + 7])

      const umbrella = hash01(i, 71) < 0.33
      // Canopy height as a share of its width: flat for acacias, rounder for the rest.
      const depth = radius * (umbrella ? 0.42 : 0.78 + hash01(i, 72) * 0.25)
      const canopyY = height - depth * 0.8

      const r = trunkRadius(height)
      matrix.compose(position.set(x, 0, z), rotation, size.set(r, canopyY, r))
      trunkMesh.setMatrixAt(i, matrix)

      matrix.compose(position.set(x, canopyY, z), rotation, size.set(radius, depth, radius))
      canopyMesh.setMatrixAt(i, matrix)
      canopyMesh.setColorAt(i, colour.setRGB(trees[o + 4], trees[o + 5], trees[o + 6]))
    }

    trunkMesh.instanceMatrix.needsUpdate = true
    canopyMesh.instanceMatrix.needsUpdate = true
    if (canopyMesh.instanceColor) canopyMesh.instanceColor.needsUpdate = true
    // Instanced meshes are culled as a whole; give three the real extent.
    trunkMesh.computeBoundingSphere()
    canopyMesh.computeBoundingSphere()
  }, [trees, count])

  // Trunks are solid; canopies are not, so you can walk under any tree.
  useStaticColliders(
    (rapier) => {
      const colliders = []
      for (let o = 0; o < trees.length; o += TREE_STRIDE) {
        const r = trunkRadius(trees[o + 2]) * 0.9
        colliders.push(
          rapier.ColliderDesc.cylinder(1.5, r).setTranslation(trees[o], 1.5, trees[o + 1]),
        )
      }
      return colliders
    },
    [trees],
  )

  if (count === 0) return null
  return (
    <group name="trees">
      <instancedMesh
        ref={trunks}
        args={[assets.trunk, assets.bark, count]}
        castShadow
        receiveShadow
      />
      <instancedMesh
        ref={canopies}
        args={[assets.canopy, assets.leaves, count]}
        castShadow
        receiveShadow
      />
    </group>
  )
}
