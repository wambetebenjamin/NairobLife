/**
 * Ambient pedestrians: real little people, instanced.
 *
 * Fourteen instanced meshes draw the whole crowd — a torso, a head, hair, and two each of
 * upper arm, forearm, hand, thigh, shin and foot. Each person is posed every frame from
 * `body.ts`: knees bend only backwards, arms swing opposite their own leg, the body rises
 * over each planted foot, and the walk cycle is timed to the ground so nobody moonwalks.
 *
 * Each person's body is their own: height, build, skin, hair, shirt and shoes all come
 * from their seed, so the same person looks the same every time you walk past.
 *
 * The skeleton is a chain of matrices: the root is the person, standing on the pavement
 * facing along their path; the torso hangs off it at the hips; the head, arms and legs
 * hang off the torso. A joint's local matrix is a rotation and a translation, and the
 * part it carries is that joint scaled to the part's size.
 *
 * They are visual only. There is no AI, no collision and no reaction to the player, and
 * the roadmap says so.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
} from 'three'
import { useGame, useQuality } from '../../state/gameStore'
import type { LoadedZone } from '../zone/loadZone'
import {
  BUILD,
  JOINTS,
  MESH,
  MESHES,
  PROPORTIONS,
  STANDARD_HEIGHT,
  idlePose,
  partSize,
  strideLength,
  walkPose,
  type Body,
  type PartName,
  type WalkPose,
} from './body'
import { allPartGeometry, type PartMesh } from './figures'
import { makeBody, tintOf } from './appearance'
import { pedestrianPose, planPedestrians } from './paths'

const RANGES = { high: 180, medium: 140, low: 100 }

/** A BufferGeometry from one part's plain arrays. */
function toGeometry(mesh: PartMesh): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3))
  geometry.setAttribute('color', new BufferAttribute(mesh.colors, 3))
  geometry.setIndex(new BufferAttribute(mesh.indices, 1))
  geometry.computeBoundingSphere()
  return geometry
}

/**
 * A joint in a person's skeleton.
 *
 * `at` is where the joint sits in its parent's space, in metres; `turn` is the rotation
 * about x (for a limb, positive swings it forward); `part` is what the joint draws, sized
 * from the body. A joint with no part is a pivot only.
 */
interface Joint {
  at: [number, number, number]
  turn?: number
  tilt?: number
  part?: PartName
  mesh?: number
  children?: Joint[]
}

/**
 * The skeleton, with the mesh index each joint writes to. Built once per person because
 * the offsets depend on their own proportions.
 */
function skeleton(body: Body, gait: WalkPose, s: number): Joint[] {
  const torsoY = JOINTS.hip * body.height + gait.bob
  const shoulderX = BUILD.shoulders * body.build * s * 0.46
  const hipX = BUILD.hipWidth * body.build * s * 0.24
  const arm = (side: 0 | 1): Joint => ({
    at: [side === 0 ? -shoulderX : shoulderX, PROPORTIONS.torso * body.height * 0.93, 0],
    turn: side === 0 ? gait.armL : gait.armR,
    tilt: side === 0 ? -0.05 : 0.05,
    part: 'upperArm',
    mesh: side === 0 ? MESH.upperArmL : MESH.upperArmR,
    children: [
      {
        at: [0, -partSize('upperArm', body)[1], 0],
        turn: side === 0 ? gait.elbowL : gait.elbowR,
        part: 'forearm',
        mesh: side === 0 ? MESH.forearmL : MESH.forearmR,
        children: [
          {
            at: [0, -partSize('forearm', body)[1], 0],
            part: 'hand',
            mesh: side === 0 ? MESH.handL : MESH.handR,
          },
        ],
      },
    ],
  })

  const leg = (side: 0 | 1): Joint => {
    const thighAngle = side === 0 ? gait.thighL : gait.thighR
    const knee = side === 0 ? gait.kneeL : gait.kneeR
    return {
      at: [side === 0 ? -hipX : hipX, 0, 0],
      turn: thighAngle,
      part: 'thigh',
      mesh: side === 0 ? MESH.thighL : MESH.thighR,
      children: [
        {
          at: [0, -partSize('thigh', body)[1], 0],
          // A knee flexes *backwards*: the heel rises towards the buttock, so the bend is
          // the opposite sign to the thigh's forward swing. Get this wrong and every
          // pedestrian walks like a bird.
          turn: -knee,
          part: 'shin',
          mesh: side === 0 ? MESH.shinL : MESH.shinR,
          children: [
            {
              // The ankle is at the bottom of the shin, not the ground: the shoe hangs
              // below it, so a person's soles are on the pavement and not through it.
              at: [0, -partSize('shin', body)[1], 0],
              // The foot stays flat as the leg swings: it cancels the thigh and knee.
              turn: -thighAngle + knee,
              part: 'foot',
              // One mesh per foot: sharing one draws a single leg, because the second
              // foot overwrites the first in the same instance slot.
              mesh: side === 0 ? MESH.footL : MESH.footR,
            },
          ],
        },
      ],
    }
  }

  return [
    // The hips: a pivot, and the torso that hangs from it.
    {
      at: [0, torsoY, 0],
      turn: gait.twist,
      part: 'torso',
      mesh: MESH.torso,
      children: [
        {
          // The neck sits at the top of the torso, and the head on top of the neck.
          at: [0, PROPORTIONS.torso * body.height, 0],
          part: 'neck',
          mesh: MESH.neck,
        },
        {
          at: [0, (PROPORTIONS.torso + PROPORTIONS.neck + PROPORTIONS.head * 0.5) * body.height, 0],
          part: 'head',
          mesh: MESH.head,
          children: [
            ...(body.hasHair
              ? [
                  {
                    // The hair caps the crown: its centre sits half a hair-height below
                    // the top of the skull.
                    at: [
                      0,
                      (partSize('head', body)[1] - partSize('hair', body)[1]) * 0.5,
                      -0.01 * partSize('head', body)[1],
                    ] as [number, number, number],
                    part: 'hair' as PartName,
                    mesh: MESH.hair,
                  },
                ]
              : []),
          ],
        },
        arm(0),
        arm(1),
        leg(0),
        leg(1),
        ...(body.bag
          ? [
              {
                // A satchel on the back, hung off one shoulder.
                at: [-0.1 * s, PROPORTIONS.torso * body.height * 0.6, -0.1 * s] as [
                  number,
                  number,
                  number,
                ],
                part: 'bag' as PartName,
                mesh: MESH.bag,
              },
            ]
          : []),
      ],
    },
  ]
}

// Scratch objects, reused every frame so posing a crowd allocates nothing.
const scratch = new Matrix4()
const UP = new Vector3(0, 1, 0)
const ONE = new Vector3(1, 1, 1)
const QUATERNION = new Quaternion()
const AT = new Matrix4()
const TURN = new Matrix4()
const TILT = new Matrix4()
const SCALED = new Matrix4()
const POSITION = new Vector3()
const COLOUR = new Color()

/**
 * A pool of matrices, so posing eighteen joints for three hundred people every frame does
 * not allocate. The depth of the skeleton is small and the same every time, so a flat pool
 * with a cursor is enough.
 */
const POOL = Array.from({ length: 64 }, () => new Matrix4())
let cursor = 0
function nextMatrix(): Matrix4 {
  const matrix = POOL[cursor++]
  if (cursor === POOL.length) cursor = 0
  return matrix
}
/** A matrix to hand to an InstancedMesh: two per person are live at once. */
const DRAW = Array.from({ length: 512 }, () => new Matrix4())
let drawCursor = 0
function drawMatrix(): Matrix4 {
  const matrix = DRAW[drawCursor++ % DRAW.length]
  return matrix
}
const TINTS = new Map<PartName, [number, number, number]>()

export function Pedestrians({
  zone,
  start,
  exclusion,
}: {
  zone: LoadedZone
  start: { x: number; z: number; yaw?: number }
  exclusion?: { x: number; z: number } | null
}) {
  const quality = useQuality()
  const paths = useMemo(
    () =>
      planPedestrians(zone.file, zone.index, zone.geometry.trees, start).filter(
        (p) =>
          !exclusion ||
          Math.hypot((p.ax + p.bx) / 2 - exclusion.x, (p.az + p.bz) / 2 - exclusion.z) > 14,
      ),
    [zone, start, exclusion],
  )
  const bodies = useMemo(() => paths.map((path) => makeBody(path.seed)), [paths])
  const refs = useRef<(InstancedMesh | null)[]>([])
  const elapsed = useRef(0)
  /** Per person: how far they have walked, so the gait keeps up with the ground. */
  const tread = useRef(new Float32Array(paths.length))

  useEffect(() => {
    tread.current = new Float32Array(paths.length)
  }, [paths])

  const assets = useMemo(() => {
    const parts = allPartGeometry()
    return {
      geometries: Object.fromEntries(
        Object.entries(parts).map(([name, mesh]) => [name, toGeometry(mesh)]),
      ) as Record<PartName, BufferGeometry>,
      material: new MeshLambertMaterial({ vertexColors: true }),
    }
  }, [])

  useEffect(
    () => () => {
      for (const geometry of Object.values(assets.geometries)) geometry.dispose()
      assets.material.dispose()
    },
    [assets],
  )

  /**
   * A person's colours never change, so each one is written once rather than every frame.
   * It is a measurable saving: writing an instance colour for all the meshes and 300
   * people costs about 0.27 ms a frame, and the matrix is the only thing that moves.
   *
   * Per *person*, not per frame: people outside the view distance are skipped, so a frame
   * that painted everyone it happened to draw would leave the rest unpainted until the
   * player walked up to them.
   */
  const painted = useRef(new Uint8Array(0))
  useEffect(() => {
    painted.current = new Uint8Array(paths.length)
  }, [paths])

  useFrame(({ camera }, delta) => {
    if (useGame.getState().phase === 'playing') elapsed.current += Math.min(delta, 0.05)
    const meshes = refs.current
    if (meshes.length !== MESHES.length || meshes.some((mesh) => !mesh)) return

    const range = RANGES[quality] ** 2
    let count = 0

    for (let i = 0; i < paths.length; i++) {
      const path = paths[i]
      const body = bodies[i]
      const pose = pedestrianPose(path, elapsed.current)
      if ((pose.x - camera.position.x) ** 2 + (pose.z - camera.position.z) ** 2 > range) continue

      const step = Math.min(delta, 0.05)
      tread.current[i] += path.speed * step
      const gait = pose.walking
        ? walkPose(tread.current[i] / strideLength(path.speed), path.speed)
        : idlePose(elapsed.current + path.seed * 3.1, body.stance)

      // The root: the person, on the ground, facing along their path.
      scratch.compose(
        POSITION.set(pose.x, 0, pose.z),
        QUATERNION.setFromAxisAngle(UP, pose.yaw),
        ONE,
      )

      const s = body.height / STANDARD_HEIGHT
      TINTS.clear()
      cursor = 0
      drawCursor = 0
      const paint = painted.current[i] === 0
      if (paint) painted.current[i] = 1
      const joints = skeleton(body, gait, s)
      poseJoints(joints, scratch, meshes, count, body, paint)
      count++
    }

    for (const mesh of meshes) {
      if (!mesh) continue
      mesh.count = count
      mesh.instanceMatrix.needsUpdate = true
    }
  })

  if (!paths.length) return null
  return (
    <group name="pedestrians">
      {MESHES.map((entry, i) => (
        <instancedMesh
          key={`${entry.part}-${entry.side}`}
          ref={(mesh) => {
            refs.current[i] = mesh
          }}
          args={[assets.geometries[entry.part], assets.material, paths.length]}
          frustumCulled={false}
          castShadow
        />
      ))}
    </group>
  )
}

/**
 * Walk the skeleton, writing each part's world matrix and tint into its instanced mesh.
 * `parent` is the joint's parent's matrix; each joint is a rotation about x and a
 * translation, and the part it draws is that joint scaled by the part's size.
 */
function poseJoints(
  joints: readonly Joint[],
  parent: Matrix4,
  meshes: readonly (InstancedMesh | null)[],
  index: number,
  body: Body,
  paint: boolean,
): void {
  for (const joint of joints) {
    const local = nextMatrix().multiplyMatrices(parent, AT.makeTranslation(...joint.at))
    local.multiply(TURN.makeRotationX(joint.turn ?? 0))
    if (joint.tilt) local.multiply(TILT.makeRotationZ(joint.tilt))

    if (joint.part && joint.mesh !== undefined) {
      const size = partSize(joint.part, body)
      const scaled = drawMatrix().multiplyMatrices(
        local,
        SCALED.makeScale(size[0], size[1], size[2]),
      )
      const mesh = meshes[joint.mesh]
      if (mesh) {
        mesh.setMatrixAt(index, scaled)
        if (paint) {
          const tint = tintOf(joint.part, body)
          mesh.setColorAt(index, COLOUR.setRGB(tint[0], tint[1], tint[2]))
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
        }
      }
    }
    if (joint.children) poseJoints(joint.children, local, meshes, index, body, paint)
  }
}
