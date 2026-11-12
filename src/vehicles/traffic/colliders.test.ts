import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { VEHICLE_GROUPS } from '../../world/physics/groups'
import {
  clearRestart,
  createTrafficCollider,
  placeTrafficCollider,
  vehicleAhead,
} from './colliders'
import type { TrafficAgent } from './graph'

beforeAll(async () => {
  await RAPIER.init()
})
const agent: TrafficAgent = {
  edge: 0,
  progress: 0,
  speed: 6,
  kind: 'car',
  seed: 0,
  wait: 0,
  stopped: false,
  turns: 0,
}
describe('ambient traffic solid boxes', () => {
  it('blocks character casts and senses a vehicle ahead, but not a building', () => {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
    const pose = { x: 0, z: 0, yaw: 0 },
      traffic = createTrafficCollider(world, RAPIER, agent, pose)
    const other = world.createCollider(
      RAPIER.ColliderDesc.cuboid(1, 1, 2)
        .setTranslation(0, 1, -6)
        .setCollisionGroups(VEHICLE_GROUPS),
    )
    world.step()
    expect(vehicleAhead(world, RAPIER, traffic, agent, pose)).toBe(true)
    expect(clearRestart(world, RAPIER, traffic, agent, { x: 0, z: -6, yaw: 0 })).toBe(false)
    expect(clearRestart(world, RAPIER, traffic, agent, { x: 20, z: -6, yaw: 0 })).toBe(true)
    const hit = world.castRay(new RAPIER.Ray({ x: -5, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }), 10, true)
    expect(hit?.collider.handle).toBe(traffic.handle)
    world.removeCollider(other, true)
    world.createCollider(RAPIER.ColliderDesc.cuboid(1, 1, 2).setTranslation(0, 1, -6))
    world.step()
    expect(vehicleAhead(world, RAPIER, traffic, agent, pose)).toBe(false)
    placeTrafficCollider(traffic, agent, { x: 10, z: 0, yaw: Math.PI / 2 })
    world.step()
    const moved = world.castRay(
      new RAPIER.Ray({ x: 10, y: 1, z: 5 }, { x: 0, y: 0, z: -1 }),
      10,
      true,
    )
    expect(moved?.collider.handle).toBe(traffic.handle)
    world.free()
  })
})
