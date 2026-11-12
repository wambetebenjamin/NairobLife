/** Conservative, deterministic right-of-way at shared road-graph junctions. */
import { trafficPose, type RoadGraph, type TrafficAgent } from './graph'

/** Stop vehicle centres before the junction; hold until the rear has cleared. */
export const JUNCTION_STOP = 8
export const JUNCTION_CLEAR = 10
const REQUEST_DISTANCE = 20

/** A true junction has three or more distinct neighbouring road vertices. */
export function findJunctions(graph: RoadGraph): Set<string> {
  const neighbours = new Map<string, Set<string>>()
  const add = (node: string, other: string) => {
    const set = neighbours.get(node) ?? new Set<string>()
    set.add(other)
    neighbours.set(node, set)
  }
  for (const edge of graph.edges) {
    add(edge.from, edge.to)
    add(edge.to, edge.from)
  }
  return new Set([...neighbours].filter(([, set]) => set.size >= 3).map(([node]) => node))
}

/**
 * One ambient vehicle owns a junction at a time. First waiting gets priority; ties use
 * distance then seed, independent of iteration order. This deliberately favours safety
 * over capacity and does not attempt to implement Kenya's full junction rules.
 */
export class JunctionController {
  readonly nodes: Set<string>
  private readonly owners = new Map<string, TrafficAgent>()
  private readonly graph: RoadGraph
  private readonly positions = new Map<string, { x: number; z: number }>()
  private readonly waiting = new Map<TrafficAgent, { node: string; seconds: number }>()

  constructor(graph: RoadGraph) {
    this.graph = graph
    this.nodes = findJunctions(graph)
    for (const edge of graph.edges) {
      if (this.nodes.has(edge.from)) this.positions.set(edge.from, { x: edge.ax, z: edge.az })
      if (this.nodes.has(edge.to)) this.positions.set(edge.to, { x: edge.bx, z: edge.bz })
    }
  }

  /**
   * Compute each incoming agent's permitted travel before stepping any agent. `eligible`
   * is false for a red signal or an external obstacle; a waiting vehicle cannot reserve
   * a junction it cannot enter. Current occupants retain ownership until they clear it.
   */
  clearances(
    agents: readonly TrafficAgent[],
    dt: number,
    eligible: (agent: TrafficAgent) => boolean,
  ): Map<TrafficAgent, number> {
    const present = new Set(agents)
    for (const [node, owner] of this.owners) {
      const edge = this.graph.edges[owner.edge]
      const incoming = edge?.to === node && edge.length - owner.progress <= REQUEST_DISTANCE
      const position = this.positions.get(node)!
      const pose = edge ? trafficPose(edge, owner.progress) : null
      const outgoing =
        !!pose && Math.hypot(pose.x - position.x, pose.z - position.z) < JUNCTION_CLEAR
      const beforeLine = incoming && edge.length - owner.progress >= JUNCTION_STOP - 0.001
      if (!present.has(owner) || (!incoming && !outgoing) || (beforeLine && !eligible(owner)))
        this.owners.delete(node)
    }

    // An agent already leaving a junction (e.g. at initial spawn) occupies it too.
    for (const agent of agents) {
      const edge = this.graph.edges[agent.edge]
      if (
        edge &&
        this.nodes.has(edge.from) &&
        agent.progress < JUNCTION_CLEAR &&
        !this.owners.has(edge.from)
      )
        this.owners.set(edge.from, agent)
    }

    const requests = new Map<string, TrafficAgent[]>()
    const active = new Set<TrafficAgent>()
    for (const agent of agents) {
      const edge = this.graph.edges[agent.edge]
      if (!edge || !this.nodes.has(edge.to) || edge.length - agent.progress > REQUEST_DISTANCE)
        continue
      const node = edge.to
      active.add(agent)
      const old = this.waiting.get(agent)
      this.waiting.set(agent, {
        node,
        seconds: (old?.node === node ? old.seconds : 0) + Math.max(0, dt),
      })
      if (!eligible(agent)) continue
      const list = requests.get(node) ?? []
      list.push(agent)
      requests.set(node, list)
    }
    for (const agent of this.waiting.keys()) if (!active.has(agent)) this.waiting.delete(agent)

    for (const [node, candidates] of requests) {
      if (this.owners.has(node)) continue
      candidates.sort((a, b) => {
        const aEdge = this.graph.edges[a.edge],
          bEdge = this.graph.edges[b.edge]
        const aRemaining = aEdge.length - a.progress,
          bRemaining = bEdge.length - b.progress
        // An agent already over the line must clear before anybody else enters.
        const committed = Number(bRemaining < JUNCTION_STOP) - Number(aRemaining < JUNCTION_STOP)
        return (
          committed ||
          this.waiting.get(b)!.seconds - this.waiting.get(a)!.seconds ||
          aRemaining - bRemaining ||
          a.seed - b.seed
        )
      })
      this.owners.set(node, candidates[0])
    }

    const result = new Map<TrafficAgent, number>()
    for (const agent of agents) {
      const edge = this.graph.edges[agent.edge]
      if (!edge || !this.nodes.has(edge.to) || this.owners.get(edge.to) === agent) continue
      result.set(agent, Math.max(0, edge.length - agent.progress - JUNCTION_STOP))
    }
    return result
  }
}
