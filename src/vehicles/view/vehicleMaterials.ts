/**
 * Materials for the fleet.
 *
 * All vehicles of a kind are drawn together, as instances of one mesh, so anything that
 * differs from one to the next has to travel with the instance rather than the material:
 *
 *  - **Livery.** Each instance has a paint colour, a second colour and a pattern (LIVERY
 *    in config/vehicles.ts). The stock shader would tint the whole model, tyres and
 *    windows included; the patch below paints only the faces the model marked as
 *    paintwork, and draws the pattern on them from where each point is on the vehicle:
 *    slashes, flames, a two-tone wave, a patchwork, zebra stripes. No textures.
 *  - **Lamps.** Each instance has a brightness for its headlamps and its tail lamps. The
 *    faces the model marked as lamps glow by that much, whatever the daylight is doing.
 *    Faces marked `glow` light up on every vehicle together, after dark.
 */
import { DataTexture, MeshBasicMaterial, MeshLambertMaterial, RGBAFormat } from 'three'

/** Shared by every vehicle; the fleet view sets it once per frame. */
export const vehicleUniforms = {
  /** How brightly the after-dark lights (LAMP.glow) burn: 0 by day. */
  uGlow: { value: 0 },
}

const VERTEX_PARS = /* glsl */ `
attribute float paint;
attribute float lamp;
attribute vec2 lamps;
attribute vec4 livery;
uniform float uGlow;
varying float vGlow;
varying float vPaint;
varying vec3 vModel;
flat varying vec3 vBase;
flat varying vec4 vLivery;
`

const VERTEX_MAIN = /* glsl */ `
#ifdef USE_INSTANCING_COLOR
  // The line above tinted everything. Start again: the paintwork is painted per pixel.
  vColor.rgb = color;
  vBase = instanceColor.rgb;
#else
  vBase = vec3(1.0);
#endif
vPaint = paint;
vLivery = livery;
vModel = position;
vGlow = lamp > 2.5 ? uGlow : (lamp > 1.5 ? lamps.y : (lamp > 0.5 ? lamps.x : 0.0));
`

// Patterns are functions of the point on the vehicle, in metres: f ahead of its middle,
// y above the road. Edges are softened by a pixel so they do not crawl as it drives by.
const FRAGMENT_PARS = /* glsl */ `
varying float vGlow;
varying float vPaint;
varying vec3 vModel;
flat varying vec3 vBase;
flat varying vec4 vLivery;

float klStep(float edge, float x) {
  float w = fwidth(x) + 0.0001;
  return smoothstep(edge - w, edge + w, x);
}

// 1 inside a stripe. One stripe and one gap per unit of x; duty is the stripe's share.
float klStripes(float x, float duty) {
  float t = abs(fract(x) - 0.5) * 2.0;
  float w = fwidth(x) * 2.0 + 0.0001;
  return 1.0 - smoothstep(duty - w, duty + w, t);
}

float klTri(float x) {
  return abs(fract(x) - 0.5) * 2.0;
}

float klHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 klLivery(vec3 base, vec3 accent, float pattern, vec3 p) {
  float f = -p.z;
  float y = p.y;
  if (pattern < 0.5) return base;
  if (pattern < 1.5) {
    // Slash: slanted bars over the back two thirds.
    float bars = klStripes((f + y * 0.9) / 1.5, 0.5) * (1.0 - klStep(0.9, f));
    return mix(base, accent, bars);
  }
  if (pattern < 2.5) {
    // Flames: a jagged edge rising from the skirts, taller towards the nose.
    float edge = 0.95 + 0.55 * klTri(f * 0.62) + 0.3 * klTri(f * 1.7 + 0.4) + 0.12 * f;
    return mix(accent, base, klStep(edge, y));
  }
  if (pattern < 3.5) {
    // Split: two-tone, parted along a wave.
    return mix(accent, base, klStep(1.3 + 0.32 * sin(f * 0.9), y));
  }
  if (pattern < 4.5) {
    // Blocks: a patchwork of panels in four tones.
    float r = klHash(floor(vec2(f / 0.95, y / 0.62)) + 3.7);
    if (r < 0.42) return base;
    if (r < 0.72) return accent;
    if (r < 0.87) return mix(accent, vec3(1.0), 0.65);
    return base * 0.3;
  }
  // Zebra.
  return mix(base, accent, klStripes((f + 0.3 * sin(y * 4.2 + f * 1.3)) / 0.46, 0.5));
}
`

const FRAGMENT_MAIN = /* glsl */ `
if (vPaint > 1.5) diffuseColor.rgb *= vLivery.rgb;
else if (vPaint > 0.5) diffuseColor.rgb *= klLivery(vBase, vLivery.rgb, vLivery.a, vModel);
`

export function createVehicleMaterial(): MeshLambertMaterial {
  const material = new MeshLambertMaterial({ vertexColors: true })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGlow = vehicleUniforms.uGlow
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <color_vertex>', `#include <color_vertex>\n${VERTEX_MAIN}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT_MAIN}`)
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow;',
      )
  }
  material.customProgramCacheKey = () => 'kanairo-vehicle-v2'
  return material
}

export function createWheelMaterial(): MeshLambertMaterial {
  return new MeshLambertMaterial({ vertexColors: true })
}

/**
 * The soft dark patch under every vehicle. Sun shadows come and go with the time of day
 * and the graphics setting; this stays, and it is what stops a parked car looking as if
 * it floats a hand's width above the road.
 */
export function createUnderShadowMaterial(): MeshBasicMaterial {
  const SIZE = 32
  const data = new Uint8Array(SIZE * SIZE * 4)
  for (let row = 0; row < SIZE; row++) {
    for (let column = 0; column < SIZE; column++) {
      // Distance from the centre, 0..1 at the edge, with squared-off corners so the
      // patch reads as the shadow of a box rather than of a ball.
      const u = Math.abs((column + 0.5) / SIZE - 0.5) * 2
      const v = Math.abs((row + 0.5) / SIZE - 0.5) * 2
      const edge = Math.pow(Math.pow(u, 4) + Math.pow(v, 4), 0.25)
      const t = Math.min(1, Math.max(0, (1 - edge) / 0.45))
      const alpha = Math.round(255 * t * t * (3 - 2 * t))
      data.fill(alpha, (row * SIZE + column) * 4, (row * SIZE + column) * 4 + 4)
    }
  }
  const falloff = new DataTexture(data, SIZE, SIZE, RGBAFormat)
  falloff.needsUpdate = true
  const material = new MeshBasicMaterial({
    color: 0x000000,
    alphaMap: falloff,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    // Wins the depth test against the road it lies on (see the decal material).
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -12,
  })
  material.userData.falloff = falloff
  return material
}
