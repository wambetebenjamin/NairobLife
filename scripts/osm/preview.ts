/**
 * npm run osm:preview [-- <zone-id>]
 *
 * Draws a baked zone as a flat SVG map (data/zones/<zone>.preview.svg, git-ignored).
 * Open it in a browser to sanity-check a bake without starting the game: north is up,
 * buildings are shaded by height, raised roads are drawn in orange.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEFAULT_ZONE_ID } from '../../src/config/zones'
import type { ZoneFile } from '../../src/world/zone/format'
import { ZONES_DIR } from './lib/osm'

const id = process.argv.slice(2).find((arg) => !arg.startsWith('-')) ?? DEFAULT_ZONE_ID
const zone = JSON.parse(readFileSync(resolve(ZONES_DIR, `${id}.json`), 'utf8')) as ZoneFile
const q = zone.q
const [minX, minZ, maxX, maxZ] = zone.bounds

const path = (p: number[], close: boolean) => {
  let d = ''
  for (let i = 0; i < p.length; i += 2) d += `${i ? 'L' : 'M'}${p[i] / q} ${p[i + 1] / q}`
  return close ? d + 'Z' : d
}
const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;')

const AREA_FILL: Record<string, string> = {
  park: '#9ccc8a',
  garden: '#a9d59a',
  grass: '#b5d9a3',
  wood: '#7fb574',
  water: '#7fb6e6',
  parking: '#d9d6cf',
  pitch: '#9fd0a0',
  plaza: '#e6dfd0',
}
const ROAD_STROKE: Record<string, string> = {
  motorway: '#3c4a63',
  trunk: '#4d5560',
  primary: '#5a6068',
  secondary: '#666b72',
  tertiary: '#72777d',
  residential: '#84888d',
  service: '#a3a6a9',
  pedestrian: '#cbb893',
  footway: '#c9a57a',
  steps: '#b5651d',
}

const out: string[] = []
out.push(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minZ} ${maxX - minX} ${maxZ - minZ}" width="1600" height="${Math.round((1600 * (maxZ - minZ)) / (maxX - minX))}">`,
  `<rect x="${minX}" y="${minZ}" width="${maxX - minX}" height="${maxZ - minZ}" fill="#efe9dc"/>`,
)
for (const a of zone.areas) {
  const d = path(a.p, true) + (a.hs ?? []).map((h) => path(h, true)).join('')
  out.push(`<path d="${d}" fill="${AREA_FILL[a.k]}" fill-rule="evenodd"/>`)
}
for (const w of zone.waterways)
  out.push(`<path d="${path(w.p, false)}" fill="none" stroke="#7fb6e6" stroke-width="${w.w}"/>`)
for (const r of zone.rails)
  out.push(
    `<path d="${path(r.p, false)}" fill="none" stroke="#7a5c4a" stroke-width="2" stroke-dasharray="6 4"/>`,
  )
const ground = zone.roads.filter((r) => !r.e)
const raised = zone.roads.filter((r) => r.e)
for (const r of ground) {
  out.push(
    `<path d="${path(r.p, false)}" fill="none" stroke="${ROAD_STROKE[r.k]}" stroke-width="${r.w}" stroke-linecap="round" stroke-linejoin="round"/>`,
  )
}
for (const b of [...zone.buildings].sort((a, c) => a.h - c.h)) {
  const shade = Math.round(225 - Math.min(b.h, 140) * 1.25)
  const d = path(b.p, true) + (b.hs ?? []).map((h) => path(h, true)).join('')
  out.push(
    `<path d="${d}" fill="rgb(${shade},${shade - 8},${shade - 20})" stroke="#40382c" stroke-width="0.4" fill-rule="evenodd"/>`,
  )
}
for (const r of raised) {
  out.push(
    `<path d="${path(r.p, false)}" fill="none" stroke="${r.br ? '#e8590c' : '#f4a261'}" stroke-width="${r.w}" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`,
  )
}
for (let i = 0; i < zone.trees.length; i += 2) {
  out.push(
    `<circle cx="${zone.trees[i] / q}" cy="${zone.trees[i + 1] / q}" r="2.5" fill="#3f8f4f"/>`,
  )
}
for (const p of zone.pois) {
  if (p.k === 'stage')
    out.push(
      `<circle cx="${p.x / q}" cy="${p.z / q}" r="4" fill="#ffd400" stroke="#000" stroke-width="0.8"/>`,
    )
}
const label = (x: number, z: number, text: string, size: number, fill: string) =>
  out.push(
    `<text x="${x}" y="${z}" font-family="sans-serif" font-size="${size}" font-weight="700" text-anchor="middle" fill="${fill}" stroke="#fff" stroke-width="${size / 5}" paint-order="stroke">${esc(text)}</text>`,
  )
for (const b of zone.buildings) {
  if (!b.n || b.h < 60) continue
  let x = 0
  let z = 0
  for (let i = 0; i < b.p.length; i += 2) {
    x += b.p[i]
    z += b.p[i + 1]
  }
  label(x / (b.p.length / 2) / q, z / (b.p.length / 2) / q, `${b.n} ${b.h}m`, 13, '#7a1f1f')
}
for (const a of zone.areas) {
  if (!a.n || (a.k !== 'park' && a.k !== 'water')) continue
  let x = 0
  let z = 0
  for (let i = 0; i < a.p.length; i += 2) {
    x += a.p[i]
    z += a.p[i + 1]
  }
  label(x / (a.p.length / 2) / q, z / (a.p.length / 2) / q, a.n, 18, '#1f5a2a')
}
// Compass and scale, to catch a mirrored or rotated bake at a glance.
out.push(
  `<g transform="translate(${minX + 70} ${minZ + 110})"><path d="M0 -60 L16 10 L0 0 L-16 10Z" fill="#c1121f"/><text y="-68" font-family="sans-serif" font-size="30" font-weight="700" text-anchor="middle">N</text></g>`,
  `<g transform="translate(${minX + 40} ${maxZ - 40})"><rect width="500" height="8" fill="#111"/><text y="-8" font-family="sans-serif" font-size="24">500 m</text></g>`,
  `<circle cx="0" cy="0" r="6" fill="none" stroke="#c1121f" stroke-width="2"/>`,
  '</svg>',
)
const file = resolve(ZONES_DIR, `${id}.preview.svg`)
writeFileSync(file, out.join('\n'))
console.log(`wrote data/zones/${id}.preview.svg (${(out.join('\n').length / 1024).toFixed(0)} KB)`)
