/**
 * People.
 *
 * The pedestrians were six stacked boxes. A person is not six boxes: it is a tapered
 * torso, a head with a face plane, shoulders, arms with elbows, legs with knees, and feet
 * that strike the ground at different times. This file builds that figure as a small
 * skeleton of parts, and `Pedestrians.tsx` poses it every frame.
 *
 * The design has three constraints, in order:
 *
 *  1. **Instanced.** Every pedestrian in the city is drawn with a fixed number of draw
 *     calls, so the figure has to be a fixed set of parts, each in its own instanced mesh.
 *  2. **Proportions from life.** A 1.72 m adult: head about a seventh of the height,
 *     shoulders about a quarter of the height wide, hips just below half. The figures are
 *     scaled per person below, so you get children, tall men and everyone in between.
 *  3. **Articulated.** Hip, knee and shoulder joints, so the walk cycle is a real one:
 *     knees bend, arms swing opposite the legs, and the body rises and falls on each step.
 *
 * Everything here is plain numbers: no three.js, no React. That means the reach of a
 * swinging foot, the fact that a knee never bends forwards, and the fact that both feet
 * are not on the ground at once can all be checked in a test. The real numbers are wrong
 * for a real body only if these tests say so.
 */

/** The parts of a pedestrian, in the order they are drawn. */
export const PARTS = [
  'torso',
  'neck',
  'head',
  'hair',
  'upperArm',
  'forearm',
  'hand',
  'thigh',
  'shin',
  'foot',
  'bag',
] as const
export type PartName = (typeof PARTS)[number]

/**
 * The fourteen instanced meshes, each with the body part it draws and which side of the
 * body it belongs to. One list, in draw order, so the renderer can index it by number.
 */
export const MESHES = [
  { part: 'torso', side: -1 },
  { part: 'neck', side: -1 },
  { part: 'head', side: -1 },
  { part: 'hair', side: -1 },
  { part: 'upperArm', side: 0 },
  { part: 'upperArm', side: 1 },
  { part: 'forearm', side: 0 },
  { part: 'forearm', side: 1 },
  { part: 'hand', side: 0 },
  { part: 'hand', side: 1 },
  { part: 'thigh', side: 0 },
  { part: 'thigh', side: 1 },
  { part: 'shin', side: 0 },
  { part: 'shin', side: 1 },
  { part: 'foot', side: 0 },
  { part: 'foot', side: 1 },
  { part: 'bag', side: -1 },
] as const satisfies readonly { part: PartName; side: number }[]

/** Index of each mesh in MESHES, by name, so the renderer can say what it means. */
export const MESH = {
  torso: 0,
  neck: 1,
  head: 2,
  hair: 3,
  upperArmL: 4,
  upperArmR: 5,
  forearmL: 6,
  forearmR: 7,
  handL: 8,
  handR: 9,
  thighL: 10,
  thighR: 11,
  shinL: 12,
  shinR: 13,
  footL: 14,
  footR: 15,
  bag: 16,
} as const

/** How tall a reference adult is, in metres. Every proportion below is a share of this. */
export const STANDARD_HEIGHT = 1.72

/**
 * Body proportions, as shares of standing height, measured from a real adult: 1.72 m with
 * the shoulder at 1.42 m, the hip at 0.90 and the knee at 0.48. They add up to exactly 1,
 * so a person of a given height is actually drawn that tall — the first version summed to
 * 0.93 and every pedestrian came out 7% short, which is the sort of thing you notice in a
 * street full of people without being able to say what is wrong.
 */
export const PROPORTIONS = {
  /** Chin to crown: seven and a half heads tall, which is what people actually are. */
  head: 0.134,
  /** Shoulder to chin. */
  neck: 0.04,
  /** Hip joint to shoulder. */
  torso: 0.303,
  /** Hip joint to the knee. */
  thigh: 0.245,
  /**
   * Knee to the ankle. In step with the shin's *drawn* length, which is this share scaled
   * by height, so the knee and ankle joints stay inside the leg they belong to.
   */
  shin: 0.211,
  /** Ankle to the sole: the shoe. Without this the whole figure sinks into the ground. */
  ankle: 0.067,
  /** The foot's length, heel to toe. Length, not height. */
  foot: 0.15,
} as const

/** Radii and widths at the reference height, in metres. */
export const BUILD = {
  /** Shoulder-to-shoulder, including the arms. */
  shoulders: 0.44,
  /** The head, across the cheekbones, and front to back. */
  headWidth: 0.155,
  headDepth: 0.196,
  /** The torso is an ellipse: deeper side to side than front to back. */
  chestDepth: 0.22,
  waistWidth: 0.32,
  hipWidth: 0.34,
  hipDepth: 0.2,
  /** Upper arm and forearm diameters. */
  upperArm: 0.1,
  forearm: 0.085,
  thigh: 0.16,
  shin: 0.12,
  /** Thickness of the foot, and of the hand. */
  footHeight: 0.07,
  hand: 0.09,
} as const

/** Joint heights above the sole, as shares of standing height. */
const LEG = PROPORTIONS.ankle + PROPORTIONS.shin + PROPORTIONS.thigh
export const JOINTS = {
  /** The ankle, where the shin turns into the shoe. */
  ankle: PROPORTIONS.ankle,
  knee: PROPORTIONS.ankle + PROPORTIONS.shin,
  hip: LEG,
  waist: LEG + PROPORTIONS.torso * 0.55,
  /** The arm hangs from just below the top of the torso, where the deltoid is. */
  shoulder: LEG + PROPORTIONS.torso * 0.96,
  /** The base of the neck. */
  neck: LEG + PROPORTIONS.torso,
  /** The *centre* of the head, which is where its geometry is built. */
  head: LEG + PROPORTIONS.torso + PROPORTIONS.neck + PROPORTIONS.head * 0.5,
  /** The top of the skull. */
  crown: LEG + PROPORTIONS.torso + PROPORTIONS.neck + PROPORTIONS.head,
} as const

/**
 * One pedestrian's body: a height, a build, and the proportions that follow from them.
 * Seeded per person, so the same person looks the same every time you walk past.
 */
export interface Body {
  /** Standing height in metres, 1.4 (a young teenager) to 1.95. */
  height: number
  /** Multiplier on width: 0.85 slight .. 1.25 broad. */
  build: number
  /** How the person stands: heels together, feet apart, one hip dropped. */
  stance: number
  /** Which foot is in front when standing still. */
  leadingFoot: 0 | 1
  /** Shirt, trousers/skirt, shoes, skin and hair, as linear RGB. */
  shirt: [number, number, number]
  legs: [number, number, number]
  shoes: [number, number, number]
  skin: [number, number, number]
  hair: [number, number, number]
  /** 0 short, 1 cropped, 2 headwrap, 3 bald. */
  hairstyle: number
  /** Whether the person carries a bag, 0 or 1. */
  bag: number
  /** The bag's colour, when they have one. */
  bagColour: [number, number, number]
  /** 0 or 1: whether the hair is drawn. Some people are bald, or wear a close crop. */
  hasHair: number
}

/**
 * The size of one part's mesh, in metres: width (x), height (y), depth (z).
 *
 * Every part's *geometry* is a unit shape, so this is the only thing that scales it. That
 * matters: the first version built the torso's geometry at 0.29 of its own height and then
 * scaled that by the torso's height, squaring the proportion, and every pedestrian came
 * out with a torso 17 cm tall. Keep the geometry unit-sized and this function honest.
 */
export function partSize(part: PartName, body: Body): [number, number, number] {
  const s = body.height / STANDARD_HEIGHT
  const w = body.build
  switch (part) {
    case 'torso':
      return [BUILD.waistWidth * w * s, PROPORTIONS.torso * body.height, BUILD.chestDepth * w * s]
    case 'neck':
      // The neck fills the gap between the base of the neck and the chin, so a head does
      // not float above the shoulders.
      return [
        BUILD.headWidth * 0.52 * w * s,
        PROPORTIONS.neck * body.height,
        BUILD.headDepth * 0.52 * w * s,
      ]
    case 'head':
      return [BUILD.headWidth * w * s, PROPORTIONS.head * body.height, BUILD.headDepth * w * s]
    case 'hair':
      return [
        BUILD.headWidth * 1.04 * w * s,
        PROPORTIONS.head * 0.45 * body.height,
        BUILD.headDepth * 1.04 * w * s,
      ]
    case 'upperArm':
      return [BUILD.upperArm * w * s, PROPORTIONS.torso * 0.6 * body.height, BUILD.upperArm * w * s]
    case 'forearm':
      return [BUILD.forearm * w * s, PROPORTIONS.torso * 0.5 * body.height, BUILD.forearm * w * s]
    case 'hand':
      return [BUILD.hand * 0.62 * s, BUILD.hand * 1.05 * s, BUILD.hand * 0.45 * s]
    case 'thigh':
      return [BUILD.thigh * w * s, PROPORTIONS.thigh * body.height, BUILD.thigh * w * s]
    case 'shin':
      return [BUILD.shin * w * s, PROPORTIONS.shin * body.height, BUILD.shin * w * s]
    case 'foot':
      // Scaled by the ankle height, so the sole of the shoe rests exactly on y = 0.
      return [BUILD.shin * w * s, PROPORTIONS.ankle * body.height, PROPORTIONS.foot * body.height]
    case 'bag':
      return [0.26 * w * s, 0.3 * s, 0.14 * s]
  }
}

/** Where a part hangs from its joint, at rest, in metres above the sole. */
export function jointHeight(part: PartName, body: Body): number {
  const s = body.height / STANDARD_HEIGHT
  switch (part) {
    case 'torso':
      return PROPORTIONS.shin * body.height + PROPORTIONS.thigh * body.height
    case 'neck':
      return JOINTS.neck * s
    case 'head':
      return JOINTS.head * s
    case 'hair':
      return (JOINTS.head + PROPORTIONS.head * 0.42) * s
    case 'upperArm':
      return JOINTS.shoulder * s
    case 'forearm':
      return (JOINTS.shoulder - PROPORTIONS.torso * 0.62) * s
    case 'hand':
      return (JOINTS.shoulder - PROPORTIONS.torso * 1.12) * s
    case 'thigh':
      return JOINTS.hip * s
    case 'shin':
      return JOINTS.knee * s
    case 'foot':
      return 0
    case 'bag':
      return JOINTS.neck * s
  }
}

/** Whether the sleeve covers the forearm: shirts have sleeves, vests do not. */
export function sleeve(body: Body): boolean {
  // One person in six wears a vest or a sleeveless top.
  return body.build > 0.88
}

/**
 * The walk cycle's numbers, at a given phase in [0, 1).
 *
 * A gait is two half-cycles, one per step. What matters is that the two legs are half a
 * cycle apart, that the knees only ever bend backwards, and that the body rises twice per
 * stride (once over each planted leg).
 */
export interface WalkPose {
  /** Thigh swing, radians. Positive is forward. */
  thighL: number
  thighR: number
  /** Knee bend, radians. Positive is a bent knee, and it is never negative. */
  kneeL: number
  kneeR: number
  /** Arm swing at the shoulder, radians, opposite the leg on the same side. */
  armL: number
  armR: number
  /** Elbow bend, radians. */
  elbowL: number
  elbowR: number
  /** How far the body has risen this instant, in metres. */
  bob: number
  /** How much the shoulders have twisted against the hips, radians. */
  twist: number
}

const TAU = Math.PI * 2

/** A smooth pulse in [0, 1]: 0 at both ends, 1 in the middle. */
function pulse(t: number): number {
  return Math.sin(Math.PI * Math.max(0, Math.min(1, t))) ** 2
}

/**
 * The pose of a walking person at `phase`, in [0, 1). `speed` in m/s changes how far the
 * limbs swing: a stroll is short and lazy, a dash is long and high.
 */
export function walkPose(phase: number, speed = 1.2): WalkPose {
  const p = ((phase % 1) + 1) % 1
  const swing = Math.min(0.72, 0.3 + speed * 0.22)
  const left = Math.sin(p * TAU)
  const right = Math.sin(p * TAU + Math.PI)

  // A knee bends only as its leg comes through, and most on the swing-forward half.
  const kneeOf = (t: number) => {
    const s = Math.sin(t * TAU)
    const bend = Math.max(0, s) * 0.9 + Math.max(0, -s) * 0.12
    return bend * (0.55 + Math.min(1, speed / 2) * 0.5)
  }

  return {
    thighL: left * swing,
    thighR: right * swing,
    kneeL: kneeOf(p + 0.25),
    kneeR: kneeOf(p + 0.75),
    // Arms swing opposite their own side's leg.
    armL: -left * swing * 0.8,
    armR: -right * swing * 0.8,
    elbowL: 0.25 + Math.max(0, -left) * 0.45,
    elbowR: 0.25 + Math.max(0, -right) * 0.45,
    // Two rises per stride, over each planted leg.
    bob: (pulse((((p * 2) % 1) + 1) % 1) - 0.5) * 0.035 * (0.6 + speed * 0.3),
    twist: left * 0.12,
  }
}

/** The pose of someone standing still: feet apart, arms by the side, a slight sway. */
export function idlePose(seconds: number, stance: number): WalkPose {
  const sway = Math.sin(seconds * 0.7) * 0.02
  return {
    thighL: stance,
    thighR: -stance,
    kneeL: 0.06 + Math.abs(sway),
    kneeR: 0.06 + Math.abs(sway),
    armL: 0.05 + sway,
    armR: 0.05 - sway,
    elbowL: 0.18,
    elbowR: 0.18,
    bob: Math.sin(seconds * 1.3) * 0.004,
    twist: sway * 2,
  }
}

/** A person who is sitting: used at the bus stages and on the matatu benches. */
export function sittingPose(): WalkPose {
  return {
    thighL: 1.45,
    thighR: 1.45,
    kneeL: 1.5,
    kneeR: 1.5,
    armL: 0.2,
    armR: 0.2,
    elbowL: 0.5,
    elbowR: 0.5,
    bob: -0.42,
    twist: 0,
  }
}

/**
 * The stride length for a speed, in metres. A walk is about 0.75 m a step and a run about
 * 1.6 m; this is the number the animation uses to keep the feet from skating.
 */
export function strideLength(speed: number): number {
  return 0.55 + speed * 0.42
}

/**
 * How far along its path a person should be, given a speed, so the feet keep up with the
 * ground. Without this, fast walkers moonwalk: the legs cycle at one rate and the body
 * moves at another.
 */
export function phaseFor(distance: number, speed: number): number {
  return (distance / strideLength(speed)) % 1
}

/**
 * The absolute angle of each bone in one leg, in radians, positive swinging forward.
 *
 * This is the joint arithmetic the renderer applies, kept here so it can be checked: a
 * knee bends *backwards*, so while the thigh swings forward the shin's absolute angle is
 * thigh minus knee. Applied with the knee the same way round as the thigh, every
 * pedestrian walks like a bird, which is exactly what the first version did.
 */
export function legChain(
  gait: WalkPose,
  side: 0 | 1,
): {
  thigh: number
  shin: number
  foot: number
} {
  const thigh = side === 0 ? gait.thighL : gait.thighR
  const knee = side === 0 ? gait.kneeL : gait.kneeR
  return { thigh, shin: thigh - knee, foot: 0 }
}

/**
 * How far forward of the hip joint the ankle is, in metres, for a leg posed by
 * `legChain`. Used to check that the planted foot does not skate and that a flexing knee
 * moves the heel backwards.
 */
export function ankleForward(gait: WalkPose, side: 0 | 1, body: Body): number {
  const chain = legChain(gait, side)
  const thigh = partSize('thigh', body)[1]
  const shin = partSize('shin', body)[1]
  return thigh * Math.sin(chain.thigh) + shin * Math.sin(chain.shin)
}
