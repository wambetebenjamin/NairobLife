/**
 * Which signals available in the zone actually predict a building's height?
 *
 * 2,821 of 3,072 CBD buildings have no height in OSM; the bake estimates them. This asks
 * whether a better estimate is possible from what is *already* in the data, by measuring
 * every candidate predictor against the 251 buildings whose height OSM really gives, with
 * leave-one-out cross-validation.
 *
 * LOO is the point. Fitting a model and scoring it on the same data would flatter anything
 * with enough parameters. Here each building is predicted from the others only.
 *
 *   npx tsx scripts/osm/predict-heights.ts
 */
import { readFileSync } from 'node:fs'
import { ringCentroid } from '../../src/core/geom2d'
import type { ZoneBuilding, ZoneFile } from '../../src/world/zone/format'

interface Sample {
  id: number
  x: number
  z: number
  area: number
  h: number
  levels: number
  typed: boolean
  civic: boolean
  named: boolean
}

const CIVIC =
  /\b(court|courts|judiciary|parliament|bunge|senate|city hall|county|ministry|treasury|police|state house|archives|museum|library|cathedral|basilica|church|mosque|temple|school|university|college|hospital|railway|station|convention|conference|amphitheat(er|re))\b/i

function polygonArea(ring: number[]): number {
  let a = 0
  for (let i = 0; i < ring.length; i += 2) {
    const j = (i + 2) % ring.length
    a += ring[i] * ring[j + 1] - ring[j] * ring[i + 1]
  }
  return Math.abs(a) / 2
}

function load(): { file: ZoneFile; real: Sample[]; all: Sample[] } {
  const file = JSON.parse(readFileSync('data/zones/nairobi-cbd.json', 'utf8')) as ZoneFile
  const q = file.q
  const make = (b: ZoneBuilding): Sample => {
    const ring = b.p.map((v) => v / q)
    const [cx, cz] = ringCentroid(ring)
    return {
      id: b.id,
      x: cx,
      z: cz,
      area: polygonArea(ring),
      h: b.h,
      levels: b.h / 3.4,
      typed: Boolean(b.t),
      civic: CIVIC.test(b.n ?? ''),
      named: Boolean(b.n),
    }
  }
  const all = file.buildings.map(make)
  const real = file.buildings.filter((b) => b.est !== 1).map(make)
  return { file, real, all }
}

/** Mean absolute error, in metres. */
const mae = (errors: number[]) => errors.reduce((s, e) => s + Math.abs(e), 0) / errors.length
/** Root mean squared error, in metres. */
const rmse = (errors: number[]) => Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length)

/**
 * Predict each real height from the real heights nearest to it, by inverse-distance
 * weighting. `k` is how many neighbours to use, `power` how fast influence falls off.
 */
function idw(real: Sample[], k: number, power: number): number[] {
  const errors: number[] = []
  for (let i = 0; i < real.length; i++) {
    const self = real[i]
    const others = real
      .map((other, j) => ({ other, j, d: Math.hypot(other.x - self.x, other.z - self.z) }))
      .filter((entry) => entry.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, k)
    if (others.length === 0) continue
    // A neighbour at zero distance (a 3D part stacked on the same footprint) would divide
    // by zero; it is the same building, so it is the best possible answer.
    const exact = others.find((entry) => entry.d < 1)
    if (exact) {
      errors.push(exact.other.h - self.h)
      continue
    }
    let weighted = 0
    let total = 0
    for (const { other, d } of others) {
      const w = 1 / Math.pow(d, power)
      weighted += other.h * w
      total += w
    }
    errors.push(weighted / total - self.h)
  }
  return errors
}

/**
 * The bake's own estimator, as a baseline. It types the building, takes the local tagged
 * median within CORE_LEVELS, and caps slenderness at 3.2. Reproduced here only roughly:
 * enough to know whether a new idea beats the status quo.
 */
function baseline(real: Sample[]): number[] {
  const errors: number[] = []
  for (const self of real) {
    const near = real
      .filter((o) => o.id !== self.id)
      .filter((o) => Math.hypot(o.x - self.x, o.z - self.z) < 250)
      .map((o) => o.levels)
      .sort((a, b) => a - b)
    const local = near.length ? near[Math.floor(near.length / 2)] : 4
    const slendernessCap = 3.2 * Math.sqrt(self.area)
    const guessed = Math.min(Math.max(4, local * 0.8) * 3.4, slendernessCap)
    errors.push(guessed - self.h)
  }
  return errors
}

/** How much of the variance in height a predictor explains (1 = perfect). */
function r2(actual: number[], predicted: number[]): number {
  const mean = actual.reduce((s, v) => s + v, 0) / actual.length
  const ssTot = actual.reduce((s, v) => s + (v - mean) ** 2, 0)
  const ssRes = actual.reduce((s, v, i) => s + (v - predicted[i]) ** 2, 0)
  return 1 - ssRes / ssTot
}

function main(): void {
  const { file, real, all } = load()
  console.log(`${file.name}`)
  console.log(
    `buildings ${all.length}   real height ${real.length}   estimated ${all.length - real.length}`,
  )
  const heights = real.map((s) => s.h).sort((a, b) => a - b)
  console.log(
    `real height: median ${heights[Math.floor(heights.length / 2)]} m, max ${heights.at(-1)} m\n`,
  )

  // ---- baseline: how wrong is the current estimator, on the buildings we can check?
  const baseErr = baseline(real)
  console.log('BASELINE (current estimator, leave-one-out)')
  console.log(`  MAE ${mae(baseErr).toFixed(1)} m   RMSE ${rmse(baseErr).toFixed(1)} m\n`)

  // ---- candidate 1: neighbours
  console.log('NEIGHBOURS (inverse-distance weighted, leave-one-out)')
  let best = { k: 0, power: 0, err: [] as number[], mae: Infinity }
  for (const k of [1, 2, 3, 5, 8, 13, 21]) {
    for (const power of [0.5, 1, 1.5, 2, 3]) {
      const err = idw(real, k, power)
      const score = mae(err)
      if (score < best.mae) best = { k, power, err, mae: score }
      if (power === 1 || power === 2)
        console.log(
          `  k=${String(k).padStart(2)} power=${power}  MAE ${score.toFixed(1)} m  RMSE ${rmse(err).toFixed(1)} m`,
        )
    }
  }
  console.log(
    `  best: k=${best.k} power=${best.power}  MAE ${best.mae.toFixed(1)} m  RMSE ${rmse(best.err).toFixed(1)} m`,
  )

  // R² on the same points, using the winning model's predictions.
  const predicted = real.map((self, i) => self.h + best.err[i])
  console.log(
    `  R² ${r2(
      real.map((s) => s.h),
      predicted,
    ).toFixed(3)}\n`,
  )

  // ---- candidate 2: does the building's own metadata help at all?
  console.log('OWN METADATA (on the 251 real buildings)')
  const byType = new Map<string, number[]>()
  for (const s of real) {
    const key = s.civic ? 'civic (by name)' : s.typed ? 'typed' : 'plain'
    byType.set(key, [...(byType.get(key) ?? []), s.h])
  }
  for (const [key, list] of [...byType.entries()].sort()) {
    list.sort((a, b) => a - b)
    const mean = list.reduce((s, v) => s + v, 0) / list.length
    console.log(
      `  ${key.padEnd(16)} n=${String(list.length).padStart(3)}  median ${list[Math.floor(list.length / 2)].toFixed(1)} m  mean ${mean.toFixed(1)} m`,
    )
  }

  // ---- candidate 3: does distance from the city centre predict height?
  console.log('\nDISTANCE FROM THE KICC (the world origin)')
  const rings: [number, number][] = [
    [0, 250],
    [250, 500],
    [500, 750],
    [750, 1000],
    [1000, 1500],
    [1500, 99999],
  ]
  for (const [lo, hi] of rings) {
    const list = real
      .filter((s) => {
        const d = Math.hypot(s.x, s.z)
        return d >= lo && d < hi
      })
      .map((s) => s.h)
      .sort((a, b) => a - b)
    if (!list.length) continue
    console.log(
      `  ${String(lo).padStart(4)}-${String(hi === 99999 ? '+' : hi).padStart(4)} m  n=${String(list.length).padStart(3)}  median ${list[Math.floor(list.length / 2)].toFixed(1)} m`,
    )
  }
}

main()
