/**
 * Drives the city's continuous sound from where the player is: footsteps on whatever is
 * underfoot, and the bed of distant traffic, louder at junctions and busy corners.
 *
 * It is a frame hook with no output of its own, like `AudioListener`: everything it does
 * happens in the audio graph, which is silent until the player's first gesture.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { updateCity } from '../audio/ambience'
import { nearestOf, surfaceUnder } from '../audio/footsteps'
import { distToSegmentSq } from '../core/geom2d'
import { useGame } from '../state/gameStore'
import { runtime } from '../state/runtime'
import { PAVEMENT } from '../world/geometry/ground'
import { DRIVABLE } from '../world/zone/format'
import type { LoadedZone } from '../world/zone/loadZone'

export function CitySound({ zone }: { zone: LoadedZone }) {
  const phase = useGame((state) => state.phase)
  // The places the city is loudest: stages and markets.
  const busy = useMemo(
    () =>
      zone.file.pois
        .filter((poi) => poi.k === 'stage')
        .map((poi) => ({ x: poi.x / zone.file.q, z: poi.z / zone.file.q })),
    [zone],
  )
  // Querying the road index every frame is cheap, but there is no need to build the list
  // of roads each time: one radius search is enough.
  const nearest = useRef({ halfWidth: 0, pavement: 0, drivable: false, distance: Infinity })
  const clock = useRef(0)

  useFrame((_, delta) => {
    if (phase !== 'playing') return
    const player = runtime.player
    const step = Math.min(delta, 0.05)
    clock.current += step

    // Only look at the roads now and then: the surface does not change 60 times a second.
    if (clock.current > 0.12) {
      clock.current = 0
      let best = Infinity
      let found: { halfWidth: number; pavement: number; drivable: boolean } | null = null
      zone.index.roadsNear(player.x, player.z, 22, ({ ax, az, bx, bz, road }) => {
        const distance = Math.sqrt(distToSegmentSq(player.x, player.z, ax, az, bx, bz))
        if (distance < best) {
          best = distance
          found = {
            halfWidth: road.w / 2,
            pavement: PAVEMENT[road.k] ?? 0,
            drivable: !!DRIVABLE[road.k] && !road.e && !road.br && !road.lk,
          }
        }
      })
      nearest.current = {
        ...(found ?? { halfWidth: 0, pavement: 0, drivable: false }),
        distance: best,
      }
    }

    const road = nearest.current
    const surface = surfaceUnder(
      road.drivable ? { halfWidth: road.halfWidth, pavement: road.pavement, drivable: true } : null,
      road.distance,
    )
    const speed = Math.abs(player.speed)
    // Sprinting tops out around 7 m/s in this game; anything well above a walk is a run.
    const gait = speed > 2.6 ? 'run' : 'walk'
    const busyDistance = nearestOf(busy, player.x, player.z)
    // The bed's level comes from the road you are beside, and how close a stage is.
    updateCity(step, speed, gait, surface, road.halfWidth * 2, busyDistance, runtime.rain, false)
  })

  return null
}
