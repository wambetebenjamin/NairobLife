/**
 * Splitting a zone's buildings into square chunks.
 *
 * Lives on its own because two very different callers need it and they must agree:
 *
 *   world/zone/zoneWorker.ts   builds one culled mesh per chunk for the game
 *   scripts/osm/export-gltf.ts writes one node per chunk for Blender / UE5 / glTF viewers
 *
 * If the rule drifted, the exported city would be carved up differently from the one
 * people play, and a bug hunt would have to start by deciding which of the two was wrong.
 */
import { CHUNK_SIZE } from './protocol'
import type { ZoneFile } from './format'
import type { ZoneBuilding } from './format'

export interface BuildingChunkGroup {
  cx: number
  cz: number
  list: ZoneBuilding[]
}

/** Bucket buildings by the chunk their first corner falls in. */
export function groupBuildingsByChunk(
  file: Pick<ZoneFile, 'buildings' | 'q'>,
): Map<string, BuildingChunkGroup> {
  const chunks = new Map<string, BuildingChunkGroup>()
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
