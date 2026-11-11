/**
 * Materials for the fleet.
 *
 * All vehicles of a kind are drawn in one call, so anything that differs from one to the
 * next has to travel with the instance rather than the material:
 *
 *  - **Paint.** Each instance has a colour. The stock shader would tint the whole model
 *    with it, tyres and windows included, so the patch below applies it only to faces
 *    the model marked as paintwork.
 *  - **Lamps.** Each instance has a brightness for its headlamps and its tail lamps. The
 *    faces the model marked as lamps glow by that much, whatever the daylight is doing.
 */
import { DataTexture, MeshBasicMaterial, MeshLambertMaterial, RGBAFormat } from 'three'

export function createVehicleMaterial(): MeshLambertMaterial {
  const material = new MeshLambertMaterial({ vertexColors: true })
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
attribute float paint;
attribute float lamp;
attribute vec2 lamps;
varying float vGlow;`,
      )
      .replace(
        '#include <color_vertex>',
        /* glsl */ `#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
  // The line above tinted everything. Start again and tint the paintwork only.
  vColor.rgb = color * mix(vec3(1.0), instanceColor.rgb, paint);
#endif
vGlow = lamp > 1.5 ? lamps.y : (lamp > 0.5 ? lamps.x : 0.0);`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow;',
      )
  }
  material.customProgramCacheKey = () => 'kanairo-vehicle-v1'
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
