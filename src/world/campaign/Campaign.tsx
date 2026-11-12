/** A fictional, non-partisan campaign rally: a silent visual scene, not a real event. */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Euler,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type Group,
} from 'three'
import { useGame } from '../../state/gameStore'
import type { CampaignSite } from './placement'

const SHIRTS = ['#1a8887', '#efbb42', '#e86245', '#dbe7dc', '#4c779c']
const SKINS = ['#70462f', '#8a593c', '#563423', '#a46c47']

export function Campaign({ site }: { site: CampaignSite }) {
  const arms = useRef<InstancedMesh>(null)
  const gesture = useRef<Group>(null)
  const elapsed = useRef(0)
  const figures = useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) => ({
        x: ((i % 5) - 2) * 2.2 + (Math.floor(i / 5) % 2) * 0.35,
        z: Math.floor(i / 5) * 1.6 - 0.2,
        shirt: SHIRTS[i % SHIRTS.length],
        skin: SKINS[i % SKINS.length],
      })),
    [],
  )
  const assets = useMemo(() => {
    const box = new BoxGeometry(1, 1, 1),
      material = new MeshLambertMaterial()
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 512
    const c = canvas.getContext('2d')!
    c.fillStyle = '#083c42'
    c.fillRect(0, 0, 1024, 512)
    c.fillStyle = '#f3c64d'
    c.fillRect(0, 0, 1024, 22)
    c.fillRect(0, 490, 1024, 22)
    c.textAlign = 'center'
    c.fillStyle = '#ffffff'
    c.font = '900 116px sans-serif'
    c.fillText('CAMPAIGN', 512, 170)
    c.fillText('RALLY', 512, 300)
    c.fillStyle = '#f3c64d'
    c.font = 'bold 55px sans-serif'
    c.fillText('A FICTIONAL CITY EVENT', 512, 415)
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    return { box, material, texture, sign: new MeshBasicMaterial({ map: texture }) }
  }, [])
  useEffect(
    () => () => {
      assets.box.dispose()
      assets.material.dispose()
      assets.texture.dispose()
      assets.sign.dispose()
    },
    [assets],
  )
  const tools = useMemo(
    () => ({
      matrix: new Matrix4(),
      pos: new Vector3(),
      rot: new Quaternion(),
      euler: new Euler(),
      scale: new Vector3(),
      color: new Color(),
    }),
    [],
  )
  const part = (
    mesh: InstancedMesh | null,
    i: number,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: string,
    angle = 0,
  ) => {
    if (!mesh) return
    const { matrix, pos, rot, euler, scale } = tools
    matrix.compose(
      pos.set(x, y, z),
      rot.setFromEuler(euler.set(0, 0, angle)),
      scale.set(sx, sy, sz),
    )
    mesh.setMatrixAt(i, matrix)
    mesh.setColorAt(i, tools.color.set(color))
  }
  const body = useRef<InstancedMesh>(null),
    heads = useRef<InstancedMesh>(null),
    legs = useRef<InstancedMesh>(null)
  useFrame((_, delta) => {
    if (useGame.getState().phase === 'playing') elapsed.current += Math.min(delta, 0.05)
    const t = elapsed.current
    figures.forEach((p, i) => {
      part(body.current, i, p.x, 1.2, p.z, 0.43, 0.58, 0.26, p.shirt)
      part(heads.current, i, p.x, 1.65, p.z, 0.24, 0.25, 0.24, p.skin)
      part(legs.current, i, p.x, 0.43, p.z, 0.34, 0.86, 0.2, '#303c48')
      part(
        arms.current,
        i,
        p.x + 0.3,
        1.27,
        p.z,
        0.13,
        0.58,
        0.14,
        p.shirt,
        i % 3 === 0 ? -1.9 + 0.2 * Math.sin(t * 2 + i) : 0.06 * Math.sin(t + i),
      )
      part(
        arms.current,
        i + figures.length,
        p.x - 0.3,
        1.27,
        p.z,
        0.13,
        0.58,
        0.14,
        p.shirt,
        0.06 * Math.sin(t + i),
      )
    })
    for (const mesh of [body.current, heads.current, legs.current, arms.current])
      if (mesh) {
        mesh.instanceMatrix.needsUpdate = true
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      }
    if (gesture.current) gesture.current.rotation.z = -1.05 + Math.sin(t * 1.8) * 0.25
  })
  return (
    <group name="fictional-campaign" position={[site.x, 0, site.z]} rotation={[0, site.yaw, 0]}>
      {/* stage, banner and two loudspeakers; the rally is visual-only and silent */}
      <mesh position={[0, 0.65, -3.4]}>
        <boxGeometry args={[8, 1.3, 3]} />
        <meshLambertMaterial color="#333c43" />
      </mesh>
      <mesh position={[0, 3.75, -4.75]} material={assets.sign}>
        <planeGeometry args={[7.4, 3.7]} />
      </mesh>
      {[-4.5, 4.5].map((x) => (
        <group key={x} position={[x, 0, -3.6]}>
          <mesh position={[0, 1.2, 0]}>
            <boxGeometry args={[0.13, 2.4, 0.13]} />
            <meshLambertMaterial color="#3b4142" />
          </mesh>
          <mesh position={[0, 2.55, 0]}>
            <boxGeometry args={[0.65, 1, 0.55]} />
            <meshLambertMaterial color="#181c20" />
          </mesh>
        </group>
      ))}
      {/* Candidate, lectern and a gesturing arm. */}
      <group position={[0, 1.3, -3.35]}>
        <mesh position={[0, 1.25, 0]}>
          <boxGeometry args={[0.5, 0.7, 0.3]} />
          <meshLambertMaterial color="#314b63" />
        </mesh>
        <mesh position={[0, 1.76, 0]}>
          <boxGeometry args={[0.27, 0.27, 0.27]} />
          <meshLambertMaterial color="#85573c" />
        </mesh>
        <mesh position={[0, 0.44, 0]}>
          <boxGeometry args={[0.38, 0.88, 0.22]} />
          <meshLambertMaterial color="#202f3c" />
        </mesh>
        <group ref={gesture} position={[0.32, 1.5, 0]}>
          <mesh position={[0, -0.3, 0]}>
            <boxGeometry args={[0.15, 0.6, 0.16]} />
            <meshLambertMaterial color="#314b63" />
          </mesh>
        </group>
        <mesh position={[0, 0.75, 0.55]}>
          <boxGeometry args={[0.85, 1.5, 0.5]} />
          <meshLambertMaterial color="#117b7c" />
        </mesh>
      </group>
      <group name="campaign-crowd">
        <instancedMesh
          ref={body}
          args={[assets.box, assets.material, figures.length]}
          frustumCulled={false}
        />
        <instancedMesh
          ref={heads}
          args={[assets.box, assets.material, figures.length]}
          frustumCulled={false}
        />
        <instancedMesh
          ref={legs}
          args={[assets.box, assets.material, figures.length]}
          frustumCulled={false}
        />
        <instancedMesh
          ref={arms}
          args={[assets.box, assets.material, figures.length * 2]}
          frustumCulled={false}
        />
      </group>
      {[-3.6, 3.2].map((x, i) => (
        <group key={x} position={[x, 0, 2.7 + i * 1.5]}>
          <mesh position={[0, 2.15, 0]}>
            <boxGeometry args={[0.06, 1.65, 0.06]} />
            <meshLambertMaterial color="#494b47" />
          </mesh>
          <mesh position={[0, 2.75, 0]}>
            <boxGeometry args={[1.15, 0.65, 0.08]} />
            <meshLambertMaterial color={i ? '#efbb42' : '#1a8887'} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
