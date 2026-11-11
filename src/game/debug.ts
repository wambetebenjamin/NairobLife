/**
 * A handle for tinkering from the browser console.
 *
 * Run the dev server, or open any build with ?debug in the address, then in DevTools:
 *
 *   nl.runtime.time = 18.4          // jump to sunset
 *   nl.actions.teleportToId('kicc-helipad')
 *   nl.runtime.player               // live position, speed, heading
 *   nl.game.getState().settings     // current settings
 *   nl.three.scene                  // the three.js scene, renderer (gl) and camera
 */
import * as actions from './actions'
import { input } from '../input/input'
import { useGame } from '../state/gameStore'
import { runtime } from '../state/runtime'

const handle: Record<string, unknown> = { game: useGame, runtime, actions, input }

export function installDebugHandle(): void {
  const wanted = import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug')
  if (wanted) Object.assign(window, { nl: handle })
}

/** Adds the three.js renderer, scene and camera to the handle as `nl.three`. */
export function exposeThree(three: unknown): void {
  handle.three = three
}
