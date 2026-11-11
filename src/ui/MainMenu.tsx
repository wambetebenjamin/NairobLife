/**
 * The main menu, drawn over the live city (the camera circles KICC behind it).
 */
import { useMemo } from 'react'
import { REPO_URL } from '../config/game'
import { OSM_ATTRIBUTION } from '../world/zone/format'
import { startGame } from '../game/actions'
import { useGame } from '../state/gameStore'
import { ControlsCard } from './ControlsCard'
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
        <div className="flag" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <h1 className="wordmark">
          <GameName />
        </h1>
        <p className="menu__tagline">{t('tagline')}</p>

        <nav className="menu__modes" aria-label="Game modes">
          <button className="mode mode--primary" onClick={startGame} autoFocus>
            <span className="mode__name">{t('play')}</span>
            <span className="mode__hint">{t('playHint')}</span>
          </button>
          {/* TODO(multiplayer): Phase 5. TODO(battle-royale): Phase 6. */}
          <ComingSoon name={t('multiplayer')} hint={t('multiplayerHint')} phase="Phase 5" />
          <ComingSoon name={t('battleRoyale')} hint={t('battleRoyaleHint')} phase="Phase 6" />
        </nav>

        <div className="menu__links">
          <button className="link" onClick={() => openSettings(true)}>
            {t('settings')}
          </button>
          <a className="link" href={REPO_URL} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>

        <footer className="menu__footer">
          <p>Phase 2 · Nairobi CBD · {stats}</p>
          <p>
            Map data{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              {OSM_ATTRIBUTION}
            </a>
          </p>
        </footer>
      </div>

      <aside className="menu__aside">
        <ControlsCard />
      </aside>
    </div>
  )
}

function ComingSoon({ name, hint, phase }: { name: string; hint: string; phase: string }) {
  const t = useT()
  return (
    <button className="mode" disabled>
      <span className="mode__name">{name}</span>
      <span className="mode__hint">{hint}</span>
      <span className="mode__badge">
        {t('comingSoon')} · {phase}
      </span>
    </button>
  )
}
