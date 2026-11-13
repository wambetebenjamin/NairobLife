/**
 * Polls a connected controller once a frame and pushes what it says into `input`.
 *
 * Browsers do not send events for analogue sticks, so a pad has to be polled; and the poll
 * has to happen before anything reads the input, which is why this runs in `useFrame` with
 * no phase of its own. With no pad connected it costs one `navigator.getGamepads()` call
 * per frame, which is a property read, not work.
 */
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { decodePad, firstPad, padLook, padMove } from './gamepad'
import { input } from './input'

export function GamepadPump() {
  const previous = useRef(new Set<number>())

  useFrame((_, delta) => {
    const pad = firstPad()
    if (!pad) {
      // Nothing plugged in: tell the input state so a pad unplugged mid-stride does not
      // leave the player walking into a wall for ever.
      input.setPad({ x: 0, y: 0, sprint: false, crouch: false, jump: false, lookX: 0, lookY: 0 })
      previous.current.clear()
      return
    }

    const frame = decodePad(pad, previous.current)
    const move = padMove(pad)
    const look = padLook(pad)
    const step = Math.min(delta, 0.05)
    input.setPad({
      x: move.x,
      y: move.y,
      sprint: frame.held.has('sprint'),
      crouch: frame.held.has('crouch'),
      jump: frame.held.has('jump'),
      // The look rate is radians a second, so it scales with the frame time.
      lookX: look.x * step,
      lookY: look.y * step,
    })
    for (const tap of frame.taps) input.tap(tap)
    for (const menu of frame.menu) input.menu(menu)
  }, -60)

  return null
}
