/** Animated ambient pedestrians: instanced limbs, no AI or collision bodies. */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  Color,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
  Euler,
  type InstancedMesh,
} from 'three'
import { hash01 } from '../../core/random'
import { useGame, useQuality } from '../../state/gameStore'
import type { LoadedZone } from '../zone/loadZone'
import { pedestrianPose, planPedestrians } from './paths'

const TOPS = [
  '#d54b30',
  '#2993a5',
  '#e9bd51',
  '#5378ac',
  '#ded8c6',
  '#ac5691',
  '#488761',
  '#b97b45',
]
const LEGS = ['#263444', '#35333b', '#49463e', '#283c52']
const SKINS = ['#70462f', '#8a593c', '#563423', '#a46c47']
const RANGES = { high: 180, medium: 140, low: 100 }

export function Pedestrians({
  zone,
  start,
}: {
  zone: LoadedZone
  start: { x: number; z: number; yaw?: number }
}) {
  const quality = useQuality()
  const paths = useMemo(
    () => planPedestrians(zone.file, zone.index, zone.geometry.trees, start),
    [zone, start],
  )
  const refs = useRef<(InstancedMesh | null)[]>([])
  const assets = useMemo(
    () => ({ box: new BoxGeometry(1, 1, 1), material: new MeshLambertMaterial() }),
    [],
  )
  const elapsed = useRef(0)
  useEffect(
    () => () => {
      assets.box.dispose()
      assets.material.dispose()
    },
    [assets],
  )
  useFrame(({ camera }, delta) => {
    if (useGame.getState().phase === 'playing') elapsed.current += Math.min(delta, 0.05)
    const meshes = refs.current
    if (meshes.length !== 6 || meshes.some((m) => !m)) return
    const matrix = new Matrix4(),
      root = new Matrix4(),
      local = new Matrix4()
    const pos = new Vector3(),
      scale = new Vector3(),
      rotation = new Quaternion(),
      euler = new Euler()
    const color = new Color()
    let count = 0
    for (const path of paths) {
      const p = pedestrianPose(path, elapsed.current)
      if ((p.x - camera.position.x) ** 2 + (p.z - camera.position.z) ** 2 > RANGES[quality] ** 2)
        continue
      const sway = Math.sin(elapsed.current * 5.3 + path.phase * 6.28) * 0.48
      root.compose(
        pos.set(p.x, 0, p.z),
        rotation.setFromEuler(euler.set(0, p.yaw, 0)),
        scale.set(1, 1, 1),
      )
      const shirt = TOPS[Math.floor(hash01(path.seed, 10) * TOPS.length)]
      const trousers = LEGS[Math.floor(hash01(path.seed, 11) * LEGS.length)]
      const skin = SKINS[Math.floor(hash01(path.seed, 12) * SKINS.length)]
      const parts: [number, number, number, number, number, number, number, string][] = [
        [0, 1.23, 0, 0.42, 0.55, 0.24, 0, shirt],
        [0, 1.66, 0, 0.23, 0.25, 0.23, 0, skin],
        [-0.11, 0.43, 0, 0.16, 0.86, 0.18, sway, trousers],
        [0.11, 0.43, 0, 0.16, 0.86, 0.18, -sway, trousers],
        [-0.28, 1.2, 0, 0.12, 0.52, 0.13, -sway, shirt],
        [0.28, 1.2, 0, 0.12, 0.52, 0.13, sway, shirt],
      ]
      parts.forEach(([x, y, z, sx, sy, sz, angle, tint], i) => {
        local.compose(
          pos.set(x, y, z),
          rotation.setFromEuler(euler.set(angle, 0, 0)),
          scale.set(sx, sy, sz),
        )
        matrix.multiplyMatrices(root, local)
        meshes[i]!.setMatrixAt(count, matrix)
        meshes[i]!.setColorAt(count, color.set(tint))
      })
      count++
    }
    for (const mesh of meshes) {
      mesh!.count = count
      mesh!.instanceMatrix.needsUpdate = true
      if (mesh!.instanceColor) mesh!.instanceColor.needsUpdate = true
    }
  })
  if (!paths.length) return null
  return (
    <group name="pedestrians">
      {Array.from({ length: 6 }, (_, i) => (
        <instancedMesh
          key={i}
          ref={(m) => {
            refs.current[i] = m
          }}
          args={[assets.box, assets.material, paths.length]}
          frustumCulled={false}
        />
      ))}
    </group>
  )
}
