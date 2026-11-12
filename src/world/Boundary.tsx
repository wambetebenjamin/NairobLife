/**
 * The edge of the playable zone: four invisible walls, and a friendly note when you
 * reach one. Neighbouring zones replace these walls as they are built (docs/ROADMAP.md).
 */
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { translate } from '../config/strings'
import { useGame } from '../state/gameStore'
import { runtime } from '../state/runtime'
import { useStaticColliders } from './physics/useStaticColliders'
import type { Rect } from '../core/geom2d'

/** How far inside the data's edge the walls stand, in metres. */
export const BOUNDARY_INSET = 12
const WARN_DISTANCE = 6
const WARN_EVERY_SECONDS = 12

export function Boundary({ bounds }: { bounds: Rect }) {
  const minX = bounds.minX + BOUNDARY_INSET
  const maxX = bounds.maxX - BOUNDARY_INSET
  const minZ = bounds.minZ + BOUNDARY_INSET
  const maxZ = bounds.maxZ - BOUNDARY_INSET
  const lastWarning = useRef(-Infinity)

  // Each wall is an infinite plane whose normal points back into the zone; everything
  // behind the plane is solid, so there is no way over or around it.
  useStaticColliders(
    (rapier) => {
      const wall = (nx: number, nz: number, x: number, z: number) =>
        new rapier.ColliderDesc(new rapier.HalfSpace({ x: nx, y: 0, z: nz })).setTranslation(
          x,
          0,
          z,
        )
      return [wall(1, 0, minX, 0), wall(-1, 0, maxX, 0), wall(0, 1, 0, minZ), wall(0, -1, 0, maxZ)]
    },
    [minX, maxX, minZ, maxZ],
  )

  useFrame(({ clock }) => {
    const { x, z } = runtime.player
    const distance = Math.min(x - minX, maxX - x, z - minZ, maxZ - z)
    if (distance > WARN_DISTANCE || clock.elapsedTime - lastWarning.current < WARN_EVERY_SECONDS)
      return
    const game = useGame.getState()
    if (game.phase !== 'playing') return
    lastWarning.current = clock.elapsedTime
    game.toast(translate(game.settings.language, 'zoneEdge'))
  })

  return null
}
