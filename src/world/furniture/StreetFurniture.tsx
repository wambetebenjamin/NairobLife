/** Mapped signs and simple two-axis signal lights. */
import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { runtime } from '../../state/runtime'
import { greenAxis } from '../../core/trafficSignals'
import { CanvasTexture, MeshBasicMaterial, SRGBColorSpace } from 'three'
import type { LoadedZone } from '../zone/loadZone'

export function StreetFurniture({ zone }: { zone: LoadedZone }) {
  const entries = useMemo(
    () =>
      zone.file.pois
        .filter((p) => p.k === 'stage' || p.k === 'lamp' || p.k === 'signal')
        .map((p, i) => ({ ...p, x: p.x / zone.file.q, z: p.z / zone.file.q, id: i })),
    [zone],
  )
  const texture = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 256
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#116d46'
    ctx.fillRect(0, 0, 512, 256)
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.font = 'bold 68px sans-serif'
    ctx.fillText('MATATU', 256, 104)
    ctx.font = 'bold 68px sans-serif'
    ctx.fillText('STAGE', 256, 190)
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    return t
  }, [])
  const sign = useMemo(() => new MeshBasicMaterial({ map: texture }), [texture])
  const lights = useMemo(
    () => ({
      xr: new MeshBasicMaterial(),
      xg: new MeshBasicMaterial(),
      zr: new MeshBasicMaterial(),
      zg: new MeshBasicMaterial(),
    }),
    [],
  )
  useFrame(() => {
    const axis = greenAxis(runtime.trafficTime)
    lights.xr.color.set(axis === 'x' ? '#3d1010' : '#ff3333')
    lights.xg.color.set(axis === 'x' ? '#38d979' : '#103324')
    lights.zr.color.set(axis === 'z' ? '#3d1010' : '#ff3333')
    lights.zg.color.set(axis === 'z' ? '#38d979' : '#103324')
  })
  useEffect(() => () => Object.values(lights).forEach((light) => light.dispose()), [lights])
  useEffect(
    () => () => {
      texture.dispose()
      sign.dispose()
    },
    [texture, sign],
  )
  return (
    <group name="street-furniture">
      {entries.map((p) => (
        <group key={p.id} position={[p.x, 0, p.z]}>
          <mesh position={[0, 1.65, 0]}>
            <boxGeometry args={[0.12, 3.3, 0.12]} />
            <meshLambertMaterial color="#55595b" />
          </mesh>
          {p.k === 'stage' && (
            <mesh position={[0, 3.05, 0]} material={sign}>
              <planeGeometry args={[1.6, 0.8]} />
            </mesh>
          )}
          {p.k === 'signal' && (
            <>
              <mesh position={[0, 3.2, 0]}>
                <boxGeometry args={[0.35, 0.95, 0.28]} />
                <meshLambertMaterial color="#252525" />
              </mesh>
              <mesh position={[0, 3.45, 0.15]} material={lights.zr}>
                <sphereGeometry args={[0.1, 6, 4]} />
              </mesh>
              <mesh position={[0, 2.93, 0.15]} material={lights.zg}>
                <sphereGeometry args={[0.1, 6, 4]} />
              </mesh>
              <mesh position={[0.18, 3.45, 0]} material={lights.xr}>
                <sphereGeometry args={[0.1, 6, 4]} />
              </mesh>
              <mesh position={[0.18, 2.93, 0]} material={lights.xg}>
                <sphereGeometry args={[0.1, 6, 4]} />
              </mesh>
            </>
          )}
          {p.k === 'lamp' && (
            <mesh position={[0, 3.35, 0]}>
              <boxGeometry args={[0.48, 0.16, 0.3]} />
              <meshBasicMaterial color="#ffe7ae" />
            </mesh>
          )}
        </group>
      ))}
    </group>
  )
}
