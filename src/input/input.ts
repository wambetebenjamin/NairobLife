/**
 * One place where keyboard, mouse and touch turn into "what the player wants".
 *
 * The simulation never looks at DOM events. It reads this object once per physics step:
 * move axes, a few held buttons, and look deltas that accumulate until consumed. That
 * keeps gameplay code identical for every input device.
 *
 * The same keys mean different things on foot and at the wheel (Space jumps, or pulls
 * the handbrake). This file does not know which; whoever reads it does.
 */
import { HELD_KEYS, TAP_KEYS, type HeldAction, type TapAction } from '../config/controls'

const held = new Set<HeldAction>()
const pressedCodes = new Set<string>()

/** Analogue values pushed in by the on-screen controls. */
const touch = { x: 0, y: 0, sprint: false, crouch: false, jump: false }

let lookX = 0
let lookY = 0
let zoomSteps = 0
let jumpQueued = false
let enabled = false

const tapListeners = new Set<(action: TapAction) => void>()

export const input = {
  /** Strafe (-1 left .. 1 right) and forward (-1 back .. 1 forward). Length never exceeds 1. */
  move(): { x: number; y: number } {
    if (!enabled) return ZERO
    let x = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0) + touch.x
    let y = (held.has('forward') ? 1 : 0) - (held.has('back') ? 1 : 0) + touch.y
    const len = Math.hypot(x, y)
    if (len > 1) {
      x /= len
      y /= len
    }
    return { x, y }
  },

  /**
   * The same two axes for driving: steering (-1 left .. 1 right) and pedals (-1 brake
   * and reverse .. 1 full power). Unlike `move`, each runs its full range whatever the
   * other is doing: flat out and full lock at once is what holding W and D means.
   */
  drive(): { steer: number; throttle: number } {
    if (!enabled) return PARKED
    let x = touch.x
    let y = touch.y
    // A thumb stick moves in a circle; stretch it to a square so the diagonals reach
    // full throttle and full lock together, as two keys do.
    const longest = Math.max(Math.abs(x), Math.abs(y))
    if (longest > 1e-3) {
      const stretch = Math.hypot(x, y) / longest
      x *= stretch
      y *= stretch
    }
    x += (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0)
    y += (held.has('forward') ? 1 : 0) - (held.has('back') ? 1 : 0)
    return { steer: Math.max(-1, Math.min(1, x)), throttle: Math.max(-1, Math.min(1, y)) }
  },

  sprint: () => enabled && (held.has('sprint') || touch.sprint),
  crouch: () => enabled && (held.has('crouch') || touch.crouch),
  jumpHeld: () => enabled && (held.has('jump') || touch.jump),

  /** True once per press of jump. */
  consumeJump(): boolean {
    const queued = jumpQueued
    jumpQueued = false
    return enabled && queued
  },

  /** Look movement since the last call, in radians (before the player's sensitivity setting). */
  consumeLook(): { x: number; y: number } {
    const delta = { x: lookX, y: lookY }
    lookX = 0
    lookY = 0
    return delta
  },

  /** Mouse wheel notches since the last call; positive zooms out. */
  consumeZoom(): number {
    const steps = zoomSteps
    zoomSteps = 0
    return steps
  },

  /** Turn by this many radians: positive dx looks right, positive dy looks down. */
  addLook(dx: number, dy: number): void {
    if (!enabled) return
    lookX += dx
    lookY += dy
  },

  addZoom(steps: number): void {
    if (enabled) zoomSteps += steps
  },

  setTouchMove(x: number, y: number): void {
    touch.x = x
    touch.y = y
  },

  setTouchButton(button: 'sprint' | 'crouch' | 'jump', down: boolean): void {
    if (button === 'jump' && down && !touch.jump) jumpQueued = true
    touch[button] = down
  },

  /** Gameplay input only counts while the game is actually being played. */
  setEnabled(value: boolean): void {
    enabled = value
    if (!value) input.reset()
  },

  reset(): void {
    held.clear()
    pressedCodes.clear()
    touch.x = touch.y = 0
    touch.sprint = touch.crouch = touch.jump = false
    lookX = lookY = zoomSteps = 0
    jumpQueued = false
  },

  /** Subscribe to one-shot actions (teleport menu, camera toggle...). Returns an unsubscribe. */
  onTap(listener: (action: TapAction) => void): () => void {
    tapListeners.add(listener)
    return () => tapListeners.delete(listener)
  },
}

const ZERO = { x: 0, y: 0 }
const PARKED = { steer: 0, throttle: 0 }

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  )
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return
  const action = HELD_KEYS[event.code]
  if (action) {
    if (enabled) event.preventDefault() // stop Space and the arrows scrolling the page
    if (!pressedCodes.has(event.code)) {
      pressedCodes.add(event.code)
      held.add(action)
      if (action === 'jump') jumpQueued = true
    }
    return
  }
  const tap = TAP_KEYS[event.code]
  if (tap && !event.repeat) for (const listener of tapListeners) listener(tap)
}

function onKeyUp(event: KeyboardEvent): void {
  const action = HELD_KEYS[event.code]
  if (!action) return
  pressedCodes.delete(event.code)
  // Two keys can map to one action (W and ArrowUp): release only when both are up.
  for (const code of pressedCodes) if (HELD_KEYS[code] === action) return
  held.delete(action)
}

/** Attach the global keyboard listeners. Returns a cleanup function. */
export function attachKeyboard(): () => void {
  const clear = () => {
    held.clear()
    pressedCodes.clear()
  }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  // Alt-tabbing away swallows the keyup; do not leave the player running into a wall.
  window.addEventListener('blur', clear)
  document.addEventListener('visibilitychange', clear)
  return () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', clear)
    document.removeEventListener('visibilitychange', clear)
  }
}
