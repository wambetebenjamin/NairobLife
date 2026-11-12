/**
 * Rain.
 *
 * A single instanced mesh of thin quads drawn as near-vertical streaks that lean with
 * the wind. Everything happens in a box that follows the camera: drops wrap from the top
 * back to the bottom as they fall, and wrap around the camera horizontally, so a few
 * thousand of them fill the whole view.
 *
 * Two details make it read as rain rather than as falling dashes:
 *
 *  - each drop is a quad stretched along its own motion, so a faster drop is a longer
 *    streak, which is what a photograph shows too;
 *  - drops fade at their near and far edges, so the field has no visible wall or edge.
 *
 * The drops are seeded once and never re-randomised: only the wrap does the work, so the
 * pattern is stable while the camera moves. When the weather eases the whole field
 * thins out and then disappears.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { rainVisible } from './rainField'
import {
  BufferAttribute,
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  NormalBlending,
  ShaderMaterial,
  Vector3,
  type Mesh,
} from 'three'

/** Drops in the field: enough for a downpour without costing a frame. */
const DROPS = 2600
/** The box the rain lives in, centred on the camera: metres across and tall. */
const SPREAD = 70
const HEIGHT = 46
/** Fall speed in metres per second, and the lean given by the wind. */
const FALL = 15
const WIND = 2.1

const VERTEX = /* glsl */ `
attribute vec3 aOffset;
attribute vec2 aCorner;
uniform float uTime;
uniform vec3 uCamera;
uniform float uIntensity;
uniform float uSpread;
uniform float uHeight;
uniform float uFall;
uniform float uWind;
varying float vFade;

void main() {
  // The drop's head falls, drifting with the wind.
  float speed = uFall * (0.75 + 0.5 * fract(aOffset.x * 0.137));
  // The field rises with the camera, so rain still falls on the KICC helipad, but its
  // base never goes below the ground.
  float base = max(uCamera.y - uHeight * 0.55, 0.0);
  float y = base + mod(aOffset.y - uTime * speed, uHeight);
  vec3 head = vec3(aOffset.x + uWind * uTime * 0.25, y, aOffset.z + uWind * uTime * 0.1);

  // Wrap the field around the camera horizontally only: a drop that wrapped vertically
  // would be seen to jump, so the height wraps against the ground instead.
  head.xz = mod(head.xz - uCamera.xz + uSpread * 0.5, uSpread) - uSpread * 0.5 + uCamera.xz;

  // A streak is the drop's own motion in a short slice of time, so a faster drop draws
  // a longer line.
  float length = speed * 0.05 * (0.6 + uIntensity);
  vec3 streak = vec3(uWind * 0.05, -length, uWind * 0.02);

  vec3 world = head + streak * (aCorner.y - 1.0);
  // Widen across the streak's own direction, so the quad is seen edge-on from any angle.
  vec3 across = normalize(cross(streak, vec3(0.0, 1.0, 0.0)) + vec3(1e-5));
  world += across * aCorner.x * 0.04;

  float distance = length(world - uCamera);
  // Fade the near and far edges of the field, so drops do not pop in and out.
  vFade = uIntensity * smoothstep(0.5, 4.0, distance) * (1.0 - smoothstep(uSpread * 0.28, uSpread * 0.5, distance));

  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vFade;

void main() {
  if (vFade <= 0.002) discard;
  gl_FragColor = vec4(uColor, vFade * 0.55);
}
`

/** A camera-independent geometry: the drops are placed in the shader. */
function createGeometry(): InstancedBufferGeometry {
  const geometry = new InstancedBufferGeometry()
  // Two triangles per drop, described by a corner pair in the shader.
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(12), 3))
  geometry.setAttribute(
    'aCorner',
    new BufferAttribute(new Float32Array([-1, 0, 1, 0, -1, 1, 1, 1]), 2),
  )
  geometry.setIndex([0, 1, 2, 2, 1, 3])

  const offsets = new Float32Array(DROPS * 3)
  for (let i = 0; i < DROPS; i++) {
    offsets[i * 3] = Math.random() * SPREAD
    offsets[i * 3 + 1] = Math.random() * HEIGHT
    offsets[i * 3 + 2] = Math.random() * SPREAD
  }
  geometry.setAttribute('aOffset', new InstancedBufferAttribute(offsets, 3))
  geometry.instanceCount = DROPS
  return geometry
}

/**
 * Rain, in a box that follows the camera. `intensity` comes from the weather: 0 hides
 * the mesh entirely.
 */
export function Rain({ intensity }: { intensity: number }) {
  const camera = useThree((state) => state.camera)
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uCamera: { value: new Vector3() },
          uIntensity: { value: 0 },
          uSpread: { value: SPREAD },
          uHeight: { value: HEIGHT },
          uFall: { value: FALL },
          uWind: { value: WIND },
          uColor: { value: new Color('#c9d6e4').convertSRGBToLinear() },
        },
        transparent: true,
        depthWrite: false,
        blending: NormalBlending,
      }),
    [],
  )
  const geometry = useMemo(createGeometry, [])
  const mesh = useRef<Mesh>(null)

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  useFrame((_, delta) => {
    const uniforms = material.uniforms
    uniforms.uTime.value += delta
    uniforms.uIntensity.value = intensity
    uniforms.uCamera.value.copy(camera.position)
    if (mesh.current) mesh.current.visible = rainVisible(intensity)
  })

  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      renderOrder={2}
    />
  )
}
