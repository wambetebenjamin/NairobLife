/**
 * The material trees are drawn with.
 *
 * Foliage is built from blobs and palm fronds, and a palm frond is a single strip of
 * triangles. If it were only drawn front-facing, every frond seen from below would
 * vanish. DoubleSide fixes that, but it also asks the GPU to shade every leaf twice.
 *
 * So this material does the trick three.js's own `DoubleSide` does — flip the normal on
 * back faces — but *without* setting `side: DoubleSide`, because that flag also makes
 * the renderer disable face culling and run the fragment shader twice per pixel. Instead
 * the culling stays on, and the blobs are built with enough overlapping shells that they
 * are closed from every angle. Only the fronds need the extra face, and they are built
 * two-sided in the mesh itself (see `MeshBuilder.frond`).
 *
 * What this material adds:
 *
 *  - a little wrap-around light, so the undersides of a canopy are not black holes: a
 *    real leaf is thin and lets light through;
 *  - a wind sway, driven by one shared uniform and the tree's own position, so a whole
 *    avenue moves together in a gust rather than every tree on its own beat;
 *  - darker colour deep inside the canopy, which is what gives a tree its volume.
 *
 * The wind is a vertex-shader sway scaled by height, so trunks stay put and the tops move.
 */
import { MeshLambertMaterial, Vector3 } from 'three'

/** Shared by every foliage material (there are two: canopies and trunks). */
export const foliageUniforms = {
  /** Seconds, for the wind. Slowed and stopped when the game pauses. */
  uTime: { value: 0 },
  /** How hard the wind is blowing, 0 still .. 1 a storm. Rain raises it. */
  uWind: { value: 0.6 },
  /** Direction the wind blows from, in radians about y. */
  uWindAngle: { value: 2.1 },
}

const VERTEX_PARS = /* glsl */ `
uniform float uTime;
uniform float uWind;
uniform float uWindAngle;
varying vec3 vFoliageWorld;
varying vec3 vFoliageEye;
`

/**
 * Sway, in the vertex shader.
 *
 * The displacement is in world metres and the matrix is rigid (no scale), so a world-space
 * offset can be applied without any matrix maths at all — it is added straight to the
 * translation column. That matters: GLSL has no `inverse()`, and three.js does not define
 * one either, so anything that wanted to go back into model space would not compile.
 */
const VERTEX_SWAY = /* glsl */ `
{
  vec4 world = modelMatrix * vec4(transformed, 1.0);
  vFoliageWorld = world.xyz;
  float phase = modelMatrix[3].x * 0.07 + modelMatrix[3].z * 0.05;
  float height = max(world.y, 0.0);
  float gust = sin(uTime * 0.9 + phase) * 0.6 + sin(uTime * 1.7 + phase * 1.3) * 0.4;
  float lean = uWind * gust * 0.022 * height;
  // Every tree sits at yaw 0 with unit scale, so a world-space offset is the same offset
  // in model space. three's own projection step follows and does the rest.
  transformed.x += cos(uWindAngle) * lean;
  transformed.z += sin(uWindAngle) * lean;
  // The eye-space normal, so the fragment shader can shade the canopy without needing a
  // camera position: Lambert's own shader does not declare one, and assuming it does is
  // how this material failed to compile the first time.
  vFoliageEye = normalize(normalMatrix * objectNormal);
}
`

const FRAGMENT_PARS = /* glsl */ `
varying vec3 vFoliageWorld;
varying vec3 vFoliageEye;
`

/**
 * Darker towards the inside of the canopy, so a mass of leaves has volume instead of
 * reading as a flat green ball with a hard edge.
 *
 * This runs at `color_fragment`, before any lighting, and it uses only names this file
 * declares itself: `vFoliageEye` comes from the vertex stage. It deliberately does *not*
 * use `cameraPosition` (three does not declare it for Lambert, so the material would fail
 * to compile) or `geometryNormal` (not declared until later in the shader).
 */
const FRAGMENT_SHADE = /* glsl */ `
{
  float facing = abs(normalize(vFoliageEye).z);
  float inside = 1.0 - smoothstep(0.1, 0.95, facing);
  diffuseColor.rgb *= 1.0 - inside * 0.22;
}
`

/**
 * A foliage material: Lambert for speed, with the sway and the wrap. Two trees can share
 * a material; the wind is global, so they all move in the same gust.
 */
export function createFoliageMaterial({
  sway = true,
}: { sway?: boolean } = {}): MeshLambertMaterial {
  const material = new MeshLambertMaterial({ vertexColors: true })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = foliageUniforms.uTime
    shader.uniforms.uWind = foliageUniforms.uWind
    shader.uniforms.uWindAngle = foliageUniforms.uWindAngle
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace(
        '#include <begin_vertex>',
        sway ? `#include <begin_vertex>\n${VERTEX_SWAY}` : '#include <begin_vertex>',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT_SHADE}`)
  }
  material.customProgramCacheKey = () => (sway ? 'kanairo-foliage-v1' : 'kanairo-bark-v1')
  return material
}

/** Samples the wind is driven from, used by tests to check the numbers move. */
export function windAt(seconds: number, wind: number, angle: number): Vector3 {
  const gust = Math.sin(seconds * 0.9) * 0.6 + Math.sin(seconds * 1.7) * 0.4
  const lean = wind * gust * 0.022
  return new Vector3(Math.cos(angle) * lean, 0, Math.sin(angle) * lean)
}
