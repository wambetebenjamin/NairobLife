/**
 * Export a baked zone as glTF 2.0 (.glb), for Blender, UE5, or any glTF viewer.
 *
 * The game builds its city in a Web Worker from plain typed arrays (see
 * world/geometry/*). Those builders are pure: no three.js, no DOM. This script reuses
 * them and then hands the triangles to three's own GLTFExporter, so what lands in Blender
 * is the same geometry that gets walked around in the browser, not a re-implementation.
 *
 *   npm run osm:export                 # data/zones/nairobi-cbd.json -> dist/export/nairobi-cbd.glb
 *   npm run osm:export -- nairobi-cbd --out ~/city.glb
 *   npm run osm:export -- --no-trees   # a lighter file for lighting/framing work
 *
 * Coordinate frame: glTF is Y-up and so is the game, so no axis swap is needed. X is east,
 * Z is south; the corner of the map sits at x=0,z=0, which is the zone's `origin`. Add
 * `file.origin` back in (see metresPerDegreeLon below, also printed on export) to recover
 * real latitude and longitude.
 *
 * What does not survive: the `facade` vertex attribute and the shader that draws windows
 * from it (materials/buildingMaterial.ts). Geometry and vertex colours do, which is what
 * an artist or a lighting scene needs.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { BASE_ELEVATION_M } from '../../src/config/zones'
import { createProjection } from '../../src/core/geo'
import { buildBuildingMesh } from '../../src/world/geometry/buildings'
import { buildGroundMesh, type FlatMesh } from '../../src/world/geometry/ground'
import { buildRaisedRoads } from '../../src/world/geometry/raisedRoads'
import {
  buildTreeChunks,
  packTrees,
  scatterTrees,
  TREE_STRIDE,
} from '../../src/world/geometry/trees'
import { groupBuildingsByChunk } from '../../src/world/zone/chunks'
import type { ZoneBuilding, ZoneFile } from '../../src/world/zone/format'

/**
 * three's GLB writer reads its buffer back through a FileReader, which Node does not
 * have. It uses one method; Blob already does the actual work.
 */
function installFileReader(): void {
  if ('FileReader' in globalThis) return
  class NodeFileReader {
    result: ArrayBuffer | null = null
    onloadend: (() => void) | null = null
    readAsArrayBuffer(blob: Blob): void {
      void blob.arrayBuffer().then((buffer) => {
        this.result = buffer
        this.onloadend?.()
      })
    }
  }
  Object.defineProperty(globalThis, 'FileReader', { value: NodeFileReader })
}

interface MeshArrays {
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  indices: Uint32Array
  uvs?: Float32Array
}

/** Plain arrays in, one BufferGeometry out. Mirrors geometry/toBufferGeometry.ts. */
function geometryFrom(mesh: MeshArrays): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(mesh.colors, 3))
  if (mesh.uvs) geometry.setAttribute('uv', new THREE.BufferAttribute(mesh.uvs, 2))
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1))
  return geometry
}

function meshFrom(mesh: MeshArrays, material: THREE.Material, name: string): THREE.Mesh {
  const object = new THREE.Mesh(geometryFrom(mesh), material)
  object.name = name
  return object
}

/** Lambert-ish, because the city is painted with baked vertex colours and no textures. */
function cityMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 })
}

interface Options {
  zone: string
  out: string
  buildings: boolean
  ground: boolean
  raised: boolean
  trees: boolean
  /** Write one file per chunk instead of one file for the whole zone. */
  tiles: boolean
  /** Chunk side in metres, if it should differ from the bake's. */
  tileSize: number
}

function parseArgs(argv: string[]): Options {
  const valueAt = (flag: string) => {
    const at = argv.indexOf(flag)
    return at >= 0 ? argv[at + 1] : undefined
  }
  const out = valueAt('--out')
  const skipped = new Set<string>()
  for (const flag of ['--out', '--tile-size']) {
    const at = argv.indexOf(flag)
    if (at < 0) continue
    skipped.add(argv[at])
    skipped.add(at + 1 < argv.length ? argv[at + 1] : '')
  }
  // Anything beginning with -- is ours, including a value we may not have consumed.
  const zone = argv.find((arg) => !arg.startsWith('--') && !skipped.has(arg)) ?? 'nairobi-cbd'
  const flags = new Set(argv)
  return {
    zone,
    out: out ?? (flags.has('--tiles') ? `dist/export/${zone}` : `dist/export/${zone}.glb`),
    buildings: !flags.has('--no-buildings'),
    ground: !flags.has('--no-ground'),
    raised: !flags.has('--no-raised'),
    trees: !flags.has('--no-trees'),
    tiles: flags.has('--tiles'),
    tileSize: Number(valueAt('--tile-size') ?? 400),
  }
}

function addBuildings(
  root: THREE.Group,
  buildings: readonly ZoneBuilding[],
  q: number,
  material: THREE.Material,
): number {
  const groups = [...groupBuildingsByChunk({ buildings: [...buildings], q }).values()]
  const mesh = { built: 0 }
  groups.forEach((group, i) => {
    const built = buildBuildingMesh(group.list, q)
    if (built.indices.length === 0) return
    const object = meshFrom(built, material, `buildings_${i}_${group.cx}_${group.cz}`)
    object.userData.buildings = group.list.length
    root.add(object)
    mesh.built += group.list.length
  })
  return mesh.built
}

function addFlat(root: THREE.Group, name: string, mesh: FlatMesh, decal: boolean): void {
  if (mesh.indices.length === 0) return
  const material = cityMaterial()
  if (decal) {
    // Roads and areas are painted a few centimetres above the ground plane, exactly as
    // in the game. Nudge them towards the camera so they do not z-fight when inspected
    // up close in a viewport that has no depth trickery.
    material.polygonOffset = true
    material.polygonOffsetFactor = -1
    material.polygonOffsetUnits = -1
  }
  root.add(meshFrom(mesh, material, name))
}

function addTrees(root: THREE.Group, file: ZoneFile, material: THREE.Material): number {
  const trees = scatterTrees(file)
  if (trees.length === 0) return 0
  const chunks = buildTreeChunks(trees)
  for (const chunk of chunks) {
    const group = new THREE.Group()
    group.name = `trees_${chunk.cx}_${chunk.cz}`
    if (chunk.leaves.indices.length) group.add(meshFrom(chunk.leaves, material, 'leaves'))
    if (chunk.wood.indices.length) group.add(meshFrom(chunk.wood, material, 'wood'))
    root.add(group)
  }
  return trees.length / TREE_STRIDE
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const zonePath = resolve(`data/zones/${options.zone}.json`)
  const file = JSON.parse(readFileSync(zonePath, 'utf8')) as ZoneFile

  installFileReader()

  const root = new THREE.Group()
  root.name = options.zone
  // A .glb that leaves the repository is a copy of an ODbL database, so it has to carry
  // its own credit and the georeference that makes it useful outside the game. Put them
  // in the file rather than in the commit message, which nobody opening it in Blender
  // will ever see.
  root.userData = {
    source: 'OpenStreetMap contributors',
    licence: 'ODbL 1.0 — https://www.openstreetmap.org/copyright',
    origin: { ...file.origin, elevation: BASE_ELEVATION_M },
    note: 'x=0, z=0 is origin; X is east, Z is south, metres. Heights marked est in the zone file are estimates, not surveys.',
  }
  const material = cityMaterial()

  const built = options.buildings ? addBuildings(root, file.buildings, file.q, material) : 0
  if (options.ground) addFlat(root, 'ground', buildGroundMesh(file), false)
  if (options.raised) addFlat(root, 'raised', buildRaisedRoads(file), true)
  const treeCount = options.trees ? addTrees(root, file, material) : 0

  const copyright = `${file.attribution}. https://www.openstreetmap.org/copyright`
  const exportGlb = async (group: THREE.Group): Promise<Buffer> => {
    const result = await new GLTFExporter().parseAsync(group, {
      binary: true,
      // Vertex colours must reach COLOR_0 or every surface arrives white in Blender.
      includeCustomExtensions: false,
      // ODbL requires attribution, and a .glb is a copy of the database. The zone already
      // carries the exact wording, so use it rather than composing a near-duplicate.
      copyright,
    })
    if (!(result instanceof ArrayBuffer)) throw new Error('Expected binary glTF output')
    return Buffer.from(result)
  }

  const projection = createProjection(file.origin)
  const measured = file.buildings.filter((b) => b.est !== 1).length
  console.log(`zone     ${file.name} (q=${file.q}, format v${file.v})`)
  if (options.buildings) console.log(`buildings ${built.toLocaleString('en-GB')}`)
  if (options.trees) console.log(`trees    ${treeCount.toLocaleString('en-GB')}`)
  console.log(
    `heights  ${measured} of ${file.buildings.length} measured, rest estimated in the bake`,
  )
  console.log(`origin   ${file.origin.lat}, ${file.origin.lon} = x0,z0 of the export`)
  console.log(
    `scale    ${projection.metresPerDegLon.toFixed(1)} m per degree of longitude at this latitude`,
  )

  if (!options.tiles) {
    const outPath = resolve(options.out)
    mkdirSync(dirname(outPath), { recursive: true })
    const bytes = await exportGlb(root)
    writeFileSync(outPath, bytes)
    console.log(`wrote    ${options.out}  ${(bytes.byteLength / 1e6).toFixed(2)} MB`)
    return
  }

  // ---- tiled export --------------------------------------------------------
  // One file per chunk, named for the chunk, so a streamer (UE5 World Partition, or any
  // other) can load the block the camera is in and nothing else. Every tile keeps the
  // same origin and the same frame as the whole-zone file, which is what lets them sit
  // side by side with no offset: `extras.origin` is identical in all of them.
  const dir = resolve(options.out)
  mkdirSync(dir, { recursive: true })
  const size = options.tileSize
  const cells = new Map<
    string,
    { cx: number; cz: number; buildings: ZoneBuilding[]; trees: THREE.Object3D[] }
  >()
  const cellFor = (x: number, z: number) => {
    const cx = Math.floor(x / size)
    const cz = Math.floor(z / size)
    const key = `${cx},${cz}`
    let cell = cells.get(key)
    if (!cell) {
      cell = { cx, cz, buildings: [], trees: [] }
      cells.set(key, cell)
    }
    return cell
  }

  if (options.buildings) {
    const groups = [...groupBuildingsByChunk(file).values()]
    for (const group of groups) {
      // The bake chunks at CHUNK_SIZE; a tile may hold several, or a slice of one. Place
      // each building in the cell its first corner falls in, the same rule the worker uses.
      const byCell = new Map<string, ZoneBuilding[]>()
      for (const building of group.list) {
        const key = `${cellFor(building.p[0] / file.q, building.p[1] / file.q).cx},${cellFor(building.p[0] / file.q, building.p[1] / file.q).cz}`
        const list = byCell.get(key)
        if (list) list.push(building)
        else byCell.set(key, [building])
      }
      for (const [key, list] of byCell) {
        const [cx, cz] = key.split(',').map(Number)
        cellFor(cx * size + 0.001, cz * size + 0.001).buildings.push(...list)
      }
    }
  }

  if (options.trees) {
    const packed = scatterTrees(file)
    const cellTrees = new Map<string, number[]>()
    for (let i = 0; i < packed.length / TREE_STRIDE; i++) {
      const o = i * TREE_STRIDE
      const cell = cellFor(packed[o], packed[o + 1])
      const key = `${cell.cx},${cell.cz}`
      const list = cellTrees.get(key)
      if (list) list.push(i)
      else cellTrees.set(key, [i])
    }
    const treeMaterial = cityMaterial()
    for (const [key, indices] of cellTrees) {
      const [cx, cz] = key.split(',').map(Number)
      const cell = cellFor(cx * size + 0.001, cz * size + 0.001)
      const packedSubset = packTrees(packed, indices)
      const built = buildTreeChunks(packedSubset)
      const group = new THREE.Group()
      group.name = `trees_${key}`
      for (const chunk of built) {
        if (chunk.leaves.indices.length) group.add(meshFrom(chunk.leaves, treeMaterial, 'leaves'))
        if (chunk.wood.indices.length) group.add(meshFrom(chunk.wood, treeMaterial, 'wood'))
      }
      cell.trees.push(group)
    }
  }

  // Bare ground and raised decks are drawn once, in the cell that holds the origin, so the
  // tiles that stream in do not each carry a duplicate copy of the whole terrain.
  let tilesWritten = 0
  let tileBytes = 0
  const keys = [...cells.keys()].sort()
  if (options.ground || options.raised) keys.push('__ground__')

  for (const key of keys) {
    const tile = new THREE.Group()
    tile.name = key === '__ground__' ? 'ground' : `tile_${key}`
    tile.userData = root.userData
    if (key === '__ground__') {
      if (options.ground) addFlat(tile, 'ground', buildGroundMesh(file), false)
      if (options.raised) addFlat(tile, 'raised', buildRaisedRoads(file), true)
    } else {
      const cell = cells.get(key)
      if (!cell) continue
      if (cell.buildings.length) addBuildings(tile, cell.buildings, file.q, material)
      for (const tree of cell.trees) tile.add(tree)
    }
    if (tile.children.length === 0) continue
    const bytes = await exportGlb(tile)
    const name = key === '__ground__' ? 'ground.glb' : `tile_${key.replace(',', '_')}.glb`
    writeFileSync(resolve(dir, name), bytes)
    tilesWritten++
    tileBytes += bytes.byteLength
  }

  console.log(
    `wrote    ${options.out}/  ${tilesWritten} tiles, ${(tileBytes / 1e6).toFixed(2)} MB total, ${size} m per tile`,
  )
}

void main()
