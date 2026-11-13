/**
 * Zone worker: downloads a baked zone and turns it into meshes off the main thread, so
 * the loading screen keeps animating and (later) new zones can stream in while you play.
 *
 * TODO(streaming): keep the worker alive and load neighbouring zones as the player
 * approaches a zone edge; unload the ones left behind.
 */
import { buildBuildingMesh } from '../geometry/buildings'
import { buildGroundMesh } from '../geometry/ground'
import { buildRaisedRoads } from '../geometry/raisedRoads'
import { buildTreeChunks, scatterTrees } from '../geometry/trees'
import { ZONE_FORMAT_VERSION, type ZoneBuilding, type ZoneFile } from './format'
import { CHUNK_SIZE, type BuildingChunk, type LoadRequest, type WorkerMessage } from './protocol'

function post(message: WorkerMessage, transfer: Transferable[] = []): void {
  self.postMessage(message, { transfer })
}

/** Fetch as text, reporting progress as bytes arrive. */
async function download(url: string, onProgress: (fraction: number) => void): Promise<string> {
  const response = await fetch(url)
  if (!response.ok)
    throw new Error(`Could not download the map (${response.status} ${response.statusText})`)
  const reader = response.body?.getReader()
  if (!reader) return response.text()

  // Content-Length is the compressed size when the server gzips, so it is only a rough
  // guide; fall back to a typical zone size and never report more than "nearly there".
  const expected = Number(response.headers.get('Content-Length')) || 600_000
  const decoder = new TextDecoder()
  let received = 0
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    text += decoder.decode(value, { stream: true })
    onProgress(Math.min(0.95, received / expected))
  }
  return text + decoder.decode()
}

function chunkBuildings(
  file: ZoneFile,
): Map<string, { cx: number; cz: number; list: ZoneBuilding[] }> {
  const chunks = new Map<string, { cx: number; cz: number; list: ZoneBuilding[] }>()
  const size = CHUNK_SIZE * file.q
  for (const building of file.buildings) {
    // A building belongs to the chunk its first corner is in. Near enough, and stable.
    const cx = Math.floor(building.p[0] / size)
    const cz = Math.floor(building.p[1] / size)
    const key = `${cx},${cz}`
    const chunk = chunks.get(key)
    if (chunk) chunk.list.push(building)
    else chunks.set(key, { cx, cz, list: [building] })
  }
  return chunks
}

async function load(url: string): Promise<void> {
  const text = await download(url, (value) => post({ type: 'progress', stage: 'download', value }))
  const file = JSON.parse(text) as ZoneFile
  if (file.v !== ZONE_FORMAT_VERSION) {
    throw new Error(
      `Zone file is format v${file.v}, this build reads v${ZONE_FORMAT_VERSION}. Run "npm run osm:bake".`,
    )
  }
  post({ type: 'progress', stage: 'download', value: 1 })

  const started = performance.now()
  const transfer: Transferable[] = []

  const groups = [...chunkBuildings(file).values()]
  const chunks: BuildingChunk[] = []
  groups.forEach((group, i) => {
    const mesh = buildBuildingMesh(group.list, file.q)
    chunks.push({ cx: group.cx, cz: group.cz, buildings: group.list.length, mesh })
    transfer.push(
      mesh.positions.buffer,
      mesh.normals.buffer,
      mesh.colors.buffer,
      mesh.uvs.buffer,
      mesh.facades.buffer,
      mesh.indices.buffer,
    )
    post({ type: 'progress', stage: 'buildings', value: (i + 1) / groups.length })
  })

  const ground = buildGroundMesh(file)
  post({ type: 'progress', stage: 'roads', value: 0.7 })
  const raised = buildRaisedRoads(file)
  post({ type: 'progress', stage: 'roads', value: 1 })
  for (const mesh of [ground, raised]) {
    transfer.push(
      mesh.positions.buffer,
      mesh.normals.buffer,
      mesh.colors.buffer,
      mesh.indices.buffer,
    )
  }

  const trees = scatterTrees(file)
  transfer.push(trees.buffer)
  post({ type: 'progress', stage: 'trees', value: 0.4 })
  const treeChunks = buildTreeChunks(trees)
  for (const chunk of treeChunks) {
    for (const mesh of [chunk.wood, chunk.leaves]) {
      transfer.push(
        mesh.positions.buffer,
        mesh.normals.buffer,
        mesh.colors.buffer,
        mesh.indices.buffer,
      )
    }
  }
  post({ type: 'progress', stage: 'trees', value: 1 })

  post(
    {
      type: 'done',
      file,
      geometry: { chunks, ground, raised, trees, treeChunks },
      buildMs: performance.now() - started,
    },
    transfer,
  )
}

self.onmessage = (event: MessageEvent<LoadRequest>) => {
  if (event.data?.type !== 'load') return
  load(event.data.url).catch((error: unknown) => {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  })
}
