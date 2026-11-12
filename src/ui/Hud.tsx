/**
 * The in-game HUD: toolbar (top right), street name over the radar (bottom left), speed
 * and position (bottom right), key hints (bottom centre), and a prompt above them when
 * there is a vehicle within reach.
 *
 * The numbers come from state/runtime.ts, which changes every frame. Rather than
 * re-render React 60 times a second, the HUD samples it four times a second.
 *
 * TODO(hud): health, cash and a wanted level once there is gameplay that needs them.
 * TODO(sheng): street-level flavour text ("Uko tao", "Hapa ni Archives") on arrival.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { BASE_ELEVATION_M, WORLD_ORIGIN } from '../config/zones'
import { compassPoint, createProjection, formatLatLon, yawToBearingDeg } from '../core/geo'
import {
  cycleHaze,
  cycleQuality,
  openTeleport,
  pauseGame,
  shiftTime,
  toggleCamera,
  toggleFullscreen,
} from '../game/actions'
import { useGame, type VehicleTag } from '../state/gameStore'
import { runtime } from '../state/runtime'
import { OSM_ATTRIBUTION } from '../world/zone/format'
import { formatClock, sunAngle } from '../world/environment/skyModel'
import { ControlsCard } from './ControlsCard'
import { GameName } from './GameName'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FullscreenIcon,
  MoonIcon,
  PauseIcon,
  SunIcon,
} from './icons'
import { getMapImage } from './mapImage'
import { Minimap } from './Minimap'
import { nairobiTime } from './nairobiTime'
import { useT } from './useT'

const projection = createProjection(WORLD_ORIGIN)
const SAMPLE_MS = 250

interface Sample {
  street: string
  place: string
  clock: string
  realTime: string
  night: boolean
  speed: number
  bearing: number
  position: string
  altitude: number
  fps: number
}

export function Hud() {
  const t = useT()
  const zone = useGame((state) => state.zone)
  const showHud = useGame((state) => state.settings.showHud)
  const showControls = useGame((state) => state.settings.showControls)
  const haze = useGame((state) => state.settings.haze)
  const touch = useGame((state) => state.touch)
  const pointerLocked = useGame((state) => state.pointerLocked)
  const teleportOpen = useGame((state) => state.teleportOpen)
  const driving = useGame((state) => state.driving)
  const ride = useGame((state) => state.ride)
  const nearVehicle = useGame((state) => state.nearVehicle)
  const map = useMemo(() => (zone ? getMapImage(zone.file) : null), [zone])

  const [sample, setSample] = useState<Sample | null>(null)
  useEffect(() => {
    if (!zone) return
    const read = () => {
      const p = runtime.player
      const bearing = yawToBearingDeg(runtime.camera.yaw)
      setSample({
        street: zone.index.streetAt(p.x, p.z) ?? '',
        place: zone.index.placeAt(p.x, p.z) ?? zone.file.name,
        clock: formatClock(runtime.time),
        realTime: nairobiTime(new Date()),
        night: sunAngle(runtime.time) > Math.PI,
        speed: Math.round(p.speed * 3.6),
        bearing,
        position: formatLatLon(projection.toLatLon(p.x, p.z), 4),
        altitude: Math.round(BASE_ELEVATION_M + p.y),
        fps: Math.round(runtime.fps),
      })
    }
    read()
    const timer = window.setInterval(read, SAMPLE_MS)
    return () => window.clearInterval(timer)
  }, [zone])

  if (!sample || !map) return null

  const hazeLabel = t(haze === 'clear' ? 'hazeClear' : haze === 'hazy' ? 'hazeHazy' : 'hazeDusty')

  return (
    <div className={`hud${showHud ? '' : ' hud--hidden'}`}>
      <div className="hud__brand">
        <GameName />
      </div>

      <div className="toolbar">
        <div
          className="clock"
          title="Game time. [ and ] move the sun. Real Nairobi time is shown below."
        >
          <ClockStep hours={-1} label="Earlier">
            <ChevronLeftIcon />
          </ClockStep>
          <span className="clock__icon">{sample.night ? <MoonIcon /> : <SunIcon />}</span>
          <span className="clock__label">Game</span>
          <span className="clock__time">{sample.clock}</span>
          <ClockStep hours={1} label="Later">
            <ChevronRightIcon />
          </ClockStep>
        </div>
        <ToolButton label={hazeLabel} hotkey="L" onClick={cycleHaze} title={t('haze')} />
        <ToolButton label={t('teleport')} hotkey="T" onClick={openTeleport} accent />
        <ToolButton label="Cam" hotkey="V" onClick={toggleCamera} title="Camera" />
        <ToolButton label="GFX" hotkey="G" onClick={cycleQuality} title={t('quality')} />
        <ToolButton
          label={<FullscreenIcon />}
          hotkey="K"
          onClick={toggleFullscreen}
          title="Fullscreen"
        />
        <ToolButton label={<PauseIcon />} hotkey="Esc" onClick={pauseGame} title="Pause" />
      </div>

      {!touch && !pointerLocked && !teleportOpen && !ride && (
        <div className="hud__click">{t('clickToPlay')}</div>
      )}

      <div className="radar">
        <div className="radar__where">
          <strong>{sample.street || sample.place}</strong>
          {sample.street && <span>{sample.place}</span>}
        </div>
        <Minimap map={map} size={touch ? 124 : 176} />
      </div>

      {/* On touch screens the same offer is a button under the thumb (TouchControls). */}
      {nearVehicle && !driving && !ride && !touch && (
        <div className="hud__prompt">
          <kbd>F</kbd>
          <span>{t(nearVehicle.kind === 'boda' ? 'ride' : 'drive')}</span>
          <VehicleName vehicle={nearVehicle} />
        </div>
      )}

      <div className={`cluster${driving ? ' cluster--driving' : ''}`}>
        {driving && (
          <div className="cluster__vehicle">
            <VehicleName vehicle={driving} />
          </div>
        )}
        <div className="cluster__speed">
          <strong>{sample.speed}</strong>
          <span>{t('speed')}</span>
        </div>
        <div className="cluster__real-time" title="Current real-world time in Nairobi">
          Nairobi <strong>{sample.realTime} EAT</strong>
        </div>
        <dl className="cluster__facts">
          <div>
            <dt>Heading</dt>
            <dd>
              {compassPoint(sample.bearing)} {Math.round(sample.bearing)}°
            </dd>
          </div>
          <div>
            <dt>Altitude</dt>
            <dd>{sample.altitude.toLocaleString()} m</dd>
          </div>
          <div>
            <dt>Position</dt>
            <dd>{sample.position}</dd>
          </div>
        </dl>
        <div className="cluster__credit">
          {import.meta.env.DEV && <span>{sample.fps} fps · </span>}
          {OSM_ATTRIBUTION}
        </div>
      </div>

      {showControls && !touch && !ride && (
        <div className="hud__hints">
          <ControlsCard compact driving={!!driving} />
        </div>
      )}
    </div>
  )
}

/**
 * "Matatu · Githurai 45", "Nganya Moto · City Square": what the vehicle is, what it is
 * called if it has a name and, if the map says, where it runs.
 */
function VehicleName({ vehicle }: { vehicle: VehicleTag }) {
  const t = useT()
  return (
    <span className="vehicle-name">
      <strong>
        {t(vehicle.kind)}
        {vehicle.name && ` ${vehicle.name}`}
      </strong>
      {vehicle.label && <em>{vehicle.label}</em>}
    </span>
  )
}

function ToolButton({
  label,
  hotkey,
  onClick,
  title,
  accent,
}: {
  label: ReactNode
  hotkey: string
  onClick: () => void
  title?: string
  accent?: boolean
}) {
  const name = title ?? (typeof label === 'string' ? label : undefined)
  return (
    <button
      className={`tool${accent ? ' tool--accent' : ''}`}
      title={name}
      aria-label={name}
      // Keep keyboard focus on the game: a focused button would swallow the space bar.
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.currentTarget.blur()
        onClick()
      }}
    >
      <span>{label}</span>
      <kbd>{hotkey}</kbd>
    </button>
  )
}

function ClockStep({
  hours,
  label,
  children,
}: {
  hours: number
  label: string
  children: ReactNode
}) {
  return (
    <button
      className="clock__step"
      aria-label={label}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.currentTarget.blur()
        shiftTime(hours)
      }}
    >
      {children}
    </button>
  )
}
