/** Simple, non-interactive signs and lights at mapped points of interest. */
import { useEffect, useMemo } from 'react'
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
              <mesh position={[0, 2.93, 0.15]}>
                <sphereGeometry args={[0.1, 6, 4]} />
                <meshBasicMaterial color="#38d979" />
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
