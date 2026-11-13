import { LANGUAGES, type StringKey } from '../config/strings'
import {
  useGame,
  type Haze,
  type Quality,
  type Settings,
  type WeatherSetting,
} from '../state/gameStore'
import { CloseIcon } from './icons'
import { useT } from './useT'

const QUALITY: { id: Quality; label: StringKey }[] = [
  { id: 'auto', label: 'qualityAuto' },
  { id: 'high', label: 'qualityHigh' },
  { id: 'medium', label: 'qualityMedium' },
  { id: 'low', label: 'qualityLow' },
]

const WEATHER: { id: WeatherSetting; label: StringKey }[] = [
  { id: 'season', label: 'weatherSeason' },
  { id: 'long-rains', label: 'weatherLongRains' },
  { id: 'short-rains', label: 'weatherShortRains' },
  { id: 'off', label: 'weatherOff' },
]

const HAZE: { id: Haze; label: StringKey }[] = [
  { id: 'clear', label: 'hazeClear' },
  { id: 'hazy', label: 'hazeHazy' },
  { id: 'dusty', label: 'hazeDusty' },
]

/**
 * Settings. Everything here is saved in the browser (localStorage) and applies at once.
 *
 * TODO(audio): volume sliders once there is sound (city ambience, matatu horns, music).
 * TODO(accessibility): reduced camera motion, larger HUD text, colour-blind map palette.
 */
export function SettingsPanel() {
  const t = useT()
  const settings = useGame((state) => state.settings)
  const update = useGame((state) => state.updateSettings)
  const close = useGame((state) => state.setSettingsOpen)
  const autoQuality = useGame((state) => state.autoQuality)

  return (
    <div className="overlay overlay--top" onClick={() => close(false)}>
      <div
        className="panel panel--settings"
        role="dialog"
        aria-modal="true"
        aria-label={t('settings')}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="panel__header">
          <h2 className="panel__title">{t('settings')}</h2>
          <button className="icon-button" onClick={() => close(false)} aria-label="Close">
            <CloseIcon />
          </button>
        </header>

        <Row
          label={t('quality')}
          note={settings.quality === 'auto' ? `Auto is using ${autoQuality}` : undefined}
        >
          <Segmented
            options={QUALITY.map((option) => ({ id: option.id, label: t(option.label) }))}
            value={settings.quality}
            onChange={(quality) => update({ quality })}
          />
        </Row>
        <Row label={t('haze')}>
          <Segmented
            options={HAZE.map((option) => ({ id: option.id, label: t(option.label) }))}
            value={settings.haze}
            onChange={(haze) => update({ haze })}
          />
        </Row>
        <Row label={t('weather')} note="Nairobi's rains, by the real calendar">
          <Segmented
            options={WEATHER.map((option) => ({ id: option.id, label: t(option.label) }))}
            value={settings.weather}
            onChange={(weather) => update({ weather })}
          />
        </Row>
        <Row label="Camera">
          <Segmented<Settings['cameraMode']>
            options={[
              { id: 'third', label: t('cameraThird') },
              { id: 'first', label: t('cameraFirst') },
            ]}
            value={settings.cameraMode}
            onChange={(cameraMode) => update({ cameraMode })}
          />
        </Row>
        <Row label={t('language')}>
          <Segmented
            options={[...LANGUAGES]}
            value={settings.language}
            onChange={(language) => update({ language })}
          />
        </Row>
        <Row label={t('sensitivity')} note={`${settings.sensitivity.toFixed(1)}×`}>
          <input
            type="range"
            min={0.3}
            max={3}
            step={0.1}
            value={settings.sensitivity}
            onChange={(event) => update({ sensitivity: Number(event.target.value) })}
          />
        </Row>
        <Row
          label={t('volume')}
          note={settings.muted ? t('soundOff') : `${Math.round(settings.volume * 100)}%`}
        >
          <div className="setting__pair">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.volume}
              aria-label={t('volume')}
              onChange={(event) => update({ volume: Number(event.target.value) })}
            />
            <Toggle checked={!settings.muted} onChange={(on) => update({ muted: !on })} />
          </div>
        </Row>
        <Row label={t('invertY')}>
          <Toggle checked={settings.invertY} onChange={(invertY) => update({ invertY })} />
        </Row>
        <Row label={t('showHints')}>
          <Toggle
            checked={settings.showControls}
            onChange={(showControls) => update({ showControls })}
          />
        </Row>
      </div>
    </div>
  )
}

function Row({
  label,
  note,
  children,
}: {
  label: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <div className="setting">
      <div className="setting__label">
        {label}
        {note && <small>{note}</small>}
      </div>
      <div className="setting__control">{children}</div>
    </div>
  )
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((option) => (
        <button
          key={option.id}
          role="radio"
          aria-checked={option.id === value}
          className={option.id === value ? 'is-active' : undefined}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      className={`toggle${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <i />
    </button>
  )
}
