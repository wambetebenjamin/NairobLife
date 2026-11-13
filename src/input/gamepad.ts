/**
 * A controller, folded into the same input state as the keyboard.
 *
 * Nothing below this file knows a gamepad exists: the decoder here writes through the same
 * `input` object the keyboard does, so the player, the camera and the vehicles are
 * unchanged. That is the whole point of having one input state.
 *
 * Two things make a gamepad unlike a keyboard, and both are handled here:
 *
 *  - **Everything is analogue.** A stick is a pair of numbers from −1 to 1 with a wobble
 *    around the middle, and a trigger is a number. So sticks get a dead zone and a curve
 *    (small movements near the centre are ignored, and what is left is shaped so that
 *    aiming is fine near the centre and fast at the edge); triggers are read as buttons
 *    once past a threshold, because walking and sprinting are not analogue in this game.
 *  - **Buttons are state, not events.** A browser reports "button 0 is held" every frame.
 *    A jump is an edge: it has to fire once per press, so the decoder remembers what was
 *    down last frame and finds the rising edge.
 *
 * The mapping is the standard one (the W3C "standard gamepad"), which is what an Xbox
 * pad and most others report: left stick to move, right stick to look, A to jump, B to
 * sprint, X to crouch, Y to get in and out of a car, D-pad up to the map, Start to pause.
 *
 * A pad with no right stick still works: the D-pad's left and right arrows turn the
 * camera when the right stick is exactly at rest. That is not a fallback anyone would
 * choose over a second stick, but it is the difference between being able to turn round
 * and being stuck facing a wall.
 */
import type { HeldAction, MenuAction, TapAction } from '../config/controls'

/** The dead zone of a stick: about a fifth of the way out, which covers the wobble. */
export const DEAD_ZONE = 0.2
/** Past this, a trigger counts as pressed. Real triggers rest around 0, and often leak. */
export const TRIGGER = 0.45
/** How fast the right stick turns the camera when held hard over, radians a second. */
export const LOOK_RATE = 2.6
/** Buttons that map straight to a held action. */
export const PAD_BUTTONS: Record<number, HeldAction> = {
  0: 'jump',
  1: 'sprint',
  2: 'crouch',
  // The right trigger is a throttle in most games; here it sprints, so a racing player's
  // muscle memory is not fighting them.
  7: 'sprint',
}
/** Buttons that fire once, on the press. */
export const PAD_TAPS: Record<number, TapAction> = {
  3: 'enterVehicle',
  12: 'teleport',
  13: 'camera',
}

/** Menu buttons, which work whether the game is playing or paused. */
export const PAD_MENU: Record<number, MenuAction> = {
  9: 'pause',
}

/** The parts of a gamepad this decoder reads. Only the fields the browser actually has. */
export interface PadState {
  axes: readonly number[]
  buttons: readonly { pressed: boolean; value: number }[]
}

/**
 * A stick axis, cleaned up: no wobble around the centre, and shaped so the middle of the
 * travel is fine and the edge is fast. Returns 0 inside the dead zone, and ±1 at the rim.
 *
 * The curve is `x * |x|`: a gentle power that keeps full deflection at full deflection
 * (unlike a plain square, which softens the rim), and gives more room near the centre.
 */
export function stick(value: number): number {
  const clamped = Math.max(-1, Math.min(1, value))
  const magnitude = Math.abs(clamped)
  if (magnitude <= DEAD_ZONE) return 0
  // Rescale what is left of the travel, so the dead zone does not leave a step at its edge.
  const pushed = (magnitude - DEAD_ZONE) / (1 - DEAD_ZONE)
  return Math.sign(clamped) * pushed * pushed
}

/** A trigger as a button: pressed once it is more than `TRIGGER` down. */
export function trigger(button: { pressed: boolean; value: number } | undefined): boolean {
  if (!button) return false
  return button.pressed || button.value > TRIGGER
}

/**
 * The move axes for a pad: x strafe, y forward. Same convention as the keyboard's
 * `input.move()`: y is positive forward, which on a standard pad is stick-up (axis 1
 * negative), so it is negated here.
 */
export function padMove(pad: PadState): { x: number; y: number } {
  const x = stick(pad.axes[0] ?? 0)
  const y = stick(-(pad.axes[1] ?? 0))
  const length = Math.hypot(x, y)
  if (length > 1) return { x: x / length, y: y / length }
  return { x, y }
}

/**
 * The look axes for a pad, in radians a second: x yaws, y pitches. Right stick, with the
 * same dead zone and curve as the movement stick.
 */
export function padLook(pad: PadState): { x: number; y: number } {
  const x = pad.axes[2] ?? 0
  const y = pad.axes[3] ?? 0
  // The dead zone and curve are for movement; for aiming they would make the camera
  // sluggish at small deflections, so only the dead zone applies here.
  const clean = (value: number) =>
    Math.abs(value) <= DEAD_ZONE ? 0 : Math.max(-1, Math.min(1, value))
  const stickLook = { x: clean(x) * LOOK_RATE, y: clean(y) * LOOK_RATE }
  if (stickLook.x !== 0 || stickLook.y !== 0) return stickLook

  // No right stick (a cheap pad, or one reporting zeros): let the D-pad turn. Only when
  // the stick is *exactly* at rest, so a pad with a stick never fights itself.
  const dpad = (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0)
  return { x: dpad * LOOK_RATE * 0.8, y: 0 }
}

/** A pad's held actions, and the ones pressed since the previous frame. */
export interface PadFrame {
  held: Set<HeldAction>
  taps: TapAction[]
  menu: MenuAction[]
}

/**
 * Decode one frame of a pad against the previous frame's held buttons, which is what
 * turns a button's state into a press.
 *
 * `previous` is mutated in place to hold this frame's held buttons, so the caller can keep
 * one set and pass it every frame without allocating.
 */
export function decodePad(pad: PadState | null, previous: Set<number>): PadFrame {
  const held = new Set<HeldAction>()
  const taps: TapAction[] = []
  const menu: MenuAction[] = []
  const down = new Set<number>()
  if (pad) {
    for (let id = 0; id < pad.buttons.length; id++) {
      const button = pad.buttons[id]
      if (!button) continue
      const pressed = id === 6 || id === 7 ? trigger(button) : button.pressed
      if (!pressed) continue
      down.add(id)
      const action = PAD_BUTTONS[id]
      if (action) held.add(action)
      const tap = PAD_TAPS[id]
      // Only on the press: the browser reports the button held for many frames.
      if (tap && !previous.has(id)) taps.push(tap)
      const menuAction = PAD_MENU[id]
      if (menuAction && !previous.has(id)) menu.push(menuAction)
    }
  }
  previous.clear()
  for (const id of down) previous.add(id)
  return { held, taps, menu }
}

/**
 * The first connected pad, or null. Separate from the decoding so the decoding can be
 * tested without a browser, and so a player with no controller pays one property read.
 */
export function firstPad(): Gamepad | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null
  const pads = navigator.getGamepads()
  for (const pad of pads) {
    // Some browsers report a placeholder pad with no buttons for a disconnected device.
    if (pad && pad.connected && pad.buttons.length > 0) return pad
  }
  return null
}
