/**
 * The player character: a low-poly figure built from boxes and animated with a little
 * trigonometry. No model file, no skeleton, no animation clips, so it costs nothing to
 * download, and every pose below is a few lines you can read and tweak.
 *
 * The figure faces -Z (north at yaw 0). For a limb hanging down from its joint, a
 * positive rotation about X swings it forwards.
 *
 * TODO(art): swap for a rigged glTF character (with walk/run/idle clips) when the game
 * has an art pass; keep this one as the instant-loading fallback.
 * TODO(customisation): outfits and skin tones chosen from the menu.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  CircleGeometry,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Group,
  type Mesh,
} from 'three'
import { PLAYER } from '../config/game'
import { clamp, damp, lerp } from '../core/math'
import { useGame, useQuality } from '../state/gameStore'
import { runtime } from '../state/runtime'
import { CROUCH_DROP } from './rig'

const HIP_HEIGHT = 0.9
const THIGH = 0.42

const COLOURS = {
  skin: '#6b4226',
  hair: '#17110d',
  // A Harambee Stars-red hoodie over dark jeans and white trainers.
  top: '#c62828',
  trim: '#f2f2f2',
  legs: '#22303f',
  shoes: '#eeeeee',
  sole: '#2a2a2a',
}

export function PlayerModel() {
  const quality = useQuality()
  const firstPerson = useGame((state) => state.settings.cameraMode === 'first')

  const root = useRef<Group>(null)
  const hips = useRef<Group>(null)
  const torso = useRef<Group>(null)
  const head = useRef<Group>(null)
  const armL = useRef<Group>(null)
  const armR = useRef<Group>(null)
  const foreL = useRef<Group>(null)
  const foreR = useRef<Group>(null)
  const legL = useRef<Group>(null)
  const legR = useRef<Group>(null)
  const shinL = useRef<Group>(null)
  const shinR = useRef<Group>(null)
  const blob = useRef<Mesh>(null)

  const assets = useMemo(() => {
    const box = new BoxGeometry(1, 1, 1)
    const disc = new CircleGeometry(0.42, 20)
    disc.rotateX(-Math.PI / 2)
    const material = (colour: string) => new MeshLambertMaterial({ color: colour })
    return {
      box,
      disc,
      skin: material(COLOURS.skin),
      hair: material(COLOURS.hair),
      top: material(COLOURS.top),
      trim: material(COLOURS.trim),
      legs: material(COLOURS.legs),
      shoes: material(COLOURS.shoes),
      sole: material(COLOURS.sole),
      blob: new MeshBasicMaterial({
        color: '#000000',
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
    }
  }, [])

  useEffect(
    () => () => {
      for (const asset of Object.values(assets)) asset.dispose()
    },
    [assets],
  )

  // In first person the body must not block the view, but it should still cast a shadow:
  // skip drawing its colour and depth, and the shadow pass carries on regardless.
  useEffect(() => {
    for (const m of [
      assets.skin,
      assets.hair,
      assets.top,
      assets.trim,
      assets.legs,
      assets.shoes,
      assets.sole,
    ]) {
      m.colorWrite = !firstPerson
      m.depthWrite = !firstPerson
    }
  }, [assets, firstPerson])

  /** Animation state, smoothed between frames. */
  const anim = useRef({ phase: 0, crouch: 0, air: 0, move: 0, run: 0, time: 0 }).current

  useFrame((_, delta) => {
    const p = runtime.player
    const dt = Math.min(delta, 0.05)
    if (!root.current || !hips.current || !torso.current) return

    root.current.rotation.y = p.yaw
    // Hide the figure when the third-person camera is squeezed right up against it.
    root.current.visible = firstPerson || runtime.cameraGap > 0.75

    anim.time += dt
    anim.crouch = damp(anim.crouch, p.crouching ? 1 : 0, 14, dt)
    anim.air = damp(anim.air, p.grounded ? 0 : 1, p.grounded ? 16 : 9, dt)
    anim.move = damp(anim.move, clamp(p.speed / PLAYER.jogSpeed, 0, 1), 12, dt)
    anim.run = damp(
      anim.run,
      clamp((p.speed - PLAYER.jogSpeed) / (PLAYER.sprintSpeed - PLAYER.jogSpeed), 0, 1),
      8,
      dt,
    )
    const { crouch, air, move, run } = anim

    // Stride rate follows speed: about 0.9 strides a second walking, 2.1 sprinting.
    if (p.grounded && p.speed > 0.2) anim.phase += dt * Math.PI * 2 * (0.55 + 0.18 * p.speed)
    const phase = anim.phase
    const sin = Math.sin(phase)
    const cos = Math.cos(phase)

    // ---- legs: thighs swing opposite each other; a knee bends while its leg comes forward
    const swing = (0.5 + 0.38 * run) * move * (1 - 0.45 * crouch)
    const kneeLift = (1.0 + 0.6 * run) * move
    let thighL = swing * sin
    let thighR = -swing * sin
    let kneeL = -(0.12 * move + kneeLift * Math.max(0, cos))
    let kneeR = -(0.12 * move + kneeLift * Math.max(0, -cos))

    // ---- crouch: sit into the legs
    thighL += 1.0 * crouch
    thighR += 1.0 * crouch
    kneeL -= 1.9 * crouch
    kneeR -= 1.9 * crouch

    // ---- in the air: one knee up, like a hurdler
    thighL = lerp(thighL, 0.75, air)
    thighR = lerp(thighR, -0.25, air)
    kneeL = lerp(kneeL, -1.1, air)
    kneeR = lerp(kneeR, -0.5, air)

    legL.current!.rotation.x = thighL
    legR.current!.rotation.x = thighR
    shinL.current!.rotation.x = kneeL
    shinR.current!.rotation.x = kneeR

    // ---- hips: bounce twice per stride, drop when crouching
    const bounce = Math.abs(cos) * 0.035 * move
    const breathe = Math.sin(anim.time * 1.7) * 0.004 * (1 - move)
    hips.current.position.y =
      HIP_HEIGHT - CROUCH_DROP * crouch - THIGH * 0.04 * move + bounce + breathe

    // ---- torso: lean into a run, fold in a crouch, twist against the legs
    torso.current.rotation.x = -(0.05 * move + 0.2 * run + 0.5 * crouch) + 0.1 * air
    torso.current.rotation.y = -0.12 * sin * move
    head.current!.rotation.x = 0.04 * move + 0.14 * run + 0.38 * crouch - 0.1 * air

    // ---- arms: swing opposite the legs with bent elbows; thrown up when falling
    const armSwing = (0.45 + 0.55 * run) * move
    const falling = clamp(-p.verticalSpeed / 14, 0, 1) * air
    const reach = 0.25 * crouch
    armL.current!.rotation.x = lerp(-armSwing * sin + reach, -0.5, air)
    armR.current!.rotation.x = lerp(armSwing * sin + reach, 0.9, air)
    armL.current!.rotation.z = -(0.06 + 0.35 * air + 1.5 * falling)
    armR.current!.rotation.z = 0.06 + 0.35 * air + 1.5 * falling
    const elbow = 0.18 + 0.45 * move + 0.75 * run + 0.5 * crouch
    foreL.current!.rotation.x = elbow + 0.25 * armSwing * Math.max(0, -sin)
    foreR.current!.rotation.x = elbow + 0.25 * armSwing * Math.max(0, sin)

    if (blob.current) blob.current.visible = p.grounded
  })

  const { box } = assets
  return (
    <group ref={root}>
      <group ref={hips} position-y={HIP_HEIGHT}>
        <mesh
          geometry={box}
          material={assets.legs}
          position={[0, 0.02, 0]}
          scale={[0.34, 0.18, 0.2]}
          castShadow
        />

        <group ref={torso}>
          <mesh
            geometry={box}
            material={assets.top}
            position={[0, 0.34, 0]}
            scale={[0.42, 0.5, 0.23]}
            castShadow
          />
          {/* hood, bunched at the back of the neck */}
          <mesh
            geometry={box}
            material={assets.top}
            position={[0, 0.6, 0.1]}
            scale={[0.3, 0.14, 0.12]}
            castShadow
          />
          {/* a stripe across the chest */}
          <mesh
            geometry={box}
            material={assets.trim}
            position={[0, 0.42, -0.005]}
            scale={[0.425, 0.05, 0.235]}
          />

          <group ref={head} position={[0, 0.62, 0]}>
            <mesh
              geometry={box}
              material={assets.skin}
              position={[0, 0.03, 0]}
              scale={[0.1, 0.08, 0.1]}
            />
            <mesh
              geometry={box}
              material={assets.skin}
              position={[0, 0.17, -0.01]}
              scale={[0.22, 0.24, 0.23]}
              castShadow
            />
            <mesh
              geometry={box}
              material={assets.hair}
              position={[0, 0.27, 0.005]}
              scale={[0.235, 0.09, 0.25]}
              castShadow
            />
          </group>

          {[-1, 1].map((side) => (
            <group key={side} ref={side < 0 ? armL : armR} position={[side * 0.265, 0.53, 0]}>
              <mesh
                geometry={box}
                material={assets.top}
                position={[0, -0.14, 0]}
                scale={[0.11, 0.32, 0.12]}
                castShadow
              />
              <group ref={side < 0 ? foreL : foreR} position={[0, -0.29, 0]}>
                <mesh
                  geometry={box}
                  material={assets.top}
                  position={[0, -0.12, 0]}
                  scale={[0.1, 0.26, 0.105]}
                  castShadow
                />
                <mesh
                  geometry={box}
                  material={assets.skin}
                  position={[0, -0.29, 0]}
                  scale={[0.085, 0.1, 0.09]}
                />
              </group>
            </group>
          ))}
        </group>

        {[-1, 1].map((side) => (
          <group key={side} ref={side < 0 ? legL : legR} position={[side * 0.1, 0, 0]}>
            <mesh
              geometry={box}
              material={assets.legs}
              position={[0, -THIGH / 2, 0]}
              scale={[0.155, THIGH + 0.04, 0.17]}
              castShadow
            />
            <group ref={side < 0 ? shinL : shinR} position={[0, -THIGH, 0]}>
              <mesh
                geometry={box}
                material={assets.legs}
                position={[0, -0.2, 0]}
                scale={[0.13, 0.42, 0.145]}
                castShadow
              />
              <mesh
                geometry={box}
                material={assets.shoes}
                position={[0, -0.425, -0.045]}
                scale={[0.14, 0.075, 0.28]}
                castShadow
              />
              <mesh
                geometry={box}
                material={assets.sole}
                position={[0, -0.468, -0.045]}
                scale={[0.145, 0.025, 0.285]}
              />
            </group>
          </group>
        ))}
      </group>

      {/* With shadow maps off, a soft blob under the feet still pins the figure to the ground. */}
      {quality === 'low' && (
        <mesh
          ref={blob}
          geometry={assets.disc}
          material={assets.blob}
          position-y={0.04}
          renderOrder={3}
        />
      )}
    </group>
  )
}
