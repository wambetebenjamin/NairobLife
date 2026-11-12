/**
 * How a vehicle moves.
 *
 * This is an arcade model, written out by hand rather than handed to a rigid-body solver,
 * for the same reason the player on foot is: the feel is then a matter of editing numbers
 * in `config/vehicles.ts`, and it behaves the same at 30 frames a second as at 144.
 *
 * A vehicle is a point with a heading, moving on the ground plane:
 *
 *  - **Engine and brakes** change the speed along the heading.
 *  - **Tyres** scrub off sideways speed, up to a limit (`grip`). Ask for more than that,
 *    with the handbrake or by turning too hard, and the vehicle slides.
 *  - **Steering** turns the heading at the rate a real car's geometry would, capped so
 *    that full lock at speed asks for a set sideways acceleration (`steerG`).
 *  - **Each axle** follows the ground under it, or falls if there is none. The body's
 *    pitch comes from the two heights, so ramps, kerbs and drops need no special cases.
 *  - **Collisions** treat the body as a few circles along its centre line. Whatever a
 *    circle overlaps pushes the body back and turns it, as a rigid body would be.
 *
 * Nothing here knows about three.js, React or Rapier: the world is seen through the
 * small `Surroundings` interface, so the tests can drive a vehicle in plain Node.
 *
 * Conventions (see docs/ARCHITECTURE.md): x east, y up, z south; yaw 0 faces north and
 * positive yaw turns left; steering input +1 is right.
 */
import type { VehicleSpec } from '../../config/vehicles'
import { approach, clamp, damp, wrapAngle } from '../../core/math'

export interface DriveInput {
  /** 1 = full power forwards, -1 = brake, then reverse. */
  throttle: number
  /** -1 = full left, 1 = full right. */
  steer: number
  handbrake: boolean
}

/** A vehicle nobody is driving: in gear with the handbrake on. */
export const PARKED: DriveInput = { throttle: 0, steer: 0, handbrake: true }

export interface VehicleState {
  /** Centre of the vehicle on the ground plane. */
  x: number
  z: number
  yaw: number
  /** Velocity on the ground plane, in m/s. */
  vx: number
  vz: number
  yawRate: number

  /** Height of the ground contact under each axle, and how fast it is falling. */
  yFront: number
  yRear: number
  vyFront: number
  vyRear: number
  groundedFront: boolean
  groundedRear: boolean

  /** Steering wheel position, -1..1, lagging the input. */
  steer: number

  // ---- worked out by every step, for the camera, the HUD and the model
  /** Height of the centre's ground contact. */
  y: number
  /** Nose up is positive. */
  pitch: number
  /** Speed along the heading; negative in reverse. */
  speed: number
  /** Sideways speed; positive is sliding to the right. */
  slide: number
  /** Angle of the front wheels; positive is right. */
  steerAngle: number
  /** Acceleration felt along and across the body, in m/s². */
  accelLong: number
  accelLat: number
  braking: boolean
  /** Hardest knock during the last step, as a closing speed in m/s. Zero if none. */
  impact: number
  /** Speed of the hardest landing during the last step, in m/s. Zero if none. */
  landing: number
}

/** A point on the nearest surface to a query point. */
export interface SurfacePoint {
  x: number
  y: number
  z: number
  /** The query point is inside something solid, so there is no direction out. */
  inside: boolean
  /** Which movable thing the surface belongs to (see Surroundings.movable), or -1 for the fixed world. */
  body: number
}

/** Something that gives way when hit: another vehicle. */
export interface Movable {
  /** In the same units as VehicleSpec.mass. */
  mass: number
  vx: number
  vz: number
  /** Change its velocity by this much. */
  shove(dvx: number, dvz: number): void
}

/** What a vehicle can sense of the world around it. */
export interface Surroundings {
  /** Find the nearest solid surface to a point. False when there is nothing at all. */
  closest(x: number, y: number, z: number, out: SurfacePoint): boolean
  /**
   * Height of the first surface below a point, looking no further down than `maxDrop`.
   * Returns NO_GROUND when there is none in reach.
   */
  ground(x: number, y: number, z: number, maxDrop: number): number
  /** Look up a movable thing by the id `closest` reported. Worlds with none can leave this out. */
  movable?(body: number): Movable | undefined
}

export const NO_GROUND = -Infinity

/** Falling. Stronger than real gravity, like the player's, so drops feel weighty not floaty. */
const GRAVITY = 20
const TERMINAL_SPEED = 60
/** Real gravity, for rolling down ramps. */
const SLOPE_GRAVITY = 9.81

/** Collision circles ride this far above the ground, so kerbs and ramp feet pass under. */
const CLEARANCE = 0.3
/** An axle climbs a ledge up to this tall without being stopped by it. */
const STEP_UP = 0.45
/** An axle stays glued to ground that falls away by up to this much in one step. */
const SNAP_DOWN = 0.35
/** Ground is looked for from this far above the axle's last height. */
const PROBE_UP = 0.9
/** Steepest the body may sit with an end in the air, as a rise over the wheelbase (about 35°). */
const MAX_PITCH_TAN = 0.7

/** Slowing from the handbrake alone, in m/s². */
const HANDBRAKE_DECEL = 6.5
/** With the handbrake on, the steering may ask for this much more turn. */
const HANDBRAKE_STEER = 2.4
/** Share of steering authority lost by top speed, which keeps motorway driving calm. */
const HIGH_SPEED_STEER_LOSS = 0.4
/** Reverse gear is short: this share of forward acceleration. */
const REVERSE_ACCEL = 0.7
/** Share of top speed that the lightest touch of throttle will eventually reach. */
const CREEP = 0.3
/** Below this speed with no throttle, the vehicle holds still, even on a ramp. */
const HOLD_SPEED = 0.5

/** Bounce off walls: 0 is a dead stop, 1 a rubber ball. */
const RESTITUTION = 0.12
/** Speed lost scraping along a wall, as a share of the force pressing into it. */
const WALL_FRICTION = 0.35
/** How much of a knock's spin is kept. Below 1 so a clipped wall does not mean a pirouette. */
const IMPACT_SPIN = 0.4
/** The most speed one knock can give another vehicle, in m/s. Stops a matatu firing a boda into orbit. */
const MAX_SHOVE = 14

const MAX_SUBSTEPS = 10
const SOLVER_PASSES = 3

export function createVehicleState(x: number, y: number, z: number, yaw: number): VehicleState {
  return {
    x,
    z,
    yaw,
    vx: 0,
    vz: 0,
    yawRate: 0,
    yFront: y,
    yRear: y,
    vyFront: 0,
    vyRear: 0,
    groundedFront: true,
    groundedRear: true,
    steer: 0,
    y,
    pitch: 0,
    speed: 0,
    slide: 0,
    steerAngle: 0,
    accelLong: 0,
    accelLat: 0,
    braking: false,
    impact: 0,
    landing: 0,
  }
}

/** True when no part of the vehicle is touching the ground. */
export function isAirborne(s: VehicleState): boolean {
  return !s.groundedFront && !s.groundedRear
}

/** True when the vehicle has come to rest and can stop being simulated. */
export function isAtRest(s: VehicleState): boolean {
  return (
    s.groundedFront &&
    s.groundedRear &&
    Math.abs(s.vx) < 0.03 &&
    Math.abs(s.vz) < 0.03 &&
    Math.abs(s.yawRate) < 0.02
  )
}

/**
 * Advance a vehicle by `dt` seconds. Long or fast frames are cut into shorter steps so a
 * collision circle can never jump clean through a wall.
 */
export function stepVehicle(
  s: VehicleState,
  spec: VehicleSpec,
  input: DriveInput,
  world: Surroundings,
  dt: number,
): void {
  s.impact = 0
  s.landing = 0
  if (dt <= 0) return
  const fastest = Math.hypot(s.vx, s.vz) + Math.abs(s.yawRate) * spec.length * 0.5 + spec.accel * dt
  const steps = clamp(Math.ceil((fastest * dt) / (spec.circleRadius * 0.5)), 1, MAX_SUBSTEPS)
  const h = dt / steps
  for (let i = 0; i < steps; i++) {
    drive(s, spec, input, h)
    s.x += s.vx * h
    s.z += s.vz * h
    s.yaw = wrapAngle(s.yaw + s.yawRate * h)
    collide(s, spec, world)
    followGround(s, spec, world, h)
  }
}

// ---------------------------------------------------------------------------- engine, tyres, steering

function drive(s: VehicleState, spec: VehicleSpec, input: DriveInput, h: number): void {
  const sin = Math.sin(s.yaw)
  const cos = Math.cos(s.yaw)
  // Forward is (-sin, -cos); right is (cos, -sin).
  let forward = -s.vx * sin - s.vz * cos
  let sideways = s.vx * cos - s.vz * sin
  const before = forward

  const wanted = clamp(input.steer, -1, 1)
  const easing = Math.abs(wanted) < Math.abs(s.steer) || wanted * s.steer < 0
  s.steer = approach(s.steer, wanted, spec.steerRate * (easing ? 1.7 : 1) * h)

  s.braking = false
  if (!s.groundedFront && !s.groundedRear) {
    // In the air nothing can push on the road: carry on, and let any spin die away.
    s.yawRate *= Math.exp(-0.6 * h)
    s.steerAngle = spec.steerLock * s.steer
    s.accelLong = 0
    s.accelLat = 0
    s.speed = forward
    s.slide = sideways
    return
  }

  // ---- along the heading: engine, brakes, slope, rolling resistance
  const throttle = clamp(input.throttle, -1, 1)
  let coasting = throttle === 0
  if (throttle > 0) {
    if (forward > -HOLD_SPEED) {
      // The pedal sets how fast you are trying to go as well as how hard you pull, so
      // a thumb stick held halfway cruises at about two thirds of top speed.
      const target = spec.topSpeed * (CREEP + (1 - CREEP) * throttle)
      const pull = 1 - (forward / target) * (forward / target)
      if (forward < 0 || pull > 0) forward += spec.accel * throttle * Math.max(pull, 0) * h
      else coasting = true
    } else {
      forward = Math.min(0, forward + spec.brake * throttle * h)
      s.braking = true
    }
  } else if (throttle < 0) {
    if (forward < HOLD_SPEED) {
      const target = spec.reverseSpeed * (CREEP + (1 - CREEP) * -throttle)
      const pull = 1 - (forward / target) * (forward / target)
      if (forward > 0 || pull > 0) {
        forward += spec.accel * REVERSE_ACCEL * throttle * Math.max(pull, 0) * h
      } else coasting = true
    } else {
      forward = Math.max(0, forward + spec.brake * throttle * h)
      s.braking = true
    }
  }

  if (throttle === 0 && !input.handbrake && Math.abs(forward) < HOLD_SPEED) {
    // Left in gear: creeps to a stop and stays put, even on a ramp.
    forward = approach(forward, 0, 4 * h)
  } else {
    forward -= SLOPE_GRAVITY * Math.sin(s.pitch) * h
    let resistance = coasting ? spec.rolling + spec.drag * Math.abs(forward) : 0
    if (input.handbrake) resistance += HANDBRAKE_DECEL
    forward = approach(forward, 0, resistance * h)
  }
  if (input.handbrake && Math.abs(forward) > HOLD_SPEED) s.braking = true

  // ---- across it: the tyres hold on, up to their limit
  sideways = approach(sideways, 0, (input.handbrake ? spec.handbrakeGrip : spec.grip) * h)

  // ---- steering: a real car's turning geometry, capped by a sideways-acceleration budget
  const fraction = clamp(Math.abs(forward) / spec.topSpeed, 0, 1)
  const budget =
    spec.steerG * (input.handbrake ? HANDBRAKE_STEER : 1) * (1 - HIGH_SPEED_STEER_LOSS * fraction)
  const lockTan = Math.min(
    Math.tan(spec.steerLock),
    (budget * spec.wheelbase) / Math.max(forward * forward, 1e-3),
  )
  s.steerAngle = Math.atan(lockTan) * s.steer
  // Steering right (positive) turns the heading clockwise, which is negative yaw.
  const yawWanted = -(forward / spec.wheelbase) * lockTan * s.steer
  s.yawRate = damp(s.yawRate, yawWanted, spec.yawResponse, h)

  s.vx = -sin * forward + cos * sideways
  s.vz = -cos * forward - sin * sideways
  s.speed = forward
  s.slide = sideways
  s.accelLong = (forward - before) / h
  s.accelLat = -s.yawRate * forward
}

// ---------------------------------------------------------------------------- collisions

const surface: SurfacePoint = { x: 0, y: 0, z: 0, inside: false, body: -1 }
const MAX_CIRCLES = 8
/** This step's contact for each circle: normal x/z, then the circle's offset from the centre x/z. */
const contacts = new Float64Array(MAX_CIRCLES * 4)
const inContact = new Uint8Array(MAX_CIRCLES)
/** What each circle is touching: a movable's id, or -1 for the fixed world. */
const contactBody = new Int32Array(MAX_CIRCLES)

/**
 * Push the body out of anything its circles overlap, then take away the speed that was
 * carrying it in.
 *
 * Each overlap is treated as it would be for a rigid body: a push at a point away from
 * the centre both moves the body and turns it, in proportion to how hard each is. That
 * is what makes a glancing hit swing the nose along the wall instead of stopping dead.
 */
function collide(s: VehicleState, spec: VehicleSpec, world: Surroundings): void {
  const radius = spec.circleRadius
  // How hard the body is to turn compared with how hard it is to move: the square of its
  // radius of gyration, taking it as a uniform rectangle.
  const inertia = (spec.length * spec.length + spec.width * spec.width) / 12
  const count = Math.min(spec.circles.length, MAX_CIRCLES)
  inContact.fill(0)

  for (let pass = 0; pass < SOLVER_PASSES; pass++) {
    let touched = false
    for (let i = 0; i < count; i++) {
      const along = spec.circles[i]
      const ox = -Math.sin(s.yaw) * along
      const oz = -Math.cos(s.yaw) * along
      const cx = s.x + ox
      const cz = s.z + oz
      const cy = heightAlong(s, spec, along) + CLEARANCE + radius
      surface.body = -1
      if (!world.closest(cx, cy, cz, surface) || surface.inside) continue

      const dx = cx - surface.x
      const dy = cy - surface.y
      const dz = cz - surface.z
      // Floors and ceilings are the axles' business, not the circles'.
      if (Math.abs(dy) > radius * 0.85) continue
      const flat = Math.hypot(dx, dz)
      if (flat < 1e-5) continue
      const depth = Math.sqrt(radius * radius - dy * dy) - flat
      if (depth <= 0) continue

      const nx = dx / flat
      const nz = dz / flat
      // Turning the body by a small angle moves this circle by angle × (oz, -ox).
      const lever = oz * nx - ox * nz
      const push = depth / (1 + (lever * lever) / inertia)
      s.x += nx * push
      s.z += nz * push
      s.yaw += (push * lever) / inertia
      contacts[i * 4] = nx
      contacts[i * 4 + 1] = nz
      contacts[i * 4 + 2] = ox
      contacts[i * 4 + 3] = oz
      contactBody[i] = surface.body
      inContact[i] = 1
      touched = true
    }
    if (!touched) break
  }

  for (let i = 0; i < count; i++) {
    if (!inContact[i]) continue
    const nx = contacts[i * 4]
    const nz = contacts[i * 4 + 1]
    const ox = contacts[i * 4 + 2]
    const oz = contacts[i * 4 + 3]
    const other = contactBody[i] >= 0 ? world.movable?.(contactBody[i]) : undefined
    // Velocity of the contact point: the body's, plus what its spin adds out here.
    const pvx = s.vx + s.yawRate * oz
    const pvz = s.vz - s.yawRate * ox
    const closing = -((pvx - (other ? other.vx : 0)) * nx + (pvz - (other ? other.vz : 0)) * nz)
    if (closing <= 0) continue

    // How much of the knock this body takes. Against the fixed world, all of it; against
    // another vehicle, the lighter of the two takes the larger share.
    const lever = oz * nx - ox * nz
    const yielding = 1 + (lever * lever) / inertia
    const impulse =
      ((1 + RESTITUTION) * closing) / (yielding + (other ? spec.mass / other.mass : 0))
    s.vx += nx * impulse
    s.vz += nz * impulse
    s.yawRate += ((impulse * lever) / inertia) * IMPACT_SPIN
    if (other) {
      const shove = Math.min((impulse * spec.mass) / other.mass, MAX_SHOVE)
      other.shove(-nx * shove, -nz * shove)
    }

    // Scraping: lose some speed along the wall too.
    const tx = -nz
    const tz = nx
    const along = s.vx * tx + s.vz * tz
    const scrape = Math.min(Math.abs(along), WALL_FRICTION * impulse) * Math.sign(along)
    s.vx -= tx * scrape
    s.vz -= tz * scrape

    if (closing > s.impact) s.impact = closing
  }
  s.yaw = wrapAngle(s.yaw)
}

/** Ground height under a point on the centre line, `along` metres ahead of the centre. */
function heightAlong(s: VehicleState, spec: VehicleSpec, along: number): number {
  return s.y + ((s.yFront - s.yRear) / spec.wheelbase) * along
}

// ---------------------------------------------------------------------------- ground

function followGround(s: VehicleState, spec: VehicleSpec, world: Surroundings, h: number): void {
  const half = spec.wheelbase / 2
  const fx = -Math.sin(s.yaw)
  const fz = -Math.cos(s.yaw)
  // Vertical speed an axle leaves the ground with: whatever the slope was giving it.
  const launch = s.speed * Math.tan(s.pitch)

  // ---- front axle
  let y = s.yFront
  let vy = s.vyFront
  let grounded = s.groundedFront
  let x = s.x + fx * half
  let z = s.z + fz * half
  for (let axle = 0; axle < 2; axle++) {
    if (axle === 1) {
      s.yFront = y
      s.vyFront = vy
      s.groundedFront = grounded
      y = s.yRear
      vy = s.vyRear
      grounded = s.groundedRear
      x = s.x - fx * half
      z = s.z - fz * half
    }
    if (grounded) {
      const ground = world.ground(x, y + PROBE_UP, z, PROBE_UP + SNAP_DOWN)
      if (ground === NO_GROUND) {
        grounded = false
        vy = launch
      } else if (ground - y <= STEP_UP) {
        y = ground
        vy = 0
      }
      // Otherwise it is a ledge too tall to climb: stay at this height; the collision
      // circles are what stop the vehicle.
    } else {
      vy = Math.max(vy - GRAVITY * h, -TERMINAL_SPEED)
      const next = y + vy * h
      const ground = world.ground(x, y + PROBE_UP, z, PROBE_UP + Math.max(0, y - next) + 0.02)
      if (ground !== NO_GROUND && ground >= next && ground - y <= STEP_UP && vy <= 0) {
        if (-vy > s.landing) s.landing = -vy
        y = ground
        vy = 0
        grounded = true
      } else {
        y = next
      }
    }
  }
  s.yRear = y
  s.vyRear = vy
  s.groundedRear = grounded

  // The body is rigid: one end cannot be far above or below the other. An end in the air
  // above is pulled down after the lower one; an end in the air below hangs from the one
  // still on the ground (nose over the edge of a flyover) until that one leaves it too.
  const limit = spec.wheelbase * MAX_PITCH_TAN
  if (s.yFront - s.yRear > limit) {
    if (!s.groundedFront) {
      s.yFront = s.yRear + limit
      s.vyFront = Math.min(s.vyFront, s.vyRear)
    } else if (!s.groundedRear) {
      s.yRear = s.yFront - limit
      s.vyRear = 0
    }
  } else if (s.yRear - s.yFront > limit) {
    if (!s.groundedRear) {
      s.yRear = s.yFront + limit
      s.vyRear = Math.min(s.vyRear, s.vyFront)
    } else if (!s.groundedFront) {
      s.yFront = s.yRear - limit
      s.vyFront = 0
    }
  }

  s.y = (s.yFront + s.yRear) / 2
  s.pitch = Math.atan2(s.yFront - s.yRear, spec.wheelbase)
}
