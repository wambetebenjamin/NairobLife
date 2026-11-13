/**
 * Footprints in, triangles out: turns the buildings of a zone into one merged mesh.
 *
 * Runs in the zone worker (and in tests), so no three.js here: plain typed arrays that
 * the main thread wraps in a BufferGeometry without copying.
 *
 * Besides position/normal/colour each vertex carries what the facade shader needs to
 * draw windows without textures (see materials/buildingMaterial.ts):
 *
 *   uv      x = window bays along the wall, y = floors up the wall (whole numbers at the
 *           wall ends, so windows are never cut in half at a corner)
 *   facade  x = per-building random seed, y = facade style, z = 1 for ground-floor shops
 *
 * TODO(lod): emit a second, cheaper mesh per chunk (no shaped roofs, merged walls) for
 * distant zones once more than one zone is loaded at a time.
 */
import earcut from 'earcut'
import { ringCentroid } from '../../core/geom2d'
import { hash01 } from '../../core/random'
import type { ZoneBuilding } from '../zone/format'
import { landmarkFor } from './landmarks'
import {
  ROOFS_FLAT,
  ROOFS_MABATI,
  WALLS_CONCRETE,
  WALLS_GLASS,
  WALLS_MASONRY,
  WALLS_STONE,
  hexToLinear,
  pick,
  scale,
  type RGB,
} from './palette'

/**
 * How a wall is glazed. The numbers travel to the shader (materials/buildingMaterial.ts)
 * and, for landmarks, are written into the zone file, so they must not be renumbered.
 */
export const FACADE = { blank: 0, punched: 1, ribbon: 2, curtain: 3, piers: 4 } as const

/** Storey height the window grid aims for, in metres. */
const FLOOR_HEIGHT = 3.4
/** Width of one window bay, in metres. */
const BAY_WIDTH = 3.2
/** Walls shorter than this stay blank. */
const MIN_WINDOW_WALL = 1.8

export interface BuildingMesh {
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  uvs: Float32Array
  facades: Float32Array
  indices: Uint32Array
}

const BLANK_TYPES = new Set([
  'roof',
  'carport',
  'shed',
  'garage',
  'garages',
  'hut',
  'kiosk',
  'toilets',
  'service',
  'guardhouse',
  'hangar',
  'warehouse',
  'industrial',
  'grandstand',
  'stadium',
  'ruins',
  'construction',
])
const CIVIC_TYPES = new Set([
  'government',
  'government_office',
  'public',
  'civic',
  'university',
  'college',
  'school',
  'church',
  'cathedral',
  'chapel',
  'mosque',
  'temple',
  'train_station',
  'hospital',
])
const NO_SHOP_TYPES = new Set([
  ...CIVIC_TYPES,
  ...BLANK_TYPES,
  'house',
  'detached',
  'dormitory',
  'parking',
])
/**
 * Most CBD buildings are mapped as plain building=yes, so the name is often the only
 * clue that one is a court or a ministry rather than a block of shops and offices.
 */
const CIVIC_NAME =
  /\b(court|courts|judiciary|parliament|bunge|senate|city hall|county|ministry|treasury|police|state house|archives|museum|library|cathedral|basilica|church|mosque|temple|synagogue|school|university|college|hospital|railway|station|convention|conference|amphitheat(er|re)|mausoleum|monument|memorial)\b/i

interface Style {
  wall: RGB
  roof: RGB
  seed: number
  facade: number
  shop: number
}

/** Everything about a building's look is a pure function of its OSM id, so it never changes between loads. */
export function styleFor(b: ZoneBuilding): Style {
  const id = b.id
  const type = b.t ?? ''
  const height = b.h - (b.b ?? 0)
  const r = hash01(id, 11)
  const civic = CIVIC_TYPES.has(type) || (b.n !== undefined && CIVIC_NAME.test(b.n))

  let facade: number
  if (BLANK_TYPES.has(type) || height < 2.6) facade = FACADE.blank
  else if (b.c)
    facade = r < 0.5 ? FACADE.ribbon : FACADE.punched // a mapped wall colour means masonry, not glass
  // Downtown's towers are mostly concrete: bands of windows, or glass in strips between
  // piers (Times Tower). Glass curtain walls are the newer minority.
  else if (b.h >= 45)
    facade =
      r < 0.3 ? FACADE.curtain : r < 0.58 ? FACADE.ribbon : r < 0.86 ? FACADE.piers : FACADE.punched
  else if (b.h >= 18) facade = r < 0.18 ? FACADE.curtain : r < 0.55 ? FACADE.ribbon : FACADE.punched
  else facade = r < 0.1 ? FACADE.ribbon : FACADE.punched
  if (civic && facade === FACADE.curtain) facade = FACADE.punched
  // A landmark the pipeline has styled by hand.
  if (b.f !== undefined) facade = b.f

  let wall: RGB
  if (b.c) wall = hexToLinear(b.c)
  else if (facade === FACADE.curtain) wall = pick(WALLS_GLASS, id, 3)
  else if (civic && hash01(id, 4) < 0.6) wall = pick(WALLS_STONE, id, 3)
  else if (b.h >= 30) wall = pick(WALLS_CONCRETE, id, 3)
  else wall = pick(WALLS_MASONRY, id, 3)
  wall = scale(wall, 0.9 + 0.2 * hash01(id, 5))

  let roof: RGB
  if (b.rc) roof = hexToLinear(b.rc)
  else if (b.h < 9.5 && facade !== FACADE.curtain && hash01(id, 6) < 0.75)
    roof = pick(ROOFS_MABATI, id, 8)
  else roof = pick(ROOFS_FLAT, id, 8)
  roof = scale(roof, 0.9 + 0.2 * hash01(id, 9))

  // A row of shops at street level: the everyday fabric of the CBD. Not for courts and
  // ministries, not for the tallest towers (lobbies, not kiosks), and not for buildings
  // somebody took the trouble to map in colour, which are landmarks.
  const shop =
    facade !== FACADE.blank &&
    !b.b &&
    !b.c &&
    b.f === undefined &&
    !civic &&
    height >= 6 &&
    b.h < 70 &&
    !NO_SHOP_TYPES.has(type) &&
    hash01(id, 10) < 0.78
      ? 1
      : 0

  return { wall, roof, seed: hash01(id, 7), facade, shop }
}

/** Growable vertex/index buffers. Plain arrays are fast enough for a few hundred thousand vertices. */
class Writer {
  pos: number[] = []
  nor: number[] = []
  col: number[] = []
  uv: number[] = []
  fac: number[] = []
  idx: number[] = []
  count = 0

  // Style of the building being written.
  seed = 0
  shop = 0

  vertex(
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    c: RGB,
    u: number,
    v: number,
    facade: number,
  ): number {
    this.pos.push(x, y, z)
    this.nor.push(nx, ny, nz)
    this.col.push(c[0], c[1], c[2])
    this.uv.push(u, v)
    this.fac.push(this.seed, facade, facade === FACADE.blank ? 0 : this.shop)
    return this.count++
  }

  /** A flat-shaded triangle, wound so that it faces the same way as (hx, hy, hz). */
  facet(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
    hx: number,
    hy: number,
    hz: number,
    c: RGB,
  ): void {
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay)
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az)
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    const len = Math.hypot(nx, ny, nz)
    if (len < 1e-9) return
    nx /= len
    ny /= len
    nz /= len
    const flip = nx * hx + ny * hy + nz * hz < 0
    if (flip) {
      nx = -nx
      ny = -ny
      nz = -nz
    }
    const i0 = this.vertex(ax, ay, az, nx, ny, nz, c, 0, 0, FACADE.blank)
    const i1 = this.vertex(bx, by, bz, nx, ny, nz, c, 0, 0, FACADE.blank)
    const i2 = this.vertex(cx, cy, cz, nx, ny, nz, c, 0, 0, FACADE.blank)
    if (flip) this.idx.push(i0, i2, i1)
    else this.idx.push(i0, i1, i2)
  }

  finish(): BuildingMesh {
    return {
      positions: new Float32Array(this.pos),
      normals: new Float32Array(this.nor),
      colors: new Float32Array(this.col),
      uvs: new Float32Array(this.uv),
      facades: new Float32Array(this.fac),
      indices: new Uint32Array(this.idx),
    }
  }
}

/** A ring made wider or narrower about a point: what the top of a leaning wall follows. */
function scaleRing(ring: number[], cx: number, cz: number, k: number): number[] {
  if (k === 1) return ring
  const out = new Array<number>(ring.length)
  for (let i = 0; i < ring.length; i += 2) {
    out[i] = cx + (ring[i] - cx) * k
    out[i + 1] = cz + (ring[i + 1] - cz) * k
  }
  return out
}

/**
 * Merge a hand-built landmark into the chunk, moved to its plot. The landmark's own mesh
 * is in local metres around (0, 0); this translates it and copies the arrays in.
 */
function appendMesh(
  w: Writer,
  mesh: {
    positions: Float32Array
    normals: Float32Array
    colors: Float32Array
    uvs: Float32Array
    facades: Float32Array
    indices: Uint32Array
  },
  x: number,
  z: number,
): void {
  const start = w.pos.length / 3
  for (let i = 0; i < mesh.positions.length; i += 3) {
    w.pos.push(mesh.positions[i] + x, mesh.positions[i + 1], mesh.positions[i + 2] + z)
    w.nor.push(mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2])
    w.col.push(mesh.colors[i], mesh.colors[i + 1], mesh.colors[i + 2])
    w.uv.push(mesh.uvs[(i / 3) * 2], mesh.uvs[(i / 3) * 2 + 1])
    w.fac.push(mesh.facades[i], mesh.facades[i + 1], mesh.facades[i + 2])
  }
  for (const index of mesh.indices) w.idx.push(index + start)
  w.count += mesh.positions.length / 3
}

/**
 * Walls around one ring, from `base` up to `top`. `topRing` is the same ring where the
 * walls end: the ring itself for straight walls, a scaled copy for walls that lean.
 * Rings with positive signed area (outer rings) get outward normals; holes are wound the
 * other way in the zone format, so their walls face into the courtyard.
 */
function addWalls(
  w: Writer,
  ring: number[],
  topRing: number[],
  base: number,
  top: number,
  colour: RGB,
  facade: number,
  salt: number,
): void {
  const n = ring.length / 2
  const rise = top - base
  const floors = Math.max(1, Math.round(rise / FLOOR_HEIGHT))
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const ax = ring[i * 2]
    const az = ring[i * 2 + 1]
    const bx = ring[j * 2]
    const bz = ring[j * 2 + 1]
    const dx = bx - ax
    const dz = bz - az
    const len = Math.hypot(dx, dz)
    if (len < 1e-4) continue
    let nx = dz / len
    let ny = 0
    let nz = -dx / len
    if (topRing !== ring) {
      // How far the top of this wall has moved outwards tilts the normal down or up.
      const lean = (topRing[i * 2] - ax) * nx + (topRing[i * 2 + 1] - az) * nz
      const k = 1 / Math.hypot(rise, lean)
      nx *= rise * k
      nz *= rise * k
      ny = -lean * k
    }
    const bays = len < MIN_WINDOW_WALL ? 0 : Math.max(1, Math.round(len / BAY_WIDTH))
    const style = bays === 0 ? FACADE.blank : facade
    // Start every wall on its own run of bay numbers so walls do not repeat each other.
    const u0 = ((salt + i) % 32) * 32
    const u1 = u0 + bays
    const v0 = w.vertex(ax, base, az, nx, ny, nz, colour, u0, 0, style)
    const v1 = w.vertex(bx, base, bz, nx, ny, nz, colour, u1, 0, style)
    const v2 = w.vertex(
      topRing[j * 2],
      top,
      topRing[j * 2 + 1],
      nx,
      ny,
      nz,
      colour,
      u1,
      floors,
      style,
    )
    const v3 = w.vertex(
      topRing[i * 2],
      top,
      topRing[i * 2 + 1],
      nx,
      ny,
      nz,
      colour,
      u0,
      floors,
      style,
    )
    w.idx.push(v1, v0, v3, v1, v3, v2)
  }
}

/** A flat cap (roof, or the underside of a floating part) over a polygon with holes. */
function addCap(
  w: Writer,
  outer: number[],
  holes: number[][],
  y: number,
  up: boolean,
  colour: RGB,
): void {
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
  const first = w.count
  const ny = up ? 1 : -1
  for (let i = 0; i < data.length; i += 2)
    w.vertex(data[i], y, data[i + 1], 0, ny, 0, colour, 0, 0, FACADE.blank)
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t]
    const b = triangles[t + 1]
    const c = triangles[t + 2]
    // In (x, z) a triangle faces up when its 2D cross product is negative.
    const cross =
      (data[b * 2] - data[a * 2]) * (data[c * 2 + 1] - data[a * 2 + 1]) -
      (data[b * 2 + 1] - data[a * 2 + 1]) * (data[c * 2] - data[a * 2])
    if (cross < 0 === up) w.idx.push(first + a, first + b, first + c)
    else w.idx.push(first + a, first + c, first + b)
  }
}

/** Cone or dome over the outer ring, rising from wallTop to top around the centroid. */
function addShapedRoof(
  w: Writer,
  ring: number[],
  wallTop: number,
  top: number,
  shape: 'cone' | 'dome',
  colour: RGB,
): void {
  const n = ring.length / 2
  const [cx, cz] = ringCentroid(ring)
  const bands = shape === 'dome' ? 5 : 1
  const ribbed = scale(colour, 0.8)
  for (let k = 0; k < bands; k++) {
    const t0 = (k / bands) * (Math.PI / 2)
    const t1 = ((k + 1) / bands) * (Math.PI / 2)
    // A cone is a single straight band; a dome follows a quarter circle.
    const s0 = shape === 'dome' ? Math.cos(t0) : 1
    const s1 = shape === 'dome' ? Math.cos(t1) : 0
    const y0 = wallTop + (top - wallTop) * (shape === 'dome' ? Math.sin(t0) : 0)
    const y1 = wallTop + (top - wallTop) * (shape === 'dome' ? Math.sin(t1) : 1)
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const ax = cx + (ring[i * 2] - cx) * s0
      const az = cz + (ring[i * 2 + 1] - cz) * s0
      const bx = cx + (ring[j * 2] - cx) * s0
      const bz = cz + (ring[j * 2 + 1] - cz) * s0
      const ex = cx + (ring[j * 2] - cx) * s1
      const ez = cz + (ring[j * 2 + 1] - cz) * s1
      const fx = cx + (ring[i * 2] - cx) * s1
      const fz = cz + (ring[i * 2 + 1] - cz) * s1
      // Faces point away from the axis and upwards.
      const hx = (ax + bx) / 2 - cx
      const hz = (az + bz) / 2 - cz
      // Every other panel of a cone is a shade darker, which reads as the ribs of a
      // folded roof (the KICC amphitheatre) instead of a smooth party hat.
      const panel = shape === 'cone' && i % 2 === 1 ? ribbed : colour
      w.facet(ax, y0, az, bx, y0, bz, ex, y1, ez, hx, 1, hz, panel)
      if (s1 > 1e-6) w.facet(ax, y0, az, ex, y1, ez, fx, y1, fz, hx, 1, hz, panel)
    }
  }
}

/**
 * Build one mesh from a set of buildings. Coordinates in the zone file are integers in
 * 1/q metres; the mesh is in metres, in world space.
 */
export function buildBuildingMesh(buildings: readonly ZoneBuilding[], q: number): BuildingMesh {
  const w = new Writer()
  const toMetres = (ring: number[]) => ring.map((value) => value / q)

  for (const b of buildings) {
    const outer = toMetres(b.p)
    const holes = (b.hs ?? []).map(toMetres)
    const base = b.b ?? 0

    // A landmark is built by hand instead of extruded, but only if it stands on the
    // ground: a model floating on a mapped podium would need its own base.
    const landmark = base < 0.5 ? landmarkFor(b.n) : undefined
    if (landmark) {
      const [cx, cz] = ringCentroid(outer)
      let radius = 0
      for (let i = 0; i < outer.length; i += 2) {
        radius = Math.max(radius, Math.hypot(outer[i] - cx, outer[i + 1] - cz))
      }
      appendMesh(w, landmark.build({ x: cx, z: cz, radius, height: b.h }), cx, cz)
      continue
    }
    const style = styleFor(b)
    w.seed = style.seed
    w.shop = style.shop

    const shaped = b.rs && holes.length === 0 ? b.rs : undefined
    const wallTop = shaped ? Math.max(base + 0.5, b.h - (b.rh ?? 0)) : b.h

    // Leaning walls end on a wider or narrower copy of the footprint.
    const lean = b.tp ?? 1
    const [cx, cz] = lean === 1 ? [0, 0] : ringCentroid(outer)
    const outerTop = scaleRing(outer, cx, cz, lean)
    const holesTop = holes.map((hole) => scaleRing(hole, cx, cz, lean))

    addWalls(w, outer, outerTop, base, wallTop, style.wall, style.facade, b.id & 31)
    holes.forEach((hole, i) =>
      addWalls(
        w,
        hole,
        holesTop[i],
        base,
        wallTop,
        style.wall,
        style.facade,
        (b.id + 7 * (i + 1)) & 31,
      ),
    )

    if (shaped) addShapedRoof(w, outerTop, wallTop, b.h, shaped, style.roof)
    else addCap(w, outerTop, holesTop, b.h, true, style.roof)

    // Parts that float above the ground (a tower's crown, a skybridge) need an underside.
    if (base > 0.5) addCap(w, outer, holes, base, false, scale(style.wall, 0.7))
  }
  return w.finish()
}
