/**
 * Teleport: pick a landmark from the list or from the map.
 *
 * TODO(map): street search and a walking route line, like a sat-nav.
 * TODO(matatus): once routes run, show stages here and let the player ride instead.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { LANDMARKS, type Landmark } from '../config/landmarks'
import { WORLD_ORIGIN, ZONES } from '../config/zones'
import { createProjection } from '../core/geo'
import { closeTeleport, teleportTo } from '../game/actions'
import { useGame } from '../state/gameStore'
import { runtime } from '../state/runtime'
import { CloseIcon, NorthIcon } from './icons'
import { getMapImage } from './mapImage'
import { useT } from './useT'

const projection = createProjection(WORLD_ORIGIN)
const GROUPS: Landmark['group'][] = ['Downtown', 'Parks & campus', 'Up high']

export function TeleportMenu() {
  const t = useT()
  const zone = useGame((state) => state.zone)
  const map = useMemo(() => (zone ? getMapImage(zone.file) : null), [zone])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  // Copy the pre-rendered map into this dialog's canvas.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !map) return
    const size = 720
    canvas.width = size
    canvas.height = Math.round((size * map.height) / map.width)
    canvas.getContext('2d')?.drawImage(map.canvas, 0, 0, canvas.width, canvas.height)
  }, [map])

  if (!zone || !map) return null

  /** World position as a percentage across the map picture. */
  const place = (x: number, z: number) => ({
    left: `${((x - map.originX) / map.width) * 100}%`,
    top: `${((z - map.originZ) / map.height) * 100}%`,
  })
  const here = place(runtime.player.x, runtime.player.z)
  const planned = ZONES.filter((def) => def.status !== 'live')

  return (
    <div className="overlay overlay--top" onClick={closeTeleport}>
      <div
        className="panel panel--teleport"
        role="dialog"
        aria-modal="true"
        aria-label={t('teleportTitle')}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="panel__header">
          <h2 className="panel__title">{t('teleportTitle')}</h2>
          <button className="icon-button" onClick={closeTeleport} aria-label="Close">
            <CloseIcon />
          </button>
        </header>

        <div className="teleport">
          <div className="teleport__list">
            {GROUPS.map((group) => (
              <section key={group}>
                <h3>{group}</h3>
                {LANDMARKS.filter(
                  (landmark) => landmark.group === group && landmark.zone === zone.id,
                ).map((landmark) => (
                  <button
                    key={landmark.id}
                    className={`place${hovered === landmark.id ? ' is-hot' : ''}`}
                    onClick={() => teleportTo(landmark)}
                    onMouseEnter={() => setHovered(landmark.id)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <strong>{landmark.name}</strong>
                    <span>{landmark.blurb}</span>
                  </button>
                ))}
              </section>
            ))}
            <section>
              <h3>More of Nairobi</h3>
              {planned.map((def) => (
                <div key={def.id} className="place place--soon">
                  <strong>{def.name}</strong>
                  <span>{t('comingSoon')}</span>
                </div>
              ))}
            </section>
          </div>

          <div className="teleport__map">
            <div className="atlas">
              <canvas ref={canvasRef} />
              {LANDMARKS.filter((landmark) => landmark.zone === zone.id).map((landmark) => {
                const [x, z] = projection.toWorld(landmark.spawn.lat, landmark.spawn.lon)
                return (
                  <button
                    key={landmark.id}
                    className={`pin${hovered === landmark.id ? ' is-hot' : ''}`}
                    style={place(x, z)}
                    title={landmark.name}
                    aria-label={landmark.name}
                    onClick={() => teleportTo(landmark)}
                    onMouseEnter={() => setHovered(landmark.id)}
                    onMouseLeave={() => setHovered(null)}
                  />
                )
              })}
              <div className="pin pin--here" style={here} title="You are here" />
              <span className="atlas__north">
                N <NorthIcon />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
