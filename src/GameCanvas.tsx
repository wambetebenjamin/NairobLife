/**
 * The 3D view: one <Canvas> holding the physics world, the city, the player and the sky.
 *
 * Frame order matters and is set with useFrame priorities (lower runs first):
 *   -50  physics steps and places bodies        (<Physics updatePriority>)
 *   -20  player reads its new position          (player/Player.tsx)
 *   -10  camera follows the player              (player/CameraRig.tsx)
 *     0  everything else (sky, lights, HUD taps)
 * Keeping every priority at zero or below leaves React Three Fiber in charge of the
 * final render call.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { Suspense, useEffect, useRef } from 'react'
import { NeutralToneMapping } from 'three'
import { CAMERA, PLAYER } from './config/game'
import { translate } from './config/strings'
import { attachGame } from './game/actions'
import { exposeThree } from './game/debug'
import { CameraRig } from './player/CameraRig'
import { Player } from './player/Player'
import { useGame, useQuality, type Quality } from './state/gameStore'
import { runtime } from './state/runtime'
import { World } from './world/World'
import { Environment } from './world/environment/Environment'
import type { LoadedZone } from './world/zone/loadZone'

/** Upper limit on device pixel ratio: the single biggest lever on GPU cost. */
const MAX_DPR: Record<Exclude<Quality, 'auto'>, number> = { high: 1.75, medium: 1.25, low: 1 }

const PHYSICS_STEP = 1 / 60

/** Auto quality: two measuring windows in a row below this frame rate lower the graphics. */
const SLOW_FPS = 30
const FPS_WINDOW_SECONDS = 2

export function GameCanvas({ zone }: { zone: LoadedZone }) {
  const quality = useQuality()
  const paused = useGame((state) => state.phase === 'paused')
  // Antialiasing can only be chosen when the WebGL context is created.
  const antialias = useRef(quality !== 'low').current

  return (
    <Canvas
      className="game-canvas"
      shadows="percentage"
      dpr={Math.min(window.devicePixelRatio || 1, MAX_DPR[quality])}
      // A paused game is a still picture: stop rendering and let the laptop fan rest.
      frameloop={paused ? 'demand' : 'always'}
      gl={{ antialias, powerPreference: 'high-performance', toneMapping: NeutralToneMapping }}
      camera={{ fov: CAMERA.fov, near: CAMERA.near, far: CAMERA.far, position: [-520, 150, 210] }}
    >
      <Bindings />
      <Environment />
      <Suspense fallback={null}>
        <Physics
          timeStep={PHYSICS_STEP}
          interpolate
          updatePriority={-50}
          paused={paused}
          gravity={[0, -PLAYER.gravity, 0]}
        >
          <World zone={zone} />
          <Player zone={zone} />
          <CameraRig />
          <ReadySignal />
        </Physics>
      </Suspense>
      <FrameRateWatch />
    </Canvas>
  )
}

/** Hooks the page's keyboard and mouse up to the game once the canvas element exists. */
function Bindings() {
  const canvas = useThree((state) => state.gl.domElement)
  const get = useThree((state) => state.get)
  useEffect(() => attachGame(canvas), [canvas])
  useEffect(() => exposeThree(get()), [get])
  return null
}

/**
 * Tells the UI when the city is actually on screen: physics is up, shaders are compiled
 * and a few frames have been drawn. Only then does the loading screen lift.
 */
function ReadySignal() {
  const frames = useRef(0)
  useFrame(() => {
    if (frames.current < 0) return
    if (++frames.current >= 4) {
      frames.current = -1
      useGame.getState().setSceneReady()
    }
  })
  return null
}

/**
 * Measures the frame rate. On "auto" quality, a sustained low frame rate steps the
 * quality down one level and says so. It never steps back up, so it cannot flip-flop.
 */
function FrameRateWatch() {
  const stats = useRef({ frames: 0, seconds: 0, slowSpells: 0 }).current
  useFrame((_, delta) => {
    const game = useGame.getState()
    if (game.phase !== 'playing') {
      stats.frames = stats.seconds = stats.slowSpells = 0
      return
    }
    stats.frames++
    stats.seconds += delta
    if (stats.seconds < FPS_WINDOW_SECONDS) return
    const fps = stats.frames / stats.seconds
    runtime.fps = fps
    stats.frames = stats.seconds = 0
    stats.slowSpells = fps < SLOW_FPS ? stats.slowSpells + 1 : 0
    if (stats.slowSpells >= 2 && game.settings.quality === 'auto' && game.autoQuality !== 'low') {
      stats.slowSpells = 0
      game.setAutoQuality(game.autoQuality === 'high' ? 'medium' : 'low')
      game.toast(translate(game.settings.language, 'qualityLowered'))
    }
  })
  return null
}
