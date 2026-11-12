/**
 * The sky dome: gradient, sun, moon, stars and drifting clouds, in one small shader.
 *
 * It is a sphere that follows the camera and always draws at maximum depth, so it sits
 * behind the whole city however far away that is. Its colour at the horizon is the fog
 * colour, which is what makes distant buildings melt into the sky rather than stop.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BackSide, Color, ShaderMaterial, Vector3, type Mesh } from 'three'
import type { SkyState } from './skyModel'

const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // Pin the dome to the far plane: it is behind everything else, at any distance.
  gl_Position.z = gl_Position.w * 0.99999;
}
`

const FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uCloudColor;
uniform float uNight;
uniform float uSunVisible;
uniform float uTime;
varying vec3 vDir;

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x),
    mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * noise(p);
    p = p * 2.03 + 17.0;
    amp *= 0.5;
  }
  return sum;
}

void main() {
  vec3 dir = normalize(vDir);
  float up = max(dir.y, 0.0);
  float above = smoothstep(-0.01, 0.02, dir.y);

  // Below the horizon the dome is plain fog colour, so the ground fades into it.
  vec3 col = mix(uHorizon, uZenith, pow(up, 0.5));

  float sunDot = max(dot(dir, uSunDir), 0.0);
  float moonDot = max(dot(dir, -uSunDir), 0.0);

  // Warm glow around the sun, strongest when it is low.
  col += uSunColor * (pow(sunDot, 9.0) * 0.16 + pow(sunDot, 90.0) * 0.3) * uSunVisible * above;

#ifdef CLOUDS
  if (dir.y > 0.0) {
    // Project the view ray onto a flat cloud layer; the 0.1 bends it down at the horizon.
    vec2 uv = dir.xz / (dir.y + 0.1) * 0.55 + uTime * vec2(0.004, 0.0015);
    float density = fbm(uv);
    float cover = smoothstep(0.5, 0.78, density) * smoothstep(0.015, 0.2, dir.y);
    // Thicker parts are a little darker underneath.
    vec3 cloud = uCloudColor * (1.08 - 0.3 * smoothstep(0.6, 0.9, density));
    col = mix(col, cloud, cover * 0.9);
  }
#endif

  // Sun and moon discs.
  col += uSunColor * smoothstep(0.99962, 0.99978, sunDot) * 4.0 * uSunVisible * above;
  col = mix(col, vec3(0.92, 0.94, 1.0), smoothstep(0.99975, 0.99985, moonDot) * uNight * above);

  // Stars: a sparse grid of points on the sphere, fading in with the night.
  if (uNight > 0.01) {
    vec3 p = dir * 140.0;
    vec3 cell = floor(p);
    float star = step(0.9972, hash3(cell));
    float falloff = 1.0 - smoothstep(0.0, 0.38, length(fract(p) - 0.5));
    col += vec3(0.9, 0.95, 1.0) * star * falloff * uNight * smoothstep(0.02, 0.3, dir.y) * (0.5 + hash3(cell + 7.0));
  }

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`

export function Sky({ sky, clouds }: { sky: SkyState; clouds: boolean }) {
  const mesh = useRef<Mesh>(null)

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        defines: clouds ? { CLOUDS: '' } : {},
        uniforms: {
          uZenith: { value: new Color() },
          uHorizon: { value: new Color() },
          uSunDir: { value: new Vector3(0, 1, 0) },
          uSunColor: { value: new Color() },
          uCloudColor: { value: new Color() },
          uNight: { value: 0 },
          uSunVisible: { value: 1 },
          uTime: { value: 0 },
        },
        side: BackSide,
        depthWrite: false,
        fog: false,
        // Fog is not tone mapped either, so sky and fog stay the same colour on screen.
        toneMapped: false,
      }),
    [clouds],
  )

  useEffect(() => () => material.dispose(), [material])

  useFrame(({ camera, clock }) => {
    mesh.current?.position.copy(camera.position)
    const u = material.uniforms
    u.uZenith.value.setRGB(sky.zenith[0], sky.zenith[1], sky.zenith[2])
    u.uHorizon.value.setRGB(sky.horizon[0], sky.horizon[1], sky.horizon[2])
    u.uSunDir.value.set(sky.sunDir[0], sky.sunDir[1], sky.sunDir[2])
    u.uSunColor.value.setRGB(sky.sunColor[0], sky.sunColor[1], sky.sunColor[2])
    u.uCloudColor.value.setRGB(sky.cloud[0], sky.cloud[1], sky.cloud[2])
    u.uNight.value = sky.night
    u.uSunVisible.value = sky.sunVisible
    u.uTime.value = clock.elapsedTime
  })

  return (
    <mesh ref={mesh} material={material} frustumCulled={false} renderOrder={2} scale={50}>
      <sphereGeometry args={[1, 32, 16]} />
    </mesh>
  )
}
