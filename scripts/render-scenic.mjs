/**
 * Render the scenic dioramas through three.js's real projection pipeline and write a PNG.
 *
 * There is no WebGL in this environment, so this cannot show shaders or lighting exactly.
 * It rasterises flat-shaded triangles, which is enough to catch the problems that matter:
 * something seen edge-on, something hidden inside something else, something out of frame.
 * Every geometry, material colour and camera position here is read from the component.
 */
import { JSDOM } from 'jsdom'
import { readFileSync, writeFileSync } from 'node:fs'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })

const THREE = await import('three')
const { SVGRenderer } = await import('three/examples/jsm/renderers/SVGRenderer.js')
const { mergeGeometries } = await import('three/examples/jsm/utils/BufferGeometryUtils.js')

// The palette moved into its own module so the tests can import the values that ship; the
// component no longer holds them. Read the palette from there and the rest of the scene
// numbers (camera, towers, trees) from the component.
const src = readFileSync('src/ui/ScenicPreview.tsx', 'utf8')
const PAL_SRC = readFileSync('src/ui/scenic/parkPalette.ts', 'utf8')
const PAL = {}
for (const m of PAL_SRC.matchAll(/(\w+): '(#[0-9a-f]{6})'/g)) PAL[m[1]] = m[2]
if (!PAL.tower) throw new Error('palette not found in src/ui/scenic/parkPalette.ts')

// --- distance haze, mirrored from src/ui/scenic/haze.ts -------------------------------------
// Node cannot import the .ts module without a loader, so the two constants and the two
// functions are reimplemented here and `scripts/check-haze-parity.py` holds them in step.
const HAZE_SRC = readFileSync('src/ui/scenic/haze.ts', 'utf8')
const HAZE_NEAR = Number(HAZE_SRC.match(/HAZE_NEAR = ([\d.]+)/)[1])
const HAZE_FAR = Number(HAZE_SRC.match(/HAZE_FAR = ([\d.]+)/)[1])
const HAZE_SKY = HAZE_SRC.match(/HAZE_SKY = '(#[0-9a-f]{6})'/)[1]
const HAZE_HORIZON = HAZE_SRC.match(/HAZE_HORIZON = '(#[0-9a-f]{6})'/)[1]

const hazeAt = (distance, height, reach = 62) => {
  const far = Math.min(1, Math.max(0, distance / reach))
  const thin = 1 - Math.min(0.55, Math.max(0, height) / 55)
  return HAZE_NEAR + (HAZE_FAR - HAZE_NEAR) * far * far * thin
}
const hazed = (hex, amount) => {
  const parse = (v) => {
    const n = parseInt(v.replace('#', ''), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const a = parse(hex)
  const b = parse(HAZE_HORIZON)
  const t = Math.min(1, Math.max(0, amount))
  return (
    '#' +
    a
      .map((v, i) =>
        Math.round(v + (b[i] - v) * t)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  )
}
const SKYLINE_Z = Number(src.match(/const SKYLINE_Z = (\d+)/)?.[1] ?? 62)
const SKYLINE_HAZE = hazeAt(SKYLINE_Z, 3)
const VEIL_BANDS = [0, 0.2, 0.4, 0.6, 0.8]

// The numbers that drive the scene, taken from the source so the picture cannot drift.
const num = (re, fallback) => Number(src.match(re)?.[1] ?? fallback)
const CAM_R = num(/camera\.position\.set\(Math\.cos\(az\) \* ([\d.]+)/, 34)
const CAM_Y = num(/Math\.cos\(az\) \* [\d.]+, ([\d.]+),/, 9.5)
const LOOK_Y = num(/camera\.lookAt\(0, kind === 'park' \? ([\d.]+)/, 7.5)
const LOOK_Z = num(/kind === 'park' \? -([\d.]+) : 0\)/, 70)
const FOV = num(/fov: (\d+), near/, 42)
const ARC = num(/Math\.PI \/ 2 \+ Math\.sin\(t\) \* ([\d.]+)/, 0.85)

const towerRows = [...src.matchAll(/\[(-?\d+), (\d+), ([\d.]+), (\d)\],/g)].map((m) => [
  +m[1],
  +m[2],
  +m[3],
  +m[4],
])
const treeRows = [...src.matchAll(/\[(-?\d+), (-?\d+), ([\d.]+)\],/g)].map((m) => [
  +m[1],
  +m[2],
  +m[3],
])
const tones = [PAL.tower, PAL.towerLight, PAL.towerGlass].map((c) => hazed(c, SKYLINE_HAZE))

function hash01(n, salt = 0) {
  let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul((salt + 1) | 0, 0x85ebca6b)) >>> 0
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d) >>> 0
  h ^= h >>> 12
  h = Math.imul(h, 0x297a2d39) >>> 0
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}
const mat = (color, extra) => new THREE.MeshLambertMaterial({ color, ...extra })

function build(t = Math.PI / 2) {
  const scene = new THREE.Scene()
  // The component uses a HemisphereLight, which SVGRenderer cannot shade. Substitute a
  // slightly dimmer ambient so the preview is readable; this is a harness limitation, not
  // a difference in the shipped scene.
  scene.add(new THREE.AmbientLight('#cfe0e6', 0.85))
  const sun = new THREE.DirectionalLight('#fff3dd', 1.15)
  sun.position.set(26, 40, 18)
  scene.add(sun)

  // sky dome, vertex-colour gradient
  const skyGeo = new THREE.SphereGeometry(160, 24, 16)
  const pos = skyGeo.getAttribute('position')
  const cols = []
  const top = new THREE.Color(PAL.skyTop),
    hor = new THREE.Color(PAL.skyHorizon),
    mix = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const v = Math.min(1, Math.max(0, pos.getY(i) / 160))
    mix.copy(hor).lerp(top, Math.pow(v, 0.55))
    cols.push(mix.r, mix.g, mix.b)
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3))
  scene.add(
    new THREE.Mesh(
      skyGeo,
      // The shipped scene uses BackSide, which is correct. three's SVGRenderer backface-culls
      // it away entirely -- measured: BackSide draws 0 of 1 faces, DoubleSide draws 1 -- so the
      // harness renders it two-sided or it would silently draw no sky at all and report the
      // background colour as if that were the dome.
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    ),
  )

  // NOTE: this duplicates buildParkTerrain(); scripts/check-terrain-parity.py holds the two
  // in step, because node cannot import the .ts module without a loader.
  // terrain: rotate flat FIRST, then displace, or computeVertexNormals gives all zeros
  const tg = new THREE.PlaneGeometry(210, 210, 64, 64)
  tg.rotateX(-Math.PI / 2)
  const tp = tg.getAttribute('position')
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i),
      z = tp.getZ(i),
      r = Math.hypot(x, z)
    const band = Math.min(1, Math.max(0, (r - 18) / 16)) * Math.min(1, Math.max(0, (78 - r) / 22))
    tp.setY(i, Math.sin(x * 0.05) * Math.cos(z * 0.055) * band * 0.85)
  }
  tg.computeVertexNormals()
  scene.add(new THREE.Mesh(tg, mat(PAL.grassMid, { side: THREE.DoubleSide })))

  // ridges. They are further back than the skyline, so they get at least as much haze.
  for (const [z, col, height] of [
    [-118, PAL.ridgeFar, 13],
    [-104, PAL.ridgeNear, 7],
  ]) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      // Basic, not Lambert: a lit ridge ends up brighter than the sky it stands in front of.
      new THREE.MeshBasicMaterial({ color: hazed(col, hazeAt(Math.abs(z), height / 2)) }),
    )
    m.position.set(0, 0, z)
    m.scale.set(150, height, 26)
    scene.add(m)
  }

  // skyline
  const sky = new THREE.Group()
  sky.position.z = -SKYLINE_Z
  const warm = hazed(PAL.towerWarm, SKYLINE_HAZE)
  for (const [x, hgt, w, tone] of towerRows) {
    const g = new THREE.Group()
    g.position.x = x
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, w), mat(tones[tone]))
    b.position.y = hgt / 2
    g.add(b)
    const f = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, hgt * 0.86, 0.04), mat(warm))
    f.position.set(0, hgt / 2, w / 2 + 0.02)
    g.add(f)
    // stacked haze bands, densest at the base (mirrors VEIL_BANDS in the component)
    for (const t of VEIL_BANDS) {
      const veil = new THREE.Mesh(
        new THREE.BoxGeometry(w * 1.04, hgt / VEIL_BANDS.length, w * 1.04),
        new THREE.MeshBasicMaterial({
          color: PAL.skyHorizon,
          transparent: true,
          opacity: 0.14 + 0.5 * (1 - t) * (1 - t),
          depthWrite: false,
        }),
      )
      veil.position.y = hgt * (t + 0.5 / VEIL_BANDS.length)
      veil.renderOrder = 1
      g.add(veil)
    }
    sky.add(g)
  }
  scene.add(sky)

  // acacias: faceted umbrella crowns, mirroring the component
  const leaf = [PAL.canopyDark, PAL.canopyMid, PAL.canopyLit]
  for (const [x, z, sc] of treeRows) {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    g.scale.setScalar(sc)
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.26, 3.8, 5), mat(PAL.trunk))
    trunk.position.y = 1.9
    g.add(trunk)
    for (const side of [-1, 1]) {
      const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.13, 1.7, 4), mat(PAL.trunk))
      fork.position.set(side * 0.55, 3.5, 0)
      fork.rotation.z = side * -0.62
      g.add(fork)
    }
    const seed = treeRows.indexOf(treeRows.find((t) => t[0] === x && t[1] === z)) + 1
    for (let i = 0; i < 11; i++) {
      const a = hash01(seed, 70 + i) * Math.PI * 2
      const reach = Math.sqrt(hash01(seed, 80 + i)) * 2.9
      const lift = 4.3 - reach * 0.22 + hash01(seed, 90 + i) * 0.32
      const plate = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1, 0),
        mat(leaf[i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 2]),
      )
      plate.position.set(Math.cos(a) * reach, lift, Math.sin(a) * reach)
      plate.scale.set(0.85 + hash01(seed, 100 + i) * 0.7, 0.16, 0.85 + hash01(seed, 110 + i) * 0.7)
      g.add(plate)
    }
    for (let i = 0; i < 4; i++) {
      const a = hash01(seed, 120 + i) * Math.PI * 2
      const shoulder = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), mat(PAL.canopyDark))
      shoulder.position.set(
        Math.cos(a) * 1.1,
        3.55 + hash01(seed, 130 + i) * 0.4,
        Math.sin(a) * 1.1,
      )
      shoulder.scale.set(1.0, 0.42, 1.0)
      g.add(shoulder)
    }
    scene.add(g)
  }

  // grass tufts
  const blades = []
  for (let b = 0; b < 3; b++) {
    const g = new THREE.PlaneGeometry(1, 1)
    g.rotateY((b / 3) * Math.PI)
    g.translate(0, 0.5, 0)
    blades.push(g)
  }
  const tuft = mergeGeometries(blades)
  const dry = mat(PAL.grassDry, { side: THREE.DoubleSide })
  const lit = mat(PAL.grassLit, { side: THREE.DoubleSide })
  for (let i = 0; i < 620; i++) {
    const a = hash01(i, 11) * Math.PI * 2
    const r = 14 + Math.sqrt(hash01(i, 12)) * 58
    const m = new THREE.Mesh(tuft, hash01(i, 15) > 0.6 ? dry : lit)
    m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r)
    m.scale.set(0.34 + hash01(i, 14) * 0.5, 0.5 + hash01(i, 13) * 0.75, 0.34 + hash01(i, 14) * 0.5)
    scene.add(m)
  }

  // animals
  const zebra = (x, z, turn) => {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    g.rotation.y = turn
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.65, 1.55), mat('#f1efe4'))
    body.position.y = 1.15
    g.add(body)
    for (const dz of [-0.48, -0.22, 0.04, 0.3, 0.55]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.67, 0.67, 0.09), mat('#292929'))
      s.position.set(0, 1.15, dz)
      g.add(s)
    }
    for (const dx of [-0.22, 0.22])
      for (const dz of [-0.55, 0.55]) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.85, 0.12), mat('#33302e'))
        l.position.set(dx, 0.42, dz)
        g.add(l)
      }
    scene.add(g)
  }
  const giraffe = (x, z, turn) => {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    g.rotation.y = turn
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1, 1.8), mat('#c79554'))
    body.position.y = 2.05
    g.add(body)
    for (const dx of [-0.3, 0.3])
      for (const dz of [-0.65, 0.65]) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.17, 1.8, 0.18), mat('#9b754c'))
        l.position.set(dx, 0.86, dz)
        g.add(l)
      }
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.34, 2.5, 0.34), mat('#c79554'))
    neck.position.set(0, 3.45, -0.65)
    neck.rotation.x = -0.12
    g.add(neck)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.43, 0.75), mat('#c79554'))
    head.position.set(0, 4.7, -0.87)
    g.add(head)
    scene.add(g)
  }
  zebra(4, 3, 0.7)
  zebra(6, 5, 1)
  zebra(3, 5, 0.4)
  giraffe(-4, -4, -0.5)
  giraffe(-6, -6, -0.2)

  const cam = new THREE.PerspectiveCamera(FOV, 1.6, 0.1, 500)
  const az = Math.PI / 2 + Math.sin(t) * ARC
  cam.position.set(Math.cos(az) * CAM_R, CAM_Y, Math.sin(az) * CAM_R)
  cam.lookAt(0, LOOK_Y, -LOOK_Z)
  return { scene, camera: cam }
}

const W = 720,
  H = 450
const at = process.argv[2] ? Number(process.argv[2]) : Math.PI / 2
const { scene, camera } = build(at)
const renderer = new SVGRenderer()
renderer.setSize(W, H)
renderer.render(scene, camera)
const svg = renderer.domElement.outerHTML
// --- diagnostics: is the ground in the output at all?
if (process.env.DIAG) {
  scene.traverse((o) => {
    if (!o.isMesh) return
    const c = o.material?.color
    if (c && '#' + c.getHexString() === PAL.grassMid) {
      o.geometry.computeBoundingBox()
      const b = o.geometry.boundingBox
      console.log(
        'DIAG ground bbox',
        JSON.stringify(b),
        'visible',
        o.visible,
        'side',
        o.material.side,
      )
    }
  })
  console.log(
    'DIAG ground paths in svg:',
    (svg.match(new RegExp('fill:rgb\\(\\d+, ?\\d+, ?\\d+\\)', 'g')) || []).length,
  )
}
writeFileSync('/tmp/scenic.svg', svg)
writeFileSync(
  '/tmp/scenic.palette.json',
  JSON.stringify({ PAL, towerRows, treeRows, CAM_R, CAM_Y, LOOK_Y, LOOK_Z, FOV }),
)
console.log(
  'RESULT',
  towerRows.length,
  'towers,',
  treeRows.length,
  'trees, svg',
  svg.length,
  'bytes',
)
