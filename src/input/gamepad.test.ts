import { describe, expect, it } from 'vitest'
import {
  DEAD_ZONE,
  LOOK_RATE,
  TRIGGER,
  decodePad,
  padLook,
  padMove,
  stick,
  trigger,
  type PadState,
} from './gamepad'
import { input } from './input'

/** A pad with nothing pressed and sticks at rest: mutable, so a test can press things. */
interface TestPad {
  axes: number[]
  buttons: { pressed: boolean; value: number }[]
}
function restPad(): TestPad {
  return {
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  }
}

/** A pad with the named buttons held. */
function padWith(...ids: number[]): TestPad {
  const pad = restPad()
  for (const id of ids) pad.buttons[id] = { pressed: true, value: 1 }
  return pad
}

describe('a controller stick', () => {
  it('ignores the wobble around the centre', () => {
    for (const wobble of [0, 0.05, -0.1, 0.19]) expect(stick(wobble)).toBe(0)
    expect(stick(DEAD_ZONE)).toBe(0)
    // Past the dead zone, movement begins from nothing rather than jumping.
    expect(Math.abs(stick(DEAD_ZONE + 0.01))).toBeLessThan(0.01)
  })

  it('reaches full deflection at the rim, and is monotonic', () => {
    expect(stick(1)).toBeCloseTo(1, 6)
    expect(stick(-1)).toBeCloseTo(-1, 6)
    let previous = 0
    for (let i = 1; i <= 40; i++) {
      const value = stick(i / 40)
      expect(value).toBeGreaterThanOrEqual(previous - 1e-9)
      previous = value
    }
  })

  it('clamps a value the browser should never send', () => {
    expect(stick(4)).toBe(1)
    expect(stick(-4)).toBe(-1)
  })

  it('is gentler near the centre than at the rim, so aiming is fine', () => {
    // Half way out gives less than half the value: the curve keeps the middle precise.
    expect(stick(0.6)).toBeLessThan(0.6)
    expect(stick(0.6)).toBeGreaterThan(0.2)
  })
})

describe('the triggers', () => {
  it('are buttons past a threshold, not analogue values', () => {
    expect(trigger({ pressed: false, value: 0 })).toBe(false)
    expect(trigger({ pressed: false, value: TRIGGER })).toBe(false)
    expect(trigger({ pressed: false, value: TRIGGER + 0.01 })).toBe(true)
    // Some pads report `pressed` before they report the value.
    expect(trigger({ pressed: true, value: 0 })).toBe(true)
    expect(trigger(undefined)).toBe(false)
  })
})

describe('the move stick', () => {
  it('pushes forward, and stays inside the unit circle', () => {
    const pad = restPad()
    // Stick up is the browser's negative y, and the game's positive forward.
    pad.axes = [0, -1, 0, 0]
    expect(padMove(pad)).toEqual({ x: 0, y: 1 })
    pad.axes = [0, 1, 0, 0]
    expect(padMove(pad).y).toBe(-1)
    // Diagonals are normalised, as they are from the keyboard.
    pad.axes = [-1, -1, 0, 0]
    const diagonal = padMove(pad)
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1, 5)
  })

  it('reads a pad that reports no axes at all as centred', () => {
    const pad: PadState = { axes: [], buttons: [] }
    expect(padMove(pad)).toEqual({ x: 0, y: 0 })
    expect(padLook(pad)).toEqual({ x: 0, y: 0 })
  })
})

describe('the look stick', () => {
  it('turns the camera at a steady rate when held over', () => {
    const pad = restPad()
    pad.axes = [0, 0, 1, 0]
    expect(padLook(pad).x).toBeCloseTo(LOOK_RATE, 6)
    pad.axes = [0, 0, 0, 1]
    expect(padLook(pad).y).toBeCloseTo(LOOK_RATE, 6)
    pad.axes = [0, 0, -0.5, 0]
    expect(padLook(pad).x).toBeCloseTo(-0.5 * LOOK_RATE, 6)
  })

  it('does not drift when the stick is at rest', () => {
    const pad = restPad()
    pad.axes = [0.03, -0.04, 0.05, -0.02]
    expect(padLook(pad)).toEqual({ x: 0, y: 0 })
  })

  it('lets the D-pad turn the camera when there is no right stick', () => {
    // A cheap pad: no right stick at all, so its axes read exactly zero.
    const pad = padWith(15)
    pad.axes = [0, 0, 0, 0]
    expect(padLook(pad).x).toBeGreaterThan(0)
    const left = padWith(14)
    left.axes = [0, 0, 0, 0]
    expect(padLook(left).x).toBeLessThan(0)
    // But a pad with a working right stick is not overruled by the D-pad.
    const both = padWith(15)
    both.axes = [0, 0, -1, 0]
    expect(padLook(both).x).toBeCloseTo(-LOOK_RATE, 5)
  })
})

describe('decoding a frame', () => {
  it('turns a held face button into a held action', () => {
    const previous = new Set<number>()
    const { held } = decodePad(padWith(0), previous)
    expect(held.has('jump')).toBe(true)
    // And it stays held next frame, rather than being a one-off.
    expect(decodePad(padWith(0), previous).held.has('jump')).toBe(true)
  })

  it('fires a tap once on the press, not every frame it is held', () => {
    const previous = new Set<number>()
    const first = decodePad(padWith(3), previous)
    expect(first.taps).toEqual(['enterVehicle'])
    const second = decodePad(padWith(3), previous)
    expect(second.taps).toEqual([])
    // Released and pressed again: another tap.
    decodePad(restPad(), previous)
    expect(decodePad(padWith(3), previous).taps).toEqual(['enterVehicle'])
  })

  it('reads the trigger as sprint, and never as a tap', () => {
    const previous = new Set<number>()
    const pad = restPad()
    pad.buttons[7] = { pressed: false, value: 0.9 }
    expect(decodePad(pad, previous).held.has('sprint')).toBe(true)
    expect(decodePad(pad, previous).taps).toEqual([])
  })

  it('sends Start to the menu path, so it can resume as well as pause', () => {
    const previous = new Set<number>()
    expect(decodePad(padWith(9), previous).menu).toEqual(['pause'])
    // Once, like any other press.
    expect(decodePad(padWith(9), previous).menu).toEqual([])
    // And it is not also a gameplay tap.
    expect(decodePad(padWith(9), previous).taps).toEqual([])
  })

  it('reads nothing at all from a disconnected pad', () => {
    const previous = new Set<number>()
    const frame = decodePad(null, previous)
    expect(frame.held.size).toBe(0)
    expect(frame.taps).toEqual([])
    expect(frame.menu).toEqual([])
    // And it forgets what was held, so replugging does not fire a stale press.
    decodePad(padWith(3), previous)
    decodePad(null, previous)
    expect(decodePad(padWith(3), previous).taps).toEqual(['enterVehicle'])
  })
})

describe('a controller through the input state', () => {
  it('drives the player exactly as the keyboard does', () => {
    input.setEnabled(true)
    input.setPad({ x: 0, y: 1, sprint: true, crouch: false, jump: false, lookX: 0, lookY: 0 })
    expect(input.move()).toEqual({ x: 0, y: 1 })
    expect(input.sprint()).toBe(true)
    expect(input.usingPad()).toBe(true)
    input.setEnabled(false)
  })

  it('queues one jump per press, from the pad', () => {
    input.setEnabled(true)
    input.setPad({ x: 0, y: 0, sprint: false, crouch: false, jump: true, lookX: 0, lookY: 0 })
    expect(input.jumpHeld()).toBe(true)
    expect(input.consumeJump()).toBe(true)
    // Still held, but not queued again.
    input.setPad({ x: 0, y: 0, sprint: false, crouch: false, jump: true, lookX: 0, lookY: 0 })
    expect(input.consumeJump()).toBe(false)
    // Released and pressed: queued again.
    input.setPad({ x: 0, y: 0, sprint: false, crouch: false, jump: false, lookX: 0, lookY: 0 })
    input.setPad({ x: 0, y: 0, sprint: false, crouch: false, jump: true, lookX: 0, lookY: 0 })
    expect(input.consumeJump()).toBe(true)
    input.setEnabled(false)
  })

  it('accumulates look, and hands it over once', () => {
    input.setEnabled(true)
    input.setPad({ x: 0, y: 0, sprint: false, crouch: false, jump: false, lookX: 0.1, lookY: 0 })
    input.setPad({ x: 0, y: 0, sprint: false, crouch: false, jump: false, lookX: 0.2, lookY: 0 })
    expect(input.consumeLook().x).toBeCloseTo(0.3, 6)
    expect(input.consumeLook().x).toBe(0)
    input.setEnabled(false)
  })

  it('drops a pad that is unplugged mid-stride', () => {
    input.setEnabled(true)
    input.setPad({ x: 1, y: 1, sprint: true, crouch: false, jump: false, lookX: 0, lookY: 0 })
    expect(input.move()).toEqual({ x: 1 / Math.SQRT2, y: 1 / Math.SQRT2 })
    // The pump sends a neutral state when there is no pad.
    input.setPad({ x: 0, y: 0, sprint: false, crouch: false, jump: false, lookX: 0, lookY: 0 })
    expect(input.move()).toEqual({ x: 0, y: 0 })
    expect(input.sprint()).toBe(false)
    input.setEnabled(false)
  })

  it('ignores the pad entirely when gameplay input is off', () => {
    input.setEnabled(false)
    input.setPad({ x: 1, y: 1, sprint: true, crouch: false, jump: true, lookX: 1, lookY: 1 })
    expect(input.move()).toEqual({ x: 0, y: 0 })
    expect(input.consumeJump()).toBe(false)
    expect(input.jumpHeld()).toBe(false)
    expect(input.consumeLook()).toEqual({ x: 0, y: 0 })
    expect(input.usingPad()).toBe(false)
  })
})
