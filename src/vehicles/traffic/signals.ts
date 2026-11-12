/**
 * Which crossings a mapped traffic signal governs.
 *
 * OSM maps a signal as a point. The bank decides the crossing by geometry: any junction
 * box whose nearest approach passes within `SIGNAL_REACH` of the signal is signalised.
 * That is a little generous compared with the real street, but the alternative — matching
 * a point to one graph node — misses every crossing the graph does not share a node with,
 * which in this map is most of the busy ones.
 */
import type { Crossing } from './crossings'
import type { RoadGraph } from './graph'
import type { ZoneFile } from '../../world/zone/format'

/** A signal governs a crossing whose approaches run this close to it, in metres. */
export const SIGNAL_REACH = 22

/** Indices into `crossings` that carry at least one mapped signal. */
export function signalCrossings(
  zone: ZoneFile,
  graph: RoadGraph,
  crossings: Crossing[],
): Set<number> {
  const signals = zone.pois.filter((poi) => poi.k === 'signal')
  const result = new Set<number>()
  if (!signals.length) return result
  for (const crossing of crossings) {
    for (const { edge } of crossing.approaches) {
      const spec = graph.edges[edge]
      if (!spec) continue
      const reach = SIGNAL_REACH * zone.q
      if (
        signals.some(
          (poi) =>
            distanceToSegment(
              poi.x,
              poi.z,
              spec.ax * zone.q,
              spec.az * zone.q,
              spec.bx * zone.q,
              spec.bz * zone.q,
            ) <= reach,
        )
      ) {
        result.add(crossing.id)
        break
      }
    }
  }
  return result
}

function distanceToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax
  const dz = bz - az
  const lengthSq = dx * dx + dz * dz
  const t =
    lengthSq > 1e-9 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSq)) : 0
  return Math.hypot(ax + dx * t - px, az + dz * t - pz)
}
