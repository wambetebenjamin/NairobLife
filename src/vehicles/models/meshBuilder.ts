/**
 * A small kit for building low-poly models in code: flat-shaded faces, boxes, beams and
 * extruded side profiles. Every face has a colour, and may be marked as paintwork (it
 * takes the vehicle's own colour) or as a lamp (it can be lit).
 *
 * Like the character, the vehicles have no model files. A car is forty lines of
 * measurements you can read and change, it costs nothing to download, and all its
 * copies are drawn together.
 *
 * Model space: x is the vehicle's right, y is up, and the nose points along -z, the same
 * way the character faces. The origin is on the ground under the middle of the vehicle.
 * Side profiles are written as [forward, up] pairs, which is how you would sketch one.
 */
import earcut from 'earcut'
import { BufferAttribute, BufferGeometry } from 'three'
import { hexToLinear, type RGB } from '../../world/geometry/palette'

export type Vec3 = readonly [number, number, number]

/** How a face is coloured: a fixed colour, or the vehicle's own paint. */
export type Finish = string | typeof PAINT

/** Use as a finish to take the colour each vehicle is painted. */
export const PAINT = Symbol('paint')

/** Which lamp a face belongs to. Stored per vertex as 0, 1 or 2. */
export const LAMP = { none: 0, head: 1, tail: 2 } as const
export type Lamp = (typeof LAMP)[keyof typeof LAMP]

const WHITE: RGB = [1, 1, 1]
const cache = new Map<string, RGB>()

function colourOf(finish: Finish): RGB {
  if (finish === PAINT) return WHITE
  let colour = cache.get(finish)
  if (!colour) {
    colour = hexToLinear(finish)
    cache.set(finish, colour)
  }
  return colour
}

export class MeshBuilder {
  private readonly positions: number[] = []
  private readonly normals: number[] = []
  private readonly colours: number[] = []
  private readonly paint: number[] = []
  private readonly lamps: number[] = []
  private readonly indices: number[] = []
  private count = 0

  /** Faces added from now on belong to this lamp. Set it back to LAMP.none afterwards. */
  lamp: Lamp = LAMP.none

  /**
   * A flat face through the given corners, in order around its edge. It is turned to
   * face the same way as `outward`, so callers never have to think about winding order.
   */
  face(corners: readonly Vec3[], outward: Vec3, finish: Finish): this {
    if (corners.length < 3) return this
    // Newell's method: a dependable normal even when the corners are not quite flat.
    let nx = 0
    let ny = 0
    let nz = 0
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i]
      const b = corners[(i + 1) % corners.length]
      nx += (a[1] - b[1]) * (a[2] + b[2])
      ny += (a[2] - b[2]) * (a[0] + b[0])
      nz += (a[0] - b[0]) * (a[1] + b[1])
    }
    const length = Math.hypot(nx, ny, nz)
    if (length < 1e-9) return this
    nx /= length
    ny /= length
    nz /= length
    const flip = nx * outward[0] + ny * outward[1] + nz * outward[2] < 0
    if (flip) {
      nx = -nx
      ny = -ny
      nz = -nz
    }
    const colour = colourOf(finish)
    const first = this.count
    for (const corner of corners) {
      this.positions.push(corner[0], corner[1], corner[2])
      this.normals.push(nx, ny, nz)
      this.colours.push(colour[0], colour[1], colour[2])
      this.paint.push(finish === PAINT ? 1 : 0)
      this.lamps.push(this.lamp)
    }
    this.count += corners.length
    for (let i = 1; i < corners.length - 1; i++) {
      if (flip) this.indices.push(first, first + i + 1, first + i)
      else this.indices.push(first, first + i, first + i + 1)
    }
    return this
  }

  /** A box: centre and full size along x, y, z. `skip` leaves faces out, e.g. '-y' for the underside. */
  box(centre: Vec3, size: Vec3, finish: Finish, skip = ''): this {
    const [cx, cy, cz] = centre
    const hx = size[0] / 2
    const hy = size[1] / 2
    const hz = size[2] / 2
    const corner = (sx: number, sy: number, sz: number): Vec3 => [
      cx + sx * hx,
      cy + sy * hy,
      cz + sz * hz,
    ]
    const side = (name: string, outward: Vec3, corners: Vec3[]) => {
      if (!skip.includes(name)) this.face(corners, outward, finish)
    }
    side('+x', [1, 0, 0], [corner(1, -1, -1), corner(1, 1, -1), corner(1, 1, 1), corner(1, -1, 1)])
    side(
      '-x',
      [-1, 0, 0],
      [corner(-1, -1, -1), corner(-1, 1, -1), corner(-1, 1, 1), corner(-1, -1, 1)],
    )
    side('+y', [0, 1, 0], [corner(-1, 1, -1), corner(1, 1, -1), corner(1, 1, 1), corner(-1, 1, 1)])
    side(
      '-y',
      [0, -1, 0],
      [corner(-1, -1, -1), corner(1, -1, -1), corner(1, -1, 1), corner(-1, -1, 1)],
    )
    side('+z', [0, 0, 1], [corner(-1, -1, 1), corner(1, -1, 1), corner(1, 1, 1), corner(-1, 1, 1)])
    side(
      '-z',
      [0, 0, -1],
      [corner(-1, -1, -1), corner(1, -1, -1), corner(1, 1, -1), corner(-1, 1, -1)],
    )
    return this
  }

  /** A square bar from one point to another: forks, handlebars, exhausts, roof racks. */
  beam(from: Vec3, to: Vec3, width: number, height: number, finish: Finish): this {
    const dx = to[0] - from[0]
    const dy = to[1] - from[1]
    const dz = to[2] - from[2]
    const length = Math.hypot(dx, dy, dz)
    if (length < 1e-6) return this
    const ax = dx / length
    const ay = dy / length
    const az = dz / length
    // Two directions square to the bar. "Sideways" is always level (it has no y part);
    // a bar standing straight up has no sideways of its own, so it borrows the x axis.
    let sx = az
    let sz = -ax
    const level = Math.hypot(sx, sz)
    if (level < 1e-6) {
      sx = 1
      sz = 0
    } else {
      sx /= level
      sz /= level
    }
    const ux = ay * sz
    const uy = az * sx - ax * sz
    const uz = -ay * sx
    const at = (p: Vec3, s: number, u: number): Vec3 => [
      p[0] + (sx * s * width) / 2 + (ux * u * height) / 2,
      p[1] + (uy * u * height) / 2,
      p[2] + (sz * s * width) / 2 + (uz * u * height) / 2,
    ]
    for (const [s, u] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const outward: Vec3 = [sx * s + ux * u, uy * u, sz * s + uz * u]
      const corners = s
        ? [at(from, s, -1), at(from, s, 1), at(to, s, 1), at(to, s, -1)]
        : [at(from, -1, u), at(from, 1, u), at(to, 1, u), at(to, -1, u)]
      this.face(corners, outward, finish)
    }
    this.face(
      [at(from, -1, -1), at(from, 1, -1), at(from, 1, 1), at(from, -1, 1)],
      [-ax, -ay, -az],
      finish,
    )
    this.face([at(to, -1, -1), at(to, 1, -1), at(to, 1, 1), at(to, -1, 1)], [ax, ay, az], finish)
    return this
  }

  /**
   * Push a side profile across the vehicle's width, like extruding clay through a
   * template: the bodywork below the windows.
   *
   * @param profile  [forward, up] pairs around the outline, in either direction
   * @param halfWidth  half the width of the result
   * @param edge  finish for the surface made by each edge, by the index of its first point
   * @param sides  finish for the two flat sides
   */
  extrude(
    profile: readonly (readonly [number, number])[],
    halfWidth: number,
    edge: (index: number) => Finish,
    sides: Finish,
  ): this {
    const n = profile.length
    let area = 0
    for (let i = 0; i < n; i++) {
      const [f0, y0] = profile[i]
      const [f1, y1] = profile[(i + 1) % n]
      area += f0 * y1 - f1 * y0
    }
    const turn = area > 0 ? 1 : -1
    for (let i = 0; i < n; i++) {
      const [f0, y0] = profile[i]
      const [f1, y1] = profile[(i + 1) % n]
      // Outward from the outline, in the plane of the profile; forward maps to -z.
      const nf = (y1 - y0) * turn
      const ny = -(f1 - f0) * turn
      this.face(
        [
          [-halfWidth, y0, -f0],
          [halfWidth, y0, -f0],
          [halfWidth, y1, -f1],
          [-halfWidth, y1, -f1],
        ],
        [0, ny, -nf],
        edge(i),
      )
    }
    const triangles = earcut(profile.flatMap(([f, y]) => [f, y]))
    for (const x of [halfWidth, -halfWidth]) {
      for (let t = 0; t < triangles.length; t += 3) {
        const corners = [0, 1, 2].map((k): Vec3 => {
          const [f, y] = profile[triangles[t + k]]
          return [x, y, -f]
        })
        this.face(corners, [Math.sign(x), 0, 0], sides)
      }
    }
    return this
  }

  /**
   * A cabin: a base and a narrower roof joined by sloping glass. Each of the four points
   * is [forward, up]; the widths are half-widths at the base and at the roof.
   */
  cabin(
    shape: {
      baseFront: readonly [number, number]
      baseRear: readonly [number, number]
      roofFront: readonly [number, number]
      roofRear: readonly [number, number]
      baseHalfWidth: number
      roofHalfWidth: number
    },
    finish: { front: Finish; rear: Finish; sides: Finish; roof: Finish },
  ): this {
    const { baseFront, baseRear, roofFront, roofRear, baseHalfWidth: b, roofHalfWidth: r } = shape
    const at = (x: number, [f, y]: readonly [number, number]): Vec3 => [x, y, -f]
    this.face(
      [at(-b, baseFront), at(b, baseFront), at(r, roofFront), at(-r, roofFront)],
      [0, 0.4, -1],
      finish.front,
    )
    this.face(
      [at(-b, baseRear), at(b, baseRear), at(r, roofRear), at(-r, roofRear)],
      [0, 0.4, 1],
      finish.rear,
    )
    this.face(
      [at(-r, roofFront), at(r, roofFront), at(r, roofRear), at(-r, roofRear)],
      [0, 1, 0],
      finish.roof,
    )
    for (const side of [1, -1]) {
      this.face(
        [
          at(side * b, baseFront),
          at(side * r, roofFront),
          at(side * r, roofRear),
          at(side * b, baseRear),
        ],
        [side, 0.2, 0],
        finish.sides,
      )
    }
    return this
  }

  get triangles(): number {
    return this.indices.length / 3
  }

  /**
   * The finished mesh. Besides the usual attributes it carries `paint` (1 on paintwork,
   * 0 elsewhere) and `lamp` (see LAMP), which the vehicle material reads to tint and
   * light each vehicle separately.
   */
  geometry(): BufferGeometry {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3))
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(this.normals), 3))
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(this.colours), 3))
    geometry.setAttribute('paint', new BufferAttribute(new Float32Array(this.paint), 1))
    geometry.setAttribute('lamp', new BufferAttribute(new Float32Array(this.lamps), 1))
    geometry.setIndex(
      new BufferAttribute(
        this.count > 65535 ? new Uint32Array(this.indices) : new Uint16Array(this.indices),
        1,
      ),
    )
    geometry.computeBoundingSphere()
    geometry.computeBoundingBox()
    return geometry
  }
}
