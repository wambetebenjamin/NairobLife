/** Fictional stage-to-stage shuttles over the directed baked street graph, not actual SACCO routes. */
import { wrapAngle } from '../../core/math'
import type { ZoneFile } from '../../world/zone/format'
import { buildRoadGraph, trafficPose, type Edge, type RoadGraph } from '../traffic/graph'

export interface Stop {
  id: string
  name: string
  x: number
  z: number
  node: string
  snapDistance: number
}
export interface RideRoute {
  from: Stop
  to: Stop
  edges: Edge[]
  length: number
}

export function buildRideNetwork(zone: ZoneFile): { graph: RoadGraph; stops: Stop[] } {
  const graph = buildRoadGraph(zone)
  const nodes = new Map<string, { x: number; z: number }>()
  for (const e of graph.edges) {
    nodes.set(e.from, { x: e.ax, z: e.az })
    nodes.set(e.to, { x: e.bx, z: e.bz })
  }
  const stops: Stop[] = []
  zone.pois.forEach((p, i) => {
    if (p.k !== 'stage' || !p.n) return
    const x = p.x / zone.q,
      z = p.z / zone.q
    let closest = '',
      distance = Infinity
    for (const [key, node] of nodes) {
      const d = Math.hypot(x - node.x, z - node.z)
      if (d < distance) {
        distance = d
        closest = key
      }
    }
    if (distance <= 50)
      stops.push({ id: String(i), name: p.n, x, z, node: closest, snapDistance: distance })
  })
  return { graph, stops }
}

/** Shortest directed path, or null when stages cannot be connected. */
export function planRide(graph: RoadGraph, from: Stop, to: Stop): RideRoute | null {
  if (from.id === to.id || from.node === to.node) return null
  const dist = new Map<string, number>([[from.node, 0]])
  const previous = new Map<string, number>()
  const queue: { node: string; distance: number }[] = [{ node: from.node, distance: 0 }]
  // Binary heap gives a useful response even when many city streets are connected.
  const push = (item: { node: string; distance: number }) => {
    queue.push(item)
    let i = queue.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (queue[p].distance <= item.distance) break
      queue[i] = queue[p]
      i = p
    }
    queue[i] = item
  }
  const pop = () => {
    const top = queue[0],
      last = queue.pop()!
    if (queue.length) {
      let i = 0
      while (true) {
        let child = i * 2 + 1
        if (child >= queue.length) break
        if (child + 1 < queue.length && queue[child + 1].distance < queue[child].distance) child++
        if (queue[child].distance >= last.distance) break
        queue[i] = queue[child]
        i = child
      }
      queue[i] = last
    }
    return top
  }
  while (queue.length) {
    const item = pop()
    if (item.distance !== dist.get(item.node)) continue
    if (item.node === to.node) break
    for (const id of graph.outgoing.get(item.node) ?? []) {
      const edge = graph.edges[id],
        next = item.distance + edge.length
      if (next < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, next)
        previous.set(edge.to, id)
        push({ node: edge.to, distance: next })
      }
    }
  }
  if (!dist.has(to.node)) return null
  const edges: Edge[] = []
  let node = to.node
  while (node !== from.node) {
    const id = previous.get(node)
    if (id === undefined) return null
    const edge = graph.edges[id]
    edges.push(edge)
    node = edge.from
  }
  edges.reverse()
  return { from, to, edges, length: dist.get(to.node)! }
}

/** Sample distance travelled, blending lane offsets and heading through the last metres of a turn. */
export function ridePose(route: RideRoute, distance: number) {
  let remaining = Math.max(0, Math.min(route.length, distance))
  for (let i = 0; i < route.edges.length; i++) {
    const edge = route.edges[i]
    if (remaining <= edge.length) {
      const pose = trafficPose(edge, remaining),
        next = route.edges[i + 1]
      const blend = Math.min(4, edge.length / 3)
      if (!next || remaining < edge.length - blend) return pose
      const t = (remaining - (edge.length - blend)) / blend
      const target = trafficPose(next, 0)
      return {
        x: pose.x + (target.x - pose.x) * t,
        z: pose.z + (target.z - pose.z) * t,
        yaw: pose.yaw + wrapAngle(target.yaw - pose.yaw) * t,
      }
    }
    remaining -= edge.length
  }
  const last = route.edges[route.edges.length - 1]
  return trafficPose(last, last.length)
}
