/**
 * Start-up: download and mesh the map, reporting progress to the loading screen.
 */
import { DEFAULT_ZONE_ID } from '../config/zones'
import { useGame } from '../state/gameStore'
import { loadZone } from '../world/zone/loadZone'
import type { LoadStage } from '../world/zone/protocol'

const STAGE_LABEL: Record<LoadStage, string> = {
  download: 'Downloading the city',
  buildings: 'Raising the skyline',
  roads: 'Paving the streets',
  trees: 'Planting jacarandas',
}

/** The zone takes the first 70% of the bar; physics and the first frame take the rest. */
const ZONE_SHARE = 0.7

let loading = false

export async function loadWorld(): Promise<void> {
  // React's StrictMode runs effects twice in development; one download is enough.
  if (loading || useGame.getState().zone) return
  loading = true
  const game = useGame.getState()
  game.setLoadError(null)
  try {
    if (!supportsWebGL2()) {
      throw new Error(
        'This browser cannot run WebGL 2. Try a recent Chrome, Edge, Firefox or Safari.',
      )
    }
    const zone = await loadZone(DEFAULT_ZONE_ID, (progress) => {
      game.setProgress(progress.overall * ZONE_SHARE, STAGE_LABEL[progress.stage])
    })
    game.setProgress(0.78, 'Starting the engine')
    game.setZone(zone)
  } catch (error) {
    game.setLoadError(error instanceof Error ? error.message : String(error))
  } finally {
    loading = false
  }
}

function supportsWebGL2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}
