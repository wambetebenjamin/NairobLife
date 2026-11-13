import { describe, expect, it } from 'vitest'
import { buildBuildingMesh } from './buildings'
import {
  LANDMARKS,
  clockTower,
  jamiaMosque,
  kicc,
  landmarkFor,
  type LandmarkMesh,
} from './landmarks'

/** Every normal, every index, and the bounds of a mesh. */
function inspect(mesh: LandmarkMesh) {
  let outwards = 0
  let inwards = 0
  let degenerate = 0
  let minY = Infinity
  let maxY = -Infinity
  let far = 0
  const positions = mesh.positions
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a, b, c] = [mesh.indices[i] * 3, mesh.indices[i + 1] * 3, mesh.indices[i + 2] * 3]
    const ux = positions[b] - positions[a]
    const uy = positions[b + 1] - positions[a + 1]
    const uz = positions[b + 2] - positions[a + 2]
    const vx = positions[c] - positions[a]
    const vy = positions[c + 1] - positions[a + 1]
    const vz = positions[c + 2] - positions[a + 2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const area = Math.hypot(nx, ny, nz)
    if (area < 1e-9) {
      degenerate++
      continue
    }
    // The vertex normal should agree with the face's own normal: if it disagrees, the
    // triangle is wound inside out and the building is a hole in the world.
    const dot = (nx * mesh.normals[a] + ny * mesh.normals[a + 1] + nz * mesh.normals[a + 2]) / area
    if (dot > 0) outwards++
    else inwards++
  }
  for (let i = 0; i < positions.length; i += 3) {
    minY = Math.min(minY, positions[i + 1])
    maxY = Math.max(maxY, positions[i + 1])
    far = Math.max(far, Math.hypot(positions[i], positions[i + 2]))
  }
  return { outwards, inwards, degenerate, minY, maxY, far }
}

/** A landmark on a plot the size of its mapped footprint. */
const plot = { x: 0, z: 0, radius: 40, height: 105 }

describe('landmark models', () => {
  for (const landmark of LANDMARKS) {
    describe(landmark.kind, () => {
      const mesh = landmark.build(plot)

      it('is a closed, outward-facing mesh', () => {
        const { outwards, inwards, degenerate } = inspect(mesh)
        expect(mesh.indices.length).toBeGreaterThan(0)
        expect(mesh.indices.length % 3).toBe(0)
        expect(outwards).toBeGreaterThan(0)
        // No more than a face or two may be degenerate, and none may be inside out.
        expect(degenerate).toBeLessThan(4)
        expect(inwards).toBe(0)
      })

      it('grounds on the pavement', () => {
        const { minY } = inspect(mesh)
        expect(minY).toBeGreaterThanOrEqual(-0.01)
        expect(minY).toBeLessThan(1)
      })

      it('stands at a believable height for the building it is', () => {
        // Each landmark relates to its mapped height differently: the KICC is the mapped
        // tower and should fill it; the clock tower's mapped 40 m is generous for a clock
        // tower; the mosque's minarets rise well above its mapped 14 m prayer hall. So
        // the check is a range that is plausible for any of them.
        const { maxY } = inspect(mesh)
        expect(maxY).toBeGreaterThan(10)
        expect(maxY).toBeLessThan(plot.height * 1.6)
      })

      it('fits inside its plot, so it does not grow through its neighbours', () => {
        const { far } = inspect(mesh)
        expect(far).toBeGreaterThan(plot.radius * 0.3)
        expect(far).toBeLessThan(plot.radius * 1.25)
      })

      it('has sane attributes: colour and uv for every vertex', () => {
        const count = mesh.positions.length / 3
        expect(mesh.normals.length).toBe(mesh.positions.length)
        expect(mesh.colors.length).toBe(mesh.positions.length)
        expect(mesh.uvs.length).toBe(count * 2)
        expect(mesh.facades.length).toBe(mesh.positions.length)
        for (let i = 0; i < mesh.positions.length; i++) {
          expect(Number.isFinite(mesh.positions[i])).toBe(true)
          expect(mesh.normals[i]).toBeGreaterThanOrEqual(-1.001)
          expect(mesh.normals[i]).toBeLessThanOrEqual(1.001)
        }
        for (const index of mesh.indices) expect(index).toBeLessThan(count)
      })
    })
  }

  it('builds KICC as a round tower on a wider skirt, as it really is', () => {
    // Section the model by height and measure its widest point at each level.
    const mesh = kicc(plot)
    const widthAt = (from: number, to: number) => {
      let far = 0
      for (let i = 0; i < mesh.positions.length; i += 3) {
        const y = mesh.positions[i + 1]
        if (y < from || y > to) continue
        far = Math.max(far, Math.hypot(mesh.positions[i], mesh.positions[i + 2]))
      }
      return far
    }
    // The bands have to contain vertices: a lathe only has vertices on its rings, so a
    // band between two rings measures nothing at all. These are the skirt, the shaft and
    // the spire.
    const skirt = widthAt(0, 6)
    const tower = widthAt(30, 88)
    const crown = widthAt(94, 200)
    // The skirt is the widest thing by far; the tower is less than half of it.
    expect(skirt).toBeGreaterThan(tower * 1.8)
    // And the crown is narrower than the tower.
    expect(crown).toBeLessThan(tower)
  })

  it('builds the clock tower as a square shaft with a roof, not a box', () => {
    const mesh = clockTower({ x: 0, z: 0, radius: 5, height: 40 })
    const { maxY, minY } = inspect(mesh)
    expect(minY).toBeGreaterThanOrEqual(-0.01)
    expect(maxY).toBeGreaterThan(35)
    // A box would have exactly 6 faces; this has a roof, a clock stage and a parapet.
    expect(mesh.indices.length / 3).toBeGreaterThan(40)
  })

  it('builds the mosque with domes and minarets above the hall', () => {
    const mesh = jamiaMosque({ x: 0, z: 0, radius: 53, height: 14 })
    // Two minarets are the tallest part, well above the mapped 14 m wall.
    const { maxY } = inspect(mesh)
    expect(maxY).toBeGreaterThan(20)
  })

  it('recognises a building by its mapped name, and nothing else', () => {
    expect(landmarkFor('Kenyatta International Convention Centre')?.kind).toBe('kicc')
    expect(landmarkFor('PARLIAMENT CLOCK TOWER')?.kind).toBe('clockTower')
    expect(landmarkFor('Jamia Mosque')?.kind).toBe('jamiaMosque')
    expect(landmarkFor('Jamia Shopping Mall')).toBeUndefined()
    expect(landmarkFor('Kenya Parliament Buildings')).toBeUndefined()
    expect(landmarkFor('Times Tower')).toBeUndefined()
    expect(landmarkFor(undefined)).toBeUndefined()
    expect(landmarkFor('')).toBeUndefined()
  })
})

describe('landmarks in the city mesh', () => {
  it('replaces the mapped footprint instead of drawing the landmark twice', () => {
    // Two identical plots, one named as the KICC and one not. The named one must be built
    // by hand; if it were also extruded there would be a plain tower inside the model.
    const named = buildBuildingMesh(
      [
        {
          id: 1,
          p: [0, 0, 20, 0, 20, 20, 0, 20],
          h: 105,
          n: 'Kenyatta International Convention Centre',
        },
      ],
      1,
    )
    const plain = buildBuildingMesh(
      [{ id: 1, p: [0, 0, 20, 0, 20, 20, 0, 20], h: 105, n: 'Some Other Tower' }],
      1,
    )
    expect(named.indices.length).not.toBe(plain.indices.length)
    expect(named.positions.length).toBeGreaterThan(0)
    // The plain one is a straight extrusion; the landmark is a lathe.
    expect(named.indices.length).toBeGreaterThan(plain.indices.length)
  })
})
