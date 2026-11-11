/** Scalar helpers shared by gameplay code. No three.js here, so workers and tests can use them. */

export const TAU = Math.PI * 2

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function inverseLerp(a: number, b: number, value: number): number {
  return a === b ? 0 : clamp((value - a) / (b - a), 0, 1)
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = inverseLerp(edge0, edge1, value)
  return t * t * (3 - 2 * t)
}

/**
 * Frame-rate independent smoothing: move `current` towards `target`, closing the gap at
 * `rate` per second (higher is snappier). Unlike a plain lerp it behaves the same at
 * 30 fps and 144 fps.
 */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-rate * dt))
}

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(angle: number): number {
  const a = ((((angle + Math.PI) % TAU) + TAU) % TAU) - Math.PI
  return a === -Math.PI ? Math.PI : a
}

/** Smooth an angle towards another along the shortest way round. */
export function dampAngle(current: number, target: number, rate: number, dt: number): number {
  return current + wrapAngle(target - current) * (1 - Math.exp(-rate * dt))
}

/** Move towards a target by at most maxDelta. */
export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target)
  return Math.max(current - maxDelta, target)
}
