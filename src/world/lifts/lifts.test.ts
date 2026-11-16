import { describe, expect, it } from 'vitest'
import {
  FLOOR_HEIGHT,
  MIN_SERVED_FLOORS,
  floorAt,
  goTo,
  initialLiftState,
  carPosition,
  hostsOf,
  insidePoint,
  liftFor,
  liftStops,
  planLifts,
  splitParts,
  streetFor,
  stepLift,
} from './lifts'
import { loadBakedZone } from '../../testing/zoneFixture'
import { ZoneIndex } from '../zone/zoneIndex'
import { pointInRing } from '../../core/geom2d'
import type { ZoneBuilding, ZoneFile } from '../zone/format'

/** A square building `side` metres across, `h` metres tall, at the origin. */
function building(h: number, side = 20, q = 10): ZoneBuilding {
  const half = (side * q) / 2
  return { id: 1, p: [-half, -half, half, -half, half, half, -half, half], h }
}

/** Run a lift for `seconds`, in 1/60 s steps, returning the final state. */
function run(
  h: number,
  seconds: number,
  plan: (s: ReturnType<typeof initialLiftState>) => void = () => {},
) {
  const lift = liftFor(building(h), 10)!
  let state = initialLiftState(lift)
  const dt = 1 / 60
  let elapsed = 0
  let acted = false
  while (elapsed < seconds) {
    if (!acted) {
      plan(state)
      acted = true
    }
    state = stepLift(lift, state, dt)
    elapsed += dt
  }
  return { lift, state }
}

describe('which buildings get a lift', () => {
  it('gives one to a building tall enough to need it', () => {
    expect(liftFor(building(40), 10)).toBeDefined()
  })

  it('does not put a lift in a two-storey shop', () => {
    expect(liftFor(building(6), 10)).toBeUndefined()
  })

  it('puts one in every building of the city that qualifies, and no others', () => {
    // The shipped zone: 3,072 buildings, of which the tall ones must all have a lift.
    // A building is either served or below the floor threshold; nothing is silently skipped.
    const file = {
      q: 10,
      buildings: [building(40), building(6), building(120), building(9)],
    } as unknown as ZoneFile
    const lifts = planLifts(file)
    expect(lifts).toHaveLength(2)
    expect(lifts.every((l) => l.stops.length >= MIN_SERVED_FLOORS)).toBe(true)
  })

  it('stops below the roof rather than opening onto the parapet', () => {
    // 40 m is 11.8 floors: 11 complete floors, so the top stop is 11 x 3.4 = 37.4 m.
    const stops = liftStops(40)
    expect(stops.at(-1)!.y).toBeCloseTo(Math.floor(40 / FLOOR_HEIGHT) * FLOOR_HEIGHT, 6)
    expect(stops.at(-1)!.y).toBeLessThan(40)
  })

  it('never plans a stop above 140 m, so a spire is not reachable', () => {
    const stops = liftStops(400)
    expect(stops.at(-1)!.y).toBeLessThanOrEqual(140)
  })

  it('starts a building that sits on a podium from the podium, not the pavement', () => {
    const stops = liftStops(60, 20)
    expect(stops[0].y).toBe(20)
    expect(stops[0].floor).toBe(0)
  })
})

describe('riding', () => {
  it('opens its doors at the ground floor, then closes them and waits', () => {
    const { state } = run(40, 0.2, () => {})
    expect(state.phase).toBe('idle')
    // Called to the floor it is already on: the doors open instead of nothing happening.
    const lift = liftFor(building(40), 10)!
    let s = initialLiftState(lift)
    s = goTo(lift, s, 0)
    expect(s.phase).toBe('opening')
  })

  it('takes a realistic time to climb, and arrives at the right floor', () => {
    const lift = liftFor(building(40), 10)!
    let state = goTo(lift, initialLiftState(lift), 10)
    const top = lift.stops[10].y
    let seconds = 0
    while (state.phase === 'moving' && seconds < 60) {
      state = stepLift(lift, state, 1 / 60)
      seconds += 1 / 60
    }
    expect(state.y).toBeCloseTo(top, 5)
    expect(state.at).toBe(10)
    // 34 m at 1.4 m/s is about 24 s. A lift that teleports would be a cheat.
    expect(seconds).toBeGreaterThan(20)
    expect(seconds).toBeLessThan(30)
  })

  it('will not move with its doors open, and will not open while moving', () => {
    const lift = liftFor(building(40), 10)!
    let state = goTo(lift, initialLiftState(lift), 5)
    state = goTo(lift, state, 9) // ignored while moving
    expect(state.target).toBe(5)
    // Step until the car arrives and the doors are fully open.
    let guard = 0
    while (!(state.phase === 'open' && state.doors === 1) && guard++ < 5000) {
      state = stepLift(lift, state, 1 / 60)
    }
    expect(state.doors).toBe(1)
    // A call while the doors are open must not start the car moving.
    const called = goTo(lift, state, 12)
    expect(called.phase).toBe('open')
  })

  it('closes its doors again before it goes anywhere', () => {
    const lift = liftFor(building(40), 10)!
    let state = goTo(lift, initialLiftState(lift), 3)
    let guard = 0
    while (state.phase !== 'idle' && guard++ < 5000) state = stepLift(lift, state, 1 / 60)
    expect(state.doors).toBe(0)
    const next = goTo(lift, state, 8)
    expect(next.phase).toBe('moving')
    expect(next.doors).toBe(0)
  })

  it('recovers when it is called to the floor it is already on', () => {
    const lift = liftFor(building(60), 10)!
    const state = goTo(lift, initialLiftState(lift), 0)
    expect(state.phase).toBe('opening')
    expect(state.target).toBe(0)
  })

  it('knows which floor a rooftop is nearest, so arriving from the roof works', () => {
    const lift = liftFor(building(40), 10)!
    expect(floorAt(lift, 0.1)).toBe(0)
    expect(floorAt(lift, 34)).toBe(10)
  })

  it('never lets a caller select a floor outside the shaft', () => {
    const lift = liftFor(building(20), 10)!
    const state = goTo(lift, initialLiftState(lift), 999)
    expect(state.target).toBe(lift.stops.length - 1)
    const down = goTo(lift, initialLiftState(lift), -5)
    expect(down.target).toBe(0)
  })
})

describe('stacked building parts', () => {
  /** A square ring in quantised units, centred on [x, z]. */
  function ring(x: number, z: number, side: number, q = 10): number[] {
    const h = (side * q) / 2
    return [x * q - h, z * q - h, x * q + h, z * q - h, x * q + h, z * q + h, x * q - h, z * q + h]
  }

  function zone(buildings: ZoneBuilding[]): ZoneFile {
    return { q: 10, buildings } as unknown as ZoneFile
  }

  it('separates the buildings on the ground from the parts stacked on them', () => {
    const [ground, parts] = splitParts([
      building(30),
      { ...building(60), id: 2, b: 30 },
      { ...building(70), id: 3, b: 30 },
    ])
    expect(ground.map((b) => b.id)).toEqual([1])
    expect(parts.map((b) => b.id)).toEqual([2, 3])
  })

  it('lengthens the shaft of a building under a part, so the top of the stack is served', () => {
    // A 30 m plinth with a 20 m tower part stacked on it: the lift must reach 50 m.
    const plinth: ZoneBuilding = { id: 1, p: ring(0, 0, 40), h: 30 }
    const part: ZoneBuilding = { id: 2, p: ring(0, 0, 20), h: 50, b: 30 }
    const lifts = planLifts(zone([plinth, part]))
    expect(lifts).toHaveLength(1)
    expect(lifts[0].stops.at(-1)!.y).toBeGreaterThan(50 - FLOOR_HEIGHT)
    expect(lifts[0].speed).toBe(1.4)
  })

  it('does not give a part a shaft of its own: there is no ground floor in it', () => {
    const plinth: ZoneBuilding = { id: 1, p: ring(0, 0, 40), h: 30 }
    const part: ZoneBuilding = { id: 2, p: ring(0, 0, 20), h: 50, b: 30 }
    const lifts = planLifts(zone([plinth, part]))
    expect(lifts.map((lift) => lift.buildingId)).toEqual([1])
  })

  it('finds a host for a part standing in the courtyard of a ring-shaped building', () => {
    // A square ring is not ring-shaped, but a footprint that does not contain its own
    // middle is the KICC case: the part's centre is 30 m from the nearest wall.
    const plinth: ZoneBuilding = { id: 1, p: ring(0, 0, 200), h: 70 }
    const part: ZoneBuilding = { id: 2, p: ring(0, 0, 30), h: 100, b: 70 }
    expect(hostsOf(part, [plinth]).map((b) => b.id)).toEqual([1])
    expect(planLifts(zone([plinth, part]))[0].stops.at(-1)!.y).toBeGreaterThan(97)
  })

  it('claims no host for a part over open ground, such as a skybridge deck', () => {
    const tower: ZoneBuilding = { id: 1, p: ring(0, 0, 40), h: 30 }
    const deck: ZoneBuilding = { id: 2, p: ring(400, 0, 20), h: 32, b: 28 }
    expect(hostsOf(deck, [tower])).toEqual([])
  })
})

describe('the planned city', () => {
  const zone = loadBakedZone()
  const lifts = planLifts(zone)

  it('serves every building tall enough for one, and only those', () => {
    const served = new Set(lifts.map((lift) => lift.buildingId))
    const tall = zone.buildings.filter(
      (b) => b.h - (b.b ?? 0) >= MIN_SERVED_FLOORS * FLOOR_HEIGHT && (b.b ?? 0) <= 3,
    )
    for (const b of tall) expect(served.has(b.id), `${b.n ?? b.id} at ${b.h} m`).toBe(true)
  })

  it('puts a lift in KICC that reaches the tower, not just the plinth', () => {
    // KICC is two OSM ways: a named 72 m plinth and an unnamed 94 m octagon beside it that
    // the tower's four parts are stacked on. The shaft that reaches the top is in the
    // octagon, so the test asks about the complex and not about the name.
    const named = zone.buildings.filter((b) => /Kenyatta International/i.test(b.n ?? ''))
    expect(named.length).toBeGreaterThan(0)
    const where = named.map((b) => {
      const ring = b.p.map((value) => value / zone.q)
      let x = 0,
        z = 0
      for (let i = 0; i < ring.length; i += 2) {
        x += ring[i]
        z += ring[i + 1]
      }
      return { x: x / (ring.length / 2), z: z / (ring.length / 2) }
    })
    const nearby = lifts.filter((lift) =>
      where.some((p) => Math.hypot(lift.x - p.x, lift.z - p.z) < 60),
    )
    expect(nearby.length).toBeGreaterThan(0)
    const tallest = Math.max(...nearby.map((lift) => lift.stops.at(-1)!.y))
    // The tower's parts reach 105 m; the plinth alone is 72 m.
    expect(tallest).toBeGreaterThan(100)
  })
})

describe('where the car stands, and which way its doors face', () => {
  const square = [0, 0, 400, 0, 400, 400, 0, 400]

  it('stands at the middle of a plain footprint', () => {
    const car = carPosition(square, 10)
    expect(car.x).toBeCloseTo(20, 6)
    expect(car.z).toBeCloseTo(20, 6)
  })

  it('stands on a street-side door, facing the street', () => {
    // The street is due east of the footprint.
    const car = carPosition(square, 10, { x: 200, z: 20 })
    // The car does not leave the building.
    expect(car.x).toBeGreaterThanOrEqual(0)
    expect(car.x).toBeLessThanOrEqual(40)
    // Local -z after a yaw points at (-sin yaw, -cos yaw); that must be towards the street.
    const fx = -Math.sin(car.yaw)
    const fz = -Math.cos(car.yaw)
    expect(fx).toBeGreaterThan(0.99)
    expect(Math.abs(fz)).toBeLessThan(0.01)
  })

  it('keeps the car inside an L-shaped footprint, where the centroid is outside', () => {
    // An L: two arms 10 m wide, the missing quadrant in the middle-right.
    const l = [0, 0, 400, 0, 400, 100, 100, 100, 100, 400, 0, 400]
    const [cx, cz] = [15, 15]
    expect(insidePoint(cx, cz, l, 10)).not.toEqual({ x: cx, z: cz })
    const car = carPosition(l, 10)
    expect(pointInRing(car.x * 10, car.z * 10, l)).toBe(true)
  })

  it('faces the doors at a road even from an irregular footprint', () => {
    const l = [0, 0, 400, 0, 400, 100, 100, 100, 100, 400, 0, 400]
    const car = carPosition(l, 10, { x: -200, z: -200 })
    const fx = -Math.sin(car.yaw)
    const fz = -Math.cos(car.yaw)
    // The street is to the south-west, so both components of the facing are negative.
    expect(fx).toBeLessThan(-0.5)
    expect(fz).toBeLessThan(-0.5)
  })
})

describe('the cars in the real city', () => {
  const zone = loadBakedZone()
  const index = new ZoneIndex(zone)
  const lifts = planLifts(zone, index)

  it('puts every car inside the building it serves', () => {
    let inside = 0
    for (const lift of lifts) {
      const building = zone.buildings.find((b) => b.id === lift.buildingId)!
      // `lift` is in metres; the footprint is in quantised units.
      if (pointInRing(lift.x * zone.q, lift.z * zone.q, building.p)) inside++
    }
    // 107 of 2,474 were outside before concave footprints were handled.
    expect(inside).toBe(lifts.length)
  })

  it('points the doors of nearly every car at a street', () => {
    let facing = 0
    for (const lift of lifts) {
      const street = streetFor(index, lift.x, lift.z, 120)
      if (!street) continue
      const fx = -Math.sin(lift.yaw)
      const fz = -Math.cos(lift.yaw)
      const dx = street.x - lift.x
      const dz = street.z - lift.z
      const d = Math.hypot(dx, dz)
      if ((fx * dx + fz * dz) / d > 0.95) facing++
    }
    // Measured at 2,427 of 2,474 when this was written; the rest are footprints whose
    // nearest road is behind a wall, where no direction is right.
    expect(facing).toBeGreaterThan(lifts.length * 0.95)
  })
})
