/**
 * Fast-changing game state that must NOT go through React.
 *
 * The player moves 60 times a second; pushing that through a store would re-render the
 * UI every frame. Instead the simulation writes plain fields here, three.js components
 * read them inside useFrame, and the HUD samples them a few times a second.
 *
 * Slow, UI-facing state (which screen is showing, settings) lives in gameStore.ts.
 */
import { CAMERA, TIME } from '../config/game'
import type { VehicleKind } from '../config/vehicles'
import type { RideRoute } from '../vehicles/ride/routes'

export const runtime = {
  /**
   * The player, wherever they are. On foot this is the character; at the wheel it is the
   * vehicle, so the map, the street name, the shadows and the zone edge need not care.
   */
  player: {
    /** Feet (or the road under the vehicle) in world metres, interpolated for rendering. */
    x: 0,
    y: 0,
    z: 0,
    /** Facing; 0 = north, positive turns left. See core/geo.ts. */
    yaw: 0,
    /** Horizontal speed in m/s. */
    speed: 0,
    verticalSpeed: 0,
    grounded: true,
    crouching: false,
    sprinting: false,
    /** Seconds since the last landing, for the camera thump. */
    landedAgo: 10,
    landingImpact: 0,
  },

  camera: {
    yaw: 0,
    /** Elevation of the camera around the player; positive looks down. */
    pitch: CAMERA.startPitch as number,
    distance: CAMERA.distance as number,
  },

  /** Id of the vehicle being driven, or -1 on foot. Change it with vehicles/driving.ts. */
  driving: -1,

  /**
   * The driven vehicle as it is drawn this frame. Filled in by the fleet while driving;
   * stale, and to be ignored, on foot.
   */
  vehicle: {
    kind: 'car' as VehicleKind,
    /** The road under the middle of the vehicle. */
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    /** Nose up is positive. Follows the road, without the dive of braking. */
    pitch: 0,
    /** Lean of the bodywork (and, on two wheels, of everything). Right side up is positive. */
    roll: 0,
    /** Speed along the heading in m/s; negative in reverse. */
    speed: 0,
    /** How hard the last knock was, as a closing speed in m/s, and how long ago. */
    impact: 0,
    impactAgo: 10,
    airborne: false,
  },

  /** A guided stage-to-stage trip. The player's capsule waits at the original position. */
  ride: null as null | {
    route: RideRoute
    distance: number
    speed: number
    origin: TeleportRequest
    destination: TeleportRequest
  },

  /** F was pressed: get into the nearest vehicle, or out of this one. Consumed by the fleet. */
  enterExit: false,

  /** Elapsed simulation seconds for traffic signal cycles; pauses with the game. */
  trafficTime: 0,

  /** How dark it is, 0 (day) .. 1 (night). Vehicles switch their lamps on by it. */
  night: 0,

  /** How far the third-person camera really is from the player right now, in metres. */
  cameraGap: CAMERA.distance as number,

  /** Hour of day, 0..24. */
  time: TIME.startHour as number,

  /** Set by the UI, consumed by the player on the next physics step. */
  teleport: null as TeleportRequest | null,

  /** Frames per second, smoothed. Shown in the HUD in development. */
  fps: 60,
}

export interface TeleportRequest {
  x: number
  z: number
  yaw: number
  /** Land on top of whatever is there rather than on the ground. */
  onTop: boolean
  /** Camera elevation on arrival, in radians; negative looks up. Defaults to a level view. */
  pitch?: number
  /**
   * Stand at exactly this height instead of looking for the ground, and leave the camera
   * where it is. Used when stepping out of a vehicle, which may be up on a flyover.
   */
  y?: number
}
