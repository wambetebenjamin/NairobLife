/**
 * Everything painted on the ground: parks, water, car parks, railway lines and the road
 * network (pavements, carriageways, centre lines).
 *
 * It all goes into ONE mesh, drawn as decals over the ground plane: the material does
 * not write depth, so overlapping layers cannot z-fight; they simply paint over each
 * other in index order. That is why the order of the sections below matters:
 *
 *   areas -> rail -> pavements -> footpaths -> carriageways (minor first) -> markings
 *
 * Roads that leave the ground (flyovers, ramps) are not here; see raisedRoads.ts.
 */
import earcut from 'earcut'
import { hash01 } from '../../core/random'
import type { AreaKind, RoadKind, ZoneFile, ZoneRoad } from '../zone/format'
import { AREA_COLOURS, GROUND, scale, type RGB } from './palette'
import { cumulativeLength, ribbonEdges } from './ribbon'

export interface FlatMesh {
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  indices: Uint32Array
}

/** Height of the decal layer above the ground plane, in metres. */
const DECAL_Y = 0.02

/** Extra width each side of a carriageway for the pavement, in metres. */
const PAVEMENT: Partial<Record<RoadKind, number>> = {
  trunk: 2.2,
  primary: 2.4,
  secondary: 2.2,
  tertiary: 2,
  residential: 1.6,
}

/** Paint order: later entries cover earlier ones where roads cross. */
const ROAD_ORDER: RoadKind[] = [
  'steps',
  'footway',
  'pedestrian',
  'service',
  'residential',
  'tertiary',
  'secondary',
  'primary',
  'trunk',
  'motorway',
]

const ROAD_COLOUR: Record<RoadKind, RGB> = {
  motorway: GROUND.asphaltMajor,
  trunk: GROUND.asphaltMajor,
  primary: GROUND.asphaltMajor,
  secondary: GROUND.asphalt,
  tertiary: GROUND.asphalt,
  residential: GROUND.asphalt,
  service: GROUND.asphaltWorn,
  pedestrian: GROUND.paving,
  footway: GROUND.footway,
  steps: GROUND.steps,
}

const CENTRE_LINE: Partial<Record<RoadKind, true>> = {
  trunk: true,
  primary: true,
  secondary: true,
  tertiary: true,
}

const AREA_ORDER: AreaKind[] = [
  'plaza',
  'parking',
  'grass',
  'park',
  'garden',
  'pitch',
  'wood',
  'water',
]

class FlatWriter {
  pos: number[] = []
  col: number[] = []
  idx: number[] = []
  count = 0

  vertex(x: number, z: number, c: RGB): number {
    this.pos.push(x, DECAL_Y, z)
    this.col.push(c[0], c[1], c[2])
    return this.count++
  }

  /** Flat ribbon along a polyline, with rounded ends so joints between roads close up. */
  ribbon(line: number[], width: number, c: RGB, caps: boolean): void {
    const n = line.length / 2
    if (n < 2) return
    const edges = ribbonEdges(line, width / 2)
    const first = this.count
    for (let i = 0; i < n; i++) {
      this.vertex(edges[i * 4], edges[i * 4 + 1], c) // left
      this.vertex(edges[i * 4 + 2], edges[i * 4 + 3], c) // right
    }
    for (let i = 0; i < n - 1; i++) {
      const l0 = first + i * 2
      const r0 = l0 + 1
      const l1 = l0 + 2
      const r1 = l0 + 3
      this.idx.push(r0, l0, l1, r0, l1, r1)
    }
    if (caps) {
      this.disc(line[0], line[1], width / 2, c)
      this.disc(line[(n - 1) * 2], line[(n - 1) * 2 + 1], width / 2, c)
    }
  }

  /** An octagon big enough to contain a circle of the given radius. */
  disc(x: number, z: number, radius: number, c: RGB): void {
    const SIDES = 8
    const r = radius / Math.cos(Math.PI / SIDES)
    const centre = this.vertex(x, z, c)
    for (let k = 0; k < SIDES; k++) {
      const a = ((k + 0.5) / SIDES) * Math.PI * 2
      this.vertex(x + Math.cos(a) * r, z + Math.sin(a) * r, c)
    }
    for (let k = 0; k < SIDES; k++)
      this.idx.push(centre, centre + 1 + ((k + 1) % SIDES), centre + 1 + k)
  }

  polygon(outer: number[], holes: number[][], c: RGB): void {
    let data = outer
    let holeIndices: number[] | undefined
    if (holes.length) {
      data = outer.slice()
      holeIndices = []
      for (const hole of holes) {
        holeIndices.push(data.length / 2)
        for (const value of hole) data.push(value)
      }
    }
    const triangles = earcut(data, holeIndices)
    const first = this.count
    for (let i = 0; i < data.length; i += 2) this.vertex(data[i], data[i + 1], c)
    for (let t = 0; t < triangles.length; t += 3) {
      const a = triangles[t]
      const b = triangles[t + 1]
      const d = triangles[t + 2]
      const cross =
        (data[b * 2] - data[a * 2]) * (data[d * 2 + 1] - data[a * 2 + 1]) -
        (data[b * 2 + 1] - data[a * 2 + 1]) * (data[d * 2] - data[a * 2])
      if (cross < 0) this.idx.push(first + a, first + b, first + d)
      else this.idx.push(first + a, first + d, first + b)
    }
  }

  /** Dashes along a polyline: `dash` metres on, `gap` metres off. */
  dashes(line: number[], width: number, dash: number, gap: number, c: RGB): void {
    const n = line.length / 2
    const dist = cumulativeLength(line)
    const total = dist[n - 1]
    const period = dash + gap
    let seg = 0
    for (let start = gap; start + dash <= total; start += period) {
      const end = start + dash
      while (seg < n - 2 && dist[seg + 1] < start) seg++
      // Keep each dash on a single segment; skip the few that would bend round a corner.
      if (dist[seg + 1] < end) continue
      const ax = line[seg * 2]
      const az = line[seg * 2 + 1]
      const len = dist[seg + 1] - dist[seg]
      const dx = (line[(seg + 1) * 2] - ax) / len
      const dz = (line[(seg + 1) * 2 + 1] - az) / len
      const t0 = start - dist[seg]
      const t1 = end - dist[seg]
      const hx = (-dz * width) / 2
      const hz = (dx * width) / 2
      const l0 = this.vertex(ax + dx * t0 + hx, az + dz * t0 + hz, c)
      const r0 = this.vertex(ax + dx * t0 - hx, az + dz * t0 - hz, c)
      const l1 = this.vertex(ax + dx * t1 + hx, az + dz * t1 + hz, c)
      const r1 = this.vertex(ax + dx * t1 - hx, az + dz * t1 - hz, c)
      this.idx.push(r0, l0, l1, r0, l1, r1)
    }
  }

  finish(): FlatMesh {
    const normals = new Float32Array(this.count * 3)
    for (let i = 1; i < normals.length; i += 3) normals[i] = 1
    return {
      positions: new Float32Array(this.pos),
      normals,
      colors: new Float32Array(this.col),
      indices: new Uint32Array(this.idx),
    }
  }
}

/** True when any vertex of the road is off the ground. Those are built by raisedRoads.ts. */
export function isRaised(road: ZoneRoad): boolean {
  return road.e !== undefined
}

export function buildGroundMesh(zone: ZoneFile): FlatMesh {
  const w = new FlatWriter()
  const q = zone.q
  const toMetres = (ring: number[]) => ring.map((value) => value / q)

  // ---- areas
  zone.areas
    .map((area, i) => ({ area, i }))
    .sort((a, b) => AREA_ORDER.indexOf(a.area.k) - AREA_ORDER.indexOf(b.area.k) || a.i - b.i)
    .forEach(({ area, i }) => {
      const tint = 0.92 + 0.16 * hash01(i, 21)
      w.polygon(toMetres(area.p), (area.hs ?? []).map(toMetres), scale(AREA_COLOURS[area.k], tint))
    })

  // ---- railway: ballast bed, then the track
  const rails = zone.rails.map((rail) => toMetres(rail.p))
  for (const line of rails) w.ribbon(line, 3.6, GROUND.ballast, false)
  for (const line of rails) w.ribbon(line, 1.5, GROUND.rail, false)

  // ---- roads
  const flat = zone.roads.filter((road) => !isRaised(road))
  const lines = new Map<ZoneRoad, number[]>()
  for (const road of flat) lines.set(road, toMetres(road.p))

  for (const road of flat) {
    const extra = PAVEMENT[road.k]
    if (extra && !road.lk) w.ribbon(lines.get(road)!, road.w + extra * 2, GROUND.sidewalk, true)
  }
  for (const kind of ROAD_ORDER) {
    for (const road of flat) {
      if (road.k === kind) w.ribbon(lines.get(road)!, road.w, ROAD_COLOUR[kind], true)
    }
  }
  for (const road of flat) {
    // TODO(roads): lane lines on multi-lane one-way roads, zebra crossings, stop lines.
    if (CENTRE_LINE[road.k] && !road.ow && !road.lk && road.w >= 6) {
      w.dashes(lines.get(road)!, 0.22, 3, 6, GROUND.marking)
    }
  }
  return w.finish()
}
