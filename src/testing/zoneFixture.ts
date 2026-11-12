/**
 * The baked CBD zone, for tests. (The game itself fetches it in a worker.)
 *
 * `?raw` asks Vite for the file's text, which keeps this module free of Node APIs and
 * stops TypeScript from trying to infer a type for half a megabyte of JSON.
 */
import raw from '../../data/zones/nairobi-cbd.json?raw'
import type { ZoneFile } from '../world/zone/format'

let cached: ZoneFile | undefined

export function loadBakedZone(): ZoneFile {
  cached ??= JSON.parse(raw) as ZoneFile
  return cached
}
