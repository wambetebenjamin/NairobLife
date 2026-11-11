/**
 * A handle for tinkering from the browser console.
 *
 * Run the dev server, or open any build with ?debug in the address, then in DevTools:
 *
 *   kanairo.runtime.time = 18.4          // jump to sunset
 *   kanairo.actions.teleportToId('kicc-helipad')
 *   kanairo.runtime.player               // live position, speed, heading
 *   kanairo.game.getState().settings     // current settings
 *   kanairo.fleet.vehicles               // every vehicle: kind, state, whether it is awake
 *   kanairo.three.scene                  // the three.js scene, renderer (gl) and camera
 */
import * as actions from './actions'
import { input } from '../input/input'
import { debugHandle } from '../state/debugHandle'
import { useGame } from '../state/gameStore'
import { runtime } from '../state/runtime'

export function installDebugHandle(): void {
  const wanted = import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug')
  if (!wanted) return
  // The scene adds `three` and `fleet` as they come up (state/debugHandle.ts).
  Object.assign(debugHandle, { game: useGame, runtime, actions, input })
  Object.assign(window, { kanairo: debugHandle })
}
