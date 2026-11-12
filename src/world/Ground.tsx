/**
 * The ground: one big earth-coloured plane, with roads, parks and water painted on top
 * as a single decal mesh. Phase 1 Nairobi is flat; see docs/ROADMAP.md for terrain.
 *
 * TODO(terrain): the CBD really falls about 30 m from Upper Hill down to the Nairobi
 * River. Add a heightfield (SRTM) and drape the decals over it.
 */
import { useEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry } from 'three'
import { toBufferGeometry } from './geometry/toBufferGeometry'
import { createDecalMaterial, createEarthMaterial } from './materials/groundMaterials'
import { useStaticColliders } from './physics/useStaticColliders'
import type { LoadedZone } from './zone/loadZone'

/** The plane runs this far past the zone so the horizon is never empty; fog hides the rest. */
const GROUND_REACH = 7_000
/** Size of a ground tile inside the zone, in metres. Tiles double in size beyond it. */
const TILE = 60

/**
 * The ground plane as a grid of tiles: small ones across the zone, growing towards the
 * horizon.
 *
 * Two triangles would describe a flat plane just as well, but triangles kilometres long
 * are more than a renderer can place accurately: at a low camera angle the ground's
 * depth comes out wrong by enough to swallow the bottom third of a wheel. Small tiles
 * near the action keep the numbers small where it matters.
 */
function createGroundGeometry(bounds: readonly [number, number, number, number]): BufferGeometry {
  const lines = (min: number, max: number): number[] => {
    const inner: number[] = []
    const from = Math.floor(min / TILE) * TILE
    const to = Math.ceil(max / TILE) * TILE
    for (let v = from; v <= to; v += TILE) inner.push(v)
    const before: number[] = []
    const after: number[] = []
    for (let step = TILE * 2, reach = 0; reach < GROUND_REACH; step *= 2) {
      reach += step
      before.unshift(from - reach)
      after.push(to + reach)
    }
    return [...before, ...inner, ...after]
  }
  const xs = lines(bounds[0], bounds[2])
  const zs = lines(bounds[1], bounds[3])
  const positions = new Float32Array(xs.length * zs.length * 3)
  const normals = new Float32Array(xs.length * zs.length * 3)
  let o = 0
  for (const z of zs) {
    for (const x of xs) {
      positions[o] = x
      positions[o + 2] = z
      normals[o + 1] = 1
      o += 3
    }
  }
  const indices = new Uint32Array((xs.length - 1) * (zs.length - 1) * 6)
  let i = 0
  for (let row = 0; row < zs.length - 1; row++) {
    for (let column = 0; column < xs.length - 1; column++) {
      const a = row * xs.length + column
      const b = a + 1
      const c = a + xs.length
      const d = c + 1
      // Counter-clockwise seen from above, so the tiles face up.
      indices.set([a, c, b, b, c, d], i)
      i += 6
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(normals, 3))
  geometry.setIndex(new BufferAttribute(indices, 1))
  geometry.computeBoundingSphere()
  return geometry
}

export function Ground({ zone }: { zone: LoadedZone }) {
  const earth = useMemo(() => createEarthMaterial(zone.file.bounds), [zone])
  const paint = useMemo(() => createDecalMaterial(), [])
  const plane = useMemo(() => createGroundGeometry(zone.file.bounds), [zone])
  const decals = useMemo(() => toBufferGeometry(zone.geometry.ground), [zone])

  useEffect(() => () => plane.dispose(), [plane])
  useEffect(() => () => decals.dispose(), [decals])
  useEffect(
    () => () => {
      earth.dispose()
      paint.dispose()
    },
    [earth, paint],
  )

  // The ground is an infinite plane, solid all the way down. (A box big enough to cover
  // the map would be so large that collision maths against it loses precision, and the
  // player ends up standing a hand's width inside it.)
  useStaticColliders(
    (rapier) => [new rapier.ColliderDesc(new rapier.HalfSpace({ x: 0, y: 1, z: 0 }))],
    [],
  )

  return (
    <group name="ground">
      <mesh geometry={plane} material={earth} receiveShadow />
      {/* renderOrder 1: painted after everything solid, so the depth test can sort it out. */}
      <mesh geometry={decals} material={paint} renderOrder={1} receiveShadow />
    </group>
  )
}
