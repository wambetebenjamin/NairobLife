/**
 * Drives the city's quiet, non-rhythmic traffic wash from the player's location.
 *
 * It is a frame hook with no output of its own, like `AudioListener`: everything it does
 * happens in the audio graph, which is silent until the player's first gesture.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { updateCity } from '../audio/ambience'
import { nearestOf } from '../audio/footsteps'
import { distToSegmentSq } from '../core/geom2d'
import { useGame } from '../state/gameStore'
import { runtime } from '../state/runtime'
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
  const nearest = useRef({ width: 0, distance: Infinity })
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
      let width = 0
      zone.index.roadsNear(player.x, player.z, 22, ({ ax, az, bx, bz, road }) => {
        const distance = Math.sqrt(distToSegmentSq(player.x, player.z, ax, az, bx, bz))
        if (distance < best) {
          best = distance
          width = road.w
        }
      })
      nearest.current = { width, distance: best }
    }

    const road = nearest.current
    const busyDistance = nearestOf(busy, player.x, player.z)
    // This sound bed only describes the surrounding city, never the player's steps.
    updateCity(road.width, busyDistance, runtime.rain, false)
  })

  return null
}
