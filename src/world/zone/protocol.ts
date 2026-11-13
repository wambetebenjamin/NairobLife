/**
 * Messages between the main thread and the zone worker, and the shape of a loaded zone.
 * Geometry travels as typed arrays whose buffers are transferred, not copied.
 */
import type { BuildingMesh } from '../geometry/buildings'
import type { TreeChunk } from '../geometry/trees'
import type { FlatMesh } from '../geometry/ground'
import type { ZoneFile } from './format'

/** Buildings are grouped into square chunks so off-screen parts of the city can be culled. */
export const CHUNK_SIZE = 400

export interface LoadRequest {
  type: 'load'
  url: string
}

export interface BuildingChunk {
  /** Chunk coordinates on the CHUNK_SIZE grid. */
  cx: number
  cz: number
  buildings: number
  mesh: BuildingMesh
}

export interface ZoneGeometry {
  chunks: BuildingChunk[]
  /** Parks, water and roads painted on the ground. */
  ground: FlatMesh
  /** Flyovers, ramps and footbridges. Also used as their collider. */
  raised: FlatMesh
  /** TREE_STRIDE floats per tree; see geometry/trees.ts. */
  trees: Float32Array
  /** The same trees, built into wood and leaves per 400 m square, for culling. */
  treeChunks: TreeChunk[]
}

export type LoadStage = 'download' | 'buildings' | 'roads' | 'trees'

export type WorkerMessage =
  | { type: 'progress'; stage: LoadStage; value: number }
  | { type: 'done'; file: ZoneFile; geometry: ZoneGeometry; buildMs: number }
  | { type: 'error'; message: string }
