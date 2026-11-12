/**
 * The vehicles, as geometry built in code.
 *
 * Each model is one mesh. Its faces are marked as paintwork (each vehicle's own livery),
 * as trim in the livery's second colour, as a head or tail lamp (lit per vehicle: on at
 * night, brighter under braking), as a light that glows after dark, or as none of these.
 * Wheels are one shared shape, placed and sized per vehicle.
 *
 * Sizes come from config/vehicles.ts, so a model can never disagree with the collision
 * shape or the handling about how long the vehicle is.
 *
 * TODO(art): hand-made glTF models, with these as the instant-loading fallback.
 * TODO(matatus): the name in letters on the board down each side, and route numbers on
 * the windscreen. The board is there, in the livery's second colour; it has no text yet.
 */
import type { BufferGeometry } from 'three'
import { MATATU_BAND, VEHICLES, type VehicleKind, type VehicleSpec } from '../../config/vehicles'
import { ACCENT, LAMP, MeshBuilder, PAINT, type Finish } from './meshBuilder'

const GLASS = '#17222c'
const TRIM = '#1c1e21'
const UNDERSIDE = '#0e0f11'
const CHROME = '#8d9399'
const SEAT = '#15161a'
const TYRE = '#101113'
const HUB_LIGHT = '#9da2a8'
const HUB_DARK = '#565a60'
/** Kenyan number plates: white at the front, yellow at the back. */
const PLATE_FRONT = '#ecece6'
const PLATE_REAR = '#e6bd18'
const HEADLAMP = '#fff3d4'
const TAIL_LAMP = '#ff2616'
/** The amber marker lights along the roof of anything big. */
const MARKER = '#ffb21f'
const CHEVRON_YELLOW = '#f2c211'

export interface VehicleModel {
  body: BufferGeometry
  /** Where the wheels go, in model space, and which ones steer. */
  wheels: readonly WheelMount[]
}

export interface WheelMount {
  x: number
  /** Forward of the vehicle's centre; negative is behind. */
  forward: number
  steers: boolean
}

/** Points over a wheel, from behind it to in front of it: the cut-out in the bodywork. */
function wheelArch(spec: VehicleSpec, forward: number, sill: number): [number, number][] {
  const r = spec.wheelRadius
  const reach = r + 0.07
  return [
    [forward - reach, sill],
    [forward - reach * 0.94, r + reach * 0.42],
    [forward - reach * 0.6, r + reach * 0.8],
    [forward, r + reach],
    [forward + reach * 0.6, r + reach * 0.8],
    [forward + reach * 0.94, r + reach * 0.42],
    [forward + reach, sill],
  ]
}

function fourWheels(spec: VehicleSpec): WheelMount[] {
  const x = spec.width / 2 - spec.wheelWidth / 2 - 0.01
  const axle = spec.wheelbase / 2
  return [
    { x: -x, forward: axle, steers: true },
    { x, forward: axle, steers: true },
    { x: -x, forward: -axle, steers: false },
    { x, forward: -axle, steers: false },
  ]
}

/** The dark space behind each wheel, so daylight does not show through the arches. */
function wheelWells(m: MeshBuilder, spec: VehicleSpec, sill: number): void {
  const reach = spec.wheelRadius + 0.07
  const width = spec.width - 2 * spec.wheelWidth - 0.08
  for (const forward of [spec.wheelbase / 2, -spec.wheelbase / 2]) {
    m.box(
      [0, (sill + spec.wheelRadius + reach) / 2, -forward],
      [width, spec.wheelRadius + reach - sill, reach * 2],
      UNDERSIDE,
      '+y',
    )
  }
}

// ---------------------------------------------------------------------------- car

function buildCar(): VehicleModel {
  const spec = VEHICLES.car
  const half = spec.width / 2
  const nose = spec.length / 2
  const axle = spec.wheelbase / 2
  const sill = 0.27
  const body = new MeshBuilder()

  // Side view of everything below the windows, clockwise from the front bumper.
  const profile: [number, number][] = [
    [nose - 0.08, sill],
    [nose, 0.42],
    [nose, 0.62],
    [nose - 0.08, 0.74],
    [0.92, 0.9], // bottom of the windscreen
    [-1.72, 0.94], // bottom of the rear window
    [-nose + 0.04, 0.88],
    [-nose, 0.5],
    [-nose + 0.08, sill],
    ...wheelArch(spec, -axle, sill),
    ...wheelArch(spec, axle, sill),
  ]
  const finishes: Finish[] = [TRIM, PAINT, PAINT, PAINT, PAINT, PAINT, PAINT, TRIM]
  body.extrude(profile, half, (i) => finishes[i] ?? UNDERSIDE, PAINT)
  wheelWells(body, spec, sill)

  const cabin = {
    baseFront: [0.92, 0.9] as const,
    baseRear: [-1.72, 0.94] as const,
    roofFront: [0.24, spec.height - 0.02] as const,
    roofRear: [-1.2, spec.height] as const,
    baseHalfWidth: half - 0.03,
    roofHalfWidth: half - 0.18,
  }
  body.cabin(cabin, { front: GLASS, rear: GLASS, sides: GLASS, roof: PAINT })
  // Pillars: painted bars up the corners of the glass and between the doors.
  for (const side of [1, -1]) {
    const base = side * cabin.baseHalfWidth
    const roof = side * cabin.roofHalfWidth
    body.beam([base, 0.9, -0.92], [roof, spec.height - 0.02, -0.24], 0.07, 0.03, PAINT)
    body.beam([base, 0.92, 0.32], [roof, spec.height - 0.01, 0.4], 0.1, 0.03, PAINT)
    body.beam([base, 0.94, 1.72], [roof, spec.height, 1.2], 0.11, 0.03, PAINT)
    // Door mirrors.
    body.box([side * (half + 0.06), 0.99, -0.8], [0.13, 0.09, 0.07], PAINT)
  }

  body.box([0, 0.585, -nose], [0.92, 0.05, 0.03], TRIM)
  body.box([0, 0.5, -nose - 0.005], [0.44, 0.11, 0.02], PLATE_FRONT)
  body.box([0, 0.63, nose - 0.02], [0.46, 0.11, 0.02], PLATE_REAR)

  for (const side of [1, -1]) {
    body.lamp = LAMP.head
    body.box([side * 0.6, 0.675, -nose + 0.05], [0.36, 0.11, 0.12], HEADLAMP)
    body.lamp = LAMP.tail
    body.box([side * 0.63, 0.78, nose - 0.04], [0.36, 0.13, 0.08], TAIL_LAMP)
  }
  body.lamp = LAMP.none

  return { body: body.geometry(), wheels: fourWheels(spec) }
}

// ---------------------------------------------------------------------------- matatu

function buildMatatu(): VehicleModel {
  const spec = VEHICLES.matatu
  const half = spec.width / 2
  const nose = spec.length / 2
  const axle = spec.wheelbase / 2
  const sill = 0.3
  const belt = 1.1
  const body = new MeshBuilder()

  // A cab-over van: flat nose, no bonnet to speak of.
  const profile: [number, number][] = [
    [nose - 0.075, sill],
    [nose, 0.46],
    [nose, 0.98],
    [nose - 0.095, belt],
    [-nose + 0.035, belt],
    [-nose, 0.52],
    [-nose + 0.075, sill],
    ...wheelArch(spec, -axle, sill),
    ...wheelArch(spec, axle, sill),
  ]
  const finishes: Finish[] = [TRIM, PAINT, PAINT, PAINT, PAINT, TRIM]
  body.extrude(profile, half, (i) => finishes[i] ?? UNDERSIDE, PAINT)
  wheelWells(body, spec, sill)

  const roofFront = nose - 0.53
  body.cabin(
    {
      baseFront: [nose - 0.095, belt],
      baseRear: [-nose + 0.035, belt],
      roofFront: [roofFront, spec.height - 0.04],
      roofRear: [-nose + 0.075, spec.height],
      baseHalfWidth: half - 0.01,
      roofHalfWidth: half - 0.06,
    },
    { front: GLASS, rear: PAINT, sides: PAINT, roof: PAINT },
  )

  // A band of windows down each side, and the yellow line the law asks for below it.
  const windows: [number, number][] = [
    [1.62, 0.84],
    [0.7, -0.18],
    [-0.32, -1.2],
    [-1.34, -2.18],
  ]
  for (const side of [1, -1]) {
    for (const [front, rear] of windows) {
      body.box(
        [side * (half - 0.035), 1.59, -(front + rear) / 2],
        [0.05, 0.56, front - rear],
        GLASS,
      )
    }
    body.box([side * (half + 0.004), 0.97, 0], [0.02, 0.13, spec.length - 0.3], MATATU_BAND)
    body.box([side * (half + 0.07), 1.44, -nose + 0.42], [0.1, 0.24, 0.06], TRIM)
  }
  body.box([0, 1.62, nose - 0.05], [1.36, 0.52, 0.05], GLASS)
  body.box([0, 0.72, -nose], [0.86, 0.2, 0.03], TRIM)
  body.box([0, 0.5, -nose - 0.005], [0.44, 0.11, 0.02], PLATE_FRONT)
  body.box([0, 0.74, nose + 0.005], [0.46, 0.11, 0.02], PLATE_REAR)
  // Luggage carrier on the roof.
  for (const side of [1, -1]) {
    body.beam(
      [side * 0.7, spec.height + 0.07, -1.1],
      [side * 0.7, spec.height + 0.07, 2.2],
      0.04,
      0.04,
      CHROME,
    )
  }
  for (const z of [-1.1, 0, 1.1, 2.2]) {
    body.beam([-0.7, spec.height + 0.07, z], [0.7, spec.height + 0.07, z], 0.04, 0.04, CHROME)
  }

  for (const side of [1, -1]) {
    body.lamp = LAMP.head
    body.box([side * 0.68, 0.74, -nose + 0.03], [0.34, 0.17, 0.1], HEADLAMP)
    body.lamp = LAMP.tail
    body.box([side * 0.82, 0.86, nose - 0.02], [0.15, 0.32, 0.07], TAIL_LAMP)
  }
  body.lamp = LAMP.none

  return { body: body.geometry(), wheels: fourWheels(spec) }
}

// ---------------------------------------------------------------------------- nganya

/**
 * A 33-seater on a light lorry chassis, dressed the way the streets dress them: a wing
 * over the tail, spotlights over the cab, a board down each side for the name, marker
 * lights along the roof and a strip of light under each skirt.
 */
function buildNganya(): VehicleModel {
  const spec = VEHICLES.nganya
  const half = spec.width / 2
  const nose = spec.length / 2
  const axle = spec.wheelbase / 2
  const roof = spec.height
  const sill = 0.46
  const belt = 1.38
  const body = new MeshBuilder()

  // Below the windows: slab sides and a flat nose, the cab sitting over the engine.
  const profile: [number, number][] = [
    [nose - 0.06, sill],
    [nose, 0.66],
    [nose, belt - 0.06],
    [nose - 0.04, belt],
    [-nose + 0.04, belt],
    [-nose, 0.78],
    [-nose + 0.07, sill],
    ...wheelArch(spec, -axle, sill),
    ...wheelArch(spec, axle, sill),
  ]
  const finishes: Finish[] = [TRIM, PAINT, PAINT, PAINT, PAINT, TRIM]
  body.extrude(profile, half, (i) => finishes[i] ?? UNDERSIDE, PAINT)
  wheelWells(body, spec, sill)

  body.cabin(
    {
      baseFront: [nose - 0.04, belt],
      baseRear: [-nose + 0.04, belt],
      roofFront: [nose - 0.42, roof - 0.06],
      roofRear: [-nose + 0.06, roof],
      baseHalfWidth: half - 0.01,
      roofHalfWidth: half - 0.05,
    },
    { front: GLASS, rear: PAINT, sides: PAINT, roof: PAINT },
  )

  // ---- sides: the cab window, five passenger windows, and the name board above them
  const windows: [number, number][] = [
    [3.05, 2.25],
    [2.05, 1.19],
    [1.05, 0.19],
    [0.05, -0.81],
    [-0.95, -1.81],
    [-1.95, -2.81],
  ]
  for (const side of [1, -1]) {
    for (const [front, rear] of windows) {
      body.box([side * (half - 0.02), 1.96, -(front + rear) / 2], [0.05, 0.8, front - rear], GLASS)
    }
    body.box([side * (half + 0.004), 1.5, 0], [0.02, 0.05, spec.length - 0.5], CHROME)
    body.box([side * (half - 0.035), 2.62, 0.4], [0.05, 0.36, 5], ACCENT)
    // Mirrors, out on arms where a bus driver can see down the whole side.
    body.beam(
      [side * half, 2.0, -(nose - 0.5)],
      [side * (half + 0.24), 2.06, -(nose - 0.24)],
      0.04,
      0.04,
      TRIM,
    )
    body.box([side * (half + 0.27), 1.92, -(nose - 0.22)], [0.08, 0.42, 0.14], TRIM)
    // Marker lights along the roof, and a strip of light under the skirt.
    body.lamp = LAMP.glow
    for (const forward of [2.6, 1.3, 0, -1.3, -2.6]) {
      body.box([side * (half - 0.13), roof + 0.02, -forward], [0.12, 0.06, 0.22], MARKER)
    }
    body.box([side * (half - 0.01), sill + 0.03, 0], [0.05, 0.08, 2.9], ACCENT)
    body.lamp = LAMP.none
  }
  // The step up to the door: the kerb side is the left, because Kenya drives on the left.
  body.box([-(half - 0.01), 0.62, -2.65], [0.04, 0.32, 0.76], UNDERSIDE)

  // ---- nose: header board, grille, hazard chevrons, plate
  body.box([0, 2.68, -(nose - 0.36)], [spec.width - 0.24, 0.36, 0.1], ACCENT)
  body.box([0, 0.98, -nose - 0.005], [1.1, 0.3, 0.03], CHROME)
  for (let k = 0; k < 6; k++) {
    body.box(
      [-0.75 + k * 0.3, 0.58, -nose - 0.012],
      [0.3, 0.1, 0.03],
      k % 2 ? TRIM : CHEVRON_YELLOW,
    )
  }
  body.box([0, 0.76, -nose - 0.006], [0.46, 0.11, 0.02], PLATE_FRONT)

  // ---- roof: a bar of spotlights over the cab
  const bar = -(nose - 0.78)
  body.beam([-0.98, roof + 0.2, bar], [0.98, roof + 0.2, bar], 0.05, 0.05, TRIM)
  for (const side of [1, -1]) {
    body.beam(
      [side * 0.9, roof - 0.04, bar + 0.18],
      [side * 0.9, roof + 0.2, bar],
      0.04,
      0.04,
      TRIM,
    )
  }
  body.box([0, roof + 0.04, 0.7], [0.8, 0.08, 0.8], TRIM)

  // ---- tail: window, plate, and the wing
  body.box([0, 2.0, nose - 0.045], [1.5, 0.62, 0.05], GLASS)
  body.box([0, 0.98, nose + 0.005], [0.46, 0.11, 0.02], PLATE_REAR)
  for (const side of [1, -1]) {
    body.beam(
      [side * 0.8, roof - 0.02, nose - 0.55],
      [side * 0.8, roof + 0.44, nose - 0.2],
      0.07,
      0.12,
      ACCENT,
    )
    body.box([side * (half - 0.03), roof + 0.4, nose - 0.12], [0.05, 0.3, 0.84], ACCENT)
  }
  body.box([0, roof + 0.47, nose - 0.12], [spec.width - 0.1, 0.07, 0.78], ACCENT)

  for (const side of [1, -1]) {
    body.lamp = LAMP.head
    body.box([side * 0.82, 0.98, -nose + 0.03], [0.34, 0.2, 0.1], HEADLAMP)
    for (const x of [0.16, 0.48, 0.8]) {
      body.box([side * x, roof + 0.2, bar - 0.05], [0.2, 0.2, 0.08], HEADLAMP)
    }
    body.lamp = LAMP.tail
    body.box([side * 0.98, 1.16, nose - 0.01], [0.16, 0.66, 0.07], TAIL_LAMP)
  }
  body.lamp = LAMP.none

  return { body: body.geometry(), wheels: fourWheels(spec) }
}

// ---------------------------------------------------------------------------- boda boda

function buildBoda(): VehicleModel {
  const spec = VEHICLES.boda
  const axle = spec.wheelbase / 2
  const r = spec.wheelRadius
  const body = new MeshBuilder()

  // Engine and frame.
  body.box([0, 0.44, -0.04], [0.24, 0.3, 0.46], '#2b2d31')
  body.beam([0, 0.72, -0.44], [0, 0.76, 0.72], 0.08, 0.08, TRIM)
  body.beam([0, 0.7, -0.44], [0, 0.34, -0.2], 0.06, 0.06, TRIM)
  // Tank, the long seat a boda needs, and the carrier behind it.
  body.box([0, 0.83, -0.2], [0.28, 0.2, 0.44], PAINT)
  body.box([0, 0.85, 0.38], [0.3, 0.1, 0.74], SEAT)
  body.box([0, 0.87, 0.88], [0.3, 0.03, 0.26], CHROME)
  // Mudguards.
  body.box([0, r + 0.34, -axle], [0.13, 0.04, 0.46], PAINT)
  body.box([0, r + 0.36, axle + 0.06], [0.13, 0.04, 0.5], PAINT)
  body.box([0, 0.62, axle + 0.36], [0.17, 0.12, 0.015], PLATE_REAR)

  for (const side of [1, -1]) {
    // Front forks, rear shocks and the swing arm.
    body.beam([side * 0.09, r, -axle], [side * 0.09, 1.0, -0.42], 0.045, 0.045, CHROME)
    body.beam([side * 0.11, r, axle], [side * 0.11, 0.74, 0.44], 0.035, 0.035, CHROME)
    body.beam([side * 0.09, r, axle], [side * 0.09, 0.38, 0.04], 0.04, 0.05, TRIM)
    // Mirrors on stalks.
    body.beam([side * 0.26, 1.03, -0.4], [side * 0.31, 1.19, -0.37], 0.02, 0.02, TRIM)
    body.box([side * 0.31, 1.22, -0.37], [0.11, 0.07, 0.02], TRIM)
    // Foot rests.
    body.beam([side * 0.12, 0.33, 0.06], [side * 0.27, 0.33, 0.06], 0.04, 0.03, TRIM)
  }
  body.beam([-0.36, 1.03, -0.4], [0.36, 1.03, -0.4], 0.04, 0.04, TRIM)
  body.box([0, 0.93, -0.49], [0.2, 0.2, 0.12], TRIM)
  // Crash bar: every working boda has one.
  body.beam([-0.3, 0.52, -0.3], [0.3, 0.52, -0.3], 0.03, 0.03, CHROME)
  // Exhaust, down the right-hand side.
  body.beam([0.15, 0.34, -0.02], [0.16, 0.43, 0.86], 0.075, 0.075, CHROME)

  body.lamp = LAMP.head
  body.box([0, 0.93, -0.56], [0.15, 0.15, 0.03], HEADLAMP)
  body.lamp = LAMP.tail
  body.box([0, 0.79, axle + 0.33], [0.11, 0.06, 0.04], TAIL_LAMP)
  body.lamp = LAMP.none

  return {
    body: body.geometry(),
    wheels: [
      { x: 0, forward: axle, steers: true },
      { x: 0, forward: -axle, steers: false },
    ],
  }
}

// ---------------------------------------------------------------------------- wheel

/**
 * One wheel, a metre across and a metre wide, lying on the x axis. Each vehicle scales
 * it to size. The hub is in light and dark wedges so that you can see it turning.
 */
export function buildWheelGeometry(sides = 10): BufferGeometry {
  const m = new MeshBuilder()
  const HUB = 0.62
  const ring = (radius: number, k: number, x: number): [number, number, number] => {
    const angle = (k / sides) * Math.PI * 2
    return [x, Math.cos(angle) * radius, Math.sin(angle) * radius]
  }
  for (let k = 0; k < sides; k++) {
    const mid = ((k + 0.5) / sides) * Math.PI * 2
    m.face(
      [ring(0.5, k, -0.5), ring(0.5, k + 1, -0.5), ring(0.5, k + 1, 0.5), ring(0.5, k, 0.5)],
      [0, Math.cos(mid), Math.sin(mid)],
      TYRE,
    )
    for (const x of [0.5, -0.5]) {
      const out: [number, number, number] = [Math.sign(x), 0, 0]
      m.face(
        [ring(0.5 * HUB, k, x), ring(0.5 * HUB, k + 1, x), ring(0.5, k + 1, x), ring(0.5, k, x)],
        out,
        TYRE,
      )
      m.face(
        [[x, 0, 0], ring(0.5 * HUB, k, x), ring(0.5 * HUB, k + 1, x)],
        out,
        k % 2 ? HUB_LIGHT : HUB_DARK,
      )
    }
  }
  return m.geometry()
}

const builders: Record<VehicleKind, () => VehicleModel> = {
  car: buildCar,
  boda: buildBoda,
  matatu: buildMatatu,
  nganya: buildNganya,
}

export function buildVehicleModel(kind: VehicleKind): VehicleModel {
  return builders[kind]()
}
