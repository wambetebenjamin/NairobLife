/**
 * Lets a vehicle sense the Rapier collision world: the buildings, flyovers, trees, zone
 * walls and other vehicles that the rest of the game already collides with.
 *
 * One trap: `closest` must not be called before the world's first step. Rapier builds
 * its lookup structure during a step, and `projectPoint` on a world without one aborts
 * the whole physics module rather than returning nothing. fleet.ts holds off for a tick.
 */
import type { Collider, World } from '@dimforge/rapier3d-compat'
import { NOT_PLAYER_GROUPS } from '../../world/physics/groups'
import { NO_GROUND, type Surroundings, type SurfacePoint } from './vehicleSim'

/** The parts of the Rapier module this file uses. Both the browser and the tests supply it. */
type RapierModule = Pick<typeof import('@dimforge/rapier3d-compat'), 'Ray' | 'QueryFilterFlags'>

export interface RapierSurroundings extends Surroundings {
  /** The collider of the vehicle doing the sensing, so it does not sense itself. */
  ignore(collider: Collider | undefined): void
}

export interface RapierSurroundingsOptions {
  /** Which movable thing owns a collider, by collider handle. Anything not listed is fixed. */
  bodies?: ReadonlyMap<number, number>
  movable?: Surroundings['movable']
}

export function createRapierSurroundings(
  world: World,
  rapier: RapierModule,
  options: RapierSurroundingsOptions = {},
): RapierSurroundings {
  const { bodies, movable } = options
  const flags = rapier.QueryFilterFlags.EXCLUDE_SENSORS
  const point = { x: 0, y: 0, z: 0 }
  const ray = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 })
  let self: Collider | undefined

  return {
    ignore(collider) {
      self = collider
    },

    closest(x: number, y: number, z: number, out: SurfacePoint): boolean {
      point.x = x
      point.y = y
      point.z = z
      const hit = world.projectPoint(point, true, flags, NOT_PLAYER_GROUPS, self)
      if (!hit) return false
      out.x = hit.point.x
      out.y = hit.point.y
      out.z = hit.point.z
      out.inside = hit.isInside
      out.body = bodies?.get(hit.collider.handle) ?? -1
      return true
    },

    movable,

    ground(x: number, y: number, z: number, maxDrop: number): number {
      ray.origin.x = x
      ray.origin.y = y
      ray.origin.z = z
      const hit = world.castRay(ray, maxDrop, true, flags, NOT_PLAYER_GROUPS, self)
      return hit ? y - hit.timeOfImpact : NO_GROUND
    },
  }
}
