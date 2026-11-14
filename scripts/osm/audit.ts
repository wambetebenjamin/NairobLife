/**
 * Report how much of each zone's geometry is real and how much is estimated.
 *
 * The bake already flags every building it had to guess (`est: 1`), but nothing ever
 * summarised that, so it was impossible to see at a glance how much of the city is
 * observation and how much is our own filler. This prints it per zone, and per landmark.
 *
 *   npm run osm:audit                 audit the default zone
 *   npm run osm:audit -- westlands    audit named zones
 *   npm run osm:audit -- --all        audit every baked zone
 *   npm run osm:audit -- --named      also list named buildings that carry no height
 *
 * Exit code is 0 always: this is a report, not a gate.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEFAULT_ZONE_ID } from '../../src/config/zones'
import type { ZoneFile } from '../../src/world/zone/format'
import { ZONES_DIR } from './lib/osm'

const args = process.argv.slice(2)
const flags = args.filter((a) => a.startsWith('--'))
const names = args.filter((a) => !a.startsWith('--'))

function bakedZones(): string[] {
  if (!existsSync(ZONES_DIR)) return []
  return readdirSync(ZONES_DIR)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.preview.svg'))
    .map((f) => f.replace(/\.json$/, ''))
}

const which = flags.includes('--all') ? bakedZones() : names.length ? names : [DEFAULT_ZONE_ID]

/** Footprint area in square metres, from the quantised ring. */
function areaOf(p: number[], q: number): number {
  let sum = 0
  for (let i = 0; i < p.length; i += 2) {
    const x1 = p[i] / q
    const z1 = p[i + 1] / q
    const j = (i + 2) % p.length
    sum += x1 * (p[j + 1] / q) - (p[j] / q) * z1
  }
  return Math.abs(sum) / 2
}

const quantile = (sorted: number[], p: number) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0

const row = (label: string, values: number[]) => {
  const s = [...values].sort((a, b) => a - b)
  return (
    `  ${label.padEnd(10)} n ${String(s.length).padStart(5)}   ` +
    `median ${quantile(s, 0.5).toFixed(1).padStart(6)} m   ` +
    `p90 ${quantile(s, 0.9).toFixed(1).padStart(6)} m   ` +
    `max ${quantile(s, 1).toFixed(1).padStart(6)} m   ` +
    `over 60 m ${String(s.filter((v) => v > 60).length).padStart(3)}`
  )
}

for (const id of which) {
  const file = resolve(ZONES_DIR, `${id}.json`)
  if (!existsSync(file)) {
    console.error(`no baked zone at ${file} -- run npm run osm:bake -- ${id} first`)
    continue
  }
  const zone = JSON.parse(readFileSync(file, 'utf8')) as ZoneFile
  const real = zone.buildings.filter((b) => !b.est)
  const est = zone.buildings.filter((b) => b.est)
  const pct = ((100 * real.length) / Math.max(1, zone.buildings.length)).toFixed(0)

  console.log(`\n${id}`)
  console.log(
    `  buildings ${zone.buildings.length}   real height ${real.length} (${pct}%)   ` +
      `estimated ${est.length}   named ${zone.buildings.filter((b) => b.n).length}`,
  )
  row(
    'real',
    real.map((b) => b.h),
  )
  row(
    'estimated',
    est.map((b) => b.h),
  )

  // The skyline is only as good as the tallest things in it, so call those out.
  const tallest = [...zone.buildings].sort((a, b) => b.h - a.h).slice(0, 5)
  console.log('  tallest:')
  for (const b of tallest) {
    console.log(
      `    ${b.h.toFixed(0).padStart(4)} m  ${b.est ? 'estimated' : 'REAL     '}  ` +
        `${b.n ?? '(unnamed)'}`,
    )
  }

  if (flags.includes('--named')) {
    // Named but unmeasured: these are landmarks being guessed at, and each one is a place a
    // player will recognise and a researcher could go and check.
    const gaps = zone.buildings
      .filter((b) => b.est && b.n)
      .sort((a, b) => areaOf(b.p, zone.q) - areaOf(a.p, zone.q))
    console.log(`  named landmarks with no height in OSM: ${gaps.length}`)
    for (const b of gaps.slice(0, 15)) {
      console.log(`    ${Math.round(areaOf(b.p, zone.q)).toString().padStart(6)} m2  ${b.n}`)
    }
    if (gaps.length > 15) console.log(`    ... and ${gaps.length - 15} more`)
  }

  // Trees, for the same reason: how many are named by species and how many are unknown.
  const kinds = zone.treeKinds ?? []
  if (zone.trees.length) {
    const known = kinds.filter((k) => k !== 0).length
    console.log(
      `  trees ${zone.trees.length / 2}   with a species or leaf type ${known}   ` +
        `unknown ${zone.trees.length / 2 - known}`,
    )
  }
}

console.log(
  '\nEverything marked "estimated" is our own filler, not a survey. It is flagged `est` in ' +
    'the zone file so the game can stay honest about it.',
)
