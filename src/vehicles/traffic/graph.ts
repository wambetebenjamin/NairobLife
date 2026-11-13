/** Directed ground-level road graph and simple ambient traffic. */
import { VEHICLES } from '../../config/vehicles'
import { orientedRectsOverlap, type OrientedRect } from '../../core/geom2d'
import { hash01 } from '../../core/random'
import { DRIVABLE, type ZoneFile } from '../../world/zone/format'

export interface Edge {
  ax: number
  az: number
  bx: number
  bz: number
  length: number
  width: number
  lanes: number
  oneWay: boolean
  from: string
  to: string
  stage: boolean
}
export interface RoadGraph {
  edges: Edge[]
  outgoing: Map<string, number[]>
}
const key = (x: number, z: number) => `${x},${z}`

/** Only mapped shared vertices connect; crossings with no shared vertex stay disconnected. */
export function buildRoadGraph(zone: ZoneFile): RoadGraph {
  const edges: Edge[] = []
  const outgoing = new Map<string, number[]>()
  const stages = zone.pois.filter((p) => p.k === 'stage')
  for (const road of zone.roads) {
    if (!DRIVABLE[road.k] || road.e || road.br || road.w < 5) continue
    for (let i = 0; i < road.p.length - 2; i += 2) {
      const x1 = road.p[i],
        z1 = road.p[i + 1],
        x2 = road.p[i + 2],
        z2 = road.p[i + 3]
      const ax = x1 / zone.q,
        az = z1 / zone.q,
        bx = x2 / zone.q,
        bz = z2 / zone.q
      const length = Math.hypot(bx - ax, bz - az)
      if (length < 1) continue
      const stage = stages.some((p) => {
        const px = p.x / zone.q - ax,
          pz = p.z / zone.q - az
        const t = Math.max(0, Math.min(1, (px * (bx - ax) + pz * (bz - az)) / (length * length)))
        return Math.hypot(px - t * (bx - ax), pz - t * (bz - az)) < 18
      })
      // Two ways that share a vertex but join at an angle still meet at a junction, so
      // both directions of a two-way road arrive there. The bake stores `ow` only when a
      // way really is one-way.
      const oneWay = !!road.ow
      const add = (a: number, b: number, c: number, d: number, from: string, to: string) => {
        const edge: Edge = {
          ax: a,
          az: b,
          bx: c,
          bz: d,
          length,
          width: road.w,
          lanes: road.ln ?? Math.max(1, Math.floor(road.w / 3.3)),
          oneWay,
          from,
          to,
          stage,
        }
        const id = edges.push(edge) - 1
        const list = outgoing.get(from) ?? []
        list.push(id)
        outgoing.set(from, list)
      }
      add(ax, az, bx, bz, key(x1, z1), key(x2, z2))
      if (!oneWay) add(bx, bz, ax, az, key(x2, z2), key(x1, z1))
    }
  }
  return { edges, outgoing }
}

export interface TrafficAgent {
  edge: number
  progress: number
  speed: number
  kind: 'car' | 'matatu' | 'boda'
  seed: number
  wait: number
  stopped: boolean
  turns: number
  /** At a dead end, remain in place until the scheduler finds a safe restart. */
  respawn?: boolean
  /** Decorative police patrol; same traffic rules, no pursuit or law enforcement. */
  patrol?: boolean
  /** One-shot: this matatu has just arrived at a stage and should sound its horn. */
  horn?: boolean
}

export function makeTraffic(
  graph: RoadGraph,
  start: { x: number; z: number },
  limit = 65,
  /**
   * Buildings, if the caller has them. A street that the map draws through a building is
   * not a street a car can start on, and the graph is built from the map's geometry alone.
   */
  buildingAt?: (x: number, z: number) => unknown,
): TrafficAgent[] {
  const long = graph.edges.map((edge, id) => ({ edge, id })).filter(({ edge }) => edge.length >= 22)
  const distance = ({ edge }: (typeof long)[number]) =>
    Math.hypot((edge.ax + edge.bx) / 2 - start.x, (edge.az + edge.bz) / 2 - start.z)
  const near = long
    .filter((e) => distance(e) < 180)
    .sort((a, b) => distance(a) - distance(b))
    .slice(0, 12)
  const used = new Set(near.map((e) => e.id))
  const rest = long
    .filter((e) => !used.has(e.id))
    .sort((a, b) => hash01(a.id, 54) - hash01(b.id, 54))

  // Ambient traffic is cars, matatus and bodas only: a nganya is a player vehicle, not
  // something the simulation drives.
  const kindOf = (seed: number): 'car' | 'boda' | 'matatu' =>
    seed === 2 || seed === 5 || seed === 8
      ? 'boda'
      : seed % 7 === 0
        ? 'matatu'
        : seed % 8 === 0
          ? 'boda'
          : 'car'

  const agents: TrafficAgent[] = []
  // Bodies already placed, as rectangles. Two vehicles that start inside each other are
  // stuck inside each other until one of them happens to turn off, which looks like a
  // crash that no driver caused.
  const placed: OrientedRect[] = []

  for (const { edge, id } of [...near, ...rest]) {
    if (agents.length >= limit) break
    const seed = agents.length
    const progress = edge.length * (0.2 + 0.6 * hash01(seed, 5))
    const kind = kindOf(seed)
    const pose = trafficPose(edge, progress)
    const spec = VEHICLES[kind]
    const body: OrientedRect = {
      x: pose.x,
      z: pose.z,
      // The car's own forward axis: yaw 0 faces -z.
      dx: -Math.sin(pose.yaw),
      dz: -Math.cos(pose.yaw),
      halfLength: spec.length / 2,
      halfWidth: spec.width / 2,
    }
    // A street drawn through a building is not a street. Measured over the CBD, about one
    // spawn in a hundred landed inside one before this check.
    if (buildingAt && buildingAt(pose.x, pose.z)) continue
    // A small margin, because two bumpers touching is already too close at a standstill.
    if (placed.some((other) => orientedRectsOverlap(body, other, 1.2))) continue
    placed.push(body)
    // Identities are assigned to accepted candidates, so the patrol bikes still appear if
    // a spot was rejected; `seed` is the count of agents so far, not the candidate index.
    agents.push({
      edge: id,
      progress,
      speed: 5 + 3 * hash01(seed, 6),
      kind,
      // Exactly three marked patrols, always the bikes at these three seeds.
      patrol: seed === 2 || seed === 5 || seed === 8,
      seed,
      wait: 0,
      stopped: false,
      turns: 0,
    })
  }
  return agents
}

/** Left-hand lane, measured relative to direction of travel. */
export function trafficPose(edge: Edge, progress: number) {
  const t = Math.max(0, Math.min(1, progress / edge.length))
  const dx = (edge.bx - edge.ax) / edge.length,
    dz = (edge.bz - edge.az) / edge.length
  const offset = Math.min(1.8, edge.width / 4)
  return {
    x: edge.ax + (edge.bx - edge.ax) * t + dz * offset,
    z: edge.az + (edge.bz - edge.az) * t - dx * offset,
    yaw: Math.atan2(-dx, -dz),
  }
}

/** Advance along connected directed edges. The scheduler handles dead-end restarts. */
export function stepTraffic(
  agent: TrafficAgent,
  graph: RoadGraph,
  dt: number,
  blocked = false,
  stageWait = 3,
): void {
  if (dt <= 0 || !graph.edges.length) return
  if (agent.wait > 0) {
    agent.wait = Math.max(0, agent.wait - dt)
    return
  }
  if (blocked || agent.respawn) return
  let remaining = agent.speed * dt
  for (let guard = 0; guard < 40 && remaining > 0; guard++) {
    const edge = graph.edges[agent.edge]
    if (
      agent.kind === 'matatu' &&
      edge.stage &&
      !agent.stopped &&
      agent.progress < edge.length * 0.5 &&
      agent.progress + remaining >= edge.length * 0.5
    ) {
      agent.progress = edge.length * 0.5
      agent.stopped = true
      agent.wait = stageWait
      // A matatu that has just pulled up at a stage lets everyone know, once.
      agent.horn = true
      return
    }
    const dist = edge.length - agent.progress
    if (remaining < dist) {
      agent.progress += remaining
      return
    }
    remaining -= dist
    const outgoing = (graph.outgoing.get(edge.to) ?? []).filter(
      (id) => graph.edges[id].to !== edge.from,
    )
    if (!outgoing.length) {
      agent.progress = edge.length
      agent.wait = 3
      agent.respawn = true
      return
    }
    agent.edge = outgoing[Math.floor(hash01(agent.seed, 23 + agent.turns++) * outgoing.length)]
    agent.progress = 0
    agent.stopped = false
  }
}

/** Half the length of a vehicle of this kind, in metres, from the spec table. */
const halfLength = (kind: TrafficAgent['kind']) => VEHICLES[kind].length / 2

/**
 * Available metres before the vehicle ahead on the same directed segment. The gap kept
 * is both vehicles' half-lengths plus a little air, so a matatu behind a boda does not
 * shove the boda along, and two cars in a queue stand bumper to bumper rather than seven
 * metres apart.
 *
 * This is a following aid along one edge, not collision detection across a junction or
 * between two edges that run side by side.
 */
export function sameEdgeClearance(agent: TrafficAgent, agents: readonly TrafficAgent[]): number {
  let available = Infinity
  const gap = halfLength(agent.kind) + 2
  for (const other of agents) {
    if (other === agent || other.edge !== agent.edge || other.progress <= agent.progress) continue
    const keep = gap + halfLength(other.kind)
    available = Math.min(available, Math.max(0, other.progress - agent.progress - keep))
  }
  return available
}
