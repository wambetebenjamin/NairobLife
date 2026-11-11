import { ShaderChunk } from 'three'
import { describe, expect, it } from 'vitest'
import { SPOT_LIGHT_LINE, catchHeadlights } from './groundMaterials'

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
