/**
 * Everything painted on the ground: parks, water, car parks, railway lines and the road
 * network (pavements, carriageways, centre lines).
 *
 * It all goes into ONE mesh, drawn as decals over the ground plane: the material does
 * not write depth, so overlapping layers cannot z-fight; they simply paint over each
 * other in index order. That is why the order of the sections below matters:
 *
 *   areas -> rail -> pavements -> kerbs -> carriageways (minor first) -> markings
 *
 * Kerbs use the map-maker's trick: every street is first painted a little too wide in
 * kerb colour, and only then are the carriageways painted. Where two streets meet, each
 * one's tarmac covers the other's kerb, so kerbs break at junctions without anyone
 * having to work out where the junctions are.
 *
 * Everything here is paint: the ground is flat, and a kerb is a line you can drive over.
 * Roads that leave the ground (flyovers, ramps) are not here; see raisedRoads.ts.
 *
 * TODO(roads): real raised pavements, with kerbs a wheel has to climb.
 * TODO(roads): lane lines on the flyover decks (raisedRoads.ts builds those).
 */
import earcut from 'earcut'
import { hash01 } from '../../core/random'
import {
  DRIVABLE,
  type AreaKind,
  type RoadKind,
  type ZoneFile,
  type ZoneRoad,
} from '../zone/format'
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
export const PAVEMENT: Partial<Record<RoadKind, number>> = {
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

export const CENTRE_LINE: Partial<Record<RoadKind, true>> = {
  trunk: true,
  primary: true,
  secondary: true,
  tertiary: true,
}

/** Width of the kerb stone line between carriageway and pavement, in metres. */
const KERB = 0.3
/**
 * Streets whose kerbs are painted in black and white blocks, as the main streets of the
 * CBD are. Each block costs two triangles, so the blocks are longer than a real kerb
 * stone and the back streets go without.
 */
const PAINTED_KERB: Partial<Record<RoadKind, true>> = {
  trunk: true,
  primary: true,
  secondary: true,
  tertiary: true,
}
const KERB_BLOCK = 2.4

/** A traffic lane is about this wide; used to guess lane counts the map does not give. */
const LANE_WIDTH = 3.3
const LINE_WIDTH = 0.16

/** Zebra crossings: stripes this long (along the road) and this wide, with equal gaps. */
const ZEBRA_LENGTH = 3
const ZEBRA_STRIPE = 0.55
/** Stop line: how far before the crossing, and how thick. */
const STOP_LINE_GAP = 1.4
const STOP_LINE = 0.4
/** A mapped crossing further than this from any street is ignored. */
const CROSSING_REACH = 6

/**
 * How many lanes a road has in each direction of travel. The map says for a few roads
 * (`ln` counts every lane, both directions together); for the rest we go by the width.
 */
export function lanesEachWay(road: Pick<ZoneRoad, 'k' | 'w' | 'ow' | 'ln'>): number {
  const ways = road.ow ? 1 : 2
  if (road.ln) return Math.max(1, Math.floor(road.ln / ways))
  return Math.max(1, Math.floor(road.w / ways / LANE_WIDTH))
}

/**
 * A line running beside a road's centre line, `offset` metres to its left as you travel
 * along it (negative for the right). "Left" here is the true left on the map.
 */
export function offsetLine(line: number[], offset: number): number[] {
  if (offset === 0) return line
  const edges = ribbonEdges(line, Math.abs(offset))
  // ribbonEdges calls +90° in (x, z) "left", which on a map with z pointing south is
  // the right-hand side. Its second pair is therefore the true left.
  const pick = offset > 0 ? 2 : 0
  const out = new Array<number>(line.length)
  for (let i = 0; i < line.length / 2; i++) {
    out[i * 2] = edges[i * 4 + pick]
    out[i * 2 + 1] = edges[i * 4 + pick + 1]
  }
  return out
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

  /**
   * A rectangle centred on a point: `length` metres along the direction (dx, dz), which
   * must be a unit vector, and `width` metres across it.
   */
  bar(x: number, z: number, dx: number, dz: number, length: number, width: number, c: RGB): void {
    const ax = (dx * length) / 2
    const az = (dz * length) / 2
    const hx = (-dz * width) / 2
    const hz = (dx * width) / 2
    const l0 = this.vertex(x - ax + hx, z - az + hz, c)
    const r0 = this.vertex(x - ax - hx, z - az - hz, c)
    const l1 = this.vertex(x + ax + hx, z + az + hz, c)
    const r1 = this.vertex(x + ax - hx, z + az - hz, c)
    this.idx.push(r0, l0, l1, r0, l1, r1)
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
      const middle = (start + end) / 2 - dist[seg]
      this.bar(ax + dx * middle, az + dz * middle, dx, dz, dash, width, c)
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

  const kerbed = flat.filter((road) => PAVEMENT[road.k] && !road.lk)
  for (const road of kerbed) {
    w.ribbon(lines.get(road)!, road.w + PAVEMENT[road.k]! * 2, GROUND.sidewalk, true)
  }

  // ---- kerbs: each street a little too wide in kerb stone; the tarmac comes next
  for (const road of kerbed) w.ribbon(lines.get(road)!, road.w + KERB * 2, GROUND.kerb, true)
  for (const road of kerbed) {
    if (!PAINTED_KERB[road.k]) continue
    const edge = road.w / 2 + KERB / 2
    for (const side of [edge, -edge]) {
      w.dashes(offsetLine(lines.get(road)!, side), KERB, KERB_BLOCK, KERB_BLOCK, GROUND.kerbPaint)
    }
  }

  // ---- carriageways
  for (const kind of ROAD_ORDER) {
    for (const road of flat) {
      if (road.k === kind) w.ribbon(lines.get(road)!, road.w, ROAD_COLOUR[kind], true)
    }
  }

  // ---- markings: a line down the middle of two-way streets, and between lanes
  for (const road of flat) {
    if (!DRIVABLE[road.k] || road.lk) continue
    const line = lines.get(road)!
    const lanes = lanesEachWay(road)
    if (!road.ow && CENTRE_LINE[road.k] && road.w >= 6) {
      // With two lanes each way, the middle line is one you do not cross.
      if (lanes >= 2) w.ribbon(line, LINE_WIDTH * 1.4, GROUND.marking, false)
      else w.dashes(line, 0.22, 3, 6, GROUND.marking)
    }
    if (lanes < 2) continue
    // Lane lines sit between the lanes of each carriageway: across the full width of a
    // one-way street, across each half of a two-way one.
    const carriageway = road.ow ? road.w : road.w / 2
    const laneWidth = carriageway / lanes
    for (let lane = 1; lane < lanes; lane++) {
      if (road.ow) {
        w.dashes(offsetLine(line, lane * laneWidth - road.w / 2), LINE_WIDTH, 3, 6, GROUND.marking)
      } else {
        w.dashes(offsetLine(line, lane * laneWidth), LINE_WIDTH, 3, 6, GROUND.marking)
        w.dashes(offsetLine(line, -lane * laneWidth), LINE_WIDTH, 3, 6, GROUND.marking)
      }
    }
  }

  // ---- zebra crossings, where the map has one
  for (const poi of zone.pois) {
    if (poi.k !== 'crossing') continue
    const x = poi.x / q
    const z = poi.z / q
    // The street it crosses: the nearest carriageway, and which way that runs here.
    let best: { road: ZoneRoad; x: number; z: number; dx: number; dz: number } | undefined
    let bestSq = CROSSING_REACH * CROSSING_REACH
    for (const road of flat) {
      if (!DRIVABLE[road.k]) continue
      const line = lines.get(road)!
      for (let i = 0; i < line.length - 2; i += 2) {
        const ax = line[i]
        const az = line[i + 1]
        const dx = line[i + 2] - ax
        const dz = line[i + 3] - az
        const lengthSq = dx * dx + dz * dz
        if (lengthSq < 1e-6) continue
        const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / lengthSq))
        const px = ax + dx * t
        const pz = az + dz * t
        const distanceSq = (px - x) * (px - x) + (pz - z) * (pz - z)
        // Of two streets equally near (a junction), prefer the wider one.
        if (distanceSq > bestSq || (distanceSq === bestSq && best && road.w <= best.road.w))
          continue
        bestSq = distanceSq
        const length = Math.sqrt(lengthSq)
        best = { road, x: px, z: pz, dx: dx / length, dz: dz / length }
      }
    }
    if (!best) continue
    const { road, dx, dz } = best
    // The true left of the direction of travel on the map (z points south).
    const leftX = dz
    const leftZ = -dx

    const stripes = Math.max(2, Math.floor((road.w - 0.3) / (ZEBRA_STRIPE * 2)))
    const pitch = road.w / stripes
    for (let k = 0; k < stripes; k++) {
      const across = (k + 0.5) * pitch - road.w / 2
      w.bar(
        best.x + leftX * across,
        best.z + leftZ * across,
        dx,
        dz,
        ZEBRA_LENGTH,
        ZEBRA_STRIPE,
        GROUND.marking,
      )
    }

    // Stop lines, on the side traffic arrives from. Kenya drives on the left: traffic
    // going with the line keeps left of it and meets the crossing from behind.
    const back = ZEBRA_LENGTH / 2 + STOP_LINE_GAP
    const stop = (along: number, from: number, to: number) => {
      const middle = (from + to) / 2
      w.bar(
        best.x + dx * along + leftX * middle,
        best.z + dz * along + leftZ * middle,
        leftX,
        leftZ,
        Math.abs(to - from),
        STOP_LINE,
        GROUND.marking,
      )
    }
    if (road.ow) {
      stop(-back, -road.w / 2, road.w / 2)
    } else {
      stop(-back, 0, road.w / 2)
      stop(back, -road.w / 2, 0)
    }
  }
  return w.finish()
}
