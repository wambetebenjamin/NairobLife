/**
 * npm run osm:bake [-- <zone-id> ...]
 *
 * Bakes a raw OpenStreetMap extract (data/osm/<zone>.osm.json.gz, Overpass JSON) into the
 * compact file the game loads (data/zones/<zone>.json; format in src/world/zone/format.ts).
 *
 *   raw OSM  ->  classify by tags  ->  project to world metres  ->  clip to the zone
 *            ->  resolve building heights and 3D parts  ->  raise bridges, add ramps
 *            ->  simplify, quantise to decimetres  ->  JSON
 *
 * It runs offline and is deterministic: the same raw extract always gives the same file.
 * With no arguments it bakes every zone that has a raw extract.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { ZONES, WORLD_ORIGIN, getZone, type ZoneDef } from '../../src/config/zones'
import { createProjection } from '../../src/core/geo'
import {
  cleanRing,
  clipRingToRect,
  pointInRing,
  rectContains,
  reverseRing,
  ringCentroid,
  signedArea,
  type Rect,
} from '../../src/core/geom2d'
import {
  OSM_ATTRIBUTION,
  Q,
  ZONE_FORMAT_VERSION,
  type ZoneArea,
  type ZoneBuilding,
  type ZoneFile,
  type ZoneLine,
  type ZonePlace,
  type ZonePoi,
  type RoofShape,
  type ZoneRoad,
} from '../../src/world/zone/format'
import { LANDMARK_OVERRIDES } from './landmarks'
import { computeElevations, type ElevWay } from './lib/elevation'
import { LEVEL_HEIGHT, createHeightEstimator, taggedHeight, type KnownHeight } from './lib/heights'
import { clipLine, lineLength, simplifyLine, simplifyRing, type P3 } from './lib/lines'
import {
  ZONES_DIR,
  assembleRings,
  hasRaw,
  indexOsm,
  isClosed,
  readRaw,
  type OsmData,
  type OsmWay,
  type Tags,
} from './lib/osm'
import {
  areaKind,
  cleanName,
  isNamedPlace,
  parseColour,
  parseMetres,
  poiKind,
  roadInfo,
  type RoadInfo,
} from './lib/tags'

const VERBOSE = process.argv.includes('--verbose')
const quant = (metres: number) => Math.round(metres * Q)
const round1 = (n: number) => Math.round(n * 10) / 10

interface Polygon {
  outer: number[]
  holes: number[][]
}

interface RawBuilding extends Polygon {
  id: number
  tags: Tags
  isPart: boolean
  area: number
  cx: number
  cz: number
  h: number
  base: number
  est: boolean
  /** Height of the roof shape (roof:height), included in h. */
  roofH: number
  name?: string
  skip?: boolean
}

/** OSM roof:shape values we can build. Everything else gets a flat roof. */
const ROOF_SHAPES: Record<string, RoofShape> = {
  cone: 'cone',
  pyramidal: 'cone',
  dome: 'dome',
  onion: 'dome',
}

export function bakeZone(zone: ZoneDef, osm: OsmData): ZoneFile {
  const proj = createProjection(WORLD_ORIGIN)
  const [minX, minZ] = proj.toWorld(zone.bbox.north, zone.bbox.west)
  const [maxX, maxZ] = proj.toWorld(zone.bbox.south, zone.bbox.east)
  const rect: Rect = { minX, minZ, maxX, maxZ }

  // Project every node once.
  const pos = new Map<number, [number, number]>()
  for (const node of osm.nodes.values()) pos.set(node.id, proj.toWorld(node.lat, node.lon))

  /** Node ids of a closed ring -> flat open ring in metres, or undefined if nodes are missing. */
  const ringFromNodes = (ids: readonly number[]): number[] | undefined => {
    const out: number[] = []
    const n = ids[0] === ids[ids.length - 1] ? ids.length - 1 : ids.length
    for (let i = 0; i < n; i++) {
      const p = pos.get(ids[i])
      if (!p) return undefined
      out.push(p[0], p[1])
    }
    return out.length >= 6 ? out : undefined
  }

  /** Outer rings wound positive, holes negative, as the zone format requires. */
  const orient = (ring: number[], positive: boolean) =>
    signedArea(ring) > 0 === positive ? ring : reverseRing(ring)

  /** Polygons of a way (one ring) or a multipolygon relation (outers with their holes). */
  const polygonsOfWay = (way: OsmWay): Polygon[] => {
    if (!isClosed(way)) return []
    const ring = ringFromNodes(way.nodes)
    return ring ? [{ outer: orient(ring, true), holes: [] }] : []
  }
  const polygonsOfRelation = (
    members: { type: string; ref: number; role: string }[],
  ): Polygon[] => {
    const waysWithRole = (inner: boolean) =>
      members
        .filter((m) => m.type === 'way' && (m.role === 'inner') === inner)
        .map((m) => osm.ways.get(m.ref))
        .filter((w): w is OsmWay => !!w)
    const outers = assembleRings(waysWithRole(false))
      .map(ringFromNodes)
      .filter((r): r is number[] => !!r)
    const inners = assembleRings(waysWithRole(true))
      .map(ringFromNodes)
      .filter((r): r is number[] => !!r)
    return outers.map((outer) => ({
      outer: orient(outer, true),
      holes: inners
        .filter((hole) => pointInRing(hole[0], hole[1], outer))
        .map((hole) => orient(hole, false)),
    }))
  }

  /** Simplify, quantise and validate a ring. Returns undefined if it collapses. */
  const packRing = (ring: number[], tolerance: number, minArea: number): number[] | undefined => {
    const packed = cleanRing(simplifyRing(ring, tolerance).map(quant))
    if (packed.length < 6) return undefined
    return Math.abs(signedArea(packed)) / (Q * Q) >= minArea ? packed : undefined
  }

  // =================================================================== buildings
  // Deliberately not a type guard: "not a building" must not narrow the tags away.
  const isBuildingTags = (t: Tags | undefined): boolean =>
    !!t &&
    ((!!t.building && t.building !== 'no') || (!!t['building:part'] && t['building:part'] !== 'no'))

  const raw: RawBuilding[] = []
  const addBuilding = (id: number, tags: Tags, poly: Polygon) => {
    const area =
      signedArea(poly.outer) - poly.holes.reduce((sum, hole) => sum + Math.abs(signedArea(hole)), 0)
    const [cx, cz] = ringCentroid(poly.outer)
    if (!rectContains(rect, cx, cz)) return
    if (tags.location === 'underground') return
    raw.push({
      ...poly,
      id,
      tags,
      // A way can be both an outline and a part; anything tagged as a part is drawn.
      isPart: !!tags['building:part'] && tags['building:part'] !== 'no',
      area,
      cx,
      cz,
      h: 0,
      base: 0,
      est: false,
      roofH: 0,
      name: cleanName(tags.name),
    })
  }

  const waysInBuildingRelations = new Set<number>()
  for (const rel of osm.relations.values()) {
    const tags = rel.tags
    if (!tags || !isBuildingTags(tags)) continue
    for (const m of rel.members) if (m.type === 'way') waysInBuildingRelations.add(m.ref)
    for (const poly of polygonsOfRelation(rel.members)) addBuilding(rel.id, tags, poly)
  }
  for (const way of osm.ways.values()) {
    const tags = way.tags
    if (!tags || !isBuildingTags(tags) || waysInBuildingRelations.has(way.id)) continue
    for (const poly of polygonsOfWay(way)) addBuilding(way.id, tags, poly)
  }

  // ---- heights: tagged first, then estimates that lean on the tagged neighbours
  const buildingType = (t: Tags): string | undefined => {
    const type = t.building && t.building !== 'yes' ? t.building : undefined
    if (t.amenity === 'place_of_worship' && (!type || type === 'religious')) {
      return t.religion === 'muslim' ? 'mosque' : t.religion === 'hindu' ? 'temple' : 'church'
    }
    return type
  }
  const known: KnownHeight[] = []
  for (const b of raw) {
    const tagged = taggedHeight(b.tags)
    b.base = tagged.base
    if (tagged.h !== undefined) {
      b.h = tagged.h
      known.push({ x: b.cx, z: b.cz, levels: tagged.levels ?? Math.round(tagged.h / LEVEL_HEIGHT) })
    }
    const override = LANDMARK_OVERRIDES[b.id]
    if (override) {
      if (override.base !== undefined) b.base = override.base
      if (override.h !== undefined) b.h = override.h
    }
  }
  const estimate = createHeightEstimator(known)
  for (const b of raw) {
    const roofHeight = ROOF_SHAPES[b.tags['roof:shape'] ?? '']
      ? parseMetres(b.tags['roof:height'])
      : undefined
    if (roofHeight && roofHeight > 0) b.roofH = roofHeight
    if (b.h > 0) continue
    // A shaped roof with a known height (the KICC amphitheatre's cone) on one tall storey.
    b.h = b.roofH
      ? b.base + b.roofH + 5
      : b.base + estimate({ id: b.id, type: buildingType(b.tags), area: b.area, x: b.cx, z: b.cz })
    b.est = true
  }

  // ---- 3D parts (OSM "Simple 3D Buildings")
  // A landmark is often mapped twice: once as an outline, and again as building:part
  // pieces that give its real shape. Drawing both would put one inside the other.
  //  - Parts standing on the ground cover most of the outline: the parts are the building;
  //    drop the outline and hand its name to the tallest part.
  //  - Otherwise the outline is the building (the Hilton's podium, with only the round
  //    tower mapped as a part): keep it, and drop any part hidden inside its volume.
  //  - Parts floating above the ground inside a kept outline (the collar near the top of
  //    Times Tower) mean the outline is the shaft below them: lower it to meet them.
  const parts = raw.filter((b) => b.isPart)
  let outlinesReplaced = 0
  let partsHidden = 0
  for (const outline of raw) {
    if (outline.isPart || LANDMARK_OVERRIDES[outline.id]?.keepOutline) continue
    const inside = parts.filter((p) => !p.skip && pointInRing(p.cx, p.cz, outline.outer))
    if (inside.length === 0) continue
    const grounded = inside.filter((p) => p.base < 1)
    const covered = coverage(
      outline.outer,
      grounded.map((p) => p.outer),
    )
    if (covered >= 0.5) {
      outline.skip = true
      outlinesReplaced++
      const tallest = inside.reduce((a, b) => (b.h > a.h ? b : a))
      if (outline.name && !tallest.name) tallest.name = outline.name
      // The outline's explicit `height` is the landmark's true height: parts with no height
      // of their own inherit it, and parts that only gave a floor count may not exceed it.
      const outlineHeight = parseMetres(outline.tags.height)
      for (const p of inside) {
        if (LANDMARK_OVERRIDES[p.id]) continue
        if (p.est && !outline.est) {
          p.h = Math.max(p.base + LEVEL_HEIGHT, outline.h)
          p.est = false
        } else if (outlineHeight && parseMetres(p.tags.height) === undefined) {
          p.h = Math.min(p.h, outlineHeight)
        }
      }
    } else {
      const floating = inside.filter(
        (p) => p.base >= 1 && p.base < outline.h && p.base > outline.h * 0.5,
      )
      if (floating.length) outline.h = Math.min(...floating.map((p) => p.base))
      for (const p of inside) {
        if (p.base < 1 && p.h <= outline.h + 0.5) {
          p.skip = true
          partsHidden++
        }
      }
    }
    if (VERBOSE) {
      console.log(
        `    [parts] ${outline.skip ? 'replaced' : 'kept    '} ${outline.id} "${outline.name ?? ''}" ` +
          `${Math.round(outline.area)} m², ${round1(outline.h)} m${outline.est ? ' (est)' : ''}, ` +
          `${Math.round(covered * 100)}% covered at ground by ` +
          `${inside.map((p) => `${p.id}${p.skip ? ' (hidden)' : ''} ${round1(p.base)}-${round1(p.h)} m`).join(', ')}`,
      )
    }
  }

  const buildings: ZoneBuilding[] = []
  for (const b of raw) {
    if (b.skip) continue
    // Needle-thin parts are antenna masts: keep them, but anything under 0.3 m² is noise.
    const outer = packRing(b.outer, 0.06, 0.3)
    if (!outer) continue
    const holes = b.holes.map((hole) => packRing(hole, 0.06, 1)).filter((r): r is number[] => !!r)
    const out: ZoneBuilding = { id: b.id, p: outer, h: round1(b.h) }
    if (holes.length) out.hs = holes
    if (b.base > 0) out.b = round1(b.base)
    if (b.name) out.n = b.name
    const type = buildingType(b.tags)
    if (type && /^[a-z_]+$/.test(type)) out.t = type
    const roof = ROOF_SHAPES[b.tags['roof:shape'] ?? '']
    if (roof) {
      out.rs = roof
      out.rh = round1(Math.min(b.roofH || (b.h - b.base) * 0.5, b.h - b.base))
    }
    const colour = parseColour(b.tags['building:colour'])
    if (colour) out.c = colour
    const roofColour = parseColour(b.tags['roof:colour'])
    if (roofColour) out.rc = roofColour
    if (b.est) out.est = 1
    buildings.push(out)
  }

  // =================================================================== roads
  interface RawRoad {
    way: OsmWay
    info: RoadInfo
    xs: number[]
    zs: number[]
  }
  const rawRoads: RawRoad[] = []
  const elevWays: ElevWay[] = []
  const rawRails: { xs: number[]; zs: number[] }[] = []
  let tunnelsSkipped = 0

  const coordsOf = (way: OsmWay): { xs: number[]; zs: number[] } | undefined => {
    const xs: number[] = []
    const zs: number[] = []
    for (const id of way.nodes) {
      const p = pos.get(id)
      if (!p) return undefined
      xs.push(p[0])
      zs.push(p[1])
    }
    return xs.length >= 2 ? { xs, zs } : undefined
  }

  for (const way of osm.ways.values()) {
    const tags = way.tags
    if (!tags) continue
    if (tags.highway) {
      const info = roadInfo(tags)
      const coords = info && coordsOf(way)
      if (!info || !coords) continue
      elevWays.push({ id: way.id, nodeIds: way.nodes, ...coords, info })
      if (info.tunnel) {
        tunnelsSkipped++ // TODO(underpasses): pedestrian subways under Uhuru Highway
        continue
      }
      rawRoads.push({ way, info, ...coords })
    } else if (
      tags.railway === 'rail' ||
      tags.railway === 'light_rail' ||
      tags.railway === 'narrow_gauge'
    ) {
      const coords = coordsOf(way)
      if (!coords || (tags.tunnel && tags.tunnel !== 'no')) continue
      elevWays.push({ id: way.id, nodeIds: way.nodes, ...coords })
      rawRails.push(coords)
    }
  }

  const { nodeHeight, decks } = computeElevations(elevWays)

  // Junction nodes must survive simplification so roads keep meeting exactly
  // (traffic, in Phase 3, rebuilds the road graph from shared end points).
  const nodeUse = new Map<number, number>()
  for (const { way } of rawRoads) {
    for (const id of new Set(way.nodes)) nodeUse.set(id, (nodeUse.get(id) ?? 0) + 1)
  }

  const roads: ZoneRoad[] = []
  for (const { way, info, xs, zs } of rawRoads) {
    const line: P3[] = way.nodes.map((id, i) => ({
      x: xs[i],
      z: zs[i],
      e: nodeHeight.get(id) ?? 0,
      keep: (nodeUse.get(id) ?? 0) > 1,
    }))
    for (const piece of clipLine(simplifyLine(line, 0.2), rect)) {
      if (lineLength(piece) < 1) continue
      const p: number[] = []
      const e: number[] = []
      for (const pt of piece) {
        const qx = quant(pt.x)
        const qz = quant(pt.z)
        if (p.length >= 2 && p[p.length - 2] === qx && p[p.length - 1] === qz) continue
        p.push(qx, qz)
        e.push(quant(pt.e))
      }
      if (p.length < 4) continue
      const road: ZoneRoad = { k: info.kind, p, w: info.width }
      if (info.name) road.n = info.name
      if (info.oneway) road.ow = 1
      if (info.lanes) road.ln = info.lanes
      if (info.link) road.lk = 1
      if (info.maxspeed) road.ms = info.maxspeed
      const top = Math.max(...e)
      if (top > 0) {
        road.e = e
        if (decks.has(way.id) && top > 0.5 * Q) road.br = 1
      }
      roads.push(road)
    }
  }

  const packLines = (
    lines: { xs: number[]; zs: number[]; w: number; n?: string }[],
  ): ZoneLine[] => {
    const out: ZoneLine[] = []
    for (const { xs, zs, w, n } of lines) {
      const line: P3[] = xs.map((x, i) => ({ x, z: zs[i], e: 0 }))
      for (const piece of clipLine(simplifyLine(line, 0.25), rect)) {
        const p = cleanRingOpen(piece.flatMap((pt) => [quant(pt.x), quant(pt.z)]))
        if (p.length >= 4) out.push(n ? { p, w, n } : { p, w })
      }
    }
    return out
  }
  const rails = packLines(rawRails.map((r) => ({ ...r, w: 3 })))

  const WATERWAY_WIDTH: Record<string, number> = {
    river: 9,
    canal: 6,
    stream: 3,
    drain: 2,
    ditch: 1.5,
  }
  const rawWaterways: { xs: number[]; zs: number[]; w: number; n?: string }[] = []
  for (const way of osm.ways.values()) {
    const kind = way.tags?.waterway
    if (
      !kind ||
      !(kind in WATERWAY_WIDTH) ||
      way.tags?.tunnel === 'yes' ||
      way.tags?.tunnel === 'culvert'
    )
      continue
    const coords = coordsOf(way)
    if (coords) {
      rawWaterways.push({
        ...coords,
        w: parseMetres(way.tags?.width) ?? WATERWAY_WIDTH[kind],
        n: cleanName(way.tags?.name),
      })
    }
  }
  const waterways = packLines(rawWaterways)

  // =================================================================== ground cover + named places
  const areas: ZoneArea[] = []
  const placeMap = new Map<string, ZonePlace>()
  const pois: ZonePoi[] = []

  const makePoi = (k: ZonePoi['k'], x: number, z: number, tags: Tags): ZonePoi => {
    const poi: ZonePoi = { k, x: quant(x), z: quant(z) }
    const name = cleanName(tags.name)
    if (name) poi.n = name
    const route = cleanName(tags.network ?? tags.route_ref ?? tags.operator)
    if (k === 'stage' && route && route !== name) poi.r = route
    return poi
  }

  const addSurface = (tags: Tags, polys: Polygon[]) => {
    const kind = areaKind(tags)
    const name = cleanName(tags.name)
    for (const poly of polys) {
      if (kind) {
        const clipped = clipRingToRect(poly.outer, rect)
        const outer = clipped.length ? packRing(orient(clipped, true), 0.3, 4) : undefined
        if (outer) {
          const holes = poly.holes
            .map((hole) => clipRingToRect(hole, rect))
            .filter((hole) => hole.length)
            .map((hole) => packRing(orient(hole, false), 0.3, 2))
            .filter((r): r is number[] => !!r)
          const area: ZoneArea = { k: kind, p: outer }
          if (holes.length) area.hs = holes
          if (name && kind !== 'parking') area.n = name
          areas.push(area)
        }
      }
      if (name && isNamedPlace(tags)) {
        const [cx, cz] = ringCentroid(poly.outer)
        const p = packRing(poly.outer, 1.5, 1000)
        if (p && rectContains(rect, cx, cz)) {
          const a = Math.round(Math.abs(signedArea(p)) / (Q * Q))
          const key = `${name}|${Math.round(a / 500)}`
          if (!placeMap.has(key)) placeMap.set(key, { n: name, p, a })
        }
      }
      // Stations and filling stations mapped as areas still want a marker.
      const poi = poiKind(tags)
      if (poi === 'stage' || poi === 'fuel') {
        const [cx, cz] = ringCentroid(poly.outer)
        if (rectContains(rect, cx, cz)) pois.push(makePoi(poi, cx, cz, tags))
      }
    }
  }

  const waysInAreaRelations = new Set<number>()
  for (const rel of osm.relations.values()) {
    if (!rel.tags || isBuildingTags(rel.tags) || (!areaKind(rel.tags) && !isNamedPlace(rel.tags)))
      continue
    if (rel.tags.type !== 'multipolygon' && rel.tags.type !== 'boundary') continue
    for (const m of rel.members) if (m.type === 'way') waysInAreaRelations.add(m.ref)
    addSurface(rel.tags, polygonsOfRelation(rel.members))
  }
  for (const way of osm.ways.values()) {
    const tags = way.tags
    if (!tags || isBuildingTags(tags) || !isClosed(way)) continue
    if (tags.highway && tags.area !== 'yes') continue
    if (waysInAreaRelations.has(way.id) && !areaKind(tags)) continue
    addSurface(tags, polygonsOfWay(way))
  }
  const places = [...placeMap.values()].sort((a, b) => a.a - b.a)

  // =================================================================== trees + points of interest
  const trees: number[] = []
  for (const node of osm.nodes.values()) {
    const tags = node.tags
    if (!tags) continue
    const [x, z] = pos.get(node.id)!
    if (!rectContains(rect, x, z)) continue
    if (tags.natural === 'tree') {
      trees.push(quant(x), quant(z))
      continue
    }
    const kind = poiKind(tags)
    if (kind) pois.push(makePoi(kind, x, z, tags))
  }
  for (const way of osm.ways.values()) {
    if (way.tags?.natural !== 'tree_row') continue
    const coords = coordsOf(way)
    if (!coords) continue
    const SPACING = 9
    let carried = 0
    for (let i = 0; i < coords.xs.length - 1; i++) {
      const dx = coords.xs[i + 1] - coords.xs[i]
      const dz = coords.zs[i + 1] - coords.zs[i]
      const len = Math.hypot(dx, dz)
      let d = carried
      for (; d < len; d += SPACING) {
        const x = coords.xs[i] + (dx * d) / len
        const z = coords.zs[i] + (dz * d) / len
        if (rectContains(rect, x, z)) trees.push(quant(x), quant(z))
      }
      carried = d - len // how far into the next segment the next tree falls
    }
  }
  // The same stage is often mapped twice (stop + platform): keep one per spot and name.
  const seenPoi = new Set<string>()
  const uniquePois = pois.filter((p) => {
    const key = `${p.k}|${p.n ?? ''}|${Math.round(p.x / (3 * Q))}|${Math.round(p.z / (3 * Q))}`
    if (seenPoi.has(key)) return false
    seenPoi.add(key)
    return true
  })

  const file: ZoneFile = {
    v: ZONE_FORMAT_VERSION,
    id: zone.id,
    name: zone.name,
    origin: WORLD_ORIGIN,
    bbox: zone.bbox,
    bounds: [round1(minX), round1(minZ), round1(maxX), round1(maxZ)],
    q: Q,
    generated: osm.timestamp ?? osm.generator,
    attribution: OSM_ATTRIBUTION,
    buildings,
    roads,
    rails,
    waterways,
    areas,
    places,
    trees,
    pois: uniquePois,
  }

  const namedRoads = new Set(roads.map((r) => r.n).filter(Boolean))
  const raisedRoads = roads.filter((r) => r.e)
  console.log(
    [
      `  ${zone.id}: ${zone.name}`,
      `    extent        ${Math.round(maxX - minX)} m × ${Math.round(maxZ - minZ)} m`,
      `    buildings     ${buildings.length}  (${buildings.filter((b) => !b.est).length} with a real height, ${buildings.filter((b) => b.n).length} named, ${outlinesReplaced} outlines replaced by 3D parts, ${partsHidden} parts hidden inside outlines)`,
      `    tallest       ${[...buildings]
        .sort((a, b) => b.h - a.h)
        .slice(0, 4)
        .map((b) => `${b.n ?? '?'} ${b.h} m`)
        .join(', ')}`,
      `    roads         ${roads.length} pieces, ${namedRoads.size} street names, ${tunnelsSkipped} tunnels skipped`,
      `    raised roads  ${raisedRoads.length} (${raisedRoads.filter((r) => r.br).length} bridge decks, max ${Math.max(0, ...raisedRoads.flatMap((r) => r.e!)) / Q} m)`,
      `    rails         ${rails.length}   waterways ${waterways.length}`,
      `    ground cover  ${areas.length}  (${countBy(areas.map((a) => a.k))})`,
      `    places        ${places.length}   trees ${trees.length / 2}   pois ${uniquePois.length} (${countBy(uniquePois.map((p) => p.k))})`,
    ].join('\n'),
  )
  return file
}

/**
 * Fraction of a polygon covered by the union of some others, by sampling a grid.
 * Good to a couple of percent, which is all the 3D-parts rule needs.
 */
function coverage(outline: number[], covers: number[][]): number {
  if (covers.length === 0) return 0
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  for (let i = 0; i < outline.length; i += 2) {
    minX = Math.min(minX, outline[i])
    maxX = Math.max(maxX, outline[i])
    minZ = Math.min(minZ, outline[i + 1])
    maxZ = Math.max(maxZ, outline[i + 1])
  }
  const STEPS = 28
  let inside = 0
  let hit = 0
  for (let ix = 0; ix < STEPS; ix++) {
    for (let iz = 0; iz < STEPS; iz++) {
      const x = minX + ((ix + 0.5) / STEPS) * (maxX - minX)
      const z = minZ + ((iz + 0.5) / STEPS) * (maxZ - minZ)
      if (!pointInRing(x, z, outline)) continue
      inside++
      if (covers.some((ring) => pointInRing(x, z, ring))) hit++
    }
  }
  return inside ? hit / inside : 0
}

/** Drop consecutive duplicate points from an open polyline. */
function cleanRingOpen(line: number[]): number[] {
  const out: number[] = []
  for (let i = 0; i < line.length; i += 2) {
    const m = out.length
    if (m >= 2 && out[m - 2] === line[i] && out[m - 1] === line[i + 1]) continue
    out.push(line[i], line[i + 1])
  }
  return out
}

function countBy(items: string[]): string {
  const counts = new Map<string, number>()
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1)
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${n}`)
    .join(', ')
}

function main(): void {
  const asked = process.argv.slice(2).filter((arg) => !arg.startsWith('-'))
  const ids = asked.length ? asked : ZONES.filter((z) => hasRaw(z.id)).map((z) => z.id)
  if (ids.length === 0) {
    console.error('Nothing to bake: no raw extracts in data/osm/. Run `npm run osm:fetch` first.')
    process.exit(1)
  }
  mkdirSync(ZONES_DIR, { recursive: true })
  console.log('Baking zones')
  for (const id of ids) {
    const zone = getZone(id)
    const file = bakeZone(zone, indexOsm(readRaw(id)))
    const json = JSON.stringify(file)
    const path = resolve(ZONES_DIR, `${id}.json`)
    writeFileSync(path, json + '\n')
    const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`
    console.log(
      `    wrote         data/zones/${id}.json  ${kb(json.length)} (${kb(gzipSync(json).length)} gzipped)`,
    )
  }
}

// Run only when executed directly, so tests can import bakeZone().
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
