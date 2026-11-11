/**
 * The vehicles: what each one is, how big it is and how it drives.
 *
 * Handling is tuned here, not in the simulation. Every number is in metres, seconds and
 * radians unless it says otherwise, and each one means something you can feel from the
 * driver's seat; `src/vehicles/sim/vehicleSim.ts` explains how they are used.
 *
 * No DOM or three.js imports: the tests and (later) a server can read this file.
 */

export type VehicleKind = 'car' | 'boda' | 'matatu' | 'nganya'

export const VEHICLE_KINDS: readonly VehicleKind[] = ['car', 'boda', 'matatu', 'nganya']

export interface VehicleSpec {
  kind: VehicleKind

  // ---- size
  length: number
  width: number
  /** Roof height above the ground. */
  height: number
  /** Distance between the front and rear axles. */
  wheelbase: number
  /** Distance between the left and right wheels. Zero for two-wheelers. */
  track: number
  wheelRadius: number
  wheelWidth: number
  /** How much heavier than a boda, roughly. Decides who moves when two vehicles touch. */
  mass: number

  // ---- engine and brakes
  /** Flat out, in m/s. The pull of the engine fades to nothing as speed approaches it. */
  topSpeed: number
  reverseSpeed: number
  /** Acceleration from a standstill, in m/s². */
  accel: number
  /** Braking, in m/s². */
  brake: number
  /** Slowing with your foot off everything, in m/s²: a constant part, and a part per m/s of speed. */
  rolling: number
  drag: number

  // ---- steering and grip
  /** Sideways acceleration the tyres can hold before the vehicle slides, in m/s². */
  grip: number
  /** The same with the handbrake on: low, so the tail steps out. */
  handbrakeGrip: number
  /** Steering angle of the front wheels at parking speed. */
  steerLock: number
  /**
   * Sideways acceleration that full steering asks for at speed, in m/s². Keeping it under
   * `grip` means the vehicle goes where it is pointed; above it, full lock makes it slide.
   */
  steerG: number
  /** How quickly the steering wheel follows the key or stick, in full-locks per second. */
  steerRate: number
  /** How quickly the vehicle starts to turn once the wheels are turned, per second. */
  yawResponse: number

  // ---- how the body moves on its springs (looks only)
  /** Body roll in a corner, in radians per m/s² of sideways acceleration. Negative leans in. */
  roll: number
  /** Nose dive under braking and squat under power, in radians per m/s². */
  dive: number

  // ---- collision shape: circles along the centre line
  /** How far ahead of the centre each circle sits; negative is behind. */
  circles: readonly number[]
  circleRadius: number

  // ---- camera and seat
  camera: { distance: number; height: number }
  /**
   * Where the first-person camera sits: right, up, forward of the centre. On an open seat
   * it is the rider's head. A closed vehicle has no interior to look out of, so it is a
   * bonnet camera: on the centre line, just in front of the windscreen.
   */
  eye: readonly [number, number, number]
  /** The driver is in the open (and so is drawn) rather than inside a cabin. */
  openSeat: boolean
  /** Where the rider's hips go on an open seat: up and forward of the centre. */
  seat: readonly [number, number]
  /** Where the driver steps out: metres to the right of the centre line. Kenya drives on the left, so the wheel is on the right. */
  door: number
}

const deg = (degrees: number) => (degrees * Math.PI) / 180

export const VEHICLES: Record<VehicleKind, VehicleSpec> = {
  /** A five-door hatchback: the everyday Nairobi car. Quick, light on its feet. */
  car: {
    kind: 'car',
    length: 4.2,
    width: 1.74,
    height: 1.46,
    wheelbase: 2.56,
    track: 1.5,
    wheelRadius: 0.31,
    wheelWidth: 0.21,
    mass: 8,
    topSpeed: 38,
    reverseSpeed: 9,
    accel: 6.4,
    brake: 13,
    rolling: 1.1,
    drag: 0.045,
    grip: 12.5,
    handbrakeGrip: 4.2,
    steerLock: deg(35),
    steerG: 10.5,
    steerRate: 3.2,
    yawResponse: 10,
    roll: 0.0085,
    dive: 0.006,
    circles: [-1.25, 0, 1.25],
    circleRadius: 0.87,
    camera: { distance: 7.4, height: 1.75 },
    eye: [0, 1.1, 1.1],
    openSeat: false,
    seat: [0, 0],
    door: 1.55,
  },

  /** A 150 cc motorbike taxi. Fastest off the line, leans into corners, fits anywhere. */
  boda: {
    kind: 'boda',
    length: 2.02,
    width: 0.76,
    height: 1.14,
    wheelbase: 1.32,
    track: 0,
    wheelRadius: 0.3,
    wheelWidth: 0.1,
    mass: 1,
    topSpeed: 31,
    reverseSpeed: 1.6,
    accel: 8.6,
    brake: 10.5,
    rolling: 1.3,
    drag: 0.05,
    grip: 11,
    handbrakeGrip: 4.6,
    steerLock: deg(31),
    steerG: 9.4,
    steerRate: 3.6,
    yawResponse: 12,
    // A bike leans the other way from a car: into the corner, by as much as balance needs.
    roll: -0.085,
    dive: 0.004,
    circles: [-0.52, 0.52],
    circleRadius: 0.44,
    camera: { distance: 5.6, height: 1.6 },
    eye: [0, 1.56, -0.02],
    openSeat: true,
    seat: [0.8, -0.22],
    door: 0.95,
  },

  /** A 14-seater matatu. Tall, heavy, slow to turn and slow to stop. */
  matatu: {
    kind: 'matatu',
    length: 4.95,
    width: 1.88,
    height: 2.14,
    wheelbase: 2.78,
    track: 1.6,
    wheelRadius: 0.34,
    wheelWidth: 0.23,
    mass: 15,
    topSpeed: 29,
    reverseSpeed: 7,
    accel: 4.4,
    brake: 9.5,
    rolling: 1.0,
    drag: 0.04,
    grip: 10,
    handbrakeGrip: 3.8,
    steerLock: deg(36),
    steerG: 8.2,
    steerRate: 2.4,
    yawResponse: 6.5,
    roll: 0.014,
    dive: 0.008,
    circles: [-1.56, -0.52, 0.52, 1.56],
    circleRadius: 0.94,
    camera: { distance: 9.4, height: 2.5 },
    eye: [0, 1.74, 2.36],
    openSeat: false,
    seat: [0, 0],
    door: 1.65,
  },

  /**
   * A nganya: the 33-seater minibus Nairobi turns into rolling art, with a wing on the
   * roof, a row of spotlights and lights down the skirts. Twice the weight of the
   * 14-seater and the longest thing here; it needs the whole road to turn round.
   */
  nganya: {
    kind: 'nganya',
    length: 7.2,
    width: 2.3,
    height: 2.95,
    wheelbase: 3.9,
    track: 1.92,
    wheelRadius: 0.42,
    wheelWidth: 0.3,
    mass: 30,
    topSpeed: 27,
    reverseSpeed: 6,
    accel: 3.5,
    brake: 8.6,
    rolling: 1.0,
    drag: 0.04,
    grip: 9.2,
    handbrakeGrip: 3.6,
    steerLock: deg(38),
    steerG: 7.2,
    steerRate: 2.1,
    yawResponse: 5.8,
    roll: 0.016,
    dive: 0.009,
    circles: [-2.45, -1.225, 0, 1.225, 2.45],
    circleRadius: 1.15,
    camera: { distance: 12.6, height: 3.4 },
    eye: [0, 2.2, 3.5],
    openSeat: false,
    seat: [0, 0],
    door: 1.9,
  },
}

/** Shared driving rules that do not vary by vehicle. */
export const DRIVING = {
  /** Reach, in metres from the vehicle's bodywork, within which F gets you in. */
  reach: 2.4,
  /** You can only get out below this speed, in m/s (about 15 km/h). */
  exitSpeed: 4.2,
  /** Seconds after the last mouse movement before the camera swings back behind the vehicle. */
  cameraRecentre: 1.6,
  /** How firmly the camera follows the vehicle round a corner, per second. */
  cameraFollow: 3.4,
  /** Extra field of view at top speed, in degrees. */
  speedFovKick: 12,
} as const

export type RGB = readonly [number, number, number]

/**
 * Paint, as sRGB hex. Nairobi's roads are mostly white, silver and grey imports, with the
 * odd bright one; the list is weighted the same way by repeating entries.
 */
export const CAR_PAINT: readonly string[] = [
  '#e9e9e4',
  '#e9e9e4',
  '#e9e9e4',
  '#b9bec4',
  '#b9bec4',
  '#7c8189',
  '#2b2e33',
  '#2b2e33',
  '#1d3557',
  '#7b1e22',
  '#c9302c',
  '#23513a',
  '#c8b68e',
  '#2f6fb0',
]

/** Working matatus: mostly white, some bright. The yellow band along the side is the law. */
export const MATATU_PAINT: readonly string[] = [
  '#f1f1ec',
  '#f1f1ec',
  '#7b1e22',
  '#16181c',
  '#1f4e9c',
  '#e2571e',
  '#3c8f3a',
  '#6b2c8f',
]

export const MATATU_BAND = '#f2c211'

export const BODA_PAINT: readonly string[] = [
  '#c62828',
  '#c62828',
  '#1f4e9c',
  '#16181c',
  '#e0a51a',
  '#2e7d32',
]

/**
 * How paintwork is patterned. A livery is two colours and one of these; the shader draws
 * the pattern (vehicles/view/vehicleMaterials.ts), so the numbers must not change.
 */
export const LIVERY = {
  /** One colour all over. */
  plain: 0,
  /** Slanted bars across the back two thirds. */
  slash: 1,
  /** A jagged edge rising from the skirts: flames, more or less. */
  flames: 2,
  /** Two-tone, parted along a wave. */
  split: 3,
  /** A patchwork of panels, the way airbrushed art reads from across the street. */
  blocks: 4,
  /** Zebra stripes. */
  zebra: 5,
} as const
export type LiveryPattern = (typeof LIVERY)[keyof typeof LIVERY]

export interface Livery {
  /** Paint, as sRGB hex. */
  base: string
  /** The second colour: the pattern, the wing, the name board and the lights down the skirts. */
  accent: string
  pattern: LiveryPattern
}

const plain = (base: string): Livery => ({ base, accent: base, pattern: LIVERY.plain })

/**
 * Nganyas are painted by hand, every one different, and the art is somebody's work: we
 * do not copy any of it. These are our own colour schemes in the same loud spirit.
 */
export const NGANYA_LIVERIES: readonly Livery[] = [
  { base: '#d6341f', accent: '#f6c21a', pattern: LIVERY.flames },
  { base: '#15171b', accent: '#19c2d8', pattern: LIVERY.slash },
  { base: '#1f4fa8', accent: '#f2f2ee', pattern: LIVERY.split },
  { base: '#6a2d91', accent: '#f08a1c', pattern: LIVERY.blocks },
  { base: '#f2c211', accent: '#15171b', pattern: LIVERY.slash },
  { base: '#1c8c4a', accent: '#f2f2ee', pattern: LIVERY.flames },
  { base: '#e2571e', accent: '#15171b', pattern: LIVERY.blocks },
  { base: '#f2f2ee', accent: '#d6341f', pattern: LIVERY.split },
  { base: '#101216', accent: '#e0245e', pattern: LIVERY.flames },
  { base: '#0f8f93', accent: '#f6c21a', pattern: LIVERY.slash },
  { base: '#b5121b', accent: '#f2f2ee', pattern: LIVERY.blocks },
  { base: '#27306f', accent: '#7ee04a', pattern: LIVERY.split },
]

/** The safari van outside every hotel: a 14-seater in zebra stripes. Rare on purpose. */
export const SAFARI_VAN: Livery = { base: '#f1f1ec', accent: '#16181c', pattern: LIVERY.zebra }

/**
 * Every way each kind can be painted. A vehicle stores an index into its kind's list.
 * Cars, bodas and working matatus are one colour; the art is on the nganyas.
 */
export const LIVERIES: Record<VehicleKind, readonly Livery[]> = {
  car: CAR_PAINT.map(plain),
  boda: BODA_PAINT.map(plain),
  matatu: [...MATATU_PAINT.map(plain), SAFARI_VAN],
  nganya: NGANYA_LIVERIES,
}

/**
 * What a nganya is called, on its name board and in the HUD. Everyday Swahili and Sheng
 * words (fire, thunder, lion, crew), not the names of real matatus.
 */
export const NGANYA_NAMES: readonly string[] = [
  'Moto',
  'Radi',
  'Simba',
  'Mbogi',
  'Noma',
  'Kali',
  'Nyota',
  'Rieng',
  'Shwari',
  'Dunda',
  'Tufani',
  'Chui',
  'Fiti',
  'Wazi',
  'Kifaru',
  'Ngoma',
  'Bazenga',
  'Mwewe',
]

/** How many of each kind the city holds at most. Keeps slow phones out of trouble. */
export const FLEET_LIMITS: Record<VehicleKind, number> = {
  car: 240,
  boda: 70,
  matatu: 46,
  nganya: 30,
}
