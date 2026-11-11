/**
 * OpenStreetMap data as the Overpass API returns it (`[out:json]`), plus the helpers to
 * load a raw extract from data/osm/ and index it.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'

export type Tags = Record<string, string>

export interface OsmNode {
  type: 'node'
  id: number
  lat: number
  lon: number
  tags?: Tags
}

export interface OsmWay {
  type: 'way'
  id: number
  nodes: number[]
  tags?: Tags
}

export interface OsmMember {
  type: 'node' | 'way' | 'relation'
  ref: number
  role: string
}

export interface OsmRelation {
  type: 'relation'
  id: number
  members: OsmMember[]
  tags?: Tags
}

export type OsmElement = OsmNode | OsmWay | OsmRelation

export interface OverpassJson {
  version?: number
  generator?: string
  osm3s?: { timestamp_osm_base?: string; copyright?: string }
  elements: OsmElement[]
}

export interface OsmData {
  nodes: Map<number, OsmNode>
  ways: Map<number, OsmWay>
  relations: Map<number, OsmRelation>
  generator: string
  timestamp?: string
}

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
export const RAW_DIR = resolve(REPO_ROOT, 'data/osm')
export const ZONES_DIR = resolve(REPO_ROOT, 'data/zones')

/** The committed, compressed extract for a zone. */
export function rawGzPath(zoneId: string): string {
  return resolve(RAW_DIR, `${zoneId}.osm.json.gz`)
}

/** An uncompressed copy next to it, if you want to poke at the data (git-ignored). */
export function rawJsonPath(zoneId: string): string {
  return resolve(RAW_DIR, `${zoneId}.osm.json`)
}

export function hasRaw(zoneId: string): boolean {
  return existsSync(rawGzPath(zoneId)) || existsSync(rawJsonPath(zoneId))
}

/** Reads whichever of <zone>.osm.json / <zone>.osm.json.gz is newer. */
export function readRaw(zoneId: string): OverpassJson {
  const gz = rawGzPath(zoneId)
  const plain = rawJsonPath(zoneId)
  const gzTime = existsSync(gz) ? statSync(gz).mtimeMs : -1
  const plainTime = existsSync(plain) ? statSync(plain).mtimeMs : -1
  if (gzTime < 0 && plainTime < 0) {
    throw new Error(
      `No raw OSM extract for zone "${zoneId}". Expected ${gz}\nRun: npm run osm:fetch -- ${zoneId}`,
    )
  }
  const text =
    plainTime > gzTime ? readFileSync(plain, 'utf8') : gunzipSync(readFileSync(gz)).toString('utf8')
  const json = JSON.parse(text) as OverpassJson
  if (!Array.isArray(json.elements)) {
    throw new Error(`${zoneId}: not an Overpass JSON document (no "elements" array)`)
  }
  return json
}

export function writeRaw(zoneId: string, json: OverpassJson): { path: string; bytes: number } {
  mkdirSync(RAW_DIR, { recursive: true })
  const path = rawGzPath(zoneId)
  const gz = gzipSync(Buffer.from(JSON.stringify(json)), { level: 9 })
  writeFileSync(path, gz)
  return { path, bytes: gz.length }
}

/**
 * Index by id. Overpass can list an element twice (once with tags, once as a bare
 * skeleton when it is also a member of something), so the tagged copy wins.
 */
export function indexOsm(json: OverpassJson): OsmData {
  const nodes = new Map<number, OsmNode>()
  const ways = new Map<number, OsmWay>()
  const relations = new Map<number, OsmRelation>()
  for (const el of json.elements) {
    const map = (el.type === 'node' ? nodes : el.type === 'way' ? ways : relations) as Map<
      number,
      OsmElement
    >
    const seen = map.get(el.id)
    if (!seen || (!seen.tags && el.tags)) map.set(el.id, el)
  }
  return {
    nodes,
    ways,
    relations,
    generator: json.generator ?? 'unknown',
    timestamp: json.osm3s?.timestamp_osm_base,
  }
}

/** A closed way: at least a triangle, ending on the node it started from. */
export function isClosed(way: OsmWay): boolean {
  return way.nodes.length >= 4 && way.nodes[0] === way.nodes[way.nodes.length - 1]
}

/**
 * Stitch the member ways of a multipolygon into closed rings of node ids
 * (first id repeated at the end). Members that never close are dropped.
 */
export function assembleRings(ways: readonly OsmWay[]): number[][] {
  const rings: number[][] = []
  const pool = ways.filter((w) => w.nodes.length >= 2).map((w) => w.nodes.slice())
  while (pool.length) {
    let ring = pool.shift()!
    let grew = true
    while (grew && ring[0] !== ring[ring.length - 1]) {
      grew = false
      for (let i = 0; i < pool.length; i++) {
        const seg = pool[i]
        const head = ring[0]
        const tail = ring[ring.length - 1]
        if (seg[0] === tail) ring = ring.concat(seg.slice(1))
        else if (seg[seg.length - 1] === tail) ring = ring.concat(seg.slice(0, -1).reverse())
        else if (seg[seg.length - 1] === head) ring = seg.slice(0, -1).concat(ring)
        else if (seg[0] === head) ring = seg.slice(1).reverse().concat(ring)
        else continue
        pool.splice(i, 1)
        grew = true
        break
      }
    }
    if (ring.length >= 4 && ring[0] === ring[ring.length - 1]) rings.push(ring)
  }
  return rings
}
