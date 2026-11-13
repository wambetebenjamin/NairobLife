/**
 * Who goes first at a junction.
 *
 * A `Crossing` (see crossings.ts) is a small box with a few approaches arriving at it.
 * Where a traffic signal stands, one axis has green and the other waits. Whether or not
 * there is a signal, two approaches whose paths cross may never both be inside the box,
 * so a car turning across another is never guessed at.
 *
 * Each approach has a **slot**: the stop line in front of it. A vehicle takes its slot
 * when it reaches the line and gives it up once it is clear on the far side of the box.
 * It may take the slot only if no conflicting approach's slot is taken. That is one
 * symmetrical rule: no pair of crossing approaches can be occupied at once, so the
 * junction cannot deadlock and nothing drives through anything.
 *
 * It is deliberately conservative. A vehicle turning right and one going straight on
 * from the opposite approach wait for each other even though their paths would miss: the
 * path through the box depends on which road the driver takes, and the graph does not
 * know that until the turn is made. Waiting is always safe, and one-way streets carry
 * most of this map's traffic anyway.
 *
 * The rules, in the order a player watching would see them:
 *
 *  1. A vehicle past the line is committed. It finishes crossing even if its light turns
 *     red, and nothing takes a slot that conflicts with a committed vehicle.
 *  2. A red axis may not take its slot at all. The cycle is the one the signal lights
 *     themselves show (`core/trafficSignals.ts`).
 *  3. If nothing is in the way, every waiting approach may go at once when their paths
 *     do not cross. When it comes to a choice, whoever has waited longest wins; ties go
 *     to whoever is nearer the line, then to the lower seed, so array order never
 *     decides anything.
 *
 * No DOM and no three.js: the tests drive this in plain Node.
 */
import { greenAxis } from '../../core/trafficSignals'
import { travel, type Crossing } from './crossings'
import type { RoadGraph, TrafficAgent } from './graph'

/** A vehicle stops with its nose this far before the box, in metres. */
export const JUNCTION_STOP = 6
/** A vehicle starts asking for the box this far before it, in metres. */
export const REQUEST_DISTANCE = 22

interface Slot {
  agent: TrafficAgent
  /** The edge it entered on, so a turn off the approach releases the slot. */
  edge: number
  /** Seconds it has been held, for cleaning up after a stall. */
  age: number
}

const slotKey = (crossing: number, approach: number) => crossing * 64 + approach

export class JunctionController {
  readonly graph: RoadGraph
  readonly crossings: Crossing[]
  /** Crossing ids reachable from each edge, so a step looks only where it is going. */
  private readonly byEdge = new Map<number, number[]>()
  /** Approach indices that conflict, per crossing. */
  private readonly conflicts: Map<number, Set<number>[]>
  private readonly slots = new Map<number, Slot>()
  private readonly waited = new Map<TrafficAgent, number>()
  /** Signal-governed crossings: the rest run on first-come, first-served. */
  readonly signalised: Set<number>
  /** Simulation seconds for the signal cycle; the simulation writes it each step. */
  clock = 0

  constructor(graph: RoadGraph, crossings: Crossing[], signalised: Iterable<number> = []) {
    this.graph = graph
    this.crossings = crossings
    this.signalised = new Set(signalised)
    this.conflicts = new Map()
    for (const crossing of crossings) {
      const clashes: Set<number>[] = crossing.approaches.map(() => new Set<number>())
      for (const [i, j] of crossing.conflicts) {
        clashes[i].add(j)
        clashes[j].add(i)
      }
      this.conflicts.set(crossing.id, clashes)
      for (const { edge } of crossing.approaches) {
        const list = this.byEdge.get(edge) ?? []
        if (!list.includes(crossing.id)) list.push(crossing.id)
        this.byEdge.set(edge, list)
      }
    }
  }

  /**
   * The metre limit on each vehicle for this step, along its current edge. A vehicle is
   * absent from the result when nothing holds it back.
   *
   * `eligible` is false for a vehicle that is already blocked for another reason (a slow
   * vehicle ahead, something the physics sees in front of it): it keeps whatever slot it
   * holds but asks for nothing new, so it cannot claim a junction and then sit in it.
   * Vehicles not in `agents` are forgotten.
   */
  clearances(
    agents: readonly TrafficAgent[],
    dt: number,
    eligible: (agent: TrafficAgent) => boolean = () => true,
    /** The simulation passes its own clock in; tests may leave it. */
    clock = this.clock,
  ): Map<TrafficAgent, number> {
    this.clock = clock
    const present = new Set(agents)
    const limits = new Map<TrafficAgent, number>()

    // ---- let go of slots whose owner is gone, turned off, or well past the box
    for (const [key, slot] of this.slots) {
      slot.age += Math.max(0, dt)
      const crossing = this.crossings[Math.floor(key / 64)]
      const approach = crossing.approaches[key % 64]
      if (
        !present.has(slot.agent) ||
        slot.agent.edge !== approach.edge ||
        slot.agent.progress > approach.progress + JUNCTION_STOP + 4 ||
        slot.agent.respawn ||
        slot.age > 40
      )
        this.slots.delete(key)
    }

    interface Request {
      agent: TrafficAgent
      crossing: Crossing
      approach: number
      distance: number
      /** Only the approach's entry may claim the slot; the road out waits for it inside. */
      entry: boolean
      /** Already past its own line: committed, and entitled to keep the slot. */
      inside: boolean
    }
    const requests: Request[] = []
    for (const agent of agents) {
      if (agent.respawn || agent.wait > 0) continue
      const ids = this.byEdge.get(agent.edge)
      if (!ids) continue
      for (const id of ids) {
        const crossing = this.crossings[id]
        const approach = crossing.approaches.findIndex((item) => item.edge === agent.edge)
        if (approach < 0) continue
        const at = crossing.approaches[approach].progress
        if (agent.progress > at) continue // already inside the box: committed
        // An approach whose meeting point sits at the edge's own start is the road *out*
        // of the junction: a vehicle on it is already through, and must not be held.
        const entry = at > JUNCTION_STOP
        const line = Math.max(0, at - JUNCTION_STOP)
        const distance = Math.max(0, line - agent.progress)
        if (distance > REQUEST_DISTANCE) continue
        const key = slotKey(id, approach)
        const mine = this.slots.get(key)?.agent === agent
        if (mine) continue // through, or waiting for the far side to clear
        // Every vehicle coming in is limited to its line, whatever else happens: it may
        // not move further unless it is granted the box, below. A vehicle already on the
        // line is limited to zero and so stops dead there.
        if (entry) limits.set(agent, Math.min(limits.get(agent) ?? Infinity, distance))
        if (!eligible(agent)) continue
        // A vehicle still inside the box has already crossed its own line: the light no
        // longer applies to it. Anything on the road out is past the junction altogether.
        const inside = agent.progress >= at
        if (entry && !inside && this.signalised.has(id) && !this.greenFor(crossing, approach))
          continue
        requests.push({ agent, crossing, approach, distance, entry, inside })
      }
    }

    // Whoever has waited longest takes the slot; ties by closeness, then seed.
    requests.sort(
      (a, b) =>
        (this.waited.get(b.agent) ?? 0) - (this.waited.get(a.agent) ?? 0) ||
        a.distance - b.distance ||
        a.agent.seed - b.agent.seed,
    )
    const granted = new Set<TrafficAgent>()
    for (const request of requests) {
      if (granted.has(request.agent)) continue
      // An exit that is already inside the box goes, so the junction empties.
      if (!request.entry) {
        granted.add(request.agent)
        limits.delete(request.agent)
        continue
      }
      const key = slotKey(request.crossing.id, request.approach)
      if (this.slots.has(key)) continue
      // A vehicle past its line is committed: it keeps the ground it entered on, even
      // when its own approach's meeting point moved forward with the merge.
      if (request.inside) {
        this.slots.set(key, { agent: request.agent, edge: request.agent.edge, age: 0 })
        granted.add(request.agent)
        limits.delete(request.agent)
        continue
      }
      if (this.conflicted(request.crossing.id, request.approach)) continue
      this.slots.set(key, { agent: request.agent, edge: request.agent.edge, age: 0 })
      granted.add(request.agent)
      limits.delete(request.agent)
    }

    // ---- waiting time: grows while held at a line, gone once through
    for (const agent of agents) {
      const holding = this.holdsSlot(agent)
      if (!holding && limits.has(agent))
        this.waited.set(agent, (this.waited.get(agent) ?? 0) + Math.max(0, dt))
      else this.waited.delete(agent)
    }
    return limits
  }

  /** True when any approach that crosses this one currently holds its slot. */
  private conflicted(crossingId: number, approach: number): boolean {
    const clashes = this.conflicts.get(crossingId)
    if (!clashes) return false
    for (const other of clashes[approach]) {
      if (this.slots.has(slotKey(crossingId, other))) return true
    }
    return false
  }

  /** Whether the approach has green. Crossings with no signal are never red. */
  private greenFor(crossing: Crossing, approach: number): boolean {
    const spec = this.graph.edges[crossing.approaches[approach].edge]
    if (!spec) return true
    const green = greenAxis(this.clock)
    if (green === null) return false
    const [dx, dz] = travel(spec)
    return green === (Math.abs(dx) >= Math.abs(dz) ? 'x' : 'z')
  }

  private holdsSlot(agent: TrafficAgent): boolean {
    for (const slot of this.slots.values()) if (slot.agent === agent) return true
    return false
  }

  /** How many seconds this vehicle has waited at a junction line. */
  waitOf(agent: TrafficAgent): number {
    return this.waited.get(agent) ?? 0
  }

  /** Every slot currently held, for tests and the debug handle. */
  get occupancy(): { crossing: number; approach: number; seed: number }[] {
    return [...this.slots].map(([key, slot]) => ({
      crossing: Math.floor(key / 64),
      approach: key % 64,
      seed: slot.agent.seed,
    }))
  }
}
