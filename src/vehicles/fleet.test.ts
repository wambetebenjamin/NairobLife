import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { PLAYER } from '../config/game'
import { VEHICLES, type VehicleKind } from '../config/vehicles'
import { Fleet, type Pose } from './fleet'
import type { Placement } from './placement'
import { PARKED, type DriveInput } from './sim/vehicleSim'

/**
 * The fleet against a real Rapier world: flat ground, the odd wall, a few vehicles.
 * Yaw 0 faces north (-z), so "ahead" below means towards smaller z.
 */

const STEP = 1 / 60
const GO: DriveInput = { throttle: 1, steer: 0, handbrake: false }

beforeAll(async () => {
  await RAPIER.init()
})

function createWorld(walls: { x: number; z: number; width: number; depth: number }[] = []) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  world.createCollider(new RAPIER.ColliderDesc(new RAPIER.HalfSpace({ x: 0, y: 1, z: 0 })))
  for (const wall of walls) {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(wall.width / 2, 3, wall.depth / 2).setTranslation(
        wall.x,
        3,
        wall.z,
      ),
    )
  }
  return world
}

const park = (kind: VehicleKind, x: number, z: number, yaw = 0): Placement => ({
  kind,
  x,
  z,
  yaw,
  paint: 0,
})

/** Step the fleet and the world together, as the game does. */
function run(
  fleet: Fleet,
  world: RAPIER.World,
  seconds: number,
  driven = -1,
  input: DriveInput = PARKED,
) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    fleet.step(STEP, driven, input)
    world.step()
  }
}

describe('Fleet', () => {
  it('parks every vehicle asleep, solid, and in its own colour', () => {
    const world = createWorld()
    const fleet = new Fleet(world, RAPIER, [
      park('car', 0, 0),
      { ...park('matatu', 10, 0, 1), paint: 4, label: 'Githurai 45' },
    ])
    world.step()
    expect(fleet.vehicles.map((v) => v.kind)).toEqual(['car', 'matatu'])
    expect(fleet.vehicles.map((v) => v.id)).toEqual([0, 1])
    expect(fleet.awake).toHaveLength(0)
    expect(fleet.vehicles[1].label).toBe('Githurai 45')
    expect(fleet.vehicles[0].paint).not.toEqual(fleet.vehicles[1].paint)

    // Something dropped from above lands on the car's roof, not the road.
    const ray = new RAPIER.Ray({ x: 0, y: 10, z: 0 }, { x: 0, y: -1, z: 0 })
    const hit = world.castRay(ray, 20, true)
    expect(hit?.collider.handle).toBe(fleet.vehicles[0].collider.handle)
    expect(10 - hit!.timeOfImpact).toBeCloseTo(VEHICLES.car.height, 2)
  })

  it('wakes a vehicle to drive it, moves its collision box along, and lets it sleep again', () => {
    const world = createWorld()
    const fleet = new Fleet(world, RAPIER, [park('car', 0, 0)])
    const car = fleet.vehicles[0]
    world.step()

    run(fleet, world, 1, 0, GO)
    expect(car.state.speed).toBe(0) // nobody woke it: the input goes nowhere

    const revision = fleet.revision
    fleet.wake(car)
    fleet.wake(car)
    expect(fleet.awake).toEqual([car])
    expect(fleet.revision).toBe(revision + 1)

    run(fleet, world, 3, 0, GO)
    expect(car.state.speed).toBeGreaterThan(12)
    expect(car.state.z).toBeLessThan(-15)
    const at = car.collider.translation()
    expect(at.x).toBeCloseTo(car.state.x, 4)
    expect(at.z).toBeCloseTo(car.state.z, 4)

    // The driver gets out: handbrake on, it stops, and after a moment it is asleep.
    run(fleet, world, 6)
    expect(car.awake).toBe(false)
    expect(fleet.awake).toHaveLength(0)
    expect(car.state.speed).toBe(0)
    expect(fleet.revision).toBe(revision + 2)
  })

  it('never puts a driven vehicle to sleep, however long it stands', () => {
    const world = createWorld()
    const fleet = new Fleet(world, RAPIER, [park('boda', 0, 0)])
    fleet.wake(fleet.vehicles[0])
    run(fleet, world, 5, 0, PARKED)
    expect(fleet.vehicles[0].awake).toBe(true)
  })

  it('knocks a parked vehicle awake, and both come to rest apart', () => {
    const world = createWorld()
    const fleet = new Fleet(world, RAPIER, [park('matatu', 0, 0), park('boda', 0.2, -25, 1.2)])
    const [matatu, boda] = fleet.vehicles
    world.step()
    fleet.wake(matatu)

    let knocked = 0
    for (let i = 0; i < 4 / STEP; i++) {
      fleet.step(STEP, 0, GO)
      world.step()
      knocked = Math.max(knocked, matatu.state.impact)
    }
    expect(knocked).toBeGreaterThan(3)
    expect(boda.awake).toBe(true)
    expect(boda.state.z).toBeLessThan(-26)
    // A boda is a fifteenth of a matatu: the matatu barely slows.
    expect(matatu.state.speed).toBeGreaterThan(8)

    run(fleet, world, 8)
    expect(fleet.awake).toHaveLength(0)
    const gap = Math.hypot(matatu.state.x - boda.state.x, matatu.state.z - boda.state.z)
    expect(gap).toBeGreaterThan(VEHICLES.boda.width / 2 + VEHICLES.matatu.width / 2 - 0.1)
  })

  it('stops a driven vehicle at a wall', () => {
    const world = createWorld([{ x: 0, z: -41, width: 30, depth: 2 }])
    const fleet = new Fleet(world, RAPIER, [park('car', 0, 0)])
    const car = fleet.vehicles[0]
    world.step()
    fleet.wake(car)
    run(fleet, world, 8, 0, GO)
    const nose = car.state.z - VEHICLES.car.length / 2
    expect(nose).toBeGreaterThan(-40.2)
    expect(nose).toBeLessThan(-39.3)
  })

  it('finds the nearest vehicle within reach, by its bodywork, on the same level', () => {
    const world = createWorld()
    const fleet = new Fleet(world, RAPIER, [park('car', 0, 0), park('matatu', 3.4, 0)])
    const [car, matatu] = fleet.vehicles
    // Between the two, nearer the matatu's flank.
    expect(fleet.nearest(2, 0, 0, 2.4)).toBe(matatu)
    expect(fleet.nearest(1.2, 0, 0, 2.4)).toBe(car)
    // Standing on the bonnet counts as touching.
    expect(fleet.nearest(0, 0, -1.5, 0.1)).toBe(car)
    // Behind the car: measured from the bumper, not the middle.
    expect(fleet.nearest(0, 0, VEHICLES.car.length / 2 + 2, 2.4)).toBe(car)
    expect(fleet.nearest(0, 0, VEHICLES.car.length / 2 + 2.6, 2.4)).toBeUndefined()
    // On a flyover five metres overhead.
    expect(fleet.nearest(1.2, 5, 0, 2.4)).toBeUndefined()
    expect(fleet.nearest(-30, 0, 0, 2.4)).toBeUndefined()
  })

  describe('getting out', () => {
    const exitFrom = (
      walls: { x: number; z: number; width: number; depth: number }[],
      others: Placement[] = [],
    ) => {
      const world = createWorld(walls)
      const fleet = new Fleet(world, RAPIER, [park('car', 0, 0), ...others])
      world.step()
      return fleet.exitSpot(fleet.vehicles[0])
    }
    const door = VEHICLES.car.door

    it('uses the driver’s door, on the right, when there is room', () => {
      const spot = exitFrom([])
      expect(spot?.x).toBeCloseTo(door, 5)
      expect(spot?.y).toBeCloseTo(0.03, 3)
      // Clear of the bodywork by more than the player is wide.
      expect(spot!.x - VEHICLES.car.width / 2).toBeGreaterThan(PLAYER.radius)
    })

    it('uses the other side when a wall is in the way', () => {
      const spot = exitFrom([{ x: 1.6, z: 0, width: 1, depth: 20 }])
      expect(spot?.x).toBeCloseTo(-door, 5)
    })

    it('treats another vehicle like a wall', () => {
      const spot = exitFrom([], [park('matatu', 2.2, 0)])
      expect(spot?.x).toBeCloseTo(-door, 5)
    })

    it('goes out of the back in an alley, and the front if that is blocked too', () => {
      const alley = [
        { x: 1.6, z: 0, width: 1, depth: 20 },
        { x: -1.6, z: 0, width: 1, depth: 20 },
      ]
      const behind = exitFrom(alley)
      expect(behind?.x).toBeCloseTo(0, 5)
      expect(behind!.z).toBeGreaterThan(VEHICLES.car.length / 2 + PLAYER.radius)

      const ahead = exitFrom([...alley, { x: 0, z: 3.2, width: 6, depth: 1 }])
      expect(ahead!.z).toBeLessThan(-VEHICLES.car.length / 2 - PLAYER.radius)
    })

    it('gives up when the vehicle is boxed in on every side', () => {
      const spot = exitFrom([
        { x: 1.6, z: 0, width: 1, depth: 20 },
        { x: -1.6, z: 0, width: 1, depth: 20 },
        { x: 0, z: 3.2, width: 6, depth: 1 },
        { x: 0, z: -3.2, width: 6, depth: 1 },
      ])
      expect(spot).toBeNull()
    })

    it('will not step out over a drop', () => {
      // A deck 6 m up, only just wider than the car.
      const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
      world.createCollider(new RAPIER.ColliderDesc(new RAPIER.HalfSpace({ x: 0, y: 1, z: 0 })))
      world.createCollider(RAPIER.ColliderDesc.cuboid(1.1, 0.25, 30).setTranslation(0, 5.75, 0))
      const fleet = new Fleet(world, RAPIER, [park('car', 0, 0)])
      const car = fleet.vehicles[0]
      car.state.y = car.state.yFront = car.state.yRear = 6
      fleet.wake(car)
      run(fleet, world, 0.2)
      expect(car.state.y).toBeCloseTo(6, 2)
      const spot = fleet.exitSpot(car)
      // Not over either side: out of the back, still on the deck.
      expect(spot?.x).toBeCloseTo(0, 5)
      expect(spot?.y).toBeCloseTo(6.03, 2)
    })
  })

  it('reports where to draw a vehicle between two steps, the short way round', () => {
    const world = createWorld()
    const fleet = new Fleet(world, RAPIER, [park('car', 0, 0)])
    const car = fleet.vehicles[0]
    Object.assign(car.previous, { x: 0, y: 0, z: 0, yaw: Math.PI - 0.1, pitch: 0 })
    Object.assign(car.state, { x: 2, y: 1, z: -4, yaw: -Math.PI + 0.1, pitch: 0.2 })
    const pose: Pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }

    fleet.pose(car, 0, pose)
    expect([pose.x, pose.y, pose.z]).toEqual([0, 0, 0])
    expect(pose.yaw).toBeCloseTo(Math.PI - 0.1)
    fleet.pose(car, 0.5, pose)
    expect(pose.x).toBeCloseTo(1)
    expect(pose.y).toBeCloseTo(0.5)
    expect(pose.z).toBeCloseTo(-2)
    expect(pose.pitch).toBeCloseTo(0.1)
    // Half way from 174° to -174° is 180°, not 0°.
    expect(Math.abs(pose.yaw)).toBeCloseTo(Math.PI)
    fleet.pose(car, 1, pose)
    expect(pose.yaw).toBeCloseTo(-Math.PI + 0.1)
  })

  it('waits for the world’s first step before asking it anything', () => {
    // Rapier aborts if asked for the nearest surface in a world that has never stepped.
    const world = createWorld()
    const fleet = new Fleet(world, RAPIER, [park('car', 0, 0)])
    const car = fleet.vehicles[0]
    fleet.wake(car)
    expect(() => fleet.step(STEP, 0, GO)).not.toThrow()
    expect(car.state.speed).toBe(0)
    world.step()
    fleet.step(STEP, 0, GO)
    expect(car.state.speed).toBeGreaterThan(0)
  })

  it('takes its collision boxes with it when it goes', () => {
    const world = createWorld()
    const before = world.colliders.len()
    const fleet = new Fleet(world, RAPIER, [park('car', 0, 0), park('boda', 5, 0)])
    expect(world.colliders.len()).toBe(before + 2)
    fleet.dispose()
    expect(world.colliders.len()).toBe(before)
    expect(fleet.vehicles).toHaveLength(0)
  })
})
