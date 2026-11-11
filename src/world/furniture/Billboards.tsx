/** Original in-world advertisement placeholders; no ad booking or contact details. */
import { useEffect, useMemo } from 'react'
import { CanvasTexture, MeshBasicMaterial, MeshLambertMaterial, SRGBColorSpace } from 'three'
import { hash01 } from '../../core/random'
import { PAVEMENT } from '../geometry/ground'
import type { LoadedZone } from '../zone/loadZone'

interface Board {
  x: number
  z: number
  yaw: number
}
function chooseBoards(zone: LoadedZone, start: { x: number; z: number; yaw: number }): Board[] {
  const boards: Board[] = []
  const bounds = zone.index.bounds
  const safe = (x: number, z: number) =>
    x > bounds.minX + 20 &&
    x < bounds.maxX - 20 &&
    z > bounds.minZ + 20 &&
    z < bounds.maxZ - 20 &&
    !zone.index.buildingAt(x, z)
  const fx = -Math.sin(start.yaw),
    fz = -Math.cos(start.yaw),
    rx = Math.cos(start.yaw),
    rz = -Math.sin(start.yaw)
  // A board overlooking City Square, facing the opening view.
  for (const side of [18, -18, 26, -26]) {
    const x = start.x + fx * 43 + rx * side,
      z = start.z + fz * 43 + rz * side
    if (safe(x, z)) {
      boards.push({ x, z, yaw: Math.atan2(start.x - x, start.z - z) })
      break
    }
  }
  zone.file.roads.forEach((road, index) => {
    if (
      boards.length >= 18 ||
      !PAVEMENT[road.k] ||
      road.e ||
      road.br ||
      road.lk ||
      hash01(index, 93) > 0.22
    )
      return
    const p = road.p,
      q = zone.file.q
    const i = Math.floor((p.length / 2 - 1) / 2) * 2
    if (i + 3 >= p.length) return
    const ax = p[i] / q,
      az = p[i + 1] / q,
      dx = p[i + 2] / q - ax,
      dz = p[i + 3] / q - az,
      len = Math.hypot(dx, dz)
    if (len < 30) return
    const ux = dx / len,
      uz = dz / len,
      offset = road.w / 2 + (PAVEMENT[road.k] ?? 0) + 1.5
    const x = ax + dx / 2 - uz * offset,
      z = az + dz / 2 + ux * offset
    if (!safe(x, z) || boards.some((b) => Math.hypot(b.x - x, b.z - z) < 150)) return
    // The sign faces the road.
    boards.push({ x, z, yaw: Math.atan2(uz, -ux) })
  })
  return boards
}

export function Billboards({
  zone,
  start,
}: {
  zone: LoadedZone
  start: { x: number; z: number; yaw: number }
}) {
  const boards = useMemo(() => chooseBoards(zone, start), [zone, start])
  const assets = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 512
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#111820'
    ctx.fillRect(0, 0, 1024, 512)
    ctx.fillStyle = '#ffd21f'
    ctx.fillRect(0, 0, 1024, 22)
    ctx.fillRect(0, 490, 1024, 22)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#ffd21f'
    ctx.font = 'bold 58px sans-serif'
    ctx.fillText('YOUR BRAND. YOUR CITY.', 512, 115)
    ctx.fillStyle = '#ffffff'
    ctx.font = '900 116px sans-serif'
    ctx.fillText('ADVERTISE', 512, 245)
    ctx.font = '900 150px sans-serif'
    ctx.fillText('HERE', 512, 390)
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    return {
      texture,
      face: new MeshBasicMaterial({ map: texture }),
      frame: new MeshLambertMaterial({ color: '#272b30' }),
    }
  }, [])
  useEffect(
    () => () => {
      assets.texture.dispose()
      assets.face.dispose()
      assets.frame.dispose()
    },
    [assets],
  )
  return (
    <group name="billboards">
      {boards.map((board, i) => (
        <group key={i} position={[board.x, 0, board.z]} rotation={[0, board.yaw, 0]}>
          <mesh position={[0, 2.2, 0]} material={assets.frame}>
            <boxGeometry args={[0.22, 4.4, 0.22]} />
          </mesh>
          <mesh position={[0, 5.1, 0]} material={assets.frame}>
            <boxGeometry args={[7.2, 3.8, 0.18]} />
          </mesh>
          <mesh position={[0, 5.1, 0.105]} material={assets.face}>
            <planeGeometry args={[7, 3.5]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
