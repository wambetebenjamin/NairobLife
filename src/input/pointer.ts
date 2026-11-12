/**
 * Mouse look.
 *
 * The good path is the Pointer Lock API: the cursor disappears and the mouse turns the
 * camera without limit, like any desktop game. Browsers can refuse the lock (embedded
 * previews often do), so there is a fallback: hold a mouse button and drag.
 */
import { CAMERA } from '../config/game'
import { input } from './input'

/** Some browsers report a huge jump on the first event after locking; ignore those. */
const MAX_MOVEMENT = 250

export interface PointerOptions {
  /** The lock was gained or lost (the user pressed Esc, or switched window). */
  onLockChange: (locked: boolean) => void
  /** The canvas was clicked while the mouse was free. */
  onCanvasClick: () => void
}

export function attachPointer(canvas: HTMLCanvasElement, options: PointerOptions): () => void {
  let dragging = false
  const locked = () => document.pointerLockElement === canvas

  const onMouseMove = (event: MouseEvent) => {
    if (!locked() && !dragging) return
    const dx = event.movementX
    const dy = event.movementY
    if (Math.abs(dx) > MAX_MOVEMENT || Math.abs(dy) > MAX_MOVEMENT) return
    input.addLook(dx * CAMERA.mouseSpeed, dy * CAMERA.mouseSpeed)
  }
  const onMouseDown = (event: MouseEvent) => {
    if (locked()) return
    dragging = true
    if (event.button === 0) options.onCanvasClick()
  }
  const onMouseUp = () => {
    dragging = false
  }
  const onWheel = (event: WheelEvent) => {
    input.addZoom(Math.sign(event.deltaY))
  }
  const onLockChange = () => {
    dragging = false
    options.onLockChange(locked())
  }
  const onLockError = () => options.onLockChange(false)
  const onContextMenu = (event: Event) => event.preventDefault()

  document.addEventListener('mousemove', onMouseMove)
  canvas.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mouseup', onMouseUp)
  canvas.addEventListener('wheel', onWheel, { passive: true })
  canvas.addEventListener('contextmenu', onContextMenu)
  document.addEventListener('pointerlockchange', onLockChange)
  document.addEventListener('pointerlockerror', onLockError)

  return () => {
    document.removeEventListener('mousemove', onMouseMove)
    canvas.removeEventListener('mousedown', onMouseDown)
    window.removeEventListener('mouseup', onMouseUp)
    canvas.removeEventListener('wheel', onWheel)
    canvas.removeEventListener('contextmenu', onContextMenu)
    document.removeEventListener('pointerlockchange', onLockChange)
    document.removeEventListener('pointerlockerror', onLockError)
  }
}
