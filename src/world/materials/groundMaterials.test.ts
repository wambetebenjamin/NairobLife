import { ShaderChunk, ShaderLib, type MeshLambertMaterial, type ShaderMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import {
  SPOT_LIGHT_LINE,
  catchHeadlights,
  createDecalMaterial,
  createStructureMaterial,
  wetUniforms,
} from './groundMaterials'

describe('catchHeadlights', () => {
  const shader =
    'void main() {\n#include <lights_fragment_begin>\n#include <lights_fragment_end>\n}'

  it('still finds the line of three.js it rewrites', () => {
    // If this fails after upgrading three.js, roads will be black in headlights at night:
    // find the new wording of the spot light loop and update SPOT_LIGHT_LINE.
    expect(ShaderChunk.lights_fragment_begin).toContain(SPOT_LIGHT_LINE)
    expect(ShaderChunk.lights_fragment_begin.split(SPOT_LIGHT_LINE)).toHaveLength(2)
  })

  it('swaps the lighting code for a copy that ignores the angle of spot lights', () => {
    const patched = catchHeadlights(shader)
    expect(patched).not.toContain('#include <lights_fragment_begin>')
    expect(patched).toContain('#include <lights_fragment_end>')
    expect(patched.split('directLight.color /= max(')).toHaveLength(2)
    // Only the spot light loop is touched: the sun and other lights keep their shading.
    const at = patched.indexOf('directLight.color /= max(')
    expect(patched.lastIndexOf('NUM_SPOT_LIGHTS', at)).toBeGreaterThan(
      patched.lastIndexOf('NUM_POINT_LIGHTS', at),
    )
    expect(patched.indexOf('NUM_DIR_LIGHTS', at)).toBeGreaterThan(at)
  })

  it('leaves a shader with no lighting alone', () => {
    expect(catchHeadlights('void main() {}')).toBe('void main() {}')
  })
})

describe('wet roads', () => {
  // The shader patches below are strings handed to three.js's own Lambert shader. If a
  // chunk name changes, `.replace` quietly does nothing and the road simply stays dry,
  // which no other test would catch. So check the real chunks the material patches.
  it('finds the chunks it patches, in this version of three.js', () => {
    for (const chunk of [
      ShaderChunk.common,
      ShaderChunk.begin_vertex,
      ShaderChunk.color_fragment,
    ]) {
      expect(chunk).toBeTruthy()
    }
    expect(ShaderLib.lambert.vertexShader).toContain('#include <begin_vertex>')
    expect(ShaderLib.lambert.fragmentShader).toContain('#include <color_fragment>')
  })

  it('shares one wetness uniform between the decals and the flyover decks', () => {
    const decals = createDecalMaterial()
    const structures = createStructureMaterial()
    const decalShader = compile(decals)
    const structureShader = compile(structures)
    expect(decalShader.uniforms.uWetness).toBe(wetUniforms.uWetness)
    expect(structureShader.uniforms.uWetness).toBe(wetUniforms.uWetness)
    // The patch actually landed, rather than silently missing the anchor.
    expect(decalShader.fragmentShader).toContain('uWetness')
    expect(structureShader.fragmentShader).toContain('uWetness')
    expect(decalShader.vertexShader).toContain('vWetView')
  })
})

/** Run a material's `onBeforeCompile` against stub shaders that carry the anchors. */
function compile(material: ShaderMaterial | MeshLambertMaterial) {
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: ShaderLib.lambert.vertexShader,
    fragmentShader: ShaderLib.lambert.fragmentShader,
  }
  material.onBeforeCompile(shader as never, undefined as never)
  return shader
}
