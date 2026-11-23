/**
 * The main menu, drawn over the live city (the camera circles KICC behind it).
 */
import { useMemo } from 'react'
import { OSM_ATTRIBUTION } from '../world/zone/format'
import { startGame } from '../game/actions'
import { useGame } from '../state/gameStore'
import { GameName } from './GameName'
import { useT } from './useT'

export function MainMenu() {
  const t = useT()
  const openSettings = useGame((state) => state.setSettingsOpen)
  const zone = useGame((state) => state.zone)
  const stats = useMemo(() => {
    if (!zone) return ''
    const streets = new Set(zone.file.roads.map((road) => road.n).filter(Boolean)).size
    return `${zone.file.buildings.length.toLocaleString()} buildings · ${streets} named streets`
  }, [zone])

  return (
    <div className="menu">
      <div className="menu__column">
        <p className="menu__eyebrow">NAIROBI · KENYA</p>
        <div className="flag" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <h1 className="wordmark">
          <GameName />
        </h1>
        <p className="menu__tagline">{t('tagline')}</p>

        <button className="menu__start" onClick={startGame} autoFocus>
          <span>{t('play')}</span>
          <small>{t('playHint')}</small>
        </button>

        <div className="menu__links">
          <button className="link" onClick={() => openSettings(true)}>
            {t('settings')}
          </button>
        </div>

        <footer className="menu__footer">
          <p>Nairobi CBD. {stats}</p>
          <p>
            Map data{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              {OSM_ATTRIBUTION}
            </a>
          </p>
        </footer>
      </div>
    </div>
  )
}
