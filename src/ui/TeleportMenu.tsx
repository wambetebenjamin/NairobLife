/**
 * Teleport: pick a landmark from the list or from the map.
 *
 * TODO(map): street search and a walking route line, like a sat-nav.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { LANDMARKS, type Landmark } from '../config/landmarks'
import { WORLD_ORIGIN, ZONES } from '../config/zones'
import { createProjection } from '../core/geo'
import { beginRide, closeTeleport, teleportTo } from '../game/actions'
import { buildRideNetwork, planRide } from '../vehicles/ride/routes'
import type { LoadedZone } from '../world/zone/loadZone'
import { useGame } from '../state/gameStore'
import { runtime } from '../state/runtime'
import { CloseIcon, NorthIcon } from './icons'
import { getMapImage } from './mapImage'
import { useT } from './useT'
import { ScenicPreview } from './ScenicPreview'
import type { ScenicKind } from './scenicMotion'

const projection = createProjection(WORLD_ORIGIN)
const GROUPS: Landmark['group'][] = ['Downtown', 'Parks & campus', 'Up high']

export function TeleportMenu() {
  const t = useT()
  const zone = useGame((state) => state.zone)
  const map = useMemo(() => (zone ? getMapImage(zone.file) : null), [zone])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [scenic, setScenic] = useState<ScenicKind | null>(null)
  const scenicLauncher = useRef<HTMLButtonElement | null>(null)
  const closeScenic = () => {
    setScenic(null)
    requestAnimationFrame(() => scenicLauncher.current?.focus())
  }

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
            <RidePlanner zone={zone} />
            <section className="ride-planner">
              <h3>Scenic tours</h3>
              <p>Take a fictional guided ride while the wider city is being built.</p>
              <button
                className="button scenic-launch"
                onClick={(e) => {
                  scenicLauncher.current = e.currentTarget
                  setScenic('park')
                }}
              >
                Nairobi National Park tour
              </button>
              <button
                className="button scenic-launch"
                onClick={(e) => {
                  scenicLauncher.current = e.currentTarget
                  setScenic('sgr')
                }}
              >
                SGR train tour
              </button>
            </section>
            <section>
              <h3>Requested destinations · planned</h3>
              <p className="destination-note">Outside the playable CBD map. Not yet visitable.</p>
              {[
                'State House Nairobi',
                'Nyayo National Stadium',
                'Talanta Sports City Stadium',
                'Kasarani Stadium',
                'Sarit Centre',
                'Westgate',
                'Two Rivers Mall',
                'Garden City Mall',
                'Yaya Centre',
                'The Hub Karen',
                'Village Market',
              ].map((name) => (
                <div className="place place--soon" key={name}>
                  <strong>{name}</strong>
                  <span>Planned</span>
                </div>
              ))}
            </section>
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
        {scenic && <ScenicPreview kind={scenic} onClose={closeScenic} onChange={setScenic} />}
      </div>
    </div>
  )
}

/** Choose any two mapped stages. The route is simulated, not an official service. */
function RidePlanner({ zone }: { zone: LoadedZone }) {
  const network = useMemo(() => buildRideNetwork(zone.file), [zone])
  const driving = useGame((state) => state.driving)
  const [fromId, setFromId] = useState(
    () =>
      [...network.stops].sort(
        (a, b) =>
          Math.hypot(a.x - runtime.player.x, a.z - runtime.player.z) -
          Math.hypot(b.x - runtime.player.x, b.z - runtime.player.z),
      )[0]?.id ?? '',
  )
  const [toId, setToId] = useState(
    () =>
      network.stops.find((s) => s.id !== fromId && s.name === 'Koja')?.id ??
      network.stops.find((s) => s.id !== fromId)?.id ??
      '',
  )
  const from = network.stops.find((s) => s.id === fromId)
  const to = network.stops.find((s) => s.id === toId)
  const route = useMemo(
    () => (from && to ? planRide(network.graph, from, to) : null),
    [network, from, to],
  )
  if (network.stops.length < 2) return null
  return (
    <section className="ride-planner">
      <h3>Matatu city ride</h3>
      <p>
        A fictional shuttle between mapped stages. The view starts at your chosen departure stage;
        this is not an official route.
      </p>
      <label>
        From{' '}
        <select
          aria-label="Departure stage"
          value={fromId}
          onChange={(e) => setFromId(e.target.value)}
        >
          {network.stops.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        To{' '}
        <select
          aria-label="Destination stage"
          value={toId}
          onChange={(e) => setToId(e.target.value)}
        >
          {network.stops.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {driving ? (
        <p>Get out of your vehicle before boarding.</p>
      ) : !route ? (
        <p>No directed street route between these stages. Choose another.</p>
      ) : (
        <p>{(route.length / 1000).toFixed(1)} km of mapped streets · scenic fast travel</p>
      )}
      <button
        className="button button--primary ride-planner__go"
        disabled={!route || !!driving}
        onClick={() => route && beginRide(route)}
      >
        Take the matatu
      </button>
    </section>
  )
}
