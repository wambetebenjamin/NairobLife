/**
 * Render one of each world tree style by importing `src/world/geometry/trees.ts` itself.
 *
 * This exists because `render-scenic.mjs` describes the park *diorama*, whose trees are
 * hand-built copies. The city's 2,330 trees come from `buildTreeMesh`, and until this script
 * existed nothing ever drew them -- which is how a canopy that was very nearly a sphere
 * survived in the codebase while every test passed.
 *
 * There is no WebGL here, so this rasterises flat-shaded triangles. That is enough to answer
 * the questions that actually come up: is the canopy a ball, are the proportions believable,
 * is a trunk floating. Heights and canopy radii below are copied from the formulas in
 * `scatterTrees`, so the trees are drawn at the proportions they really get in the world.
 *
 * Usage: npx tsx scripts/render-trees.mjs [out.png]
 */
import { JSDOM } from 'jsdom'
import { writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })

const THREE = await import('three')
const { SVGRenderer } = await import('three/examples/jsm/renderers/SVGRenderer.js')
const { buildTreeMesh, TREE_STRIDE, TREE_STYLE } = await import('../src/world/geometry/trees.ts')

const out = process.argv[2] ?? '/tmp/world-trees.png'

// Proportions copied from scatterTrees: palms are 9-16 m with a canopy of height * 0.2,
// columnars are height * 0.16, everything broad is height * (0.34..0.46).
const trees = [
  { name: 'round', style: TREE_STYLE.round, height: 11, radius: 11 * 0.4, x: -25 },
  { name: 'acacia', style: TREE_STYLE.acacia, height: 11, radius: 11 * 0.4, x: -9 },
  { name: 'columnar', style: TREE_STYLE.columnar, height: 10, radius: 10 * 0.16, x: 7 },
  { name: 'palm', style: TREE_STYLE.palm, height: 14, radius: 14 * 0.2, x: 23 },
]

const data = new Float32Array(trees.length * TREE_STRIDE)
trees.forEach((tree, i) => {
  const o = i * TREE_STRIDE
  data[o] = tree.x
  data[o + 1] = 0
  data[o + 2] = tree.height
  data[o + 3] = tree.radius
  data[o + 4] = 0.22
  data[o + 5] = 0.4
  data[o + 6] = 0.16
  data[o + 7] = 0.6
  data[o + 8] = tree.style
  data[o + 9] = 1234 + i * 991
})

const { wood, leaves } = buildTreeMesh(data)
const scene = new THREE.Scene()
scene.background = new THREE.Color('#b9c7cf')

const addHalf = (half) => {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(half.positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(half.colors, 3))
  geometry.setIndex(new THREE.BufferAttribute(half.indices, 1))
  geometry.computeVertexNormals()
  scene.add(new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true })))
}
addHalf(wood)
addHalf(leaves)

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2),
  new THREE.MeshLambertMaterial({ color: '#a8894a' }),
)
ground.position.y = -0.4
scene.add(ground)

// SVGRenderer cannot shade a HemisphereLight, so substitute what the scene really uses.
scene.add(new THREE.AmbientLight(0xffffff, 0.55))
const sun = new THREE.DirectionalLight(0xffffff, 1.2)
sun.position.set(-30, 45, 28)
scene.add(sun)

const W = 900
const H = 460
const camera = new THREE.PerspectiveCamera(38, W / H, 0.5, 500)
camera.position.set(0, 9.5, 47)
camera.lookAt(-1, 7.0, 0)

const renderer = new SVGRenderer()
renderer.setSize(W, H)
renderer.setClearColor(new THREE.Color('#b9c7cf'))
renderer.render(scene, camera)
writeFileSync('/tmp/world-trees.svg', renderer.domElement.outerHTML)

// The measurement that matters: how wide a canopy is for its height. A ball is about 1.0.
for (const tree of trees) {
  const o = trees.indexOf(tree) * TREE_STRIDE
  const one = buildTreeMesh(data.slice(o, o + TREE_STRIDE)).leaves
  let maxRadius = 0
  let minY = Infinity
  let maxY = -Infinity
  for (let k = 0; k < one.positions.length; k += 3) {
    // Measure from this tree's own trunk, not from the world origin: the four are laid out
    // side by side, so the raw x would just report how far along the row each one sits.
    maxRadius = Math.max(maxRadius, Math.hypot(one.positions[k] - tree.x, one.positions[k + 2]))
    minY = Math.min(minY, one.positions[k + 1])
    maxY = Math.max(maxY, one.positions[k + 1])
  }
  // The anti-sphere metric: canopy height against canopy width. A ball is 1.0; a real
  // broadleaf crown in this city should be well under that, and an acacia far under it.
  const canopyHeight = maxY - minY
  const canopyWidth = maxRadius * 2
  console.log(
    `RESULT ${tree.name.padEnd(9)} canopy ${minY.toFixed(1)}..${maxY.toFixed(1)} m ` +
      `(${canopyHeight.toFixed(1)} m tall, ${canopyWidth.toFixed(1)} m wide), ` +
      `aspect ${(canopyHeight / canopyWidth).toFixed(2)}`,
  )
}

if (!out.endsWith('.svg')) {
  execFileSync('python3', ['scripts/svg-to-png.py', out, '/tmp/world-trees.svg'], {
    stdio: 'inherit',
  })
}
