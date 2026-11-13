/**
 * The geometry of a person, as plain triangles.
 *
 * One small mesh per part of the body, built once and drawn thousands of times with
 * instancing. Each is deliberately simple — a tapered box with bevelled edges and a
 * rounded crown — because what sells a figure at ten metres is its silhouette and its
 * proportions, not its polygons. The head is the exception: it gets a face plane, a nose
 * and ears, because that is where the eye goes.
 *
 * No three.js here: the arrays are wrapped in a BufferGeometry by the renderer. That
 * keeps the shapes testable, which matters because "the head is inside the body" and
 * "the arms are attached at the shoulders" are things a test can check and a screenshot
 * cannot check reliably.
 */
import type { PartName } from './body'

export interface PartMesh {
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  indices: Uint32Array
}

type P = [number, number, number]

/** A unit cube's eight corners, for the boxes below. */
const CUBE: readonly P[] = [
  [-0.5, -0.5, -0.5],
  [0.5, -0.5, -0.5],
  [0.5, 0.5, -0.5],
  [-0.5, 0.5, -0.5],
  [-0.5, -0.5, 0.5],
  [0.5, -0.5, 0.5],
  [0.5, 0.5, 0.5],
  [-0.5, 0.5, 0.5],
]

/** The six faces of that cube, as four corners each, wound outwards. */
const CUBE_FACES: readonly number[][] = [
  [4, 5, 6, 7], // +z
  [1, 0, 3, 2], // -z
  [5, 1, 2, 6], // +x
  [0, 4, 7, 3], // -x
  [7, 6, 2, 3], // +y
  [0, 1, 5, 4], // -y
]

class Builder {
  private readonly positions: number[] = []
  private readonly normals: number[] = []
  private readonly colors: number[] = []
  private readonly indices: number[] = []

  vertex(p: P, n: P, c: readonly [number, number, number]): number {
    const index = this.positions.length / 3
    this.positions.push(p[0], p[1], p[2])
    this.normals.push(n[0], n[1], n[2])
    this.colors.push(c[0], c[1], c[2])
    return index
  }

  triangle(a: number, b: number, c: number): void {
    this.indices.push(a, b, c)
  }

  /**
   * A tapered box, optionally bevelled and with a rounded top or bottom. The eight
   * corners are given as shares of the part's size, so a part is described once and
   * scaled per person.
   *
   * `taper` narrows the top or the bottom: a torso is wider at the shoulders than the
   * waist, a forearm narrower at the wrist than the elbow.
   */
  box(
    size: readonly [number, number, number],
    colour: readonly [number, number, number],
    options: {
      centre?: P
      /** 0..1: how much narrower the far end is. */
      taper?: number
      /** Round the top and bottom into a capsule, for limbs. */
      round?: number
      bevel?: number
    } = {},
  ): void {
    const [w, h, d] = size
    const [cx, cy, cz] = options.centre ?? [0, 0, 0]
    const taper = options.taper ?? 0
    const round = options.round ?? 0
    const bevel = options.bevel ?? 0

    // Eight corners, scaled, tapered towards +y, and bevelled in x and z.
    const corners: P[] = CUBE.map(([x, y, z]) => {
      const t = 1 - taper * (y + 0.5)
      return [cx + x * w * t * (1 - bevel), cy + y * h, cz + z * d * t * (1 - bevel)] as P
    })

    // A rounded end: a fan of extra rings at the top and bottom.
    const rings: P[][] = []
    const steps = round > 0 ? 3 : 0
    if (steps > 0) {
      for (let s = 0; s <= steps; s++) {
        const angle = (s / steps) * (Math.PI / 2)
        const lift = Math.sin(angle) * h * round * 0.5
        const shrink = Math.cos(angle)
        rings.push(
          CUBE.slice(0, 4).map((_, i) => {
            const x = i === 0 || i === 3 ? -0.5 : 0.5
            const z = i < 2 ? -0.5 : 0.5
            return [cx + x * w * shrink, cy + h / 2 + lift, cz + z * d * shrink] as P
          }),
        )
      }
    }

    // Sides.
    for (const face of CUBE_FACES) {
      const points = face.map((i) => corners[i])
      const normal = faceNormal(points)
      const base = points.map((p) => this.vertex(p, normal, colour))
      this.triangle(base[0], base[1], base[2])
      this.triangle(base[0], base[2], base[3])
    }

    // Rounded top: a cap of rings, closed with a centre.
    if (steps > 0) {
      const [rx, ry, rz] = [w / 2, h / 2, d / 2]
      void rx
      void rz
      let previous = rings[0]
      for (let s = 1; s < rings.length; s++) {
        const ring = rings[s]
        for (let i = 0; i < 4; i++) {
          const j = (i + 1) % 4
          const normal = faceNormal([previous[i], previous[j], ring[j], ring[i]])
          const a = this.vertex(previous[i], normal, colour)
          const b = this.vertex(previous[j], normal, colour)
          const c = this.vertex(ring[j], normal, colour)
          const d = this.vertex(ring[i], normal, colour)
          this.triangle(a, b, c)
          this.triangle(a, c, d)
        }
        previous = ring
      }
      const top = this.vertex([cx, cy + ry + h * round * 0.5, cz], [0, 1, 0], colour)
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4
        const a = this.vertex(previous[i], [0, 1, 0], colour)
        const b = this.vertex(previous[j], [0, 1, 0], colour)
        this.triangle(a, b, top)
      }
    }

    // A bevelled top and bottom get a flat cap, so limbs do not look cut off.
    if (bevel > 0) {
      const top = corners.slice(4, 8)
      const bottom = corners.slice(0, 4)
      const capTop = top.map((p) =>
        this.vertex([p[0], p[1] + h * 0.5 * bevel * 0.5, p[2]], [0, 1, 0], colour),
      )
      this.triangle(capTop[0], capTop[1], capTop[2])
      this.triangle(capTop[0], capTop[2], capTop[3])
      const capBottom = bottom.map((p) =>
        this.vertex([p[0], p[1] - h * 0.5 * bevel * 0.5, p[2]], [0, -1, 0], colour),
      )
      this.triangle(capBottom[0], capBottom[2], capBottom[1])
      this.triangle(capBottom[0], capBottom[3], capBottom[2])
    }
  }

  build(): PartMesh {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      colors: new Float32Array(this.colors),
      indices: new Uint32Array(this.indices),
    }
  }
}

function faceNormal(points: readonly P[]): P {
  let nx = 0
  let ny = 0
  let nz = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    nx += (a[1] - b[1]) * (a[2] + b[2])
    ny += (a[2] - b[2]) * (a[0] + b[0])
    nz += (a[0] - b[0]) * (a[1] + b[1])
  }
  const length = Math.hypot(nx, ny, nz) || 1
  return [nx / length, ny / length, nz / length]
}

/**
 * The meshes. Each part's geometry is built once at the reference proportions, and the
 * instance matrix scales it per person. Units are metres, the origin is at the joint the
 * part hangs from, and the part hangs *down* from it (so a thigh runs from y = 0 down to
 * y = -length).
 */
export function partGeometry(part: PartName): PartMesh {
  const b = new Builder()
  // The reference palette below is a placeholder; every face is tinted per instance by
  // the instance colour, so the geometry's own colours are white where the clothing tint
  // applies and fixed where the part is always that material.
  const WHITE: readonly [number, number, number] = [1, 1, 1]
  const SOLE: readonly [number, number, number] = [0.05, 0.05, 0.05]

  switch (part) {
    // ---- torso: chest to waist, tapering in, with shoulders on top. Unit height, so
    // `partSize` alone decides how big it is.
    case 'torso': {
      // Unlike the limbs, the torso rises from its joint: the hip is at y = 0 and the neck
      // at y = 1, because the chest is *above* the pelvis. Build it downward and the chest
      // hangs through the thighs.
      b.box([1, 1, 1], WHITE, { centre: [0, 0.5, 0], taper: 0.18, bevel: 0.08 })
      // Shoulders: a wider slab at the top, which is what makes a silhouette human.
      b.box([1.14, 0.14, 0.6], WHITE, { centre: [0, 0.93, 0], bevel: 0.5 })
      break
    }
    case 'neck':
      // A short column of skin, slightly tapered: the neck.
      b.box([1, 1, 1], WHITE, { centre: [0, 0.5, 0], taper: 0.12, bevel: 0.3 })
      break
    case 'head': {
      // A skull is a little taller than it is wide, and narrower at the jaw.
      b.box([1, 1, 1], WHITE, { taper: 0.08, bevel: 0.3 })
      // The face: a plane set slightly forward, so there is a front and a back.
      b.box([0.74, 0.62, 0.07], WHITE, { centre: [0, 0.04, 0.48] })
      // A nose.
      b.box([0.13, 0.17, 0.13], WHITE, { centre: [0, -0.02, 0.55] })
      // Ears.
      for (const side of [-1, 1]) {
        b.box([0.09, 0.22, 0.1], WHITE, { centre: [side * 0.49, 0.05, 0.02] })
      }
      break
    }
    case 'hair': {
      // A cap over the crown and the back of the head.
      b.box([1, 1, 1], WHITE, { centre: [0, 0, -0.05], bevel: 0.45 })
      break
    }
    // ---- limbs: a unit rod hanging from y = 0 down to y = -1, rounded at both ends.
    // The rounded cap would push above the joint and leave a gap at the shoulder, so the
    // rod starts a little lower: the cap then fills the joint and overlaps the torso,
    // which is what a shoulder actually is.
    case 'upperArm':
      b.box([1, 1, 0.9], WHITE, { centre: [0, -0.625, 0], round: 0.45 })
      break
    case 'forearm':
      b.box([1, 1, 0.9], WHITE, { centre: [0, -0.625, 0], taper: 0.16, round: 0.45 })
      break
    case 'hand':
      // A flat-ish paddle with a thumb: enough at any distance you see one.
      b.box([1, 1, 0.6], WHITE, { centre: [0, -0.5, 0], round: 0.35 })
      b.box([0.4, 0.55, 0.5], WHITE, { centre: [0.5, -0.3, 0.1] })
      break
    case 'thigh':
      b.box([1, 1, 0.9], WHITE, { centre: [0, -0.63, 0], taper: 0.18, round: 0.4 })
      break
    case 'shin':
      b.box([1, 1, 0.9], WHITE, { centre: [0, -0.645, 0], taper: 0.3, round: 0.35 })
      break
    // ---- a shoe: a wedge, longer than it is tall, on a sole. The sole's underside is at
    // y = -1, so a foot scaled to the ankle height rests exactly on the ground.
    case 'foot':
      b.box([1, 0.7, 0.95], WHITE, { centre: [0, -0.62, 0.28], taper: 0.25, bevel: 0.18 })
      b.box([1.04, 0.3, 1], SOLE, { centre: [0, -0.85, 0.28] })
      break
    // ---- a satchel: a soft slab, with a strap over one shoulder.
    case 'bag':
      b.box([1, 1, 0.8], WHITE, { centre: [0, -0.5, -0.1], bevel: 0.25 })
      b.box([0.16, 1.6, 0.14], WHITE, { centre: [0.34, 0.1, -0.05] })
      break
  }
  return b.build()
}

/** Every part's geometry, built once. */
export function allPartGeometry(): Record<PartName, PartMesh> {
  return {
    torso: partGeometry('torso'),
    neck: partGeometry('neck'),
    head: partGeometry('head'),
    hair: partGeometry('hair'),
    upperArm: partGeometry('upperArm'),
    forearm: partGeometry('forearm'),
    hand: partGeometry('hand'),
    thigh: partGeometry('thigh'),
    shin: partGeometry('shin'),
    foot: partGeometry('foot'),
    bag: partGeometry('bag'),
  }
}
