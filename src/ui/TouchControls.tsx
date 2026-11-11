/**
 * On-screen controls for phones and tablets: a thumb stick that appears wherever the
 * left thumb lands, drag-to-look everywhere else, and a few buttons.
 *
 * At the wheel the same stick is pedals and steering, the big button is the handbrake,
 * and a "get out" button replaces the two that only make sense on foot.
 *
 * Everything here ends up in the same input object the keyboard writes to, so the game
 * itself never knows which device is in use.
 *
 * TODO(touch): pinch to zoom the camera.
 */
import { useRef, useState } from 'react'
import { CAMERA } from '../config/game'
import { enterOrExitVehicle } from '../game/actions'
import { input } from '../input/input'
import { useGame } from '../state/gameStore'
import { useT } from './useT'

/** How far the thumb travels for full speed, in CSS pixels. */
const STICK_RADIUS = 56

export function TouchControls() {
  const t = useT()
  const stick = useRef<{ id: number; x: number; y: number } | null>(null)
  const look = useRef<{ id: number; x: number; y: number } | null>(null)
  const [knob, setKnob] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null)
  const [running, setRunning] = useState(false)
  const [crouched, setCrouched] = useState(false)
  const driving = useGame((state) => state.driving)
  const nearVehicle = useGame((state) => state.nearVehicle)

  /** Into the nearest vehicle or out of this one; and let go of anything held on foot. */
  const enterOrExit = () => {
    input.setTouchButton('crouch', false)
    input.setTouchButton('sprint', false)
    setCrouched(false)
    setRunning(false)
    enterOrExitVehicle()
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const leftSide = event.clientX < window.innerWidth * 0.42
    if (leftSide && !stick.current) {
      stick.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
      setKnob({ x: event.clientX, y: event.clientY, dx: 0, dy: 0 })
    } else if (!look.current) {
      look.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
    }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (stick.current?.id === event.pointerId) {
      let dx = (event.clientX - stick.current.x) / STICK_RADIUS
      let dy = (event.clientY - stick.current.y) / STICK_RADIUS
      const length = Math.hypot(dx, dy)
      if (length > 1) {
        dx /= length
        dy /= length
      }
      // Screen y grows downwards; pushing the stick up means "forward".
      input.setTouchMove(dx, -dy)
      setKnob({
        x: stick.current.x,
        y: stick.current.y,
        dx: dx * STICK_RADIUS,
        dy: dy * STICK_RADIUS,
      })
    } else if (look.current?.id === event.pointerId) {
      input.addLook(
        (event.clientX - look.current.x) * CAMERA.touchSpeed,
        (event.clientY - look.current.y) * CAMERA.touchSpeed,
      )
      look.current.x = event.clientX
      look.current.y = event.clientY
    }
  }

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (stick.current?.id === event.pointerId) {
      stick.current = null
      input.setTouchMove(0, 0)
      setKnob(null)
    } else if (look.current?.id === event.pointerId) {
      look.current = null
    }
  }

  const hold = (button: 'jump') => ({
    onPointerDown: (event: React.PointerEvent) => {
      event.stopPropagation()
      input.setTouchButton(button, true)
    },
    onPointerUp: () => input.setTouchButton(button, false),
    onPointerCancel: () => input.setTouchButton(button, false),
  })

  return (
    <div
      className="touch"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {knob && (
        <div className="stick" style={{ left: knob.x, top: knob.y }}>
          <i style={{ transform: `translate(${knob.dx}px, ${knob.dy}px)` }} />
        </div>
      )}
      {!knob && <div className="stick stick--idle" />}

      <div className="touch__buttons" onPointerDown={(event) => event.stopPropagation()}>
        {driving ? (
          <button className="pad pad--wide pad--offer" onClick={enterOrExit}>
            {t(driving.kind === 'boda' ? 'getOff' : 'getOut')}
          </button>
        ) : (
          <>
            {nearVehicle && (
              <button className="pad pad--wide pad--offer" onClick={enterOrExit}>
                {t(nearVehicle.kind === 'boda' ? 'ride' : 'drive')}
                <small>{nearVehicle.label ?? t(nearVehicle.kind)}</small>
              </button>
            )}
            <button
              className={`pad${crouched ? ' is-on' : ''}`}
              onClick={() => {
                input.setTouchButton('crouch', !crouched)
                setCrouched(!crouched)
              }}
            >
              {t('crouch')}
            </button>
            <button
              className={`pad${running ? ' is-on' : ''}`}
              onClick={() => {
                input.setTouchButton('sprint', !running)
                setRunning(!running)
              }}
            >
              {t('sprint')}
            </button>
          </>
        )}
        {/* Jump on foot; the same input is the handbrake at the wheel. */}
        <button className="pad pad--big" {...hold('jump')}>
          {t(driving ? 'handbrake' : 'jump')}
        </button>
      </div>
    </div>
  )
}
