import { describe, expect, it } from 'vitest'
import { VEHICLES, VEHICLE_KINDS, type VehicleKind } from '../../config/vehicles'
import { box, createBoxWorld, type Box } from '../../testing/boxWorld'
import {
  PARKED,
  createVehicleState,
  isAirborne,
  isAtRest,
  stepVehicle,
  type DriveInput,
  type Movable,
  type Surroundings,
  type VehicleState,
} from './vehicleSim'

/**
 * The driving model, on a test track: flat ground and a few boxes (testing/boxWorld.ts).
 * Headings follow the game's convention: yaw 0 faces north, which is -z.
 */

const FLAT = createBoxWorld()
const GO: DriveInput = { throttle: 1, steer: 0, handbrake: false }
const COAST: DriveInput = { throttle: 0, steer: 0, handbrake: false }
const BRAKE: DriveInput = { throttle: -1, steer: 0, handbrake: false }

function drive(
  state: VehicleState,
  kind: VehicleKind,
  input: DriveInput,
  seconds: number,
  world: Surroundings = FLAT,
  hz = 60,
  each?: (state: VehicleState) => void,
): VehicleState {
  const steps = Math.round(seconds * hz)
  for (let i = 0; i < steps; i++) {
    stepVehicle(state, VEHICLES[kind], input, world, 1 / hz)
    each?.(state)
  }
  return state
}

/** A vehicle standing on the ground, facing north unless told otherwise. */
const parked = (x = 0, z = 0, yaw = 0) => createVehicleState(x, 0, z, yaw)

/** Seconds of full throttle from rest to reach a speed. */
function timeTo(kind: VehicleKind, speed: number): number {
  const state = parked()
  for (let step = 1; step <= 60 * 60; step++) {
    stepVehicle(state, VEHICLES[kind], GO, FLAT, 1 / 60)
    if (state.speed >= speed) return step / 60
  }
  return Infinity
}

describe('engine and brakes', () => {
  it.each(VEHICLE_KINDS)('the %s reaches its top speed and goes no faster', (kind) => {
    const spec = VEHICLES[kind]
    let fastest = 0
    const state = drive(parked(), kind, GO, 45, FLAT, 60, (s) => {
      fastest = Math.max(fastest, s.speed)
    })
    expect(state.speed).toBeGreaterThan(spec.topSpeed * 0.97)
    expect(fastest).toBeLessThanOrEqual(spec.topSpeed + 1e-6)
    // Straight north: no drift sideways, no turn.
    expect(state.x).toBeCloseTo(0, 6)
    expect(state.yaw).toBeCloseTo(0, 6)
    expect(state.z).toBeLessThan(-500)
  })

  it('is quickest off the line on a boda and slowest in a matatu', () => {
    const fifty = 50 / 3.6
    const boda = timeTo('boda', fifty)
    const car = timeTo('car', fifty)
    const matatu = timeTo('matatu', fifty)
    expect(boda).toBeLessThan(car)
    expect(car).toBeLessThan(matatu)
    expect(boda).toBeGreaterThan(1) // quick, not a rocket
    expect(matatu).toBeLessThan(6)
  })

  it('brakes to a standstill, and only then backs up', () => {
    const state = drive(parked(), 'car', GO, 6)
    const cruising = state.speed
    expect(cruising).toBeGreaterThan(20)

    let stoppedAt = Infinity
    let braked = false
    drive(state, 'car', BRAKE, 12, FLAT, 60, (s) => {
      if (s.braking) braked = true
      if (s.speed <= 0 && stoppedAt === Infinity) stoppedAt = s.z
    })
    expect(braked).toBe(true)
    expect(stoppedAt).not.toBe(Infinity)
    // Still holding the same pedal, it is now in reverse: moving back south, capped.
    expect(state.speed).toBeLessThan(-2)
    expect(state.speed).toBeGreaterThanOrEqual(-VEHICLES.car.reverseSpeed - 1e-6)
    expect(state.z).toBeGreaterThan(stoppedAt)
  })

  it('stops in a believable distance from 100 km/h', () => {
    for (const kind of VEHICLE_KINDS) {
      const state = parked()
      while (state.speed < Math.min(100 / 3.6, VEHICLES[kind].topSpeed * 0.95)) {
        stepVehicle(state, VEHICLES[kind], GO, FLAT, 1 / 60)
      }
      const from = state.z
      const speed = state.speed
      while (state.speed > 0.01) stepVehicle(state, VEHICLES[kind], BRAKE, FLAT, 1 / 60)
      const distance = from - state.z
      // A real car on dry tarmac needs about 35 to 45 m; arcade brakes are a bit keener.
      expect(distance).toBeGreaterThan((speed * speed) / (2 * VEHICLES[kind].brake) - 1)
      expect(distance).toBeLessThan(50)
    }
  })

  it('rolls to a halt with no pedal, and a parked vehicle stays parked', () => {
    const state = drive(parked(), 'matatu', GO, 5)
    drive(state, 'matatu', COAST, 60)
    expect(isAtRest(state)).toBe(true)

    const still = drive(parked(3, 4, 1), 'car', PARKED, 5)
    expect([still.x, still.z, still.yaw]).toEqual([3, 4, 1])
    expect(isAtRest(still)).toBe(true)
  })

  it('goes further on more throttle, so a thumb stick can cruise', () => {
    const half = drive(parked(), 'car', { ...GO, throttle: 0.5 }, 40)
    const full = drive(parked(), 'car', GO, 40)
    expect(half.speed).toBeGreaterThan(VEHICLES.car.topSpeed * 0.5)
    expect(half.speed).toBeLessThan(full.speed * 0.8)
  })
})

describe('steering', () => {
  it('turns right for positive steer and left for negative, by the same amount', () => {
    const right = drive(parked(), 'car', { ...GO, throttle: 0.4, steer: 1 }, 3)
    const left = drive(parked(), 'car', { ...GO, throttle: 0.4, steer: -1 }, 3)
    // Facing north, right is east (+x) and a right turn is clockwise: yaw goes down.
    expect(right.x).toBeGreaterThan(1)
    expect(right.yaw).toBeLessThan(-0.5)
    expect(left.x).toBeCloseTo(-right.x, 6)
    expect(left.yaw).toBeCloseTo(-right.yaw, 6)
    expect(left.z).toBeCloseTo(right.z, 6)
  })

  it('turns as tightly at walking pace as the steering lock allows', () => {
    for (const kind of VEHICLE_KINDS) {
      const spec = VEHICLES[kind]
      // A touch of throttle for two seconds: well under walking pace, wheels hard over.
      const state = drive(parked(), kind, { throttle: 0.05, steer: 1, handbrake: false }, 2)
      expect(state.speed).toBeLessThan(1.5)
      // Turn per metre travelled is one over the radius of the circle being driven.
      const radius = state.speed / Math.abs(state.yawRate)
      const geometric = spec.wheelbase / Math.tan(spec.steerLock)
      expect(radius).toBeGreaterThan(geometric * 0.95)
      expect(radius).toBeLessThan(geometric * 1.1)
      expect(state.steerAngle).toBeCloseTo(spec.steerLock, 2)
    }
  })

  it('holds its line through a fast corner, and slides when the handbrake comes on', () => {
    const state = drive(parked(), 'car', GO, 4)
    let worstSlide = 0
    drive(state, 'car', { throttle: 0.6, steer: 1, handbrake: false }, 2, FLAT, 60, (s) => {
      worstSlide = Math.max(worstSlide, Math.abs(s.slide))
    })
    expect(worstSlide).toBeLessThan(0.5)

    const drifting = drive(parked(), 'car', GO, 4)
    let slid = 0
    drive(drifting, 'car', { throttle: 0, steer: 1, handbrake: true }, 1.5, FLAT, 60, (s) => {
      slid = Math.max(slid, Math.abs(s.slide))
    })
    expect(slid).toBeGreaterThan(2)
  })

  it('steers less sharply the faster it goes', () => {
    const turnAfter = (seconds: number) => {
      const state = drive(parked(), 'car', GO, seconds)
      const before = state.yaw
      drive(state, 'car', { throttle: 0.5, steer: 1, handbrake: false }, 0.5)
      return Math.abs(state.yaw - before) / Math.max(state.speed, 1)
    }
    // Turn per metre travelled: much smaller at speed than in town.
    expect(turnAfter(8)).toBeLessThan(turnAfter(1.5) * 0.5)
  })

  it('reports forces the bodywork can lean on', () => {
    const state = drive(parked(), 'car', GO, 3)
    expect(state.accelLong).toBeGreaterThan(0)
    drive(state, 'car', { throttle: 0.5, steer: 1, handbrake: false }, 1)
    // Turning right, the car is pushed to the right: centripetal.
    expect(state.accelLat).toBeGreaterThan(3)
    expect(state.steerAngle).toBeGreaterThan(0)
  })
})

describe('time steps', () => {
  it('drives the same route at 30, 60 and 144 steps a second', () => {
    const route = (hz: number) => {
      const state = parked()
      drive(state, 'car', GO, 3, FLAT, hz)
      drive(state, 'car', { throttle: 0.7, steer: 0.6, handbrake: false }, 2, FLAT, hz)
      drive(state, 'car', BRAKE, 1, FLAT, hz)
      return state
    }
    const reference = route(60)
    for (const hz of [30, 144]) {
      const other = route(hz)
      expect(Math.hypot(other.x - reference.x, other.z - reference.z)).toBeLessThan(2.5)
      expect(Math.abs(other.yaw - reference.yaw)).toBeLessThan(0.08)
      expect(Math.abs(other.speed - reference.speed)).toBeLessThan(1)
    }
  })

  it('does nothing in no time', () => {
    const state = drive(parked(), 'car', GO, 2)
    const before = { ...state }
    stepVehicle(state, VEHICLES.car, GO, FLAT, 0)
    expect(state.x).toBe(before.x)
    expect(state.z).toBe(before.z)
    expect(state.speed).toBe(before.speed)
  })
})

describe('collisions', () => {
  /** A wall across the road, its near face `distance` metres north of the origin. */
  const wallAhead = (distance: number): Box => box(0, -distance - 1, 40, 2, 4)

  it.each(VEHICLE_KINDS)('the %s stops at a wall instead of passing through it', (kind) => {
    const spec = VEHICLES[kind]
    const world = createBoxWorld({ boxes: [wallAhead(40)] })
    let hardest = 0
    let deepest = 0
    const state = drive(parked(), kind, GO, 8, world, 60, (s) => {
      hardest = Math.max(hardest, s.impact)
      // How far the nose is past the wall's face.
      deepest = Math.max(deepest, -40 - (s.z - spec.length / 2))
    })
    expect(hardest).toBeGreaterThan(8)
    expect(deepest).toBeLessThan(0.2)
    // Still pressing the pedal, it sits against the wall, going nowhere.
    expect(Math.abs(state.speed)).toBeLessThan(1)
    expect(state.z - spec.length / 2).toBeGreaterThan(-40.2)
    expect(state.z - spec.length / 2).toBeLessThan(-39)
  })

  it('never tunnels through a thin wall, even flat out on a slow frame', () => {
    const world = createBoxWorld({ boxes: [box(0, -300, 40, 0.3, 4)] })
    const state = parked()
    // 20 steps a second at top speed: nearly two metres a step.
    drive(state, 'car', GO, 30, world, 20)
    expect(state.z).toBeGreaterThan(-300)
  })

  it('glances off a wall met at an angle and runs along it', () => {
    // A long wall on the right, parallel to the road; approach it at about 25 degrees.
    const world = createBoxWorld({ boxes: [box(6, -100, 2, 400, 4)] })
    const state = createVehicleState(0, 0, 0, -0.44)
    drive(state, 'car', { ...GO, throttle: 0.6 }, 6, world)
    const flank = state.x + VEHICLES.car.width / 2
    expect(flank).toBeLessThan(5.3) // did not go through
    expect(state.z).toBeLessThan(-40) // kept moving
    expect(Math.abs(state.yaw)).toBeLessThan(0.2) // turned to run along it
  })

  it('shoves what it hits, harder if that is lighter than itself', () => {
    const shoveGiven = (driver: VehicleKind, otherMass: number) => {
      let pushed = 0
      const other: Movable = {
        mass: otherMass,
        vx: 0,
        vz: 0,
        shove: (dvx, dvz) => {
          pushed += Math.hypot(dvx, dvz)
        },
      }
      const world = createBoxWorld({ boxes: [{ ...box(0, -31, 2, 4, 1.5), movable: other }] })
      const state = drive(parked(), driver, GO, 4, world)
      return { pushed, speed: state.speed }
    }
    const matatuIntoBoda = shoveGiven('matatu', VEHICLES.boda.mass)
    const bodaIntoMatatu = shoveGiven('boda', VEHICLES.matatu.mass)
    expect(matatuIntoBoda.pushed).toBeGreaterThan(bodaIntoMatatu.pushed * 3)
    // The heavy one barely notices; the light one is stopped.
    expect(matatuIntoBoda.speed).toBeGreaterThan(bodaIntoMatatu.speed)
  })
})

describe('ground', () => {
  it('climbs a ramp nose up, and sits still on it when parked', () => {
    // A 10% slope rising to the north.
    const world = createBoxWorld({ heightAt: (_x, z) => Math.max(0, -z - 20) * 0.1 })
    const state = drive(parked(), 'car', { ...GO, throttle: 0.5 }, 6, world)
    expect(state.y).toBeGreaterThan(1)
    expect(state.pitch).toBeCloseTo(Math.atan(0.1), 2)
    expect(isAirborne(state)).toBe(false)

    drive(state, 'car', BRAKE, 0.2, world)
    drive(state, 'car', PARKED, 6, world)
    const held = state.z
    drive(state, 'car', PARKED, 4, world)
    expect(state.z).toBeCloseTo(held, 3)
    expect(isAtRest(state)).toBe(true)
  })

  it('loses speed faster up a hill than on the flat, and does not roll back once stopped', () => {
    const coast = (slope: number) => {
      const world = createBoxWorld({ heightAt: (_x, z) => Math.max(0, -z) * slope })
      const state = drive(parked(), 'car', GO, 3, world)
      const from = state.z
      drive(state, 'car', COAST, 30, world)
      return { rolled: from - state.z, state, world }
    }
    const flat = coast(0)
    const hill = coast(0.12)
    expect(hill.rolled).toBeLessThan(flat.rolled * 0.7)
    // Stopped on the slope with no brake held: it stays where it is, as if left in gear.
    expect(isAtRest(hill.state)).toBe(true)
    const held = hill.state.z
    drive(hill.state, 'car', COAST, 5, hill.world)
    expect(hill.state.z).toBe(held)
  })

  it('takes a kerb in its stride and is stopped by a loading dock', () => {
    const kerb = createBoxWorld({ boxes: [box(0, -60, 40, 80, 0.15)] })
    const over = drive(parked(), 'car', { ...GO, throttle: 0.4 }, 6, kerb)
    expect(over.y).toBeCloseTo(0.15, 2)
    expect(over.z).toBeLessThan(-30)

    const dock = createBoxWorld({ boxes: [box(0, -60, 40, 80, 0.75)] })
    const blocked = drive(parked(), 'car', { ...GO, throttle: 0.4 }, 6, dock)
    expect(blocked.y).toBeLessThan(0.05)
    expect(blocked.z - VEHICLES.car.length / 2).toBeGreaterThan(-20.3)
  })

  it('flies off the end of a deck, lands and drives on', () => {
    // A deck 4 m up that ends 30 m to the north; open ground beyond and below.
    const world = createBoxWorld({ boxes: [box(0, 10, 12, 80, 4)] })
    const state = createVehicleState(0, 4, 0, 0)
    let flew = 0
    let landing = 0
    drive(state, 'car', GO, 6, world, 60, (s) => {
      if (isAirborne(s)) flew++
      landing = Math.max(landing, s.landing)
    })
    expect(flew).toBeGreaterThan(15)
    expect(landing).toBeGreaterThan(5)
    expect(state.y).toBeCloseTo(0, 3)
    expect(isAirborne(state)).toBe(false)
    expect(state.speed).toBeGreaterThan(10)
    expect(state.z).toBeLessThan(-60)
  })

  it('falls for ever where there is no ground, without breaking', () => {
    const world = createBoxWorld({ bottomless: true })
    const state = drive(parked(), 'boda', GO, 3, world)
    expect(state.y).toBeLessThan(-20)
    expect(Number.isFinite(state.y + state.x + state.z + state.yaw + state.pitch)).toBe(true)
  })
})
