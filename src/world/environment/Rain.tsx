/**
 * Rain, drawn.
 *
 * Two and a half thousand streaks, each drawn as a short line leaning into the wind, in a
 * box that follows the camera. They fall, wrap round the top, and wrap round the sides
 * as the camera moves, so a small field fills the whole view without ever running out.
 *
 * The field is stepped on the CPU rather than in a shader. That is deliberate: it keeps
 * the geometry in ordinary buffers, where the tests can step it and say what it does, and
 * it costs a few hundred microseconds a frame. Drops fade out towards the edge of the
 * box, so there is no visible wall.
 *
 * A faster drop draws a longer streak, which is what a photograph of falling rain shows.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  LineBasicMaterial,
  type LineSegments,
} from 'three'
import { RainField, rainVisible } from './rainField'

/** Rain, in a box that follows the camera. `intensity` comes from the weather. */
export function Rain({ intensity }: { intensity: number }) {
  const camera = useThree((state) => state.camera)
  const field = useMemo(() => new RainField(), [])
  const geometry = useMemo(() => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(field.positions, 3))
    geometry.setAttribute('color', new BufferAttribute(field.colours, 3))
    return geometry
  }, [field])
  const material = useMemo(
    () =>
      new LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      }),
    [],
  )
  const mesh = useRef<LineSegments>(null)

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  useFrame((_, delta) => {
    // A dry day costs nothing at all: no stepping, no upload, no draw.
    if (mesh.current) mesh.current.visible = rainVisible(intensity)
    if (!rainVisible(intensity)) return
    // A tab that was in the background must not teleport every drop: step at most 0.1 s.
    field.focus(camera.position)
    field.step(Math.min(delta, 0.1), intensity)
    geometry.getAttribute('position').needsUpdate = true
    geometry.getAttribute('color').needsUpdate = true
  })

  return (
    <lineSegments
      ref={mesh}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={2}
    />
  )
}
