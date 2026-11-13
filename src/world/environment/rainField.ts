/**
 * The rain field: where every drop is, and how bright its streak is.
 *
 * Pure numbers in plain buffers, stepped once a frame, so the tests can step it and say
 * what it does without a renderer. `Rain.tsx` wraps it in a line mesh.
 */
import { Color, type Vector3 } from 'three'

/** Below this much rain, there is none to see, and the mesh is hidden. */
export const RAIN_VISIBLE = 0.01

/** Whether the rain field would be drawn at all: a dry day pays nothing for it. */
export function rainVisible(intensity: number): boolean {
  return intensity > RAIN_VISIBLE
}

/** Streaks in the field: enough for a downpour, cheap enough for a phone. */
export const DROPS = 2600
/** The box the rain lives in, centred on the camera: metres across and tall. */
const SPREAD = 70
const HEIGHT = 46
/** Fall speed in metres per second, and the lean given the wind. */
const FALL = 15
const WIND = 2.1
/** The shallowest fall, so the streaks are all a little different. */
const SLOWEST = 0.62
/** Streak length as a share of a second of falling. */
const TRAIL = 0.055

/** Where a single drop is, and how long its streak is right now. */
interface Drop {
  x: number
  y: number
  z: number
  speed: number
}

/**
 * The rain field's own state, stepped once a frame. Kept out of the component so a test
 * can step it without React or a renderer.
 */
export class RainField {
  readonly positions: Float32Array
  readonly colours: Float32Array
  private readonly drops: Drop[]
  private readonly tint: Color
  private cameraX = 0
  private cameraY = 0
  private cameraZ = 0

  constructor(random: () => number = Math.random) {
    this.positions = new Float32Array(DROPS * 6)
    // Each streak has two ends, each with its own colour, so it fades along its length.
    this.colours = new Float32Array(DROPS * 6)
    this.drops = Array.from({ length: DROPS }, () => ({
      x: random() * SPREAD,
      y: random() * HEIGHT,
      z: random() * SPREAD,
      speed: FALL * (SLOWEST + (1 - SLOWEST) * random()),
    }))
    this.tint = new Color('#b9c9dc')
    this.step(0, 0)
  }

  /** Fall for `dt` seconds and redraw every streak from the camera's point of view. */
  step(dt: number, intensity: number): void {
    const base = Math.max(this.cameraY - HEIGHT * 0.55, 0)
    // Additive rain: darker is fainter, so the far end of a streak is dimmer.
    const r = this.tint.r
    const g = this.tint.g
    const b = this.tint.b
    const half = SPREAD * 0.5
    for (let i = 0; i < DROPS; i++) {
      const drop = this.drops[i]
      drop.y -= drop.speed * dt
      if (drop.y < base) drop.y += HEIGHT
      // Keep the field around the camera: wrap, rather than move, so nothing pops.
      const x = wrap(drop.x, this.cameraX, SPREAD)
      const z = wrap(drop.z, this.cameraZ, SPREAD)

      const length = drop.speed * TRAIL
      // A streak leans the way the wind is blowing: it starts above and upwind.
      const o = i * 6
      this.positions[o] = x
      this.positions[o + 1] = drop.y + length
      this.positions[o + 2] = z
      this.positions[o + 3] = x - WIND * TRAIL
      this.positions[o + 4] = drop.y
      this.positions[o + 5] = z - WIND * TRAIL * 0.4

      // Fade at the near and far edges of the box, and by how hard it is raining.
      const dx = x - this.cameraX
      const dz = z - this.cameraZ
      const flat = Math.hypot(dx, dz)
      const near = Math.min(1, Math.max(0, (flat - 1.5) / 3))
      const far = 1 - Math.min(1, Math.max(0, (flat - half * 0.55) / (half * 0.45)))
      const fade = intensity * near * far
      this.colours[o] = r * fade
      this.colours[o + 1] = g * fade
      this.colours[o + 2] = b * fade
      this.colours[o + 3] = r * fade * 0.25
      this.colours[o + 4] = g * fade * 0.25
      this.colours[o + 5] = b * fade * 0.25
    }
  }

  /** Tell the field where the camera is. Called before `step`. */
  focus(position: Vector3): void {
    this.cameraX = position.x
    this.cameraY = position.y
    this.cameraZ = position.z
  }
}

/** Wrap `value` into a window of `span` centred on `centre`. */
function wrap(value: number, centre: number, span: number): number {
  return ((((value - centre + span * 0.5) % span) + span) % span) - span * 0.5 + centre
}
