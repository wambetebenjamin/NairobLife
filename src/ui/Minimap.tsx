/**
 * The radar: a round map that turns with the camera, so "up" is always the way you are
 * looking. Redrawn every frame from the pre-rendered map picture (see mapImage.ts).
 */
import { useEffect, useRef } from 'react'
import { LANDMARKS } from '../config/landmarks'
import { WORLD_ORIGIN } from '../config/zones'
import { createProjection } from '../core/geo'
import { runtime } from '../state/runtime'
import type { MapImage } from './mapImage'

/** Metres from the centre of the radar to its rim. */
const RANGE = 150

const projection = createProjection(WORLD_ORIGIN)
const PINS = LANDMARKS.filter((landmark) => !landmark.onTop).map((landmark) => {
  const [x, z] = projection.toWorld(landmark.lookAt.lat, landmark.lookAt.lon)
  return { x, z }
})

export function Minimap({ map, size }: { map: MapImage; size: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = canvas.height = Math.round(size * dpr)
    const half = canvas.width / 2
    /** Screen pixels per metre. */
    const zoom = half / RANGE

    let frame = 0
    const draw = () => {
      frame = requestAnimationFrame(draw)
      const { x, z, yaw } = runtime.player
      const heading = runtime.camera.yaw

      ctx.save()
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.beginPath()
      ctx.arc(half, half, half, 0, Math.PI * 2)
      ctx.clip()
      ctx.fillStyle = '#1d2128'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Turn the map so the camera's forward direction points up, centred on the player.
      ctx.translate(half, half)
      ctx.rotate(heading)
      ctx.scale(zoom, zoom)
      ctx.translate(-x, -z)

      // Copy only the square of map around the player (the diagonal covers any rotation).
      const reach = RANGE * 1.45
      const sx = Math.max(0, (x - reach - map.originX) * map.scale)
      const sy = Math.max(0, (z - reach - map.originZ) * map.scale)
      const sw = Math.min(map.canvas.width - sx, reach * 2 * map.scale)
      const sh = Math.min(map.canvas.height - sy, reach * 2 * map.scale)
      if (sw > 0 && sh > 0) {
        ctx.drawImage(
          map.canvas,
          sx,
          sy,
          sw,
          sh,
          map.originX + sx / map.scale,
          map.originZ + sy / map.scale,
          sw / map.scale,
          sh / map.scale,
        )
      }

      // Landmarks in range.
      ctx.fillStyle = '#ffd21f'
      for (const pin of PINS) {
        if (Math.abs(pin.x - x) > reach || Math.abs(pin.z - z) > reach) continue
        ctx.beginPath()
        ctx.arc(pin.x, pin.z, 3.2 / zoom, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()

      // The player: an arrow at the centre, pointing the way the character faces.
      ctx.save()
      ctx.translate(half, half)
      ctx.rotate(heading - yaw)
      const a = half * 0.085
      ctx.beginPath()
      ctx.moveTo(0, -a * 1.5)
      ctx.lineTo(a, a)
      ctx.lineTo(0, a * 0.45)
      ctx.lineTo(-a, a)
      ctx.closePath()
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)'
      ctx.lineWidth = half * 0.02
      ctx.stroke()
      ctx.fill()
      ctx.restore()

      // North, riding the rim.
      const nx = half + Math.sin(heading) * (half - 11 * dpr)
      const ny = half - Math.cos(heading) * (half - 11 * dpr)
      ctx.beginPath()
      ctx.arc(nx, ny, 8 * dpr, 0, Math.PI * 2)
      ctx.fillStyle = '#c8102e'
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.font = `700 ${10 * dpr}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('N', nx, ny + 0.5 * dpr)
    }
    draw()
    return () => cancelAnimationFrame(frame)
  }, [map, size])

  return (
    <canvas
      ref={canvasRef}
      className="minimap"
      style={{ width: size, height: size }}
      aria-label="Minimap"
    />
  )
}
