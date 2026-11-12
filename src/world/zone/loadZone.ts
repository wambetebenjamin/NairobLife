/**
 * Main-thread side of zone loading: finds the baked file for a zone, hands it to the
 * worker and resolves with meshes ready to mount.
 */
import { getZone } from '../../config/zones'
import type { ZoneFile } from './format'
import type { LoadRequest, LoadStage, WorkerMessage, ZoneGeometry } from './protocol'
import { ZoneIndex } from './zoneIndex'

/**
 * Every baked zone, as a URL to a hashed file. Vite copies the JSON into dist/assets, so
 * it is served compressed and can be cached forever.
 */
const ZONE_URLS = import.meta.glob<string>('/data/zones/*.json', {
  query: '?url',
  import: 'default',
  eager: true,
})

export interface LoadedZone {
  id: string
  file: ZoneFile
  geometry: ZoneGeometry
  index: ZoneIndex
}

export interface LoadProgress {
  stage: LoadStage
  /** 0..1 within the stage. */
  value: number
  /** 0..1 overall. */
  overall: number
}

const STAGE_RANGE: Record<LoadStage, [number, number]> = {
  download: [0, 0.4],
  buildings: [0.4, 0.8],
  roads: [0.8, 0.93],
  trees: [0.93, 1],
}

export function loadZone(
  id: string,
  onProgress?: (progress: LoadProgress) => void,
): Promise<LoadedZone> {
  const zone = getZone(id)
  const url = ZONE_URLS[`/data/zones/${id}.json`]
  if (!url) {
    return Promise.reject(
      new Error(`No baked data for zone "${zone.name}". Run "npm run osm -- ${id}" and rebuild.`),
    )
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./zoneWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data
      if (message.type === 'progress') {
        const [from, to] = STAGE_RANGE[message.stage]
        onProgress?.({
          stage: message.stage,
          value: message.value,
          overall: from + (to - from) * message.value,
        })
      } else if (message.type === 'done') {
        worker.terminate()
        if (import.meta.env.DEV) {
          const tris = message.geometry.chunks.reduce(
            (sum, c) => sum + c.mesh.indices.length / 3,
            0,
          )
          console.info(
            `[zone] ${id}: ${message.file.buildings.length} buildings (${Math.round(tris / 1000)}k triangles in ` +
              `${message.geometry.chunks.length} chunks), ${message.geometry.trees.length / 8} trees, ` +
              `meshed in ${message.buildMs.toFixed(0)} ms`,
          )
        }
        resolve({
          id,
          file: message.file,
          geometry: message.geometry,
          index: new ZoneIndex(message.file),
        })
      } else {
        worker.terminate()
        reject(new Error(message.message))
      }
    }
    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message || 'The map worker failed to start'))
    }
    const request: LoadRequest = { type: 'load', url: new URL(url, window.location.href).href }
    worker.postMessage(request)
  })
}
