import { quitToMenu, resumeGame } from '../game/actions'
import { useGame } from '../state/gameStore'
import { ControlsCard } from './ControlsCard'
import { useT } from './useT'

export function PauseMenu() {
  const t = useT()
  const openSettings = useGame((state) => state.setSettingsOpen)
  const openTeleport = useGame((state) => state.setTeleportOpen)

  return (
    <div className="overlay">
      <div className="panel panel--pause" role="dialog" aria-modal="true" aria-label={t('paused')}>
        <h2 className="panel__title">{t('paused')}</h2>
        <div className="panel__buttons">
          <button className="button button--primary" onClick={resumeGame} autoFocus>
            {t('resume')}
          </button>
          <button className="button" onClick={() => openTeleport(true)}>
            {t('teleport')}
          </button>
          <button className="button" onClick={() => openSettings(true)}>
            {t('settings')}
          </button>
          <button className="button button--quiet" onClick={quitToMenu}>
            {t('backToMenu')}
          </button>
        </div>
        <ControlsCard />
      </div>
    </div>
  )
}
