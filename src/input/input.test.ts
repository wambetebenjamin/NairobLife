import { afterEach, describe, expect, it } from 'vitest'
import { input } from './input'

/** The parts of the input object that do not need a browser: the touch setters. */
describe('input', () => {
  afterEach(() => {
    input.setEnabled(false)
  })

  it('reads nothing until gameplay input is switched on', () => {
    input.setTouchMove(1, 1)
    expect(input.move()).toEqual({ x: 0, y: 0 })
    expect(input.drive()).toEqual({ steer: 0, throttle: 0 })
    input.setTouchButton('jump', true)
    expect(input.jumpHeld()).toBe(false)
    expect(input.consumeJump()).toBe(false)
  })

  it('keeps walking speed the same in every direction', () => {
    input.setEnabled(true)
    input.setTouchMove(0.6, 0.8)
    const { x, y } = input.move()
    expect(Math.hypot(x, y)).toBeCloseTo(1)
  })

  it('gives driving both pedals and steering at once from a thumb stick', () => {
    input.setEnabled(true)
    // Straight up: full throttle, no steering.
    input.setTouchMove(0, 1)
    expect(input.drive()).toEqual({ steer: 0, throttle: 1 })
    // Hard into the top-right corner of the stick's circle: both flat out.
    input.setTouchMove(Math.SQRT1_2, Math.SQRT1_2)
    const corner = input.drive()
    expect(corner.steer).toBeCloseTo(1)
    expect(corner.throttle).toBeCloseTo(1)
    // Half way out, still half of each.
    input.setTouchMove(-0.5, 0)
    expect(input.drive()).toEqual({ steer: -0.5, throttle: 0 })
    // Pulled back and a little left: braking, with a touch of steering.
    input.setTouchMove(-0.2, -0.9)
    const back = input.drive()
    expect(back.throttle).toBeLessThan(-0.9)
    expect(back.steer).toBeLessThan(0)
    expect(back.steer).toBeGreaterThan(-0.3)
  })

  it('queues one jump per press and forgets it when input is switched off', () => {
    input.setEnabled(true)
    input.setTouchButton('jump', true)
    expect(input.jumpHeld()).toBe(true)
    expect(input.consumeJump()).toBe(true)
    expect(input.consumeJump()).toBe(false)
    input.setTouchButton('jump', false)
    input.setTouchButton('jump', true)
    input.setEnabled(false)
    input.setEnabled(true)
    expect(input.consumeJump()).toBe(false)
    expect(input.jumpHeld()).toBe(false)
  })
})
