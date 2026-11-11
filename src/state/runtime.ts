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

export const runtime = {
  player: {
    /** Feet position in world metres (interpolated for rendering). */
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
}
