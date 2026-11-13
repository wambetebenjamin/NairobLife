/**
 * Where a sound is, in plain arithmetic.
 *
 * Kept apart from the audio graph so the tests can check the maths without a sound card,
 * and so nothing pulls a Zustand store into a numeric test.
 */

/**
 * Distance falloff: an inverse-ish curve that reaches silence at `range` rather than a
 * long tail to nothing. Twice as far is a quarter as loud, which is what a street sounds
 * like.
 */
/** How far a vehicle's engine carries, in metres. A few cars away, and no further. */
export const ENGINE_RANGE = 55
/** How far a horn carries. Further than an engine: hearing it before you see it is the point. */
export const HORN_RANGE = 130

export function falloff(distance: number, range: number): number {
  if (distance >= range) return 0
  const near = 1 - distance / range
  return near * near
}

/**
 * Pan a sound left or right by where it is relative to where the camera is looking.
 * -1 is hard left, +1 hard right. Dead ahead and dead behind are both centred, which is
 * what the ear does without a head turn.
 */
export function panOf(dx: number, dz: number, yaw: number): number {
  const distance = Math.hypot(dx, dz)
  if (distance < 0.001) return 0
  // Forward is (sin yaw, -cos yaw); right is (cos yaw, sin yaw). See core/geo.ts.
  const right = (dx * Math.cos(yaw) + dz * Math.sin(yaw)) / distance
  return Math.max(-1, Math.min(1, right))
}
