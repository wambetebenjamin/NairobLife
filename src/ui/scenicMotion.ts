/** Timing and poses for self-contained fictional scenic journeys (metres and seconds). */
export type ScenicKind = 'park' | 'sgr'
export const SCENIC_DURATION: Record<ScenicKind, number> = { park: 48, sgr: 38 }

/** Keep the guided journey stable after a slow frame or a hidden tab. */
export function advanceScenicTime(
  kind: ScenicKind,
  elapsed: number,
  delta: number,
  paused: boolean,
) {
  if (paused || !Number.isFinite(delta) || delta <= 0) return elapsed
  return Math.min(SCENIC_DURATION[kind], elapsed + Math.min(delta, 0.05))
}

export function scenicPose(kind: ScenicKind, elapsed: number) {
  const duration = SCENIC_DURATION[kind]
  const progress = Math.max(0, Math.min(1, elapsed / duration))
  if (kind === 'park') {
    const t = progress * Math.PI * 2
    return {
      x: Math.cos(t) * 10,
      z: Math.sin(t) * 10,
      yaw: Math.PI - t,
      dx: -Math.sin(t),
      dz: Math.cos(t),
      progress,
    }
  }
  return { x: 22 - 44 * progress, z: 0, yaw: 0, dx: -1, dz: 0, progress }
}
