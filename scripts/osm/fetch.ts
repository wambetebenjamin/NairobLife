/**
 * Step 1 of the map pipeline: download a zone's raw OpenStreetMap data.
 *
 *   npm run osm:fetch                 fetch every zone that has no raw data yet
 *   npm run osm:fetch -- westlands    fetch (or refresh) the named zones
 *   npm run osm:fetch -- --all        refresh everything
 *
 * The result is saved to data/osm/<zone>.osm.json.gz and committed, so that building the
 * game never depends on a third-party server being up. Run `npm run osm:bake` afterwards
 * to turn it into the file the game loads.
 *
 * Data comes from the Overpass API, a free public service: one request per zone, with a
 * polite pause between zones, and a fall back to mirror servers if one is busy.
 *
 * Data (c) OpenStreetMap contributors, ODbL 1.0: https://www.openstreetmap.org/copyright
 */
import { pathToFileURL } from 'node:url'
import { GAME_NAME, REPO_URL } from '../../src/config/game'
import { ZONES, type ZoneDef } from '../../src/config/zones'
import type { BBox } from '../../src/core/geo'
import { hasRaw, writeRaw, type OverpassJson } from './lib/osm'

/** Public Overpass servers, tried in order. Override with OVERPASS_URL=https://... */
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

/** Extra margin around the zone, in degrees (about 130 m), so features on the edge arrive whole. */
const MARGIN_DEG = 0.0012
const TIMEOUT_SECONDS = 180
const PAUSE_BETWEEN_ZONES_MS = 5000

/**
 * Everything the bake step knows how to use. Ways and relations are fetched with all of
 * their nodes (`>;`), so shapes that cross the box edge are complete and the bake can
 * clip them cleanly.
 */
export function overpassQuery(bbox: BBox): string {
  const box = [
    bbox.south - MARGIN_DEG,
    bbox.west - MARGIN_DEG,
    bbox.north + MARGIN_DEG,
    bbox.east + MARGIN_DEG,
  ]
    .map((value) => value.toFixed(5))
    .join(',')
  return `
[out:json][timeout:${TIMEOUT_SECONDS}][bbox:${box}];
(
  way["building"];
  way["building:part"];
  relation["building"];
  relation["building:part"];
  way["highway"];
  way["railway"~"^(rail|light_rail|tram|narrow_gauge)$"];
  way["waterway"~"^(river|stream|canal|drain|riverbank)$"];
  way["natural"~"^(water|wood|scrub|grassland|tree_row)$"];
  relation["natural"~"^(water|wood)$"];
  way["landuse"~"^(grass|forest|meadow|recreation_ground|village_green|cemetery|commercial|retail|education)$"];
  relation["landuse"~"^(grass|forest|recreation_ground)$"];
  way["leisure"~"^(park|garden|nature_reserve|pitch|playground|track|swimming_pool|stadium|sports_centre|golf_course)$"];
  relation["leisure"~"^(park|garden|nature_reserve)$"];
  way["amenity"~"^(parking|fountain|university|college|school|hospital|marketplace|bus_station)$"];
  relation["amenity"~"^(university|college|school|hospital)$"];
  way["place"~"^(square|neighbourhood|suburb|quarter)$"];
  way["highway"="pedestrian"]["area"="yes"];
  node["natural"="tree"];
  node["highway"~"^(bus_stop|traffic_signals|street_lamp)$"];
  node["amenity"~"^(bus_station|fuel|fountain)$"];
  node["public_transport"="platform"];
  node["tourism"~"^(attraction|artwork|viewpoint|museum)$"];
  node["historic"];
  node["place"~"^(square|neighbourhood|suburb|quarter)$"];
);
out body;
>;
out skel qt;
`.trim()
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function download(zone: ZoneDef): Promise<OverpassJson> {
  const endpoints = process.env.OVERPASS_URL ? [process.env.OVERPASS_URL] : ENDPOINTS
  const body = new URLSearchParams({ data: overpassQuery(zone.bbox) })
  const failures: string[] = []

  for (const endpoint of endpoints) {
    const host = new URL(endpoint).host
    try {
      process.stdout.write(`  ${zone.id}: asking ${host} ... `)
      const response = await fetch(endpoint, {
        method: 'POST',
        body,
        headers: {
          // Overpass operators ask for a User-Agent that says who is calling.
          'User-Agent': `${GAME_NAME} map pipeline (${REPO_URL})`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout((TIMEOUT_SECONDS + 30) * 1000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
      const json = (await response.json()) as OverpassJson & { remark?: string }
      // Overpass reports a query that ran out of time or memory in a "remark", with HTTP 200.
      if (json.remark && /error/i.test(json.remark)) throw new Error(json.remark)
      if (!Array.isArray(json.elements) || json.elements.length === 0) {
        throw new Error('the server returned no map data')
      }
      console.log(`${json.elements.length.toLocaleString()} elements`)
      return json
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(`failed (${message})`)
      failures.push(`${host}: ${message}`)
    }
  }
  throw new Error(
    `Could not download "${zone.id}" from any Overpass server:\n    ${failures.join('\n    ')}`,
  )
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const all = args.includes('--all')
  const asked = args.filter((arg) => !arg.startsWith('-'))

  const unknown = asked.filter((id) => !ZONES.some((zone) => zone.id === id))
  if (unknown.length) {
    throw new Error(`Unknown zone: ${unknown.join(', ')}. Zones are listed in src/config/zones.ts.`)
  }

  // With no arguments, never overwrite data that is already there: a refresh changes the
  // map, and that should be something you asked for.
  const zones = asked.length
    ? ZONES.filter((zone) => asked.includes(zone.id))
    : ZONES.filter((zone) => zone.status === 'live' && (all || !hasRaw(zone.id)))

  if (zones.length === 0) {
    console.log('Every live zone already has raw data in data/osm/. Nothing to fetch.')
    console.log('To refresh from OpenStreetMap: npm run osm:fetch -- --all')
    return
  }

  console.log(`Fetching ${zones.length} zone(s) from OpenStreetMap via the Overpass API`)
  for (const [i, zone] of zones.entries()) {
    if (i > 0) await sleep(PAUSE_BETWEEN_ZONES_MS)
    const json = await download(zone)
    const { path, bytes } = writeRaw(zone.id, json)
    const stamp = json.osm3s?.timestamp_osm_base ?? 'unknown date'
    console.log(
      `  ${zone.id}: saved ${path} (${Math.round(bytes / 1024)} KB, OSM data as of ${stamp})`,
    )
  }
  console.log('Done. Next: npm run osm:bake')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
