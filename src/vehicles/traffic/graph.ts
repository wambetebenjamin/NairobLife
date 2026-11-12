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
      const add = (a: number, b: number, c: number, d: number, from: string, to: string) => {
        const edge: Edge = {
          ax: a,
          az: b,
          bx: c,
          bz: d,
          length,
          width: road.w,
          lanes: road.ln ?? Math.max(1, Math.floor(road.w / 3.3)),
          oneWay: !!road.ow,
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
      if (!road.ow) add(bx, bz, ax, az, key(x2, z2), key(x1, z1))
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
}

export function makeTraffic(
  graph: RoadGraph,
  start: { x: number; z: number },
  limit = 65,
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
  const agents: TrafficAgent[] = []
  const occupied: OrientedRect[] = []
  for (const { edge, id } of [...near, ...rest]) {
    if (agents.length >= limit) break
    // Assign identities only to accepted candidates so patrols still appear if a spot
    // was rejected. Vary progress by edge id rather than retrying the same location.
    const seed = agents.length
    const kind =
      seed === 2 || seed === 5 || seed === 8
        ? 'boda'
        : seed % 7 === 0
          ? 'matatu'
          : seed % 8 === 0
            ? 'boda'
            : 'car'
    const progress = edge.length * (0.2 + 0.6 * hash01(id, 5))
    const pose = trafficPose(edge, progress)
    const rect = trafficRect(kind, pose)
    // Do not materialise a vehicle on the initial player, or on another traffic box.
    // Parked vehicles and later movement require separate physics checks.
    if (Math.hypot(pose.x - start.x, pose.z - start.z) < 10 + rect.halfLength) continue
    if (occupied.some((other) => orientedRectsOverlap(rect, other, 1))) continue
    agents.push({
      edge: id,
      progress,
      speed: 5 + 3 * hash01(seed, 6),
      kind,
      patrol: seed === 2 || seed === 5 || seed === 8,
      seed,
      wait: 0,
      stopped: false,
      turns: 0,
    })
    occupied.push(rect)
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

/** Approximate footprint shared by initial placement and dead-end restarts. */
export function trafficRect(
  kind: TrafficAgent['kind'],
  pose: ReturnType<typeof trafficPose>,
): OrientedRect {
  const spec = VEHICLES[kind]
  return {
    x: pose.x,
    z: pose.z,
    dx: -Math.sin(pose.yaw),
    dz: -Math.cos(pose.yaw),
    halfLength: spec.length / 2,
    halfWidth: spec.width / 2,
  }
}

/** Advance along connected directed edges. The scheduler handles dead-end restarts. */
export function stepTraffic(
  agent: TrafficAgent,
  graph: RoadGraph,
  dt: number,
  blocked = false,
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
      agent.wait = 3
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

/** Available metres before the vehicle ahead on the same directed segment, keeping a gap.
 * This is a visual headway aid, not collision detection at junctions or across segments. */
export function sameEdgeClearance(agent: TrafficAgent, agents: readonly TrafficAgent[]): number {
  let available = Infinity
  const gap = agent.kind === 'matatu' ? 10 : 7
  for (const other of agents) {
    if (other === agent || other.edge !== agent.edge || other.progress <= agent.progress) continue
    available = Math.min(available, Math.max(0, other.progress - agent.progress - gap))
  }
  return available
}
