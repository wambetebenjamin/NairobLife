/**
 * Key bindings, in one table. The input system reads it to react to keys, and the HUD
 * reads it to print the controls help, so the two can never disagree.
 *
 * Codes are KeyboardEvent.code values: physical keys, so WASD stays WASD on AZERTY.
 * Ctrl is deliberately unused: Ctrl+W closes the tab even while the pointer is locked.
 *
 * TODO(gamepad): map a standard gamepad onto the same actions.
 */

export type HeldAction = 'forward' | 'back' | 'left' | 'right' | 'sprint' | 'crouch' | 'jump'

export type TapAction =
  | 'teleport'
  | 'camera'
  | 'hud'
  | 'quality'
  | 'haze'
  | 'timeBack'
  | 'timeForward'
  | 'fullscreen'
  // Reserved for Phase 2 so muscle memory carries over.
  | 'enterVehicle'
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

export const TAP_KEYS: Record<string, TapAction> = {
  KeyT: 'teleport',
  KeyM: 'teleport',
  KeyV: 'camera',
  KeyH: 'hud',
  KeyG: 'quality',
  KeyL: 'haze',
  BracketLeft: 'timeBack',
  BracketRight: 'timeForward',
  KeyK: 'fullscreen',
  KeyF: 'enterVehicle',
  KeyQ: 'reconPulse',
}

/** What the controls card shows. `soon` rows are greyed out until their phase ships. */
export const CONTROLS_HELP: readonly { keys: string[]; label: string; soon?: boolean }[] = [
  { keys: ['W', 'A', 'S', 'D'], label: 'Move' },
  { keys: ['Mouse'], label: 'Look' },
  { keys: ['Shift'], label: 'Sprint' },
  { keys: ['Space'], label: 'Jump' },
  { keys: ['C'], label: 'Crouch' },
  { keys: ['T'], label: 'Teleport / map' },
  { keys: ['V'], label: 'Camera' },
  { keys: ['[', ']'], label: 'Time of day' },
  { keys: ['L'], label: 'Haze' },
  { keys: ['G'], label: 'Graphics' },
  { keys: ['H'], label: 'Hide HUD' },
  { keys: ['Esc'], label: 'Pause' },
  { keys: ['F'], label: 'Enter vehicle', soon: true },
]
