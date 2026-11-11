/**
 * The dials. Gameplay feel lives here rather than scattered through components, so
 * tuning the game means editing one file.
 */

/**
 * Change the name here and it changes on the loading screen, the menu and the HUD.
 * (index.html and package.json carry it too; search for "NairobLife".)
 */
export const GAME_NAME = 'NairobLife'
export const GAME_TAGLINE = 'Free-roam Nairobi. No download.'
export const REPO_URL = 'https://github.com/wambetebenjamin/NairobLife'

export const PLAYER = {
  radius: 0.32,
  /** Standing and crouching height of the collision capsule, in metres. */
  height: 1.76,
  crouchHeight: 1.15,
  eyeHeight: 1.62,
  crouchEyeHeight: 1.02,

  /** Speeds in m/s. 4.6 m/s is a brisk jog (16.5 km/h); 8.6 m/s is a flat-out sprint (31 km/h). */
  jogSpeed: 4.6,
  sprintSpeed: 8.6,
  crouchSpeed: 1.9,

  /** How fast you reach the target speed, in m/s². Lower in the air so jumps commit. */
  groundAccel: 48,
  airAccel: 14,

  gravity: 24,
  /** Take-off speed in m/s. With the gravity above that is a 1.25 m jump. */
  jumpSpeed: 7.75,
  /** Grace period after walking off a ledge during which a jump still counts, in seconds. */
  coyoteTime: 0.12,
  /** A jump pressed this long before landing still fires, in seconds. */
  jumpBuffer: 0.13,

  /** Kerbs and stairs up to this height are walked up without jumping, in metres. */
  stepHeight: 0.45,
  maxSlopeDeg: 50,
  /** Faster than this (m/s, downwards) and the landing gets a camera thump. */
  hardLandingSpeed: 11,
} as const

export const CAMERA = {
  fov: 58,
  /** Extra field of view at full sprint, in degrees. */
  sprintFovKick: 7,
  near: 0.15,
  far: 7000,
  distance: 5.2,
  minDistance: 1.6,
  maxDistance: 14,
  /** Where the camera looks, relative to the player's feet. */
  targetHeight: 1.55,
  /** Sideways offset for an over-the-shoulder view, in metres. */
  shoulder: 0.45,
  /** Elevation limits in radians: negative looks up from below, positive looks down. */
  minPitch: -0.55,
  maxPitch: 1.35,
  startPitch: 0.16,
  /** Radians of turn per pixel of mouse travel at sensitivity 1. */
  mouseSpeed: 0.0023,
  touchSpeed: 0.0052,
} as const

export const TIME = {
  /** Real minutes for a full 24-hour cycle. */
  dayLengthMinutes: 24,
  /** Hour of day when a session starts: a bright mid-morning. */
  startHour: 9.25,
  /** Nairobi is a degree off the equator: sunrise and sunset barely move all year. */
  sunriseHour: 6.5,
  sunsetHour: 18.6,
} as const

/** Where a new session starts: City Square, at the foot of KICC. See config/landmarks.ts. */
export const START_LANDMARK = 'kicc'
