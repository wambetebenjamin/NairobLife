/**
 * Sun, sky, fog and the clock.
 *
 * Once per frame this advances the time of day, asks skyModel.ts what the light should
 * look like, and applies the answer to the lights, the fog, the sky dome and the lit
 * windows. The sun's shadow covers a box that follows the player, so shadows are sharp
 * nearby without rendering the whole city into the shadow map.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, FogExp2, Vector3, type DirectionalLight, type HemisphereLight } from 'three'
import { TIME } from '../../config/game'
import { useGame, useQuality } from '../../state/gameStore'
import { runtime } from '../../state/runtime'
import { facadeUniforms } from '../materials/buildingMaterial'
import { wetUniforms } from '../materials/groundMaterials'
import { Rain } from './Rain'
import { Sky } from './Sky'
import { computeSky, createSkyState } from './skyModel'
import { computeWeather, createWeatherState } from './weather'

const HOURS_PER_SECOND = 24 / (TIME.dayLengthMinutes * 60)

/** Shadow box: half-width in metres, and shadow-map resolution, per quality level. */
const SHADOWS = {
  high: { extent: 95, mapSize: 2048 },
  medium: { extent: 70, mapSize: 1024 },
  low: null,
} as const

/** How far up the light direction the shadow camera sits; must clear the tallest tower. */
const LIGHT_DISTANCE = 450
/** 0 = glass mirrors the sky's full colour, 1 = glass is neutral grey. */
const GLASS_GREYING = 0.45
/** Share of windows with the lights on once it is fully dark. */
const LIT_WINDOWS = 0.4

/**
 * The real date at load, which decides whether it is the rains or the dry season. Read
 * once: a session that runs past midnight should not have the weather change under it,
 * but the timestamp is cheap to keep and honest about when the session began.
 */
const NOW = new Date()

const right = new Vector3()
const up = new Vector3()
const dir = new Vector3()
const centre = new Vector3()
const WORLD_UP = new Vector3(0, 1, 0)

export function Environment() {
  const quality = useQuality()
  const shadows = SHADOWS[quality]
  const scene = useThree((state) => state.scene)
  const sun = useRef<DirectionalLight>(null)
  const hemisphere = useRef<HemisphereLight>(null)
  const sky = useMemo(() => createSkyState(), [])
  const weather = useMemo(() => createWeatherState(), [])
  const weatherSetting = useGame((state) => state.settings.weather)
  const fog = useMemo(() => new FogExp2(0xffffff, 0.0003), [])
  const background = useMemo(() => new Color(), [])

  useEffect(() => {
    scene.fog = fog
    scene.background = background
    return () => {
      scene.fog = null
      scene.background = null
    }
  }, [scene, fog, background])

  // The light's target must be in the scene for its position to count.
  useEffect(() => {
    const light = sun.current
    if (!light) return
    scene.add(light.target)
    return () => {
      scene.remove(light.target)
    }
  }, [scene, quality])

  useFrame((_, delta) => {
    const game = useGame.getState()
    if (game.phase === 'playing' || game.phase === 'menu') {
      runtime.time = (runtime.time + Math.min(delta, 0.1) * HOURS_PER_SECOND + 24) % 24
    }
    computeSky(runtime.time, game.settings.haze, sky)
    computeWeather(NOW, runtime.time, weatherSetting, weather)
    // Rain dims the sun and flattens the sky: the skydome reads the result, so the two
    // never disagree about how bright the day is.
    for (const channel of ['zenith', 'horizon', 'hemiSky', 'hemiGround'] as const) {
      const space = sky[channel]
      const grey = 0.2126 * space[0] + 0.7152 * space[1] + 0.0722 * space[2]
      for (let i = 0; i < 3; i++) space[i] += (grey - space[i]) * weather.overcast * 0.75
    }
    sky.lightIntensity *= weather.light
    sky.hemiIntensity *= 0.6 + 0.4 * weather.light
    sky.fogDensity /= Math.max(0.35, weather.visibility)
    runtime.rain = weather.intensity
    runtime.wetness = weather.wetness
    // The road mirrors the sky, so it reflects whatever the horizon is doing right now.
    wetUniforms.uWetness.value = weather.wetness
    wetUniforms.uSky.value.setRGB(sky.horizon[0], sky.horizon[1], sky.horizon[2])
    runtime.night = sky.night

    fog.color.setRGB(sky.horizon[0], sky.horizon[1], sky.horizon[2])
    fog.density = sky.fogDensity
    background.copy(fog.color)

    if (hemisphere.current) {
      hemisphere.current.color.setRGB(sky.hemiSky[0], sky.hemiSky[1], sky.hemiSky[2])
      hemisphere.current.groundColor.setRGB(sky.hemiGround[0], sky.hemiGround[1], sky.hemiGround[2])
      hemisphere.current.intensity = sky.hemiIntensity
    }

    const light = sun.current
    if (light) {
      light.color.setRGB(sky.lightColor[0], sky.lightColor[1], sky.lightColor[2])
      light.intensity = sky.lightIntensity
      dir.set(sky.lightDir[0], sky.lightDir[1], sky.lightDir[2])
      centre.set(runtime.player.x, runtime.player.y, runtime.player.z)

      if (shadows) {
        // Move the shadow box in whole shadow-map pixels. Without this, shadow edges
        // crawl every time the player takes a step.
        const texel = (shadows.extent * 2) / shadows.mapSize
        right.crossVectors(WORLD_UP, dir).normalize()
        up.crossVectors(dir, right)
        const r = Math.round(centre.dot(right) / texel) * texel
        const u = Math.round(centre.dot(up) / texel) * texel
        const d = centre.dot(dir)
        centre.set(0, 0, 0).addScaledVector(right, r).addScaledVector(up, u).addScaledVector(dir, d)
      }
      light.target.position.copy(centre)
      light.position.copy(centre).addScaledVector(dir, LIGHT_DISTANCE)
    }

    // Windows start to light up at dusk. Glass mirrors the sky: its colour halfway up,
    // a little greyed because the reflection is of haze as much as of blue.
    facadeUniforms.uLit.value = sky.night * LIT_WINDOWS
    const r = sky.zenith[0] * 0.5 + sky.horizon[0] * 0.5
    const g = sky.zenith[1] * 0.5 + sky.horizon[1] * 0.5
    const b = sky.zenith[2] * 0.5 + sky.horizon[2] * 0.5
    const grey = 0.2126 * r + 0.7152 * g + 0.0722 * b
    facadeUniforms.uGlass.value.setRGB(
      r + (grey - r) * GLASS_GREYING,
      g + (grey - g) * GLASS_GREYING,
      b + (grey - b) * GLASS_GREYING,
    )
  })

  return (
    <>
      <Sky sky={sky} clouds={quality !== 'low'} />
      <Rain intensity={weather.intensity} />
      <hemisphereLight ref={hemisphere} />
      {/* Remounted when quality changes so the shadow map is rebuilt at the new size. */}
      <directionalLight
        key={quality}
        ref={sun}
        castShadow={!!shadows}
        shadow-mapSize={shadows ? [shadows.mapSize, shadows.mapSize] : [512, 512]}
        shadow-bias={-0.00012}
        shadow-normalBias={0.14}
      >
        {shadows && (
          <orthographicCamera
            attach="shadow-camera"
            args={[
              -shadows.extent,
              shadows.extent,
              shadows.extent,
              -shadows.extent,
              1,
              LIGHT_DISTANCE + 500,
            ]}
          />
        )}
      </directionalLight>
    </>
  )
}
