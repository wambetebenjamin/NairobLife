/**
 * Where the trees stand, and what shape each one is.
 *
 * OSM has a few hundred individually mapped trees in the CBD (the avenues, the
 * university). Parks and woods are mapped only as areas, so we plant those ourselves:
 * seeded-random points inside each polygon, kept clear of buildings, roads and water.
 * The result is the same on every load.
 *
 * Each tree also gets a *style*, because a city avenue is not a uniform green blob:
 *
 *   round     the broad, lumpy canopy of a croton, mango or jacaranda
 *   acacia    the flat umbrella of a thorn tree, forked low and wide
 *   columnar  the narrow spire of a cypress, common in gardens and churchyards
 *   palm      the street palms along Kenyatta Avenue and in the parks
 *
 * `buildTreeMesh` then turns those into triangles: tapered, leaning trunks, forked
 * branches, and canopies of overlapping lumpy blobs. No three.js, so the shapes are
 * built in the worker (and in tests) and handed over as plain arrays.
 */
import { distToSegmentSq, pointInPolygon, ringBounds } from '../../core/geom2d'
import { hash01, seededRandom } from '../../core/random'
import { SpatialGrid } from '../../core/spatialGrid'
import { TREE_KINDS, type AreaKind, type ZoneFile } from '../zone/format'
import {
  TREE_FLAME,
  TREE_GREENS,
  TREE_JACARANDA,
  hexToLinear,
  pick,
  scale,
  type RGB,
} from './palette'

/** Floats per tree: x, z, height, canopy radius, r, g, b, yaw, style, seed. */
export const TREE_STRIDE = 10

/** The shapes of tree. The numbers are stored in the zone data, so never renumber them. */
export const TREE_STYLE = { round: 0, acacia: 1, columnar: 2, palm: 3 } as const
export type TreeStyle = (typeof TREE_STYLE)[keyof typeof TREE_STYLE]

/** Trunk radius at the ground, in metres, for a tree of the given height. */
export const trunkRadius = (height: number) => 0.12 + height * 0.017

/** Square metres of area per planted tree. */
const DENSITY: Partial<Record<AreaKind, number>> = { wood: 110, park: 520, garden: 330 }
const MAX_TREES = 2600
const MIN_SPACING = 4

/**
 * The shape a mapped tree should be, given what OpenStreetMap actually said about it.
 *
 * Only 43 of the CBD's 271 mapped trees carry any classification at all -- 40 broadleaved and
 * 3 evergreen, none of them a species -- so most still fall back to a seed. That is
 * deliberate: inventing a species for an untagged tree would be making up data. Where the map
 * did say something, it wins.
 */
export function styleOfKind(kind: number, seed: number): TreeStyle {
  if (kind === TREE_KINDS.broadleaved) return TREE_STYLE.round
  if (kind === TREE_KINDS.evergreen) return TREE_STYLE.acacia
  if (kind === TREE_KINDS.palm) return TREE_STYLE.palm
  if (kind === TREE_KINDS.conifer) return TREE_STYLE.columnar
  return treeStyle(seed)
}

/** Which shape a tree is, from its seed. Roughly the mix you see in the CBD. */
export function treeStyle(seed: number): TreeStyle {
  const roll = hash01(seed, 37)
  if (roll < 0.06) return TREE_STYLE.palm
  if (roll < 0.3) return TREE_STYLE.acacia
  if (roll < 0.4) return TREE_STYLE.columnar
  return TREE_STYLE.round
}

interface Polygon {
  outer: number[]
  holes: number[][]
}

export function scatterTrees(zone: ZoneFile): Float32Array {
  const q = zone.q
  const toMetres = (ring: number[]) => ring.map((value) => value / q)

  // ---- obstacles
  const buildings = new SpatialGrid<Polygon>(40)
  for (const b of zone.buildings) {
    if ((b.b ?? 0) > 3) continue // floating parts do not block the ground
    const outer = toMetres(b.p)
    const box = ringBounds(outer)
    buildings.insert({ outer, holes: [] }, box.minX - 2, box.minZ - 2, box.maxX + 2, box.maxZ + 2)
  }
  const roads = new SpatialGrid<[number, number, number, number, number]>(40)
  const addLine = (p: number[], clearance: number) => {
    for (let i = 0; i < p.length - 2; i += 2) {
      const ax = p[i] / q
      const az = p[i + 1] / q
      const bx = p[i + 2] / q
      const bz = p[i + 3] / q
      roads.insert(
        [ax, az, bx, bz, clearance],
        Math.min(ax, bx) - clearance,
        Math.min(az, bz) - clearance,
        Math.max(ax, bx) + clearance,
        Math.max(az, bz) + clearance,
      )
    }
  }
  for (const road of zone.roads)
    addLine(road.p, road.w / 2 + (road.k === 'footway' || road.k === 'steps' ? 0.8 : 2))
  for (const rail of zone.rails) addLine(rail.p, 3.5)
  const water = zone.areas
    .filter((a) => a.k === 'water' || a.k === 'pitch')
    .map((a) => ({ outer: toMetres(a.p), holes: [] }))

  const blocked = (x: number, z: number): boolean => {
    for (const b of buildings.at(x, z)) if (pointInPolygon(x, z, b.outer)) return true
    for (const [ax, az, bx, bz, clearance] of roads.at(x, z)) {
      if (distToSegmentSq(x, z, ax, az, bx, bz) < clearance * clearance) return true
    }
    for (const w of water) if (pointInPolygon(x, z, w.outer)) return true
    return false
  }

  // ---- planting
  const out: number[] = []
  const planted = new SpatialGrid<[number, number]>(MIN_SPACING * 2)
  const tooClose = (x: number, z: number): boolean => {
    let close = false
    planted.near(x, z, MIN_SPACING, ([px, pz]) => {
      if ((px - x) * (px - x) + (pz - z) * (pz - z) < MIN_SPACING * MIN_SPACING) close = true
    })
    return close
  }
  const plant = (x: number, z: number, seed: number, wild: boolean, kind = 0) => {
    const style = styleOfKind(kind, seed)
    const height =
      style === TREE_STYLE.palm
        ? 9 + hash01(seed, 31) * 7
        : style === TREE_STYLE.columnar
          ? 7 + hash01(seed, 31) * 6
          : 6 + hash01(seed, 31) * (wild ? 9 : 6)
    const radius =
      style === TREE_STYLE.columnar
        ? height * 0.16
        : style === TREE_STYLE.palm
          ? height * 0.2
          : height * (0.34 + hash01(seed, 32) * 0.12)
    const roll = hash01(seed, 33)
    const base =
      style === TREE_STYLE.palm
        ? pick(TREE_GREENS, seed, 34)
        : roll < (wild ? 0.04 : 0.1)
          ? pick(TREE_JACARANDA, seed, 34)
          : roll > 0.985
            ? TREE_FLAME[0]
            : pick(TREE_GREENS, seed, 34)
    const c = scale(base, 0.85 + hash01(seed, 35) * 0.3)
    out.push(x, z, height, radius, c[0], c[1], c[2], hash01(seed, 36) * Math.PI * 2, style, seed)
    planted.insert([x, z], x, z, x, z)
  }

  for (let i = 0, k = 0; i < zone.trees.length; i += 2, k++) {
    const x = zone.trees[i] / q
    const z = zone.trees[i + 1] / q
    // Mapped positions are trusted, but not blindly: OpenStreetMap has a few street trees
    // whose node sits in the middle of the carriageway next to them, and a trunk growing out
    // of a traffic lane looks like a bug in this game rather than in the map.
    if (!tooClose(x, z) && !blocked(x, z)) plant(x, z, i + 1, false, zone.treeKinds?.[k] ?? 0)
  }

  zone.areas.forEach((area, index) => {
    const perTree = DENSITY[area.k]
    if (!perTree) return
    const polygon: Polygon = { outer: toMetres(area.p), holes: (area.hs ?? []).map(toMetres) }
    const box = ringBounds(polygon.outer)
    const boxArea = (box.maxX - box.minX) * (box.maxZ - box.minZ)
    // Throw darts at the bounding box; the polygon keeps its share of them.
    const attempts = Math.min(4000, Math.ceil(boxArea / perTree))
    const random = seededRandom(0x7ee5 + index * 7919)
    for (let n = 0; n < attempts && out.length < MAX_TREES * TREE_STRIDE; n++) {
      const x = box.minX + random() * (box.maxX - box.minX)
      const z = box.minZ + random() * (box.maxZ - box.minZ)
      if (!pointInPolygon(x, z, polygon.outer, polygon.holes)) continue
      if (blocked(x, z) || tooClose(x, z)) continue
      plant(x, z, index * 100003 + n, area.k === 'wood')
    }
  })

  return new Float32Array(out)
}

// --------------------------------------------------------------------------- shapes

/** One merged tree mesh, in the same plain arrays the building builder hands over. */
export interface TreeMesh {
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  indices: Uint32Array
}

/** The two halves of every tree: wood, and leaves. */
export interface TreeMeshes {
  wood: TreeMesh
  leaves: TreeMesh
}

/** A square group of trees, so off-screen avenues are culled in one go. */
export interface TreeChunk extends TreeMeshes {
  /** Chunk coordinates on the same CHUNK_SIZE grid the buildings use. */
  cx: number
  cz: number
  trees: number
}

/** Metres per tree chunk, in world units. Matches the building chunks. */
export const TREE_CHUNK = 400

/**
 * Group a packed tree array into chunks and build each one separately.
 *
 * Without this the whole city's trees are one pair of meshes, and every tree in the CBD
 * is submitted every frame even when it is behind you. Buildings are chunked for the same
 * reason (see zone/protocol.ts).
 */
export function buildTreeChunks(trees: Float32Array): TreeChunk[] {
  const count = trees.length / TREE_STRIDE
  const groups = new Map<string, number[]>()
  for (let i = 0; i < count; i++) {
    const o = i * TREE_STRIDE
    const cx = Math.floor(trees[o] / TREE_CHUNK)
    const cz = Math.floor(trees[o + 1] / TREE_CHUNK)
    const key = `${cx},${cz}`
    const list = groups.get(key)
    if (list) list.push(i)
    else groups.set(key, [i])
  }

  const chunks: TreeChunk[] = []
  for (const [key, indices] of groups) {
    const [cx, cz] = key.split(',').map(Number)
    const packed = packTrees(trees, indices)
    const { wood, leaves } = buildTreeMesh(packed)
    chunks.push({ cx, cz, trees: indices.length, wood, leaves })
  }
  return chunks
}

/** Copy the trees at `indices` out of a packed array into a packed array of their own. */
export function packTrees(trees: Float32Array, indices: readonly number[]): Float32Array {
  const packed = new Float32Array(indices.length * TREE_STRIDE)
  indices.forEach((index, i) => {
    const o = index * TREE_STRIDE
    for (let f = 0; f < TREE_STRIDE; f++) packed[i * TREE_STRIDE + f] = trees[o + f]
  })
  return packed
}

type P = [number, number, number]

/** Sun-bleached leaf tops: everything green goes a little yellow in the Nairobi sun. */
const SUNLIT = hexToLinear('#d8c761')
const BARK = hexToLinear('#5c4a3a')
const PALM_BARK = hexToLinear('#8b8375')

/** Grow or shrink a colour, keeping it in range. */
function tint(colour: RGB, amount: number): RGB {
  return [
    Math.min(1, Math.max(0, colour[0] * amount)),
    Math.min(1, Math.max(0, colour[1] * amount)),
    Math.min(1, Math.max(0, colour[2] * amount)),
  ]
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/**
 * Two meshes come out of one tree: the wood (trunks, branches, palm stems) and the leaves
 * (blobs, fronds). They take different materials — the leaves sway and let light through,
 * the bark does neither — so they are built into separate buffers.
 */
class MeshBuilder {
  private wood = new SubMesh()
  private leaves = new SubMesh()

  /** A trunk or branch: into the wood mesh. */
  tube(points: readonly P[], radii: readonly number[], sides: number, colour: RGB): void {
    this.wood.tube(points, radii, sides, colour)
  }

  /** A lump of leaves: into the leaf mesh. */
  blob(centre: P, radii: P, seed: number, colour: RGB, jitter = 0.32): void {
    this.leaves.blob(centre, radii, seed, colour, jitter)
  }

  /** A palm frond: into the leaf mesh. */
  frond(origin: P, yaw: number, length: number, width: number, colour: RGB): void {
    this.leaves.frond(origin, yaw, length, width, colour)
  }

  build(): TreeMeshes {
    return { wood: this.wood.build(), leaves: this.leaves.build() }
  }
}

/** One of the two buffers a tree is built into. */
class SubMesh {
  private readonly positions: number[] = []
  private readonly normals: number[] = []
  private readonly colors: number[] = []
  private readonly indices: number[] = []

  vertex(p: P, n: P, colour: RGB): number {
    const index = this.positions.length / 3
    this.positions.push(p[0], p[1], p[2])
    this.normals.push(n[0], n[1], n[2])
    this.colors.push(colour[0], colour[1], colour[2])
    return index
  }

  triangle(a: number, b: number, c: number): void {
    this.indices.push(a, b, c)
  }

  /**
   * A tapered tube through a polyline: the workhorse for trunks, branches and frond
   * stems. Normals point out from the axis, so the tube shades as a cylinder rather than
   * as a faceted prism, even with six sides.
   */
  tube(points: readonly P[], radii: readonly number[], sides: number, colour: RGB): void {
    if (points.length < 2) return
    // A parallel-transported frame: each ring keeps its roll, so the tube never twists.
    let normal: P = [1, 0, 0]
    const rings: number[][] = []
    for (let i = 0; i < points.length; i++) {
      const previous = points[Math.max(0, i - 1)]
      const next = points[Math.min(points.length - 1, i + 1)]
      const tangent = normalise([
        next[0] - previous[0],
        next[1] - previous[1],
        next[2] - previous[2],
      ])
      normal = normalise(orthogonal(tangent, normal))
      const binormal: P = [
        tangent[1] * normal[2] - tangent[2] * normal[1],
        tangent[2] * normal[0] - tangent[0] * normal[2],
        tangent[0] * normal[1] - tangent[1] * normal[0],
      ]
      const ring: number[] = []
      for (let s = 0; s < sides; s++) {
        const angle = (s / sides) * Math.PI * 2
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        const radial: P = [
          normal[0] * cos + binormal[0] * sin,
          normal[1] * cos + binormal[1] * sin,
          normal[2] * cos + binormal[2] * sin,
        ]
        const r = radii[Math.min(radii.length - 1, i)]
        ring.push(
          this.vertex(
            [
              points[i][0] + radial[0] * r,
              points[i][1] + radial[1] * r,
              points[i][2] + radial[2] * r,
            ],
            radial,
            colour,
          ),
        )
      }
      rings.push(ring)
    }
    for (let i = 0; i < rings.length - 1; i++) {
      for (let s = 0; s < sides; s++) {
        const next = (s + 1) % sides
        this.triangle(rings[i][s], rings[i][next], rings[i + 1][next])
        this.triangle(rings[i][s], rings[i + 1][next], rings[i + 1][s])
      }
    }
    // A cap on the far end: the tip of a frond, or the top of a cut trunk.
    const last = rings[rings.length - 1]
    const tip = points[points.length - 1]
    const n = normalise([
      tip[0] - points[points.length - 2][0],
      tip[1] - points[points.length - 2][1] + 0.001,
      tip[2] - points[points.length - 2][2],
    ])
    const centre = this.vertex(tip, n, colour)
    for (let s = 0; s < sides; s++) this.triangle(last[s], last[(s + 1) % sides], centre)
  }

  /**
   * A lumpy blob of leaves: an icosahedron stretched to the given radii, its corners
   * pushed in and out by a seeded jitter, and coloured a little darker underneath and
   * lighter on top. Overlapping a handful of these is what makes a canopy read as
   * foliage rather than as a ball.
   */
  blob(centre: P, radii: P, seed: number, colour: RGB, jitter = 0.32): void {
    const base: number[] = []
    for (let v = 0; v < ICO_VERTICES.length; v++) {
      const unit = normalise(ICO_VERTICES[v])
      const wobble = 1 + (hash01(seed, v + 3) - 0.5) * jitter
      const p: P = [
        centre[0] + unit[0] * radii[0] * wobble,
        centre[1] + unit[1] * radii[1] * wobble,
        centre[2] + unit[2] * radii[2] * wobble,
      ]
      // Lighter where the sun reaches the top of the blob, darker underneath.
      const lift = 0.9 + Math.max(0, unit[1]) * 0.22
      const shade = tint(mix(colour, SUNLIT, Math.max(0, unit[1]) * 0.22), lift)
      base.push(this.vertex(p, unit, shade))
    }
    for (const [a, b, c] of ICO_FACES) this.triangle(base[a], base[b], base[c])
  }

  /** A flat ribbon that arches out and droops: one palm frond. */
  frond(origin: P, yaw: number, length: number, width: number, colour: RGB): void {
    const steps = 4
    const dir: P = [Math.cos(yaw), 0, Math.sin(yaw)]
    const side: P = [-Math.sin(yaw), 0, Math.cos(yaw)]
    const lefts: P[] = []
    const rights: P[] = []
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      // Out and up first, then the tip falls away: a palm frond's arc.
      const reach = length * t
      const lift = Math.sin(t * Math.PI * 0.7) * length * 0.34
      const droop = Math.max(0, t - 0.55) ** 2 * length * 1.15
      const p: P = [
        origin[0] + dir[0] * reach,
        origin[1] + lift - droop,
        origin[2] + dir[2] * reach,
      ]
      const w = width * (1 - t) ** 0.7
      lefts.push([p[0] + side[0] * w, p[1], p[2] + side[2] * w])
      rights.push([p[0] - side[0] * w, p[1], p[2] - side[2] * w])
    }
    // Two-sided: the strip is drawn from above and below, so a frond is never invisible
    // from underneath.
    for (let i = 0; i < steps; i++) {
      const shade = 0.88 + (i / steps) * 0.3
      const c = tint(colour, shade)
      const up: P = [0, 1, 0]
      const a = this.vertex(lefts[i], up, c)
      const b = this.vertex(rights[i], up, c)
      const d = this.vertex(lefts[i + 1], up, c)
      const e = this.vertex(rights[i + 1], up, c)
      this.triangle(a, d, b)
      this.triangle(b, d, e)
      this.triangle(a, b, d)
      this.triangle(b, e, d)
    }
  }

  build(): TreeMesh {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      colors: new Float32Array(this.colors),
      indices: new Uint32Array(this.indices),
    }
  }
}

/** The twenty faces and twelve corners of an icosahedron, for the foliage blobs. */
const ICO_VERTICES: readonly P[] = [
  [-1, 1.618, 0],
  [1, 1.618, 0],
  [-1, -1.618, 0],
  [1, -1.618, 0],
  [0, -1, 1.618],
  [0, 1, 1.618],
  [0, -1, -1.618],
  [0, 1, -1.618],
  [1.618, 0, -1],
  [1.618, 0, 1],
  [-1.618, 0, -1],
  [-1.618, 0, 1],
]
const ICO_FACES: readonly [number, number, number][] = [
  [0, 11, 5],
  [0, 5, 1],
  [0, 1, 7],
  [0, 7, 10],
  [0, 10, 11],
  [1, 5, 9],
  [5, 11, 4],
  [11, 10, 2],
  [10, 7, 6],
  [7, 1, 8],
  [3, 9, 4],
  [3, 4, 2],
  [3, 2, 6],
  [3, 6, 8],
  [3, 8, 9],
  [4, 9, 5],
  [2, 4, 11],
  [6, 2, 10],
  [8, 6, 7],
  [9, 8, 1],
]

function normalise(v: P): P {
  const length = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / length, v[1] / length, v[2] / length]
}

/** A unit vector at right angles to `axis`, as close to `hint` as it can be. */
function orthogonal(axis: P, hint: P): P {
  const dot = hint[0] * axis[0] + hint[1] * axis[1] + hint[2] * axis[2]
  const flattened: P = [hint[0] - axis[0] * dot, hint[1] - axis[1] * dot, hint[2] - axis[2] * dot]
  if (Math.hypot(flattened[0], flattened[1], flattened[2]) < 1e-3) {
    // The hint was parallel to the axis: any perpendicular will do.
    const alt: P = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
    return orthogonalAlt(axis, alt)
  }
  return normalise(flattened)
}

function orthogonalAlt(axis: P, alt: P): P {
  const dot = alt[0] * axis[0] + alt[1] * axis[1] + alt[2] * axis[2]
  return normalise([alt[0] - axis[0] * dot, alt[1] - axis[1] * dot, alt[2] - axis[2] * dot])
}

/**
 * Build the triangles for a run of trees.
 *
 * @param trees  the packed array from `scatterTrees`
 * @param first  index of the first tree to build (not a float offset)
 * @param last   index one past the last tree to build
 */
export function buildTreeMesh(
  trees: Float32Array,
  first = 0,
  last = trees.length / TREE_STRIDE,
): TreeMeshes {
  const builder = new MeshBuilder()
  for (let i = Math.max(0, first); i < Math.min(last, trees.length / TREE_STRIDE); i++) {
    const o = i * TREE_STRIDE
    const x = trees[o]
    const z = trees[o + 1]
    const height = trees[o + 2]
    const radius = trees[o + 3]
    const leaf: RGB = [trees[o + 4], trees[o + 5], trees[o + 6]]
    const style = trees[o + 8] as TreeStyle
    const seed = trees[o + 9]

    if (style === TREE_STYLE.palm) {
      palm(builder, x, z, height, radius, seed, leaf)
    } else if (style === TREE_STYLE.columnar) {
      columnar(builder, x, z, height, radius, seed, leaf)
    } else if (style === TREE_STYLE.acacia) {
      acacia(builder, x, z, height, radius, seed, leaf)
    } else {
      round(builder, x, z, height, radius, seed, leaf)
    }
  }
  return builder.build()
}

/** A broad tree: a leaning trunk, a few forks, and a dome of overlapping leaf blobs. */
function round(
  b: MeshBuilder,
  x: number,
  z: number,
  height: number,
  radius: number,
  seed: number,
  leaf: RGB,
): void {
  const trunk = trunkRadius(height)
  const lean = (hash01(seed, 41) - 0.5) * 0.5
  const direction = hash01(seed, 42) * Math.PI * 2
  const forkHeight = height * (0.36 + hash01(seed, 43) * 0.12)
  const top: P = [
    x + Math.cos(direction) * lean * forkHeight,
    forkHeight,
    z + Math.sin(direction) * lean * forkHeight,
  ]
  b.tube(
    [
      [x, -0.4, z],
      [
        x + Math.cos(direction) * lean * forkHeight * 0.4,
        forkHeight * 0.5,
        z + Math.sin(direction) * lean * forkHeight * 0.4,
      ],
      top,
    ],
    [trunk, trunk * 0.78, trunk * 0.62],
    6,
    tint(BARK, 0.9 + hash01(seed, 44) * 0.25),
  )

  const forks = 3 + Math.floor(hash01(seed, 45) * 2)
  for (let i = 0; i < forks; i++) {
    const angle = direction + (i / forks) * Math.PI * 2 + hash01(seed, 46 + i) * 0.6
    const reach = radius * (0.42 + hash01(seed, 50 + i) * 0.3)
    b.tube(
      [
        top,
        [
          top[0] + Math.cos(angle) * reach * 0.55,
          forkHeight + height * 0.14,
          top[2] + Math.sin(angle) * reach * 0.55,
        ],
      ],
      [trunk * 0.5, trunk * 0.28],
      5,
      tint(BARK, 0.85 + hash01(seed, 54 + i) * 0.2),
    )
  }

  const blobs = 8 + Math.floor(hash01(seed, 60) * 3)
  const canopyY = height - radius * 0.42
  for (let i = 0; i < blobs; i++) {
    const angle = hash01(seed, 70 + i) * Math.PI * 2
    const reach = hash01(seed, 80 + i) * radius * 0.62
    const rise = (hash01(seed, 90 + i) - 0.35) * radius * 0.75
    // Wider than tall. The first version used 0.45/0.36/0.45 radii, which is nearly a sphere
    // and is why every broadleaf tree in the city read as a green ball on a stick.
    b.blob(
      [x + Math.cos(angle) * reach, canopyY + rise, z + Math.sin(angle) * reach],
      [
        radius * (0.56 + hash01(seed, 100 + i) * 0.26),
        radius * (0.26 + hash01(seed, 110 + i) * 0.14),
        radius * (0.56 + hash01(seed, 120 + i) * 0.26),
      ],
      seed + i * 37,
      tint(leaf, 0.86 + hash01(seed, 130 + i) * 0.28),
    )
  }
}

/** An acacia: a low fork into two or three long limbs, and a flat umbrella on top. */
function acacia(
  b: MeshBuilder,
  x: number,
  z: number,
  height: number,
  radius: number,
  seed: number,
  leaf: RGB,
): void {
  const trunk = trunkRadius(height)
  const direction = hash01(seed, 41) * Math.PI * 2
  const forkHeight = height * (0.26 + hash01(seed, 42) * 0.12)
  const fork: P = [x, forkHeight, z]
  b.tube(
    [
      [x, -0.4, z],
      [x + Math.cos(direction) * 0.18, forkHeight * 0.55, z + Math.sin(direction) * 0.18],
      fork,
    ],
    [trunk * 1.15, trunk, trunk * 0.85],
    7,
    tint(BARK, 0.9 + hash01(seed, 43) * 0.2),
  )

  const limbs = 2 + Math.floor(hash01(seed, 44) * 2)
  for (let i = 0; i < limbs; i++) {
    const angle = direction + (i / limbs) * Math.PI * 2 + hash01(seed, 45 + i) * 0.5
    const reach = radius * (0.6 + hash01(seed, 48 + i) * 0.35)
    const rise = height - forkHeight
    b.tube(
      [
        fork,
        [
          fork[0] + Math.cos(angle) * reach * 0.6,
          forkHeight + rise * 0.62,
          fork[2] + Math.sin(angle) * reach * 0.6,
        ],
        [
          fork[0] + Math.cos(angle) * reach,
          forkHeight + rise * 0.95,
          fork[2] + Math.sin(angle) * reach,
        ],
      ],
      [trunk * 0.7, trunk * 0.42, trunk * 0.2],
      5,
      tint(BARK, 0.85 + hash01(seed, 52 + i) * 0.2),
    )
  }

  // The umbrella: a wide, flat disc of blobs at the very top.
  const blobs = 7 + Math.floor(hash01(seed, 60) * 3)
  for (let i = 0; i < blobs; i++) {
    const angle = hash01(seed, 70 + i) * Math.PI * 2
    const reach = radius * (0.25 + hash01(seed, 80 + i) * 0.75)
    b.blob(
      [
        x + Math.cos(angle) * reach,
        height - radius * 0.1 + hash01(seed, 90 + i) * radius * 0.16,
        z + Math.sin(angle) * reach,
      ],
      [radius * 0.5, radius * 0.16, radius * 0.5],
      seed + i * 53,
      tint(leaf, 0.82 + hash01(seed, 100 + i) * 0.3),
      0.4,
    )
  }
}

/** A cypress: a narrow spire of blobs on a short trunk. */
function columnar(
  b: MeshBuilder,
  x: number,
  z: number,
  height: number,
  radius: number,
  seed: number,
  leaf: RGB,
): void {
  const trunk = trunkRadius(height)
  b.tube(
    [
      [x, -0.4, z],
      [x, height * 0.25, z],
    ],
    [trunk, trunk * 0.8],
    6,
    tint(BARK, 0.9 + hash01(seed, 41) * 0.2),
  )
  const slices = 7
  for (let i = 0; i < slices; i++) {
    const t = i / (slices - 1)
    // Fat at the bottom, pointed at the top, and never perfectly round.
    const spread = radius * (1 - t * 0.85) * (0.85 + hash01(seed, 50 + i) * 0.3)
    b.blob(
      [x, height * (0.22 + t * 0.78), z],
      [spread, radius * 0.5, spread],
      seed + i * 71,
      tint(leaf, 0.8 + hash01(seed, 60 + i) * 0.3),
      0.28,
    )
  }
}

/** A palm: a ringed trunk that leans, and a crown of fronds falling away from it. */
function palm(
  b: MeshBuilder,
  x: number,
  z: number,
  height: number,
  radius: number,
  seed: number,
  leaf: RGB,
): void {
  const trunk = trunkRadius(height) * 0.85
  const direction = hash01(seed, 41) * Math.PI * 2
  const lean = 0.1 + hash01(seed, 42) * 0.14
  const points: P[] = []
  const radii: number[] = []
  for (let i = 0; i <= 4; i++) {
    const t = i / 4
    points.push([
      x + Math.cos(direction) * height * lean * t * t,
      height * t,
      z + Math.sin(direction) * height * lean * t * t,
    ])
    radii.push(trunk * (1.15 - t * 0.35))
  }
  b.tube(points, radii, 6, PALM_BARK)

  const crown = points[points.length - 1]
  // The crown's own stub, in leaf colour, so the fronds have somewhere to spring from.
  b.blob(
    [crown[0], crown[1] + 0.16, crown[2]],
    [trunk * 0.9, trunk * 0.7, trunk * 0.9],
    seed + 5,
    leaf,
  )
  const fronds = 7 + Math.floor(hash01(seed, 43) * 3)
  for (let i = 0; i < fronds; i++) {
    const angle = (i / fronds) * Math.PI * 2 + hash01(seed, 44 + i) * 0.4
    b.frond(
      crown,
      angle,
      radius * (1.5 + hash01(seed, 50 + i) * 0.7),
      radius * 0.16,
      tint(leaf, 0.8 + hash01(seed, 60 + i) * 0.35),
    )
  }
  // A few dead fronds hanging under the crown, which is what a real palm looks like.
  for (let i = 0; i < 3; i++) {
    b.frond(
      crown,
      hash01(seed, 70 + i) * Math.PI * 2,
      radius * 0.7,
      radius * 0.09,
      [0.11, 0.1, 0.06],
    )
  }
}
