import { describe, expect, it } from 'vitest'
import { loadBakedZone } from '../../testing/zoneFixture'
import { ZoneIndex } from '../zone/zoneIndex'
import { DRIVABLE } from '../zone/format'
import {
  TREE_CHUNK,
  TREE_STRIDE,
  TREE_STYLE,
  buildTreeChunks,
  buildTreeMesh,
  packTrees,
  scatterTrees,
  treeStyle,
  trunkRadius,
} from './trees'

/** A packed array of one tree of each style, so a test can look at them individually. */
function one(style: number, height = 12, radius = 5) {
  return new Float32Array([
    0,
    0,
    height,
    radius,
    0.2,
    0.5,
    0.15,
    0,
    style,
    1234,
    // A second tree, so `first`/`last` slicing has something to exclude.
    100,
    100,
    height,
    radius,
    0.2,
    0.5,
    0.15,
    0,
    style,
    9999,
  ])
}

describe('tree layout', () => {
  const zone = loadBakedZone()
  const trees = scatterTrees(zone)
  const count = trees.length / TREE_STRIDE

  it('packs ten floats per tree, and plants the whole CBD', () => {
    expect(trees.length % TREE_STRIDE).toBe(0)
    expect(count).toBeGreaterThan(500)
  })

  it('mixes four kinds of tree, and mostly broad ones', () => {
    const styles = new Map<number, number>()
    for (let i = 0; i < count; i++) {
      const style = trees[i * TREE_STRIDE + 8]
      styles.set(style, (styles.get(style) ?? 0) + 1)
    }
    for (const style of Object.values(TREE_STYLE)) expect(styles.get(style)).toBeTruthy()
    // Avenue trees are mostly broad and round, not palms.
    expect(styles.get(TREE_STYLE.round)!).toBeGreaterThan(styles.get(TREE_STYLE.palm)!)
    expect(styles.get(TREE_STYLE.palm)!).toBeGreaterThan(20)
  })

  it('gives each tree a real height, canopy and seed', () => {
    for (let i = 0; i < count; i += 97) {
      const o = i * TREE_STRIDE
      expect(trees[o + 2]).toBeGreaterThan(5)
      expect(trees[o + 2]).toBeLessThan(30)
      expect(trees[o + 3]).toBeGreaterThan(0.4)
      expect(trees[o + 9]).not.toBe(0)
    }
  })

  it('is deterministic: the same zone plants the same trees', () => {
    expect(scatterTrees(zone)).toEqual(trees)
  })

  it('picks a style from the seed alone, so a tree never changes shape', () => {
    expect(treeStyle(1)).toBe(treeStyle(1))
    const seen = new Set<number>()
    for (let seed = 0; seed < 400; seed++) seen.add(treeStyle(seed))
    expect(seen.size).toBe(4)
  })

  it('gives a taller tree a thicker trunk', () => {
    expect(trunkRadius(20)).toBeGreaterThan(trunkRadius(8))
  })
})

describe('tree geometry', () => {
  it('builds wood and leaves for every style, with nothing empty or broken', () => {
    for (const style of Object.values(TREE_STYLE)) {
      const meshes = buildTreeMesh(one(style))
      for (const mesh of [meshes.wood, meshes.leaves]) {
        expect(mesh.indices.length).toBeGreaterThan(0)
        expect(mesh.indices.length % 3).toBe(0)
        // Every vertex has a position, a normal and a colour.
        expect(mesh.positions.length).toBe(mesh.normals.length)
        expect(mesh.positions.length).toBe(mesh.colors.length)
        expect(mesh.positions.length % 3).toBe(0)
        // And every index points at a real vertex.
        const vertices = mesh.positions.length / 3
        for (const index of mesh.indices) expect(index).toBeLessThan(vertices)
      }
    }
  })

  it('keeps a round tree inside its own footprint and height', () => {
    const meshes = buildTreeMesh(one(TREE_STYLE.round, 12, 5))
    const { positions } = meshes.leaves
    let maxRadius = 0
    let maxY = 0
    for (let i = 0; i < positions.length; i += 3) {
      // Only the first tree in the array: the second sits at x, z = 100.
      if (positions[i] > 50) continue
      maxRadius = Math.max(maxRadius, Math.hypot(positions[i], positions[i + 2]))
      maxY = Math.max(maxY, positions[i + 1])
    }
    // A 12 m tree with a 5 m canopy: the leaves reach most of the way out, and
    // overshoot the trunk a little without becoming a different tree.
    expect(maxRadius).toBeGreaterThan(2)
    expect(maxRadius).toBeLessThan(5 * 1.35)
    expect(maxY).toBeGreaterThan(9)
    expect(maxY).toBeLessThan(14)
  })

  it('makes the leaves lighter on top than underneath, so the canopy has volume', () => {
    const meshes = buildTreeMesh(one(TREE_STYLE.round, 12, 5))
    const { positions, colors } = meshes.leaves
    let top = 0
    let topCount = 0
    let bottom = 0
    let bottomCount = 0
    for (let i = 0; i < positions.length; i += 3) {
      if (positions[i] > 50) continue
      const luminance = colors[i] * 0.2126 + colors[i + 1] * 0.7152 + colors[i + 2] * 0.0722
      if (positions[i + 1] > 11) {
        top += luminance
        topCount++
      } else if (positions[i + 1] < 7) {
        bottom += luminance
        bottomCount++
      }
    }
    expect(topCount).toBeGreaterThan(0)
    expect(bottomCount).toBeGreaterThan(0)
    expect(top / topCount).toBeGreaterThan(bottom / bottomCount)
  })

  it('builds each kind differently: a palm is tall and thin, an acacia is flat', () => {
    const spread = (style: number) => {
      const { positions } = buildTreeMesh(one(style, 12, 5)).leaves
      let width = 0
      let height = 0
      for (let i = 0; i < positions.length; i += 3) {
        if (positions[i] > 50) continue
        width = Math.max(width, Math.hypot(positions[i], positions[i + 2]))
        height = Math.max(height, positions[i + 1])
      }
      return width / height
    }
    // A columnar cypress is a spire; an acacia spreads out under its umbrella.
    expect(spread(TREE_STYLE.columnar)).toBeLessThan(spread(TREE_STYLE.acacia))
    expect(spread(TREE_STYLE.round)).toBeLessThan(spread(TREE_STYLE.acacia))
  })

  it('roots the trunks below ground and never leaves foliage underground', () => {
    for (const style of Object.values(TREE_STYLE)) {
      const meshes = buildTreeMesh(one(style))
      let woodBottom = Infinity
      let leavesBottom = Infinity
      for (let i = 1; i < meshes.wood.positions.length; i += 3)
        woodBottom = Math.min(woodBottom, meshes.wood.positions[i])
      for (let i = 1; i < meshes.leaves.positions.length; i += 3)
        leavesBottom = Math.min(leavesBottom, meshes.leaves.positions[i])
      // Trunks start below ground so there is no gap at the base.
      expect(woodBottom).toBeLessThan(0)
      // Leaves may come close to the ground (a cypress's do), but never through it.
      expect(leavesBottom).toBeGreaterThan(-0.2)
    }
  })

  it('lifts the canopy of a broad tree clear of the pavement', () => {
    // A round tree's leaves start well up the trunk: you can walk under it.
    for (const style of [TREE_STYLE.round, TREE_STYLE.acacia, TREE_STYLE.palm]) {
      const meshes = buildTreeMesh(one(style))
      let leavesBottom = Infinity
      for (let i = 1; i < meshes.leaves.positions.length; i += 3)
        leavesBottom = Math.min(leavesBottom, meshes.leaves.positions[i])
      expect(leavesBottom).toBeGreaterThan(2)
    }
  })

  it('builds only the trees it is asked for', () => {
    const all = buildTreeMesh(one(TREE_STYLE.round))
    const firstOnly = buildTreeMesh(one(TREE_STYLE.round), 0, 1)
    expect(firstOnly.leaves.positions.length).toBeLessThan(all.leaves.positions.length)
    // The second tree sits at x = 100, so it must not appear in the first-only mesh.
    for (let i = 0; i < firstOnly.leaves.positions.length; i += 3)
      expect(firstOnly.leaves.positions[i]).toBeLessThan(50)
  })
})

describe('tree chunks', () => {
  const zone = loadBakedZone()
  const trees = scatterTrees(zone)

  it('groups trees into 400 m squares, losing none of them', () => {
    const chunks = buildTreeChunks(trees)
    expect(chunks.length).toBeGreaterThan(1)
    const total = chunks.reduce((sum, chunk) => sum + chunk.trees, 0)
    expect(total).toBe(trees.length / TREE_STRIDE)
  })

  it('puts every tree in the chunk its own coordinates belong to', () => {
    const chunks = buildTreeChunks(trees)
    for (const chunk of chunks) {
      for (let i = 0; i < chunk.wood.positions.length; i += 3) {
        const x = chunk.wood.positions[i]
        const z = chunk.wood.positions[i + 2]
        // Wood starts a little below ground and can lean, so allow a few metres of slack.
        expect(Math.floor(x / TREE_CHUNK)).toBeGreaterThanOrEqual(chunk.cx - 1)
        expect(Math.floor(x / TREE_CHUNK)).toBeLessThanOrEqual(chunk.cx + 1)
        expect(Math.floor(z / TREE_CHUNK)).toBeGreaterThanOrEqual(chunk.cz - 1)
        expect(Math.floor(z / TREE_CHUNK)).toBeLessThanOrEqual(chunk.cz + 1)
      }
    }
  })

  it('packs a subset out without disturbing its contents', () => {
    const indices = [3, 1, 7]
    const packed = packTrees(trees, indices)
    expect(packed.length).toBe(indices.length * TREE_STRIDE)
    indices.forEach((index, i) => {
      for (let f = 0; f < TREE_STRIDE; f++)
        expect(packed[i * TREE_STRIDE + f]).toBe(trees[index * TREE_STRIDE + f])
    })
  })
})

describe('trees that the map puts in the road', () => {
  const zone = loadBakedZone()
  const index = new ZoneIndex(zone)
  const trees = scatterTrees(zone)

  it('never plants a trunk in a carriageway or inside a building', () => {
    // The map has 271 individually mapped trees. A handful of their nodes sit in the middle
    // of the street beside them, and one inside a building -- a trunk growing out of a
    // traffic lane reads as a bug in the game, not in the map. Scattered park trees were
    // already checked against both; the mapped ones were only checked against each other.
    let standing = 0
    for (let i = 0; i < trees.length; i += TREE_STRIDE) {
      const x = trees[i]
      const z = trees[i + 1]
      standing++
      expect(index.buildingAt(x, z), `a tree at ${x}, ${z}`).toBeUndefined()
      index.roadsNear(x, z, 1, ({ ax, az, bx, bz, road }) => {
        if (!DRIVABLE[road.k] || road.e) return
        const dx = bx - ax
        const dz = bz - az
        const lengthSq = dx * dx + dz * dz
        const t = lengthSq
          ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSq))
          : 0
        const distance = Math.hypot(x - (ax + dx * t), z - (az + dz * t))
        expect(distance, `a tree at ${x}, ${z}`).toBeGreaterThanOrEqual(road.w / 2)
      })
    }
    // Still a full avenue's worth of trees: this rejects a few, it does not clear the map.
    expect(standing).toBeGreaterThan(2200)
  })
})
