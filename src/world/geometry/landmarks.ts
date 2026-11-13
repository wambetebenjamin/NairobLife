/**
 * The buildings you would recognise from the shape alone.
 *
 * Everything else in this city is a mapped footprint extruded to its mapped height, which
 * is right for the everyday fabric: a hundred thousand buildings that nobody looks at
 * twice. It is wrong for the handful of buildings that *are* Nairobi, because their shape
 * is the point. KICC is not a box; it is a round tower standing in a flared skirt. The
 * Parliament clock tower is not a 10 m box.
 *
 * So each landmark here is built by hand — lathes, rings and stacks — and takes the place
 * of the footprint the map gave it. The footprint stays in the zone file, and its centre
 * and extent are used as the model's anchor, so the model stands where the building is;
 * but the triangles are ours.
 *
 * As with everything in `geometry/`, this runs in the worker and knows nothing about
 * three.js: plain typed arrays, wrapped by `toBufferGeometry`.
 */

/** Vertex data, in the same layout as the building mesh so the two can share a material. */
export interface LandmarkMesh {
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  uvs: Float32Array
  facades: Float32Array
  indices: Uint32Array
}

type RGB = readonly [number, number, number]
type P = readonly [number, number, number]

/** A growable mesh. Normals are averaged per vertex at the end, so lathes look smooth. */
class Lathe {
  private readonly positions: number[] = []
  private readonly normals: number[] = []
  private readonly colors: number[] = []
  private readonly uvs: number[] = []
  private readonly facades: number[] = []
  private readonly indices: number[] = []

  /** Add one vertex; returns its index. */
  vertex(p: P, colour: RGB, facade = 0, seed = 0, u = 0, v = 0): number {
    const index = this.positions.length / 3
    this.positions.push(p[0], p[1], p[2])
    this.normals.push(0, 0, 0)
    this.colors.push(colour[0], colour[1], colour[2])
    this.uvs.push(u, v)
    this.facades.push(seed, facade, 0)
    return index
  }

  triangle(a: number, b: number, c: number): void {
    this.indices.push(a, b, c)
  }

  /**
   * A surface of revolution: a profile of (radius, height) points, turned around the y
   * axis. This is what makes the tower round and the skirt flare, with one function.
   *
   * `facade` travels to the window shader, so the tower gets its floor-by-floor glazing
   * rather than a painted pattern.
   */
  lathe(
    cx: number,
    cz: number,
    profile: readonly (readonly [number, number])[],
    colour: RGB,
    options: { segments?: number; facade?: number; seed?: number; cap?: boolean } = {},
  ): void {
    const segments = options.segments ?? 24
    const facade = options.facade ?? 0
    const seed = options.seed ?? 0
    const rings: number[][] = []
    for (let i = 0; i < profile.length; i++) {
      const [radius, height] = profile[i]
      const ring: number[] = []
      for (let s = 0; s < segments; s++) {
        const angle = (s / segments) * Math.PI * 2
        // Bay numbers around the ring and floors up it, so the window shader has a grid.
        ring.push(
          this.vertex(
            [cx + Math.cos(angle) * radius, height, cz + Math.sin(angle) * radius],
            colour,
            facade,
            seed,
            (s / segments) * Math.round(radius * 2),
            height / 3.4,
          ),
        )
      }
      rings.push(ring)
    }
    // A profile that ends at radius 0 (a dome's crown) would give every triangle in its
    // last band zero area: two coincident rings. Close it with a fan instead.
    const apex = profile[profile.length - 1][0] < 1e-6
    const bands = apex ? rings.length - 2 : rings.length - 1
    for (let i = 0; i < bands; i++) {
      for (let s = 0; s < segments; s++) {
        const next = (s + 1) % segments
        const a = rings[i][s]
        const b = rings[i][next]
        const c = rings[i + 1][next]
        const d = rings[i + 1][s]
        // Wound outwards: the model is seen from outside, and the ring runs clockwise
        // when seen from above in a right-handed system, so the quad is flipped here.
        this.triangle(a, c, b)
        this.triangle(a, d, c)
      }
    }
    if (apex) {
      // The crown: one vertex, fanned to the ring below it.
      const last = profile[profile.length - 1]
      const tip = this.vertex([cx, last[1], cz], colour, facade, seed)
      const ring = rings[rings.length - 2]
      for (let s = 0; s < segments; s++) {
        this.triangle(tip, ring[(s + 1) % segments], ring[s])
      }
    } else if (options.cap) {
      const last = profile[profile.length - 1]
      const centre = this.vertex([cx, last[1], cz], colour, facade, seed)
      const ring = rings[rings.length - 1]
      for (let s = 0; s < segments; s++) {
        this.triangle(centre, ring[(s + 1) % segments], ring[s])
      }
    }
  }

  /** A flat disc: a roof, a plinth, the top of a low wall. */
  disc(cx: number, y: number, cz: number, radius: number, colour: RGB, segments = 24): void {
    const ring: number[] = []
    for (let s = 0; s < segments; s++) {
      const angle = (s / segments) * Math.PI * 2
      ring.push(
        this.vertex([cx + Math.cos(angle) * radius, y, cz + Math.sin(angle) * radius], colour, 0),
      )
    }
    const centre = this.vertex([cx, y, cz], colour, 0)
    for (let s = 0; s < segments; s++) this.triangle(centre, ring[(s + 1) % segments], ring[s])
  }

  /** A box, for the parts of a landmark that are square. */
  box(
    centre: P,
    size: readonly [number, number, number],
    colour: RGB,
    facade = 0,
    seed = 0,
    yaw = 0,
  ): void {
    const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2]
    const corners: P[] = [
      [-hx, -hy, -hz],
      [hx, -hy, -hz],
      [hx, hy, -hz],
      [-hx, hy, -hz],
      [-hx, -hy, hz],
      [hx, -hy, hz],
      [hx, hy, hz],
      [-hx, hy, hz],
    ]
    const cos = Math.cos(yaw)
    const sin = Math.sin(yaw)
    const placed = corners.map(
      ([x, y, z]) =>
        [centre[0] + x * cos + z * sin, centre[1] + y, centre[2] - x * sin + z * cos] as P,
    )
    const faces = [
      [4, 5, 6, 7],
      [1, 0, 3, 2],
      [5, 1, 2, 6],
      [0, 4, 7, 3],
      [7, 6, 2, 3],
      [0, 1, 5, 4],
    ]
    for (const face of faces) {
      const base = face.map((i) =>
        this.vertex(placed[i], colour, facade, seed, placed[i][0] / 3.2, placed[i][1] / 3.4),
      )
      this.triangle(base[0], base[1], base[2])
      this.triangle(base[0], base[2], base[3])
    }
  }

  finish(): LandmarkMesh {
    // Face normals, accumulated onto their vertices. Smooth lathes, hard boxes: a box's
    // corners get the same normal from each of its three faces and average to a diagonal,
    // so boxes are built with duplicated corners and come out flat anyway.
    const normals = this.normals
    for (let i = 0; i < this.indices.length; i += 3) {
      const a = this.indices[i] * 3
      const b = this.indices[i + 1] * 3
      const c = this.indices[i + 2] * 3
      const px = this.positions
      const ux = px[b] - px[a]
      const uy = px[b + 1] - px[a + 1]
      const uz = px[b + 2] - px[a + 2]
      const vx = px[c] - px[a]
      const vy = px[c + 1] - px[a + 1]
      const vz = px[c + 2] - px[a + 2]
      const nx = uy * vz - uz * vy
      const ny = uz * vx - ux * vz
      const nz = ux * vy - uy * vx
      for (const at of [a, b, c]) {
        normals[at] += nx
        normals[at + 1] += ny
        normals[at + 2] += nz
      }
    }
    for (let i = 0; i < normals.length; i += 3) {
      const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1
      normals[i] /= length
      normals[i + 1] /= length
      normals[i + 2] /= length
    }
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(normals),
      colors: new Float32Array(this.colors),
      uvs: new Float32Array(this.uvs),
      facades: new Float32Array(this.facades),
      indices: new Uint32Array(this.indices),
    }
  }
}

/** sRGB hex to linear RGB, matching how the rest of the city is coloured. */
export function hex(hexColour: string): RGB {
  const value = parseInt(hexColour.slice(1), 16)
  const channel = (shift: number) => {
    const c = ((value >> shift) & 255) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return [channel(16), channel(8), channel(0)]
}

/** What a landmark needs to know about where it stands. */
export interface Plot {
  x: number
  z: number
  /** Half the width of the mapped footprint, in metres. The model should fit inside it. */
  radius: number
  /** The mapped height, in metres. */
  height: number
}

/**
 * KICC: the Kenyatta International Convention Centre.
 *
 * The real thing is a 28-storey round tower of glass and concrete standing in a much wider
 * flared plinth, like a candle in a saucer, with a smaller drum and a spire on the roof.
 * Its silhouette is the whole reason it is a landmark, so the model is built as a lathe:
 * the skirt flares out to the full footprint, the tower rises from it, the crown steps in.
 *
 * The plinth is 105 m across on the map; the tower above it is about 45.
 */
export function kicc(plot: Plot): LandmarkMesh {
  const b = new Lathe()
  const RADIUS = Math.max(18, plot.radius)
  const TOWER = RADIUS * 0.42
  const concrete = hex('#b9b2a4')
  const glass = hex('#7d8f96')
  const stone = hex('#c9c1b0')
  const dark = hex('#4a4a48')

  // The flared skirt: the full footprint at the ground, narrowing to the tower's base.
  b.lathe(
    0,
    0,
    [
      [RADIUS, 0],
      [RADIUS * 0.99, 3],
      [RADIUS * 0.92, 9],
      [RADIUS * 0.74, 15],
      [RADIUS * 0.56, 20],
      [TOWER * 1.04, 24],
    ],
    stone,
    { segments: 40, facade: 2, seed: 0.31 },
  )

  // The tower: ribbed glass, 27 floors up to the crown.
  const towerTop = Math.min(plot.height * 0.82, 100)
  b.lathe(
    0,
    0,
    [
      [TOWER, 24],
      [TOWER * 1.02, towerTop * 0.5],
      [TOWER, towerTop],
    ],
    glass,
    { segments: 40, facade: 3, seed: 0.31 },
  )

  // The crown: a narrower drum above the tower, then a slim spire.
  b.lathe(
    0,
    0,
    [
      [TOWER, towerTop],
      [TOWER * 0.82, towerTop + 4],
      [TOWER * 0.8, towerTop + 7],
    ],
    concrete,
    { segments: 32, facade: 2, seed: 0.31 },
  )
  b.lathe(
    0,
    0,
    [
      [TOWER * 0.16, towerTop + 7],
      [TOWER * 0.07, towerTop + 22],
    ],
    dark,
    { segments: 12 },
  )
  // And a cap, so the spire is not hollow when seen from below.
  b.disc(0, towerTop + 7, 0, TOWER * 0.8, concrete, 32)

  return b.finish()
}

/**
 * The Parliament clock tower: a square stone tower with a clock stage near the top, a
 * parapet, and a shallow pyramid roof.
 *
 * The map gives it a 10 m footprint 40 m high, which is the footprint of the tower's base
 * rather than of a 40 m shaft: the real tower is a good deal shorter and wider than that,
 * and stands in the Parliament grounds. So the model is built to look right — a solid
 * shaft with the clock stage high up — rather than to fill 40 m of invented height. The
 * 40 m in the zone file still sets the case the model has to fit inside.
 */
export function clockTower(plot: Plot): LandmarkMesh {
  const b = new Lathe()
  // `radius` is the half-width of the footprint, and a square shaft's corners are
  // sqrt(2) further out than its faces: size the shaft from that, not from the radius.
  const W = Math.max(4, plot.radius * 0.7)
  // The model is a clock tower, not a 40 m shaft: the map's height is the envelope it must
  // fit inside, and the tower uses about four fifths of it.
  const H = plot.height * 0.8
  const stone = hex('#c2ab86')
  const trim = hex('#d8c8a8')
  const slate = hex('#5b5f5c')

  // Shaft, stepping in slightly at the clock stage.
  b.box([0, H * 0.42, 0], [W * 2, H * 0.84, W * 2], stone, 1, 0.2)
  b.box([0, H * 0.84 + 0.6, 0], [W * 2.12, 1.2, W * 2.12], trim, 0, 0.2)

  // The clock stage: four faces, each with a dark clock face inset.
  const stageBottom = H * 0.84 + 1.2
  const stageHeight = H * 0.1
  b.box([0, stageBottom + stageHeight / 2, 0], [W * 2, stageHeight, W * 2], trim, 1, 0.2)
  for (let side = 0; side < 4; side++) {
    const angle = (side / 4) * Math.PI * 2
    const dx = Math.sin(angle)
    const dz = Math.cos(angle)
    b.box(
      [dx * W * 0.995, stageBottom + stageHeight / 2, dz * W * 0.995],
      [W * 1.1, stageHeight * 0.62, W * 0.12],
      slate,
      0,
      0.2,
      angle,
    )
  }

  // Parapet, then the pyramid roof. Both stay inside the mapped footprint: a tower that
  // overhangs its plot grows through whatever is mapped next to it.
  const parapet = stageBottom + stageHeight
  const cap = Math.min(W * 1.12, plot.radius)
  b.box([0, parapet + 0.8, 0], [cap * 2, 1.6, cap * 2], trim, 0, 0.2)
  b.lathe(
    0,
    0,
    [
      [cap * 0.98, parapet + 1.6],
      [cap * 0.2, parapet + 1.6 + Math.min(6, H * 0.14)],
    ],
    slate,
    { segments: 4, facade: 0 },
  )
  b.disc(0, parapet + 1.6, 0, cap * 0.98, slate, 4)

  return b.finish()
}

/**
 * Jamia Mosque: the silver domes and the two minarets, which is what you see of it from
 * Banda Street. The mapped footprint is 106 m wide — the whole walled compound — so the
 * mosque itself takes the middle third of it, with the courtyards left to the ground.
 */
export function jamiaMosque(plot: Plot): LandmarkMesh {
  const b = new Lathe()
  const SIDE = Math.max(10, plot.radius * 0.62)
  const WALL = 8
  const white = hex('#ddd6c8')
  const dome = hex('#b8b9b4')
  const trim = hex('#9a8f79')

  // The prayer hall, square, with a low wall around the courtyard.
  b.box([0, WALL / 2, 0], [SIDE * 1.1, WALL, SIDE * 1.1], trim, 0, 0.4)
  b.box([0, WALL + SIDE * 0.28, 0], [SIDE * 1.16, SIDE * 0.56, SIDE * 1.16], white, 1, 0.4)

  // The main dome: a dome is a half-ellipse, so five points of a lathe is plenty.
  const roof = WALL + SIDE * 0.56
  const domeRadius = SIDE * 0.42
  const rings: [number, number][] = []
  for (let i = 0; i <= 8; i++) {
    const angle = (i / 8) * (Math.PI / 2)
    rings.push([Math.cos(angle) * domeRadius, roof + Math.sin(angle) * domeRadius * 0.86])
  }
  b.lathe(0, 0, rings, dome, { segments: 28, cap: false })
  // The finial on the dome's crown. Slim, but not so slim that its tip collapses to a
  // line of degenerate triangles.
  b.lathe(
    0,
    0,
    [
      [0.7, roof + domeRadius * 0.86],
      [0.45, roof + domeRadius * 0.86 + 2],
      [0.14, roof + domeRadius * 0.86 + 4.5],
    ],
    dome,
    { segments: 8 },
  )

  // Two minarets at the front corners, each a slim shaft with its own small dome.
  for (const side of [-1, 1]) {
    const x = side * SIDE * 0.52
    const z = SIDE * 0.52
    const shaft = WALL + SIDE * 0.9
    b.lathe(
      x,
      z,
      [
        [1.5, 0],
        [1.2, shaft * 0.5],
        [1.0, shaft],
      ],
      white,
      { segments: 12, facade: 1, seed: 0.4 },
    )
    b.lathe(
      x,
      z,
      [
        [1.0, shaft],
        [1.5, shaft + 1.6],
        [0.7, shaft + 3.4],
      ],
      dome,
      { segments: 12 },
    )
    // Close the dome with a cap, and give it a small finial so the top is not a lid.
    b.lathe(
      x,
      z,
      [
        [0.7, shaft + 3.4],
        [0.16, shaft + 4.4],
      ],
      dome,
      { segments: 12 },
    )
  }

  return b.finish()
}

/** A landmark's model, by the name the zone file gives the building. */
export type LandmarkKind = 'kicc' | 'clockTower' | 'jamiaMosque'

/** How a landmark is recognised in a zone file, and how big it really is. */
interface LandmarkDef {
  kind: LandmarkKind
  /** The building's mapped name, matched case-insensitively against this pattern. */
  match: RegExp
  /** The model's height as a fraction of the mapped one, when the map's height is wrong. */
  heightScale?: number
  build: (plot: Plot) => LandmarkMesh
}

/**
 * The register. Names are matched against the mapped building's name, which is how the
 * data already identifies these sites; nothing here depends on a footprint's shape, which
 * varies with how carefully somebody mapped it.
 */
export const LANDMARKS: readonly LandmarkDef[] = [
  // The map has the KICC tower, and also a separate low building and an amphitheatre
  // around it. Only the tower gets the model; the others keep their mapped footprints.
  { kind: 'kicc', match: /^kenyatta international convention centre$/i, build: kicc },
  { kind: 'clockTower', match: /^parliament clock tower$/i, build: clockTower },
  { kind: 'jamiaMosque', match: /^jamia mosque$/i, build: jamiaMosque },
]

/** The landmark a building is, if it is one. */
export function landmarkFor(name: string | undefined): LandmarkDef | undefined {
  if (!name) return undefined
  return LANDMARKS.find((landmark) => landmark.match.test(name.trim()))
}
