/**
 * Turning a landmark (real-world coordinates) into a spot to stand in the game world.
 */
import type { Landmark } from '../config/landmarks'
import { WORLD_ORIGIN } from '../config/zones'
import { bearingBetween, bearingDegToYaw, createProjection } from '../core/geo'
import { wrapAngle } from '../core/math'
import type { TeleportRequest } from '../state/runtime'
import type { LoadedZone } from '../world/zone/loadZone'

const projection = createProjection(WORLD_ORIGIN)

export function resolveLandmark(landmark: Landmark, zone: LoadedZone): TeleportRequest {
  let [x, z] = projection.toWorld(landmark.spawn.lat, landmark.spawn.lon)
  // Ground-level spawns are nudged out of any building the map may have gained since
  // the landmark was written. Rooftop spawns are meant to be inside a footprint.
  if (!landmark.onTop) [x, z] = zone.index.safeSpawn(x, z)

  const sameSpot =
    landmark.spawn.lat === landmark.lookAt.lat && landmark.spawn.lon === landmark.lookAt.lon
  const yaw = sameSpot
    ? 0
    : wrapAngle(bearingDegToYaw(bearingBetween(landmark.spawn, landmark.lookAt)))
  return { x, z, yaw, onTop: !!landmark.onTop, pitch: landmark.pitch }
}
