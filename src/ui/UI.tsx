/**
 * The HTML interface drawn over the 3D canvas: which screen shows depends on the phase.
 */
import { useEffect } from 'react'
import { loadWorld } from '../game/loadWorld'
import { useGame } from '../state/gameStore'
import { hideBoot, setBootProgress, showBootError, startBootTips } from './bootScreen'
import { AudioListener } from '../audio/AudioListener'
import { Hud } from './Hud'
import { RideControls } from './RideControls'
import { MainMenu } from './MainMenu'
import { PauseMenu } from './PauseMenu'
import { SettingsPanel } from './SettingsPanel'
import { TeleportMenu } from './TeleportMenu'
import { Toasts } from './Toasts'
import { TouchControls } from './TouchControls'

export function UI() {
  const phase = useGame((state) => state.phase)
  const curtain = useGame((state) => state.curtain)
  const teleportOpen = useGame((state) => state.teleportOpen)
  const settingsOpen = useGame((state) => state.settingsOpen)
  const touch = useGame((state) => state.touch)
  const ride = useGame((state) => state.ride)

  return (
    <div className={`ui${touch ? ' ui--touch' : ''}`}>
      <BootDriver />
      {phase === 'menu' && <MainMenu />}
      <AudioListener />
      {phase === 'playing' && <Hud />}
      {phase === 'playing' && ride && <RideControls />}
      {phase === 'playing' && touch && !teleportOpen && !ride && <TouchControls />}
      {phase === 'paused' && <PauseMenu />}
      {teleportOpen && <TeleportMenu />}
      {settingsOpen && <SettingsPanel />}
      <Toasts />
      <div className={`curtain${curtain ? ' curtain--on' : ''}`} aria-hidden="true" />
    </div>
  )
}

/** Feeds load progress to the static loading screen in index.html, then removes it. */
function BootDriver() {
  const progress = useGame((state) => state.progress)
  const sceneReady = useGame((state) => state.sceneReady)
  const loadError = useGame((state) => state.loadError)

  useEffect(startBootTips, [])
  useEffect(() => setBootProgress(progress.value, progress.label), [progress])
  useEffect(() => {
    if (loadError) showBootError(loadError, () => void loadWorld())
  }, [loadError])
  useEffect(() => {
    if (!sceneReady) return
    setBootProgress(1, 'Karibu Nairobi')
    hideBoot()
  }, [sceneReady])

  return null
}
