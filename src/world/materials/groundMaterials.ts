/**
 * Materials for the ground plane and the decals painted on it.
 */
import { MeshLambertMaterial, Vector4 } from 'three'
import { GROUND } from '../geometry/palette'

/**
 * The ground plane. Inside the zone it is worn paving and dust, breaking into Nairobi's
 * red murram soil in patches. Beyond the zone edge, where nothing is mapped yet, it turns
 * into a soft patchwork of bush, dry grass and bare earth, so the city sits in a
 * landscape instead of on a tabletop.
 *
 * The variation is value noise on world position: no texture to download, no tiling.
 *
 * @param bounds the zone rectangle, [minX, minZ, maxX, maxZ] in metres
 */
export function createEarthMaterial(
  bounds: readonly [number, number, number, number],
): MeshLambertMaterial {
  const material = new MeshLambertMaterial()
  material.color.setRGB(GROUND.earth[0], GROUND.earth[1], GROUND.earth[2])
  const zone = { value: new Vector4(bounds[0], bounds[1], bounds[2], bounds[3]) }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uZone = zone
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGroundPos;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvGroundPos = (modelMatrix * vec4(transformed, 1.0)).xz;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
varying vec2 vGroundPos;
uniform vec4 uZone;
float nlNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  vec2 h = vec2(127.1, 311.7);
  float a = fract(sin(dot(i, h)) * 43758.5453);
  float b = fract(sin(dot(i + vec2(1.0, 0.0), h)) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0.0, 1.0), h)) * 43758.5453);
  float d = fract(sin(dot(i + vec2(1.0, 1.0), h)) * 43758.5453);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
{
  // Metres per pixel: fine grain is dropped where a pixel is too big to show it.
  float footprint = max(fwidth(vGroundPos.x), fwidth(vGroundPos.y));
  float broad = nlNoise(vGroundPos * 0.011) * 0.65 + nlNoise(vGroundPos * 0.043) * 0.35;
  float fine = mix(nlNoise(vGroundPos * 0.9), 0.5, smoothstep(0.25, 1.1, footprint));

  // ---- inside the zone: paving and dust, with patches of red murram
  vec3 murram = vec3(0.3, 0.135, 0.07);
  vec3 town = mix(diffuseColor.rgb, murram, smoothstep(0.56, 0.86, broad) * 0.42);

  // ---- beyond it: bush, dry grass and bare earth in big soft patches
  float region = nlNoise(vGroundPos * 0.0037 + 31.7);
  float patches = nlNoise(vGroundPos * 0.019 + 7.3);
  vec3 bush = vec3(0.075, 0.13, 0.05);
  vec3 grass = vec3(0.2, 0.21, 0.09);
  vec3 soil = vec3(0.27, 0.16, 0.09);
  vec3 country = mix(bush, grass, smoothstep(0.25, 0.75, patches));
  country = mix(country, soil, smoothstep(0.55, 0.9, region * 0.6 + broad * 0.4) * 0.7);

  vec2 beyond = max(max(uZone.xy - vGroundPos, vGroundPos - uZone.zw), 0.0);
  // The edge wanders by a few dozen metres so it does not read as a ruled line.
  float outside = smoothstep(0.0, 70.0, length(beyond) + (patches - 0.5) * 50.0);

  diffuseColor.rgb = mix(town, country, outside) * (0.93 + 0.14 * fine);
}`,
      )
  }
  material.customProgramCacheKey = () => 'nairoblife-earth-v2'
  return material
}

/**
 * Roads, parks and water, painted over the ground plane as decals. Not writing depth
 * means overlapping layers cannot z-fight: they paint over each other in the order the
 * mesh lists them. The polygon offset wins the depth test against the ground beneath.
 */
export function createDecalMaterial(): MeshLambertMaterial {
  return new MeshLambertMaterial({
    vertexColors: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -8,
  })
}

/** Flyover decks, ramps and piers. The small offset stops ramp feet flickering against the ground. */
export function createStructureMaterial(): MeshLambertMaterial {
  return new MeshLambertMaterial({
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  })
}
