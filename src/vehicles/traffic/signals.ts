/** Simplified coordinated two-axis signal cycle for mapped intersections. */
import { greenAxis } from '../../core/trafficSignals'
import type { ZoneFile } from '../../world/zone/format'
import type { Edge, RoadGraph, TrafficAgent } from './graph'

/** Snap each mapped signal to its nearest ground-road endpoint, within 25 m. */
export function signalNodes(zone: ZoneFile, graph: RoadGraph): Set<string> {
  const nodes = new Map<string, { x: number; z: number }>()
  for (const edge of graph.edges) nodes.set(edge.to, { x: edge.bx, z: edge.bz })
  const result = new Set<string>()
  for (const poi of zone.pois) {
    if (poi.k !== 'signal') continue
    let nearest = '',
      distance = 25
    for (const [key, node] of nodes) {
      const d = Math.hypot(node.x - poi.x / zone.q, node.z - poi.z / zone.q)
      if (d <= distance) {
        distance = d
        nearest = key
      }
    }
    if (nearest) result.add(nearest)
  }
  return result
}

export function edgeAxis(edge: Edge): 'x' | 'z' {
  return Math.abs(edge.bx - edge.ax) >= Math.abs(edge.bz - edge.az) ? 'x' : 'z'
}

/** Metres until the stop line on red. Vehicles already past the line may clear the junction. */
export function signalClearance(
  agent: TrafficAgent,
  edge: Edge,
  nodes: Set<string>,
  seconds: number,
): number {
  if (!nodes.has(edge.to) || greenAxis(seconds) === edgeAxis(edge)) return Infinity
  const line = Math.max(0, edge.length - 4)
  if (agent.progress > line + 0.01) return Infinity
  return Math.max(0, line - agent.progress)
}
