/** Approximate solid boxes for ambient traffic and a short forward vehicle probe. */
import type RAPIER from '@dimforge/rapier3d-compat'
import { VEHICLES } from '../../config/vehicles'
import { VEHICLE_GROUPS } from '../../world/physics/groups'
import type { TrafficAgent } from './graph'

type RapierModule = Pick<
  typeof import('@dimforge/rapier3d-compat'),
  'ColliderDesc' | 'Ball' | 'Cuboid' | 'QueryFilterFlags'
>
type Pose = { x: number; z: number; yaw: number }

export function createTrafficCollider(
  world: RAPIER.World,
  rapier: RapierModule,
  agent: TrafficAgent,
  pose: Pose,
): RAPIER.Collider {
  const spec = VEHICLES[agent.kind]
  const collider = world.createCollider(
    rapier.ColliderDesc.cuboid(spec.width / 2, spec.height / 2, spec.length / 2).setCollisionGroups(
      VEHICLE_GROUPS,
    ),
  )
  placeTrafficCollider(collider, agent, pose)
  return collider
}
export function placeTrafficCollider(
  collider: RAPIER.Collider,
  agent: TrafficAgent,
  pose: Pose,
): void {
  collider.setTranslation({ x: pose.x, y: VEHICLES[agent.kind].height / 2, z: pose.z })
  collider.setRotation({ x: 0, y: Math.sin(pose.yaw / 2), z: 0, w: Math.cos(pose.yaw / 2) })
}

/** Query only vehicle-group boxes. Junctions and abruptly turning traffic are still approximate. */
export function vehicleAhead(
  world: RAPIER.World,
  rapier: RapierModule,
  self: RAPIER.Collider,
  agent: TrafficAgent,
  pose: Pose,
): boolean {
  const spec = VEHICLES[agent.kind],
    dx = -Math.sin(pose.yaw),
    dz = -Math.cos(pose.yaw)
  const start = {
    x: pose.x + dx * (spec.length / 2 + 0.2),
    y: Math.min(spec.height / 2, 1),
    z: pose.z + dz * (spec.length / 2 + 0.2),
  }
  const hit = world.castShape(
    start,
    { x: 0, y: 0, z: 0, w: 1 },
    { x: dx, y: 0, z: dz },
    new rapier.Ball(Math.min(0.45, spec.width / 2)),
    0,
    3,
    true,
    rapier.QueryFilterFlags.EXCLUDE_SENSORS,
    VEHICLE_GROUPS,
    self,
    undefined,
    (c) => c.collisionGroups() === VEHICLE_GROUPS,
  )
  return !!hit
}

/** Reject a restart point occupied by any other vehicle box. */
export function clearRestart(
  world: RAPIER.World,
  rapier: RapierModule,
  self: RAPIER.Collider,
  agent: TrafficAgent,
  pose: Pose,
): boolean {
  const spec = VEHICLES[agent.kind]
  const shape = new rapier.Cuboid(spec.width / 2 + 1, spec.height / 2, spec.length / 2 + 1)
  const hit = world.intersectionWithShape(
    { x: pose.x, y: spec.height / 2, z: pose.z },
    { x: 0, y: Math.sin(pose.yaw / 2), z: 0, w: Math.cos(pose.yaw / 2) },
    shape,
    rapier.QueryFilterFlags.EXCLUDE_SENSORS,
    VEHICLE_GROUPS,
    self,
    undefined,
    (c) => c.collisionGroups() === VEHICLE_GROUPS,
  )
  return !hit
}
