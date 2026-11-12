/** Step ambient traffic as a batch so junction decisions use the same frame snapshot. */
import { orientedRectsOverlap } from '../../core/geom2d'
import {
  sameEdgeClearance,
  stepTraffic,
  trafficPose,
  trafficRect,
  type RoadGraph,
  type TrafficAgent,
} from './graph'
import { JunctionController, JUNCTION_STOP } from './junctions'
import { signalClearance } from './signals'

export class TrafficSimulation {
  readonly junctions: JunctionController
  readonly graph: RoadGraph
  readonly agents: TrafficAgent[]
  readonly signals: Set<string>
  private readonly restartEdges: number[]
  private readonly restartRetry = new Map<TrafficAgent, number>()
  constructor(graph: RoadGraph, agents: TrafficAgent[], signals: Set<string>) {
    this.graph = graph
    this.agents = agents
    this.signals = signals
    this.junctions = new JunctionController(graph)
    this.restartEdges = graph.edges
      .map((edge, i) => ({ edge, i }))
      .filter(
        ({ edge }) =>
          edge.length >= 25 &&
          (graph.outgoing.get(edge.to) ?? []).some((id) => graph.edges[id].to !== edge.from),
      )
      .map(({ i }) => i)
  }

  step(
    dt: number,
    time: number,
    blocked: ReadonlySet<TrafficAgent> = new Set(),
    canRestart: (agent: TrafficAgent, pose: ReturnType<typeof trafficPose>) => boolean = () => true,
  ): void {
    if (dt <= 0) return
    const eligible = (agent: TrafficAgent) =>
      !blocked.has(agent) &&
      !agent.respawn &&
      agent.wait <= 0 &&
      sameEdgeClearance(agent, this.agents) > 0 &&
      signalClearance(agent, this.graph.edges[agent.edge], this.signals, time) === Infinity
    const junction = this.junctions.clearances(this.agents, dt, eligible)
    const limits = this.agents.map((agent) => {
      const edge = this.graph.edges[agent.edge]
      // A vehicle that entered the reserved area on green can clear even if the light changes.
      const committed =
        this.junctions.nodes.has(edge.to) &&
        !junction.has(agent) &&
        edge.length - agent.progress < JUNCTION_STOP
      return Math.min(
        sameEdgeClearance(agent, this.agents),
        committed ? Infinity : signalClearance(agent, edge, this.signals, time),
        junction.get(agent) ?? Infinity,
        // Re-evaluate at every vertex, including short links between two junctions.
        Math.max(0, edge.length - agent.progress) + 0.000001,
      )
    })
    this.agents.forEach((agent, i) => {
      if (agent.wait > 0) {
        stepTraffic(agent, this.graph, dt, true)
        return
      }
      if (agent.respawn) {
        const retry = (this.restartRetry.get(agent) ?? 0) - dt
        if (retry <= 0) {
          if (this.restart(agent, canRestart)) this.restartRetry.delete(agent)
          else this.restartRetry.set(agent, 1)
        } else this.restartRetry.set(agent, retry)
        return
      }
      if (blocked.has(agent)) return
      const limited = Math.min(dt, limits[i] / agent.speed)
      if (limited > 0) stepTraffic(agent, this.graph, limited)
    })
  }
  /** Wait at a dead end, then restart away from existing traffic and external obstacles. */
  private restart(
    agent: TrafficAgent,
    canRestart: (agent: TrafficAgent, pose: ReturnType<typeof trafficPose>) => boolean,
  ): boolean {
    const count = this.restartEdges.length
    if (!count) return false
    const start = (agent.seed * 37 + agent.turns * 43) % count
    for (let n = 0; n < Math.min(count, 48); n++) {
      const id = this.restartEdges[(start + n) % count],
        edge = this.graph.edges[id],
        progress = edge.length / 2
      const pose = trafficPose(edge, progress)
      const rect = trafficRect(agent.kind, pose)
      const occupied = this.agents.some((other) => {
        if (other === agent) return false
        const p = trafficPose(this.graph.edges[other.edge], other.progress)
        return orientedRectsOverlap(rect, trafficRect(other.kind, p), 2)
      })
      if (occupied || !canRestart(agent, pose)) continue
      agent.edge = id
      agent.progress = progress
      agent.wait = 0
      agent.respawn = false
      agent.stopped = false
      agent.turns++
      return true
    }
    // Try a different batch later if all candidates were occupied.
    agent.turns++
    return false
  }
}
