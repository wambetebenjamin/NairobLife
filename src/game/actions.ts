/**
 * Things the player can do that are bigger than moving: start, pause, teleport, change
 * a setting from the keyboard. Menus, HUD buttons and key presses all call these, so
 * each action behaves the same wherever it is triggered from.
 */
import type { TapAction } from '../config/controls'
import { TIME } from '../config/game'
import { getLandmark, type Landmark } from '../config/landmarks'
import { translate, type StringKey } from '../config/strings'
import { attachKeyboard, input } from '../input/input'
import { attachPointer } from '../input/pointer'
import { resolveLandmark } from '../player/teleport'
import { HAZE_ORDER, QUALITY_ORDER, cycle, useGame } from '../state/gameStore'
import { runtime } from '../state/runtime'
import type { RideRoute } from '../vehicles/ride/routes'

let canvas: HTMLCanvasElement | null = null
let welcomed = false

const game = () => useGame.getState()
const t = (key: StringKey) => translate(game().settings.language, key)

// ------------------------------------------------------------------ pointer lock

function lockPointer(): void {
  if (!canvas || game().touch || document.pointerLockElement === canvas) return
  try {
    // Newer browsers return a promise. It rejects if the player pressed Esc a moment
    // ago or the page is embedded without permission; the game then runs in
    // click-and-drag mode and the HUD says so.
    const pending = canvas.requestPointerLock() as Promise<void> | undefined
    pending?.catch(() => {})
  } catch {
    /* same as a rejection */
  }
}

function unlockPointer(): void {
  if (document.pointerLockElement) document.exitPointerLock()
}

// ------------------------------------------------------------------ flow

/** Cut to black, then fade back in: hides camera jumps. */
function curtain(holdMs: number, then?: () => void): void {
  game().setCurtain(true)
  window.setTimeout(() => {
    game().setCurtain(false)
    then?.()
  }, holdMs)
}

export function startGame(): void {
  if (!game().sceneReady) return
  lockPointer()
  curtain(90)
  game().setPhase('playing')
  if (!welcomed) {
    welcomed = true
    game().toast(`${t('welcome')} · KICC, City Square`)
  }
}

export function pauseGame(): void {
  if (game().phase !== 'playing') return
  game().setPhase('paused')
  unlockPointer()
}

export function resumeGame(): void {
  if (game().phase !== 'paused') return
  game().setPhase('playing')
  if (!runtime.ride) lockPointer()
}

export function quitToMenu(): void {
  if (runtime.ride) finishRide(false)
  curtain(90)
  game().setPhase('menu')
  unlockPointer()
}

export function openTeleport(): void {
  if (game().phase !== 'playing' || runtime.ride) return
  game().setTeleportOpen(true)
  unlockPointer()
}

export function closeTeleport(): void {
  game().setTeleportOpen(false)
  if (game().phase === 'playing' && !runtime.ride) lockPointer()
}

export function teleportTo(landmark: Landmark): void {
  const zone = game().zone
  if (!zone || landmark.zone !== zone.id) return
  if (game().phase === 'paused') game().setPhase('playing')
  closeTeleport()
  runtime.teleport = resolveLandmark(landmark, zone)
  // Hold the curtain until the physics has moved the player and the camera has caught up.
  curtain(220, () => game().toast(`${t('arrived')} ${landmark.name}`))
}

export function teleportToId(id: string): void {
  const landmark = getLandmark(id)
  if (landmark) teleportTo(landmark)
}

/** Ride an imaginary shuttle between mapped stages, over the one-way road graph. */
export function beginRide(route: RideRoute): void {
  const zone = game().zone
  if (!zone || runtime.ride || runtime.driving >= 0) {
    game().toast('Leave your vehicle before taking a matatu ride.')
    return
  }
  const p = runtime.player
  const [x, z] = zone.index.safeSpawn(route.to.x, route.to.z)
  runtime.ride = {
    route,
    distance: 0,
    // Compress a real street journey into a watchable 18–45 second tour.
    speed: route.length / Math.max(18, Math.min(45, route.length / 22)),
    origin: { x: p.x, y: p.y, z: p.z, yaw: runtime.camera.yaw, onTop: false },
    destination: { x, z, yaw: runtime.camera.yaw, onTop: false },
  }
  game().setRide({ from: route.from.name, to: route.to.name })
  if (game().phase === 'paused') game().setPhase('playing')
  closeTeleport()
  unlockPointer()
  input.reset()
  curtain(180)
}

/** Arrive now, or cancel and return to where the ride was requested. */
export function finishRide(arrive: boolean): void {
  const ride = runtime.ride
  if (!ride) return
  runtime.teleport = arrive ? ride.destination : ride.origin
  runtime.ride = null
  game().setRide(null)
  input.reset()
  curtain(220, () => game().toast(arrive ? `Arrived: ${ride.route.to.name}` : 'Ride cancelled'))
}

// ------------------------------------------------------------------ quick settings

export function cycleQuality(): void {
  const quality = cycle(QUALITY_ORDER, game().settings.quality)
  game().updateSettings({ quality })
  const label = {
    auto: 'qualityAuto',
    high: 'qualityHigh',
    medium: 'qualityMedium',
    low: 'qualityLow',
  } as const
  game().toast(`${t('quality')}: ${t(label[quality])}`)
}

export function cycleHaze(): void {
  const haze = cycle(HAZE_ORDER, game().settings.haze)
  game().updateSettings({ haze })
  const label = { clear: 'hazeClear', hazy: 'hazeHazy', dusty: 'hazeDusty' } as const
  game().toast(`${t('haze')}: ${t(label[haze])}`)
}

export function toggleCamera(): void {
  const cameraMode = game().settings.cameraMode === 'third' ? 'first' : 'third'
  game().updateSettings({ cameraMode })
  game().toast(t(cameraMode === 'first' ? 'cameraFirst' : 'cameraThird'))
}

export function toggleHud(): void {
  game().updateSettings({ showHud: !game().settings.showHud })
}

/** Jump the clock: handy for seeing the city at dusk without waiting for it. */
export function shiftTime(hours: number): void {
  runtime.time = (((runtime.time + hours) % 24) + 24) % 24
}

export function resetTime(): void {
  runtime.time = TIME.startHour
}

/**
 * Get into the nearest vehicle, or out of the one being driven. The fleet decides which
 * on its next physics step (vehicles/driving.ts); this only passes on the request.
 */
export function enterOrExitVehicle(): void {
  if (game().phase === 'playing' && !runtime.ride) runtime.enterExit = true
}

export function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen?.().catch(() => {})
}

// ------------------------------------------------------------------ wiring

function onTap(action: TapAction): void {
  if (game().phase !== 'playing' || runtime.ride) return
  if (game().teleportOpen) {
    if (action === 'teleport') closeTeleport()
    return
  }
  switch (action) {
    case 'teleport':
      return openTeleport()
    case 'camera':
      return toggleCamera()
    case 'hud':
      return toggleHud()
    case 'quality':
      return cycleQuality()
    case 'haze':
      return cycleHaze()
    case 'timeBack':
      return shiftTime(-1)
    case 'timeForward':
      return shiftTime(1)
    case 'fullscreen':
      return toggleFullscreen()
    case 'enterVehicle':
      return enterOrExitVehicle()
    case 'reconPulse':
      // TODO(gameplay): reserved for a scan/ping ability in later modes.
      return
  }
}

function onEscape(event: KeyboardEvent): void {
  if (event.code !== 'Escape') return
  // While the mouse is locked the browser keeps Esc for itself and we hear about it
  // through onLockChange instead. This handler covers every other case.
  const state = game()
  if (state.teleportOpen) closeTeleport()
  else if (state.phase === 'playing') pauseGame()
  else if (state.phase === 'paused' && !state.settingsOpen) resumeGame()
  else if (state.settingsOpen) state.setSettingsOpen(false)
}

/**
 * Connect the game to the page: keyboard, mouse, and the rules for when gameplay input
 * counts. Called once when the 3D canvas exists; returns a cleanup function.
 */
export function attachGame(element: HTMLCanvasElement): () => void {
  canvas = element

  const detachKeyboard = attachKeyboard()
  const detachPointer = attachPointer(element, {
    onLockChange(locked) {
      const state = game()
      state.setPointerLocked(locked)
      // Losing the lock while playing means the player pressed Esc (or left the window).
      if (
        !locked &&
        state.phase === 'playing' &&
        !state.teleportOpen &&
        !state.touch &&
        !state.ride
      )
        pauseGame()
    },
    onCanvasClick() {
      if (game().phase === 'playing' && !game().teleportOpen && !runtime.ride) lockPointer()
    },
  })
  const offTap = input.onTap(onTap)
  window.addEventListener('keydown', onEscape)

  // Gameplay input counts only while actually playing with no menu on top.
  const sync = () =>
    input.setEnabled(game().phase === 'playing' && !game().teleportOpen && !runtime.ride)
  sync()
  const unsubscribe = useGame.subscribe(sync)

  // Phones and tablets: the first touch switches the HUD to on-screen controls.
  const onTouch = () => game().setTouch(true)
  window.addEventListener('touchstart', onTouch, { once: true, passive: true })

  // Pause when the tab is hidden, so the clock and the player do not run on unseen.
  const onVisibility = () => {
    if (document.hidden) pauseGame()
  }
  document.addEventListener('visibilitychange', onVisibility)

  return () => {
    detachKeyboard()
    detachPointer()
    offTap()
    unsubscribe()
    window.removeEventListener('keydown', onEscape)
    window.removeEventListener('touchstart', onTouch)
    document.removeEventListener('visibilitychange', onVisibility)
    canvas = null
  }
}
