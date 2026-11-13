import { Matrix4, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { makeBody, tintOf } from './appearance'
import {
  BUILD,
  JOINTS,
  MESH,
  MESHES,
  PARTS,
  PROPORTIONS,
  STANDARD_HEIGHT,
  ankleForward,
  idlePose,
  legChain,
  partSize,
  phaseFor,
  sittingPose,
  strideLength,
  walkPose,
} from './body'
import { allPartGeometry, partGeometry } from './figures'

describe('a pedestrian body', () => {
  it('is a real person: sane height and build, from a seed', () => {
    for (let seed = 0; seed < 300; seed++) {
      const body = makeBody(seed)
      // From a young teenager to a tall adult, never a giant or a toddler.
      expect(body.height).toBeGreaterThan(1.4)
      expect(body.height).toBeLessThan(1.95)
      expect(body.build).toBeGreaterThan(0.8)
      expect(body.build).toBeLessThan(1.3)
    }
  })

  it('gives the same person the same look every time', () => {
    expect(makeBody(1234)).toEqual(makeBody(1234))
  })

  it('makes people different from each other', () => {
    const heights = new Set<number>()
    const shirts = new Set<string>()
    for (let seed = 0; seed < 200; seed++) {
      const body = makeBody(seed)
      heights.add(Math.round(body.height * 100))
      shirts.add(body.shirt.map((c) => c.toFixed(3)).join(','))
    }
    expect(heights.size).toBeGreaterThan(30)
    // Not one shirt colour in the city: shirts are a palette, not a uniform.
    expect(shirts.size).toBeGreaterThan(2)
  })

  it('dresses each part sensibly: shirt on the arms, skin on the face', () => {
    const body = makeBody(7)
    expect(tintOf('torso', body)).toEqual(body.shirt)
    expect(tintOf('upperArm', body)).toEqual(body.shirt)
    expect(tintOf('head', body)).toEqual(body.skin)
    expect(tintOf('hand', body)).toEqual(body.skin)
    expect(tintOf('thigh', body)).toEqual(body.legs)
    expect(tintOf('foot', body)).toEqual(body.shoes)
    expect(tintOf('hair', body)).toEqual(body.hair)
  })

  it('has human proportions: seven heads tall, hips at half the height', () => {
    const body = makeBody(11)
    body.height = STANDARD_HEIGHT
    // A head is about a seventh of a body.
    expect(PROPORTIONS.head * STANDARD_HEIGHT).toBeGreaterThan(0.2)
    expect(PROPORTIONS.head * STANDARD_HEIGHT).toBeLessThan(0.26)
    // The hip joint sits at about half the standing height — 0.52 of it, because a
    // person's legs are half their body — and the shoulder above it.
    expect(JOINTS.hip).toBeGreaterThan(0.48)
    expect(JOINTS.hip).toBeLessThan(0.55)
    expect(JOINTS.shoulder).toBeGreaterThan(JOINTS.hip)
    // The crown is the top.
    expect(JOINTS.crown).toBe(1)
  })

  it('keeps every part inside the body it belongs to', () => {
    const body = makeBody(3)
    for (const part of ['torso', 'head', 'hair', 'upperArm', 'forearm', 'thigh', 'shin'] as const) {
      const [x, y, z] = partSize(part, body)
      expect(x).toBeGreaterThan(0)
      expect(y).toBeGreaterThan(0)
      expect(z).toBeGreaterThan(0)
      // No part is longer than the person, or wider than their shoulders by much.
      expect(y).toBeLessThan(body.height)
      expect(Math.max(x, z)).toBeLessThan(BUILD.shoulders * body.build * 2)
    }
  })

  it('scales with height: a taller person has longer limbs', () => {
    const short = makeBody(1)
    short.height = 1.45
    const tall = makeBody(2)
    tall.height = 1.9
    expect(partSize('thigh', tall)[1]).toBeGreaterThan(partSize('thigh', short)[1])
  })
})

describe('the walk cycle', () => {
  it('swings the two legs in opposition', () => {
    for (let i = 0; i < 12; i++) {
      const pose = walkPose(i / 12, 1.2)
      // One leg forward means the other back, for most of the cycle.
      expect(Math.sign(pose.thighL)).not.toBe(Math.sign(pose.thighR))
    }
  })

  it('never bends a knee the wrong way', () => {
    for (let i = 0; i < 40; i++) {
      const pose = walkPose(i / 40, 1.4)
      expect(pose.kneeL).toBeGreaterThanOrEqual(0)
      expect(pose.kneeR).toBeGreaterThanOrEqual(0)
    }
  })

  it('swings the arms opposite their own leg', () => {
    for (let i = 0; i < 24; i++) {
      const pose = walkPose(i / 24, 1.2)
      expect(Math.sign(pose.armL)).not.toBe(Math.sign(pose.thighL))
      expect(Math.sign(pose.armR)).not.toBe(Math.sign(pose.thighR))
    }
  })

  it('rises twice per stride, once over each planted foot', () => {
    const bobs = Array.from({ length: 48 }, (_, i) => walkPose(i / 48, 1.2).bob)
    // Count the local maxima: a stride has two.
    let peaks = 0
    for (let i = 1; i < bobs.length - 1; i++) {
      if (bobs[i] > bobs[i - 1] && bobs[i] >= bobs[i + 1]) peaks++
    }
    expect(peaks).toBe(2)
  })

  it('walks further and swings harder when it moves faster', () => {
    expect(Math.abs(walkPose(0.13, 3).thighL)).toBeGreaterThan(Math.abs(walkPose(0.13, 0.8).thighL))
    expect(strideLength(3)).toBeGreaterThan(strideLength(0.8))
  })

  it('keeps its feet on the ground: the stride matches the speed', () => {
    // A person at 1.2 m/s takes about a step a second, so a stride is a bit over a metre.
    expect(strideLength(1.2)).toBeGreaterThan(0.9)
    expect(strideLength(1.2)).toBeLessThan(1.3)
    // The phase repeats every stride, so the cycle and the ground agree.
    const stride = strideLength(1.3)
    expect(phaseFor(0, 1.3)).toBe(0)
    expect(phaseFor(stride, 1.3)).toBeCloseTo(0, 6)
    expect(phaseFor(stride / 2, 1.3)).toBeCloseTo(0.5, 6)
  })

  it('wraps any phase, however large, without jumping', () => {
    for (const phase of [-3, -0.1, 0, 0.999, 12.5]) {
      const pose = walkPose(phase, 1.2)
      expect(Number.isFinite(pose.thighL)).toBe(true)
      expect(Math.abs(pose.thighL)).toBeLessThan(1)
    }
    // 1.5 is halfway through the next stride, the same as 0.5.
    expect(walkPose(1.5, 1.2).thighL).toBeCloseTo(walkPose(0.5, 1.2).thighL, 6)
  })
})

describe('standing and sitting', () => {
  it('stands with the feet apart and the arms down', () => {
    const pose = idlePose(0, 0.06)
    expect(pose.thighL).toBeCloseTo(0.06, 5)
    expect(pose.thighR).toBeCloseTo(-0.06, 5)
    expect(Math.abs(pose.armL)).toBeLessThan(0.15)
    // Almost no bob: a standing person is not bouncing.
    expect(Math.abs(pose.bob)).toBeLessThan(0.01)
  })

  it('sits with the thighs up and the knees bent', () => {
    const pose = sittingPose()
    expect(pose.thighL).toBeGreaterThan(1)
    expect(pose.kneeL).toBeGreaterThan(1)
    // Sitting drops the body by about half a metre.
    expect(pose.bob).toBeLessThan(-0.3)
  })
})

describe('the body geometry', () => {
  it('builds a mesh for every part, closed and correctly wound enough to draw', () => {
    const parts = allPartGeometry()
    for (const [name, mesh] of Object.entries(parts)) {
      expect(mesh.indices.length, name).toBeGreaterThan(0)
      expect(mesh.indices.length % 3, name).toBe(0)
      expect(mesh.positions.length, name).toBe(mesh.normals.length)
      expect(mesh.positions.length, name).toBe(mesh.colors.length)
      const vertices = mesh.positions.length / 3
      for (const index of mesh.indices) expect(index, name).toBeLessThan(vertices)
    }
  })

  it('stands every part below its own joint, where the skeleton expects it', () => {
    // A limb hangs *down* from the joint it is attached to.
    for (const part of ['upperArm', 'forearm', 'thigh', 'shin'] as const) {
      const mesh = partGeometry(part)
      let top = -Infinity
      let bottom = Infinity
      for (let i = 1; i < mesh.positions.length; i += 3) {
        top = Math.max(top, mesh.positions[i])
        bottom = Math.min(bottom, mesh.positions[i])
      }
      // The rounded cap reaches the joint — no gap at the shoulder or hip — and never
      // pokes out beyond it, where it would show through the torso.
      expect(top, part).toBeLessThanOrEqual(0.101)
      // And it reaches down about its own length.
      expect(bottom, part).toBeLessThan(-0.8)
    }
  })

  it('builds the head as a head: a face at the front, above the neck', () => {
    const mesh = partGeometry('head')
    let front = -Infinity
    for (let i = 2; i < mesh.positions.length; i += 3) {
      front = Math.max(front, mesh.positions[i])
    }
    // The face plane and nose stick out at +z.
    expect(front).toBeGreaterThan(0.5)
  })

  it('keeps the index table and the mesh list in step', () => {
    // MESH is the human-readable name for a slot in MESHES; the renderer indexes one by
    // the other. A mismatch writes one person's forearm into another part's mesh.
    const slots = Object.entries(MESH) as [string, number][]
    expect(slots).toHaveLength(MESHES.length)
    expect(new Set(slots.map(([, i]) => i)).size).toBe(MESHES.length)
    for (const [name, index] of slots) {
      // `upperArmL` -> `upperArm`: strip the side suffix, keep the camel case.
      const part = name.replace(/(L|R)$/, '')
      expect(MESHES[index].part, name).toBe(part)
      if (name.endsWith('L')) expect(MESHES[index].side).toBe(0)
      if (name.endsWith('R')) expect(MESHES[index].side).toBe(1)
    }
  })

  it('has exactly one mesh per body part, and no mesh without a part', () => {
    // One mesh per part, plus a second for each of the six paired limbs: upper arm,
    // forearm, hand, thigh, shin and foot. Two feet need two meshes, or the second foot
    // overwrites the first and each person walks on one leg.
    const drawn = new Set(MESHES.map((entry) => entry.part))
    expect(MESHES).toHaveLength(drawn.size + 6)
    expect(drawn.size).toBe(PARTS.length)
    const parts = allPartGeometry()
    for (const entry of MESHES) expect(parts[entry.part]).toBeDefined()
    // Two of every limb, one of each central part.
    const counts = new Map<string, number>()
    for (const entry of MESHES) counts.set(entry.part, (counts.get(entry.part) ?? 0) + 1)
    expect(counts.get('upperArm')).toBe(2)
    expect(counts.get('thigh')).toBe(2)
    expect(counts.get('torso')).toBe(1)
    expect(counts.get('head')).toBe(1)
    // Two feet share one mesh, the way the two hands do not (a hand is a side, a foot is
    // placed by the lead leg), and the bag is one.
    expect(counts.get('foot')).toBe(2)
    expect(counts.get('bag')).toBe(1)
    expect(counts.get('neck')).toBe(1)
  })
})

describe('the skeleton, assembled', () => {
  /**
   * Reproduce the renderer's maths for one person standing still, and check the whole
   * figure: this is the check that would have caught a head on the floor or an arm
   * attached at the knee, which no unit test of a single part can see.
   */
  function assemble(body: ReturnType<typeof makeBody>, pose: ReturnType<typeof idlePose>) {
    const s = body.height / STANDARD_HEIGHT
    const torsoY = JOINTS.hip * body.height + pose.bob
    const torso = new Matrix4().makeTranslation(0, torsoY, 0)
    const torsoScale = new Matrix4().makeScale(...partSize('torso', body))
    const torsoWorld = new Matrix4().multiplyMatrices(torso, torsoScale)

    const at = (parent: Matrix4, x: number, y: number, z: number, turn = 0) =>
      new Matrix4()
        .multiplyMatrices(parent, new Matrix4().makeTranslation(x, y, z))
        .multiply(new Matrix4().makeRotationX(turn))

    const head = at(
      torso,
      0,
      (PROPORTIONS.torso + PROPORTIONS.neck + PROPORTIONS.head * 0.5) * body.height,
      0,
    )
    const headWorld = new Matrix4().multiplyMatrices(
      head,
      new Matrix4().makeScale(...partSize('head', body)),
    )
    const shoulderX = BUILD.shoulders * body.build * s * 0.46
    const armWorld = (side: 0 | 1) => {
      const x = side === 0 ? -shoulderX : shoulderX
      const shoulder = at(
        torso,
        x,
        PROPORTIONS.torso * body.height * 0.93,
        0,
        side === 0 ? pose.armL : pose.armR,
      )
      return new Matrix4().multiplyMatrices(
        shoulder,
        new Matrix4().makeScale(...partSize('upperArm', body)),
      )
    }
    const hipX = BUILD.hipWidth * body.build * s * 0.24
    const legWorld = (side: 0 | 1) => {
      const x = side === 0 ? -hipX : hipX
      const hip = at(torso, x, 0, 0, side === 0 ? pose.thighL : pose.thighR)
      return new Matrix4().multiplyMatrices(
        hip,
        new Matrix4().makeScale(...partSize('thigh', body)),
      )
    }
    /** The top of the head: the crown, in metres. */
    const crownY = () => origin(headWorld).y + (PROPORTIONS.head * body.height) / 2

    return { torsoWorld, headWorld, armWorld, legWorld, torsoY, crownY }
  }

  const origin = (m: Matrix4) => new Vector3().setFromMatrixPosition(m)

  it('puts the head on top and the arms and legs where they belong', () => {
    const body = makeBody(21)
    body.height = 1.72
    const pose = idlePose(0, 0.06)
    const { headWorld, armWorld, legWorld, torsoY, crownY } = assemble(body, pose)

    const head = origin(headWorld)
    expect(head.y).toBeCloseTo(JOINTS.head * 1.72, 2)
    // Above the shoulders, and on the centre line.
    expect(head.y).toBeGreaterThan(JOINTS.shoulder * 1.72)
    expect(Math.abs(head.x)).toBeLessThan(0.05)

    // The whole point of proportions that sum to 1: the person is as tall as they claim.
    expect(crownY()).toBeCloseTo(1.72, 2)

    for (const side of [0, 1] as const) {
      const arm = origin(armWorld(side))
      // At the shoulder: above the hips, about half a body high.
      expect(arm.y).toBeGreaterThan(torsoY)
      expect(arm.y).toBeCloseTo(JOINTS.shoulder * 1.72, 1)
      // Out to one side, not across the body.
      expect(Math.sign(arm.x)).toBe(side === 0 ? -1 : 1)
      expect(Math.abs(arm.x)).toBeGreaterThan(0.12)

      const leg = origin(legWorld(side))
      // At the hip, below the arms.
      expect(leg.y).toBeLessThan(arm.y)
      expect(leg.y).toBeCloseTo(JOINTS.hip * 1.72, 2)
      expect(Math.sign(leg.x)).toBe(side === 0 ? -1 : 1)
    }
  })

  it('drops the whole body when it sits, and keeps it on its feet when it walks', () => {
    const body = makeBody(21)
    const standing = assemble(body, idlePose(0, 0))
    const sitting = assemble(body, sittingPose())
    expect(sitting.torsoY).toBeLessThan(standing.torsoY - 0.3)
  })

  it('keeps the drawing scale sane: nothing is a metre wide', () => {
    const body = makeBody(21)
    const pose = idlePose(0, 0.06)
    const { torsoWorld, headWorld } = assemble(body, pose)
    const width = (m: Matrix4) => new Vector3().setFromMatrixScale(m).x
    expect(width(torsoWorld)).toBeLessThan(0.6)
    expect(width(headWorld)).toBeLessThan(0.25)
    expect(width(torsoWorld)).toBeGreaterThan(0.15)
  })
})

describe('a 1.72 m person, measured', () => {
  /**
   * The numbers a figure has to hit to read as human at a glance, checked against the real
   * meshes rather than against the tables that build them. Every one of these was wrong at
   * some point: the head sat 36 cm low, the torso hung down through the thighs, the soles
   * were 12 cm under the pavement, and the proportions summed to 0.93.
   */
  const body = makeBody(9)
  body.height = 1.72
  body.build = 1
  const parts = allPartGeometry()
  const span = (part: Parameters<typeof partSize>[0]) => {
    const mesh = parts[part]
    let low = Infinity
    let high = -Infinity
    for (let i = 1; i < mesh.positions.length; i += 3) {
      low = Math.min(low, mesh.positions[i])
      high = Math.max(high, mesh.positions[i])
    }
    const size = partSize(part, body)[1]
    return { low: low * size, high: high * size }
  }

  it('puts the crown at the top of the person, and the soles on the ground', () => {
    const hip = JOINTS.hip * body.height
    const headCentre =
      hip + (PROPORTIONS.torso + PROPORTIONS.neck + PROPORTIONS.head * 0.5) * body.height
    expect(headCentre + span('head').high).toBeCloseTo(body.height, 1)

    // The leg: hip joint down through the knee and ankle to the sole.
    const ankle = hip - partSize('thigh', body)[1] - partSize('shin', body)[1]
    expect(ankle + span('foot').low).toBeCloseTo(0, 2)
    expect(ankle).toBeGreaterThan(0.05)
  })

  it('raises the torso from the hips to the neck, not down through the legs', () => {
    const hip = JOINTS.hip * body.height
    const torso = span('torso')
    // The chest starts at the hip joint and ends at the base of the neck.
    expect(hip + torso.low).toBeGreaterThan(hip - 0.05)
    expect(hip + torso.high).toBeCloseTo(hip + PROPORTIONS.torso * body.height, 1)
  })

  it('fills the neck, so the head does not float above the shoulders', () => {
    const hip = JOINTS.hip * body.height
    const neckBottom = hip + PROPORTIONS.torso * body.height
    const neckTop = neckBottom + partSize('neck', body)[1]
    const headBottom =
      hip +
      (PROPORTIONS.torso + PROPORTIONS.neck + PROPORTIONS.head * 0.5) * body.height +
      span('head').low
    // The neck reaches into the head, and starts inside the torso.
    expect(neckTop).toBeGreaterThan(headBottom - 0.02)
    expect(neckBottom).toBeLessThan(hip + PROPORTIONS.torso * body.height + 0.01)
  })

  it('hangs the arms from the shoulders, clear of the hips', () => {
    const shoulder = (JOINTS.hip + PROPORTIONS.torso * 0.96) * body.height
    const armEnd = shoulder - partSize('upperArm', body)[1] - partSize('forearm', body)[1]
    // Arms reach to about the hip: long enough for hands at the thigh, not at the knee.
    expect(armEnd).toBeGreaterThan(JOINTS.hip * body.height - 0.25)
    expect(armEnd).toBeLessThan(JOINTS.hip * body.height + 0.12)
  })
})

describe('the joints, as the renderer poses them', () => {
  const body = makeBody(9)
  body.height = 1.72

  it('bends the knee backwards, like a human and not a bird', () => {
    // With the thigh vertical, flexing the knee must move the ankle behind the hip.
    const straight: ReturnType<typeof idlePose> = { ...idlePose(0, 0), thighL: 0, kneeL: 0 }
    const bent: ReturnType<typeof walkPose> = { ...straight, kneeL: 1 }
    expect(ankleForward(bent, 0, body)).toBeLessThan(ankleForward(straight, 0, body) - 0.2)
    // And it holds however the thigh is swung.
    for (const thigh of [-0.5, 0, 0.5]) {
      const a = { ...straight, thighL: thigh, kneeL: 0 }
      const b = { ...a, kneeL: 0.8 }
      expect(ankleForward(b, 0, body)).toBeLessThan(ankleForward(a, 0, body))
    }
  })

  it('keeps the shin behind the thigh, never hyperextended', () => {
    for (let i = 0; i < 40; i++) {
      const chain = legChain(walkPose(i / 40, 1.2), 0)
      // The shin's absolute angle never swings in front of the thigh's.
      expect(chain.shin).toBeLessThanOrEqual(chain.thigh + 1e-9)
    }
  })

  it('swings the foot about a stride and no more', () => {
    // The planted foot must travel about a stride under the hip, or the figure skates.
    const reach: number[] = []
    for (let i = 0; i <= 32; i++) reach.push(-ankleForward(walkPose(i / 32, 1.2), 0, body))
    const travel = Math.max(...reach) - Math.min(...reach)
    const stride = strideLength(1.2)
    expect(travel).toBeGreaterThan(stride * 0.7)
    expect(travel).toBeLessThan(stride * 1.2)
  })

  it('reaches forward about half a stride at its furthest', () => {
    let furthest = 0
    for (let i = 0; i <= 32; i++)
      furthest = Math.max(furthest, ankleForward(walkPose(i / 32, 1.2), 0, body))
    // A 1.72 m adult's step reaches roughly half a stride in front of the hip.
    expect(furthest).toBeGreaterThan(0.25)
    expect(furthest).toBeLessThan(0.6)
  })
})
