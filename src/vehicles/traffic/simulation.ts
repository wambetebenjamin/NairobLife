/**
 * The ambient traffic simulation.
 *
 * One step moves every vehicle a little, in a fixed order, using one snapshot of the
 * world so that no vehicle gets an advantage from being earlier in the array:
 *
 *  1. Work out what each vehicle wants to do: keep going along its road, turn at the end
 *     of it, stop at the matatu stage it is passing, and where its nose would be.
 *  2. Work out what holds each vehicle: the vehicle ahead on the same road, a junction
 *     whose crossing approach is occupied, a red light, or something the caller says is
 *     in the way (the player, or a vehicle the physics reports ahead).
 *  3. Move everybody by the smallest of those limits.
 *
 * Junctions are the interesting part. `crossings.ts` finds every place two roads meet,
 * including the many in this map where two ways cross without sharing a node, and
 * `junctions.ts` decides who may be inside each box. See that file for the rules.
 *
 * The result is still a prototype: vehicles follow the graph's centre lines rather than
 * lanes, turns happen at the vertex rather than along an arc, and only the physics-side
 * probe sees the player's own vehicle. It is closer to a city's traffic than a queue of
 * cars on rails, and it is honest about the rest.
 *
 * No DOM and no three.js: this is driven in plain Node by the tests.
 */
import { VEHICLES } from '../../config/vehicles'
import { orientedRectsOverlap } from '../../core/geom2d'
import { findCrossings, type Crossing } from './crossings'
import {
  sameEdgeClearance,
  stepTraffic,
  trafficPose,
  type RoadGraph,
  type TrafficAgent,
} from './graph'
import { JunctionController } from './junctions'

export interface TrafficOptions {
  /** Crossings that carry a mapped traffic signal, by index into `crossings`. */
  signalised?: Iterable<number>
  /** Seconds a matatu waits at a stage it passes. */
  stageWait?: number
}

export class TrafficSimulation {
  readonly junctions: JunctionController
  readonly graph: RoadGraph
  readonly agents: TrafficAgent[]
  readonly crossings: Crossing[]
  private readonly restartEdges: number[]
  private readonly restartRetry = new Map<TrafficAgent, number>()
  private readonly stageWait: number
  /** Elapsed simulation seconds; drives the signal cycle. */
  time = 0

  constructor(graph: RoadGraph, agents: TrafficAgent[], options: TrafficOptions = {}) {
    this.graph = graph
    this.agents = agents
    this.stageWait = options.stageWait ?? 3
    this.crossings = findCrossings(graph)
    this.junctions = new JunctionController(graph, this.crossings, options.signalised)
    this.restartEdges = graph.edges
      .map((edge, i) => ({ edge, i }))
      .filter(
        ({ edge }) =>
          edge.length >= 25 &&
          (graph.outgoing.get(edge.to) ?? []).some((id) => graph.edges[id].to !== edge.from),
      )
      .map(({ i }) => i)
  }

  /**
   * Advance the traffic by `dt` seconds.
   *
   * @param blocked  vehicles that may not move this step: the player is too close, or
   *                 the physics found something in front of them
   * @param canRestart  false when a dead-end restart would put a vehicle somewhere the
   *                 simulation cannot see, such as on top of a parked car
   */
  step(
    dt: number,
    time: number,
    blocked: ReadonlySet<TrafficAgent> = new Set(),
    canRestart: (agent: TrafficAgent, pose: ReturnType<typeof trafficPose>) => boolean = () => true,
  ): void {
    if (dt <= 0) return
    this.time = time
    this.junctions.clock = time

    const eligible = (agent: TrafficAgent) =>
      !blocked.has(agent) &&
      !agent.respawn &&
      agent.wait <= 0 &&
      sameEdgeClearance(agent, this.agents) > 0

    const junction = this.junctions.clearances(this.agents, dt, eligible)
    const limits = this.agents.map((agent) => {
      const edge = this.graph.edges[agent.edge]
      if (!edge) return Infinity
      // Also re-evaluate at every vertex, including short links between two junctions.
      return Math.min(
        sameEdgeClearance(agent, this.agents),
        junction.get(agent) ?? Infinity,
        Math.max(0, edge.length - agent.progress) + 0.000001,
      )
    })
    this.agents.forEach((agent, i) => {
      if (agent.wait > 0) {
        stepTraffic(agent, this.graph, dt, true, this.stageWait)
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
      // The limit is a distance along the edge. Never step into it: stop exactly on it.
      const limited = Math.min(dt, limits[i] / Math.max(0.5, agent.speed))
      if (limited > 0) stepTraffic(agent, this.graph, limited, false, this.stageWait)
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
    const spec = VEHICLES[agent.kind]
    for (let n = 0; n < Math.min(count, 48); n++) {
      const id = this.restartEdges[(start + n) % count],
        edge = this.graph.edges[id],
        progress = edge.length / 2
      const pose = trafficPose(edge, progress)
      const rect = {
        x: pose.x,
        z: pose.z,
        dx: -Math.sin(pose.yaw),
        dz: -Math.cos(pose.yaw),
        halfLength: spec.length / 2,
        halfWidth: spec.width / 2,
      }
      const occupied = this.agents.some((other) => {
        if (other === agent) return false
        const p = trafficPose(this.graph.edges[other.edge], other.progress),
          s = VEHICLES[other.kind]
        return orientedRectsOverlap(
          rect,
          {
            x: p.x,
            z: p.z,
            dx: -Math.sin(p.yaw),
            dz: -Math.cos(p.yaw),
            halfLength: s.length / 2,
            halfWidth: s.width / 2,
          },
          2,
        )
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
