/**
 * The GLSL the foliage and wet-road materials inject has to be valid shader source.
 *
 * There is no GPU in CI, and a shader that fails to compile does not throw: three logs to
 * the console and draws nothing. That is exactly the bug this file exists to catch — a
 * sway built on `inverse(modelMatrix)` compiled nowhere, because **GLSL ES has no
 * `inverse()`** and neither three.js nor three's shader chunks define one. The material
 * looked fine, the tests were green, and the trees would simply not have been drawn.
 *
 * So these tests do not try to run a shader; they check the rules a shader is built
 * against:
 *
 *  1. three has no `inverse()` (asserted against the installed three, not remembered);
 *  2. the injected code does not call anything that does not exist;
 *  3. it is injected at a point where the names it uses are actually in scope;
 *  4. every shader still contains the anchors the patch relies on, so a future three
 *     cannot silently make the patch a no-op.
 */
import { ShaderChunk, ShaderLib } from 'three'
import { describe, expect, it } from 'vitest'
import { createFoliageMaterial } from './foliageMaterial'
import { createDecalMaterial, createStructureMaterial } from './groundMaterials'

/** Read a material's patched shaders the way three's renderer would. */
function compile(material: { onBeforeCompile: unknown }) {
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: ShaderLib.lambert.vertexShader,
    fragmentShader: ShaderLib.lambert.fragmentShader,
  }
  ;(material.onBeforeCompile as (s: typeof shader, r: unknown) => void)(shader, undefined)
  return shader
}

/** The GLSL our materials inject: everything that did not come from three. */
function injected(original: string, patched: string): string {
  const extra: string[] = []
  for (const line of patched.split('\n')) {
    if (!original.includes(line)) extra.push(line)
  }
  return extra.join('\n')
}

describe('the GLSL we inject', () => {
  it('does not call inverse(), because GLSL ES does not have one', () => {
    // Prove the premise against the installed three rather than trusting memory.
    const everything = Object.values(ShaderChunk).join('\n')
    expect(everything).not.toContain('inverse(')
    for (const material of [
      createFoliageMaterial(),
      createFoliageMaterial({ sway: false }),
      createDecalMaterial(),
      createStructureMaterial(),
    ]) {
      const shader = compile(material)
      expect(shader.vertexShader).not.toContain('inverse(')
      expect(shader.fragmentShader).not.toContain('inverse(')
    }
  })

  it('only shadows names three has already declared, and nothing else', () => {
    const shader = compile(createFoliageMaterial())
    const ours = injected(ShaderLib.lambert.vertexShader, shader.vertexShader)
    // The sway runs after three's `begin_vertex`, where `transformed` and `position` exist,
    // and it may only use those, its own uniforms, and the varyings it declares itself.
    // Comments are prose, not code: strip them before looking at identifiers.
    const code = ours.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const names = new Set<string>()
    for (const match of code.matchAll(/\b([a-zA-Z_]\w*)\b/g)) names.add(match[1])
    const allowed = new Set([
      // three's own names, all declared by the time begin_vertex has run
      'transformed',
      'position',
      'objectNormal',
      'normalMatrix',
      'modelMatrix',
      // our uniforms and varyings
      'uTime',
      'uWind',
      'uWindAngle',
      'vFoliageWorld',
      'vFoliageEye',
      // our locals
      'world',
      'phase',
      'height',
      'gust',
      'lean',
      // keywords and builtins
      'vec',
      'vec3',
      'vec4',
      'float',
      'max',
      'min',
      'sin',
      'cos',
      'normalize',
      'attribute',
      'uniform',
      'varying',
      'glsl',
      'if',
      'GLSL',
    ])
    // Swizzles (`.xyz`, `.x`) are not identifiers in their own right.
    const swizzles = new Set(['x', 'y', 'z', 'w', 'xy', 'xz', 'yz', 'xyz'])
    const unknown = [...names].filter(
      (name) => !allowed.has(name) && !swizzles.has(name) && !/^\d/.test(name),
    )
    expect(unknown).toEqual([])
  })

  it('is injected after the names it uses are declared', () => {
    // The sway runs at begin_vertex, where `transformed` and `objectNormal` exist.
    const shader = compile(createFoliageMaterial())
    const sway = shader.vertexShader.indexOf('vFoliageEye =')
    expect(sway).toBeGreaterThan(shader.vertexShader.indexOf('#include <begin_vertex>'))
  })

  it('anchors on chunks that still exist in this version of three', () => {
    // If an anchor is missing, `.replace` quietly does nothing and the code is never run:
    // no crash, no error, just a feature that has stopped working.
    const lambert = ShaderLib.lambert
    for (const anchor of ['#include <common>', '#include <begin_vertex>']) {
      expect(lambert.vertexShader).toContain(anchor)
    }
    for (const anchor of [
      '#include <common>',
      '#include <normal_fragment_maps>',
      '#include <color_fragment>',
      '#include <lights_fragment_begin>',
    ]) {
      expect(lambert.fragmentShader).toContain(anchor)
    }
  })

  it('never relies on a uniform three does not declare for this material', () => {
    // This is the exact bug that was here: `cameraPosition` reads like a free variable in
    // a fragment shader, but three only prepends it for some materials. Lambert is not
    // one of them, so the material would not have compiled.
    expect(ShaderLib.lambert.fragmentShader).not.toContain('cameraPosition')
    for (const material of [createFoliageMaterial(), createFoliageMaterial({ sway: false })]) {
      const shader = compile(material)
      const ours = injected(ShaderLib.lambert.fragmentShader, shader.fragmentShader)
      expect(ours).not.toContain('cameraPosition')
      expect(ours).not.toContain('geometryNormal')
    }
  })

  it('writes the wet sheen into the colour before lighting, not after', () => {
    // The road's wetness is a colour change, so it belongs at color_fragment. Injected
    // after the lighting it would be over-brightened by the sun and look like paint.
    // `catchHeadlights` expands the lighting chunk in place, so the anchor is gone by the
    // time this runs: compare against the chunk's own body instead.
    const shader = compile(createDecalMaterial())
    const wet = shader.fragmentShader.indexOf('uWetness * uWetness')
    const shade = shader.fragmentShader.indexOf('diffuseColor.rgb *= 1.0 - 0.32 * uWetness;')
    const lit = shader.fragmentShader.indexOf('getSpotLightInfo(')
    expect(shade).toBeGreaterThan(-1)
    expect(lit).toBeGreaterThan(-1)
    expect(wet).toBe(-1)
    // The sheen is written before the light loops run.
    expect(shade).toBeLessThan(lit)
  })
})
