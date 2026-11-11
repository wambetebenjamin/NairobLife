/**
 * Getting in and out.
 *
 * `runtime.driving` is the one fact that says whether the player is on foot or at the
 * wheel. Everything else reads it: the fleet (who gets the driver's input), the player
 * (whether to walk), the camera (which rig to use). This file is the only place that
 * changes it, so the HUD's copy in the store can never fall out of step.
 */
import { DRIVING } from '../config/vehicles'
import { translate, type StringKey } from '../config/strings'
import { input } from '../input/input'
import { useGame } from '../state/gameStore'
import { runtime } from '../state/runtime'
import type { Fleet, Vehicle } from './fleet'

let helpShown = false
let lastRefusal = -Infinity

const say = (key: StringKey) => {
  const game = useGame.getState()
  game.toast(translate(game.settings.language, key))
}

/** Complaints such as "slow down" are worth saying once, not on every press of the key. */
function refuse(key: StringKey): void {
  const now = performance.now()
  if (now - lastRefusal < 1500) return
  lastRefusal = now
  say(key)
}

export function beginDriving(fleet: Fleet, vehicle: Vehicle): void {
  runtime.driving = vehicle.id
  runtime.vehicle.kind = vehicle.kind
  runtime.vehicle.impact = 0
  runtime.vehicle.impactAgo = 10
  fleet.wake(vehicle)
  // Space was "jump" a moment ago; do not let a queued jump fire when we get out.
  input.consumeJump()
  const game = useGame.getState()
  game.setDriving({ kind: vehicle.kind, name: vehicle.name, label: vehicle.label })
  if (!helpShown) {
    helpShown = true
    say(game.touch ? 'drivingHelpTouch' : 'drivingHelp')
  }
}

/** Leave the vehicle where it is. The caller decides where the player goes. */
export function endDriving(): void {
  if (runtime.driving < 0) return
  runtime.driving = -1
  input.consumeJump()
  useGame.getState().setDriving(null)
}

/** The F key: into the nearest vehicle within reach, or out of the one being driven. */
export function pressEnterExit(fleet: Fleet): void {
  if (runtime.driving >= 0) {
    const vehicle = fleet.vehicles[runtime.driving]
    if (!vehicle) return endDriving()
    if (Math.abs(vehicle.state.speed) > DRIVING.exitSpeed) return refuse('tooFastToExit')
    const spot = fleet.exitSpot(vehicle)
    if (!spot) return refuse('noRoomToExit')
    endDriving()
    runtime.teleport = { ...spot, yaw: vehicle.state.yaw, onTop: false }
    return
  }
  const p = runtime.player
  const vehicle = fleet.nearest(p.x, p.y, p.z, DRIVING.reach)
  if (vehicle) beginDriving(fleet, vehicle)
}
