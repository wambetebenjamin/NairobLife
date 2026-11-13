/**
 * Feet, and the city around them.
 *
 * The traffic has had a voice for a while; the player walking had none, which made the
 * city feel like a film with the sound turned down whenever you got out of the car.
 *
 * What is here is the arithmetic of that sound, with no Web Audio in it, so it can be
 * tested in Node:
 *
 *  - **Footsteps.** A footfall every stride, alternating feet, timed from the distance
 *    walked rather than a fixed interval, so walking slowly gives slow steps.
 *  - **The surface underfoot.** Tarmac, pavement slabs, gravel and the concrete of steps
 *    all sound different; the step takes a brightness and a weight from whichever you are
 *    on.
 *  - **The city's own bed.** A faint, low wash that is there when nothing else is: the
 *    distant traffic of a city, the hum of the street. It gets louder at junctions and
 *    market corners and quieter down a quiet street.
 *
 * Nothing here randomises with `Math.random`: the same seed gives the same footstep, so a
 * test can be exact and a replay sounds the same.
 */
import { hash01 } from '../core/random'

/** How far apart footsteps fall, as a fraction of a human stride. */
export const STEP_PER_STRIDE = 0.5

/** The surfaces a player can stand on, as far as their feet are concerned. */
export type Surface = 'tarmac' | 'pavement' | 'gravel' | 'concrete'

/**
 * What each surface does to a step: how loud, how bright, and how long it lasts.
 * `tone` is a cutoff in Hz for the noise, `thump` the pitch of the body landing, and
 * `decay` how long the noise takes to vanish.
 */
export const SURFACE: Record<
  Surface,
  { gain: number; tone: number; thump: number; decay: number }
> = {
  // Smooth, hard and loud: a slap with a little ring.
  tarmac: { gain: 0.5, tone: 2200, thump: 90, decay: 0.09 },
  // Slabs: a hollow clack, slightly higher.
  pavement: { gain: 0.56, tone: 3000, thump: 110, decay: 0.07 },
  // Gravel: a scuff rather than a tap, wide and dull.
  gravel: { gain: 0.44, tone: 1500, thump: 80, decay: 0.14 },
  // Concrete steps: the sharpest of the four.
  concrete: { gain: 0.58, tone: 3400, thump: 120, decay: 0.06 },
}

/** The gait: walk, run and everything between. */
export type Gait = 'walk' | 'run'

/**
 * How often a foot lands, in seconds, for a speed. Derived from the stride rather than
 * guessed, so a walk of 1.3 m/s steps about twice a second and a sprint does not turn into
 * a machine gun.
 */
export function stepInterval(speed: number, gait: Gait): number {
  const stride = 0.62 + Math.abs(speed) * 0.42
  const cadence = Math.max(0.6, Math.abs(speed)) / stride
  // Two steps a stride; a run lands harder and more often, but not absurdly so.
  const seconds = 1 / (cadence * 2)
  return gait === 'run' ? Math.max(0.22, seconds * 0.88) : Math.max(0.32, seconds)
}

/** A footstep's own numbers, before any Web Audio sees them. */
export interface Step {
  /** 0 for the left foot, 1 for the right. */
  foot: 0 | 1
  /** Which footfall this is since the player started walking, from the distance. */
  index: number
  /** Loudness at the ear, scaled by speed. */
  gain: number
  /** The noise's cutoff, Hz. */
  tone: number
  /** The body's landing thump, Hz. */
  thump: number
  /** How long the scuff takes to die, seconds. */
  decay: number
}

/** How far a footfall carries the player along the ground, in metres. */
export function stepLength(speed: number, gait: Gait): number {
  return stepInterval(speed, gait) * Math.max(0.25, Math.abs(speed))
}

/**
 * The footfall that `distance` metres of walking lands on, or null when standing still.
 *
 * The walked distance is the clock. That is what keeps the steps honest: a run covers twice
 * the ground, so it takes twice as many steps, and a player who stops does not keep
 * marching. The step's variation comes from its index, so it is deterministic — the same
 * walk sounds the same twice.
 */
export function stepAt(
  distance: number,
  speed: number,
  gait: Gait,
  surface: Surface,
  seed = 0,
): Step | null {
  if (Math.abs(speed) < 0.25) return null
  const length = stepLength(speed, gait)
  if (!(length > 0)) return null

  const index = Math.floor(Math.abs(distance) / length)
  const foot = (index % 2) as 0 | 1
  const profile = SURFACE[surface]
  const jitter = hash01(seed + index, 61)
  const effort = Math.min(1, Math.abs(speed) / 6)
  return {
    foot,
    index,
    // Harder landings at speed, quieter when strolling, and never two steps alike.
    gain: profile.gain * (0.55 + effort * 0.6) * (0.85 + jitter * 0.3),
    tone: profile.tone * (0.92 + jitter * 0.16),
    thump: profile.thump * (0.94 + jitter * 0.12),
    decay: profile.decay * (0.9 + jitter * 0.25),
  }
}

/**
 * How many footfalls happened between two frames, at a given step length. Walking
 * backwards steps too, so the count is unsigned: the caller wants to know how many, not
 * which way round the world is.
 */
export function crossedStep(before: number, after: number, length: number): number {
  if (!(length > 0)) return 0
  const counted = Math.floor(Math.abs(after) / length) - Math.floor(Math.abs(before) / length)
  return Math.abs(counted)
}

/**
 * How loud the city's own bed is, from where the player is.
 *
 * A city is never silent. This is the low wash of distant traffic and the street's hum. It
 * is louder beside a big road than a residential one, louder near a stage or a market where
 * people and matatus gather, and softer in the rain, when the tyres hiss instead of roar.
 *
 * The inputs are what the game actually knows: the width of the nearest road in metres,
 * and the distance to the nearest stage. It does not claim to model traffic volume.
 */
export function cityBed(
  roadWidth: number,
  stageDistance: number,
  rain: number,
  indoors = false,
): number {
  // A motorway is about 30 m wide with its shoulders; a residential street about 8.
  const nearBigRoad = Math.max(0, Math.min(1, (roadWidth - 8) / 22))
  const nearStage = Math.max(0, 1 - stageDistance / 120)
  const base = 0.05 + nearBigRoad * 0.09 + nearStage * 0.06
  const weather = 1 - rain * 0.25
  return Math.max(0, base * weather * (indoors ? 0.55 : 1))
}

/**
 * The pitch of the city's bed, in Hz: lower beside a quiet street, higher beside a big
 * road. Fixed, not random: it is a drone, and a drone that wanders is a headache.
 */
export function cityBedTone(roadWidth: number): number {
  return 200 + Math.max(0, Math.min(1, (roadWidth - 8) / 22)) * 200
}

/**
 * Which surface a step lands on, from what the player is standing on. The caller knows
 * whether they are on a pavement, a road or the ground; this is the mapping, in one place
 * so the answer is the same everywhere.
 */
export function surfaceOf(kind: 'road' | 'pavement' | 'gravel' | 'steps' | 'unknown'): Surface {
  switch (kind) {
    case 'road':
      return 'tarmac'
    case 'pavement':
      return 'pavement'
    case 'gravel':
      return 'gravel'
    case 'steps':
      return 'concrete'
    case 'unknown':
      return 'pavement'
  }
}

/**
 * What the player is standing on, from the roads around them.
 *
 * Within a drivable road's half width, it is tarmac; within the pavement beside it, slabs;
 * otherwise the ground, which for now is pavement too. Kept here so the answer does not
 * depend on which component asks.
 */
export function surfaceUnder(
  segment: { halfWidth: number; pavement: number; drivable: boolean } | null,
  distance: number,
): Surface {
  // Off any road, or past its kerb, you are on paving. On the carriageway, tarmac.
  if (!segment || !segment.drivable) return 'pavement'
  return distance <= segment.halfWidth ? 'tarmac' : 'pavement'
}

/**
 * How loud the city's bed should be near a stage or market, as a distance in metres. POIs
 * are points, so this is the distance to the nearest one; returns a large number when
 * there are none, which reads as silence.
 */
export function nearestOf(
  points: readonly { x: number; z: number }[],
  x: number,
  z: number,
): number {
  let best = Infinity
  for (const point of points) {
    const d = Math.hypot(point.x - x, point.z - z)
    if (d < best) best = d
  }
  return best
}
