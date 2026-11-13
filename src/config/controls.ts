/**
 * Key bindings, in one table. The input system reads it to react to keys, and the HUD
 * reads it to print the controls help, so the two can never disagree.
 *
 * Codes are KeyboardEvent.code values: physical keys, so WASD stays WASD on AZERTY.
 * Ctrl is deliberately unused: Ctrl+W closes the tab even while the pointer is locked.
 *
 * A connected controller is decoded in `input/gamepad.ts` and written into the same state,
 * so nothing downstream knows which device the player is using.
 */

export type HeldAction = 'forward' | 'back' | 'left' | 'right' | 'sprint' | 'crouch' | 'jump'

export type TapAction =
  | 'teleport'
  | 'camera'
  | 'hud'
  | 'quality'
  | 'haze'
  | 'weather'
  | 'timeBack'
  | 'timeForward'
  | 'fullscreen'
  | 'enterVehicle'
  // Reserved for a later phase so muscle memory carries over.
  | 'reconPulse'

export const HELD_KEYS: Record<string, HeldAction> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  KeyC: 'crouch',
  Space: 'jump',
}

/**
 * Actions that work the menu as well as the game, so they are not `TapAction`s: a pause
 * that only worked while playing could never resume.
 */
export type MenuAction = 'pause'

export const TAP_KEYS: Record<string, TapAction> = {
  KeyT: 'teleport',
  KeyM: 'teleport',
  KeyV: 'camera',
  KeyH: 'hud',
  KeyG: 'quality',
  KeyL: 'haze',
  KeyN: 'weather',
  BracketLeft: 'timeBack',
  BracketRight: 'timeForward',
  KeyK: 'fullscreen',
  KeyF: 'enterVehicle',
  KeyQ: 'reconPulse',
}

export interface ControlsRow {
  keys: string[]
  label: string
  /** Greyed out until its phase ships. */
  soon?: boolean
}

/** What the controls card shows on foot. The first rows are the ones the HUD keeps on screen. */
export const CONTROLS_HELP: readonly ControlsRow[] = [
  { keys: ['W', 'A', 'S', 'D'], label: 'Move' },
  { keys: ['Mouse'], label: 'Look' },
  { keys: ['Shift'], label: 'Sprint' },
  { keys: ['Space'], label: 'Jump' },
  { keys: ['F'], label: 'Drive / get out' },
  { keys: ['C'], label: 'Crouch' },
  { keys: ['T'], label: 'Teleport / map' },
  { keys: ['V'], label: 'Camera' },
  { keys: ['[', ']'], label: 'Time of day' },
  { keys: ['L'], label: 'Haze' },
  { keys: ['N'], label: 'Weather' },
  { keys: ['G'], label: 'Graphics' },
  { keys: ['H'], label: 'Hide HUD' },
  { keys: ['Esc'], label: 'Pause' },
  { keys: ['Pad'], label: 'Controller' },
]

/** The same keys at the wheel: what the HUD shows instead while driving. */
export const DRIVING_HELP: readonly ControlsRow[] = [
  { keys: ['W', 'S'], label: 'Drive / brake' },
  { keys: ['A', 'D'], label: 'Steer' },
  { keys: ['Space'], label: 'Handbrake' },
  { keys: ['F'], label: 'Get out' },
  { keys: ['Mouse'], label: 'Look around' },
  { keys: ['V'], label: 'Camera' },
  { keys: ['T'], label: 'Teleport / map' },
]
