/** Compact, fictional scenic previews; these are not geographically accurate playable zones. */
import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BackSide, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, SphereGeometry } from 'three'
import { BufferAttribute, BufferGeometry, Float32BufferAttribute } from 'three'
import { PlaneGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { hash01 } from '../core/random'
import { buildParkTerrain } from './scenic/parkTerrain'
import { hazeAt, hazed } from './scenic/haze'
import { PARK, SKYLINE_HAZE, SKYLINE_Z, VEIL_BANDS } from './scenic/parkPalette'

export type ScenicKind = 'park' | 'sgr'

export function ScenicPreview({
  kind,
  onClose,
  onChange,
}: {
  kind: ScenicKind
  onClose: () => void
  onChange: (kind: ScenicKind) => void
}) {
  return (
    <div
      className="scenic"
      role="dialog"
      aria-modal="true"
      aria-label={kind === 'park' ? 'Nairobi National Park scenic preview' : 'SGR scenic preview'}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          onClose()
        } else if (e.key === 'Tab') {
          const buttons = [
            ...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
          ]
          const first = buttons[0],
            last = buttons[buttons.length - 1]
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault()
            last?.focus()
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault()
            first?.focus()
          }
        }
      }}
    >
      <header className="scenic__header">
        <div>
          <span className="scenic__eyebrow">kaNAIRO · SCENIC PREVIEW</span>
          <h2>{kind === 'park' ? 'Nairobi National Park' : 'SGR · Madaraka Express'}</h2>
        </div>
        <button className="button" onClick={onClose} autoFocus>
          Back to map
        </button>
      </header>
      <p className="scenic__note">
        A stylised, looping 3D illustration of{' '}
        {kind === 'park'
          ? 'the park: straw grassland, acacia stands, game and the city skyline behind them'
          : 'the railway'}{' '}
        — colours sampled from photographs, but not a mapped route, real-time service or playable
        destination.
      </p>
      <div
        className="scenic__view"
        aria-label={
          kind === 'park'
            ? 'Animated savannah scene with wildlife and safari vehicle'
            : 'Animated train and railway landscape'
        }
      >
        <Canvas
          camera={{ position: [0, 9.5, 34], fov: 42, near: 0.1, far: 600 }}
          dpr={[1, 1.25]}
          gl={{ antialias: true }}
        >
          <color attach="background" args={[kind === 'park' ? PARK.skyHorizon : '#badbe2']} />
          {/* Daylight, not a studio. Ambient plus sun was multiplying the palette by up to
              3.4x, which washed the straw-coloured grassland out to near-white sand and made
              the whole diorama look bleached. Real shade is about a third of full sun. */}
          <hemisphereLight args={['#cfe0e6', '#7a6234', 0.85]} />
          <directionalLight position={[26, 40, 18]} intensity={1.15} color="#fff3dd" />
          <TourCamera kind={kind} />
          {kind === 'park' ? <Park /> : <Rail />}
        </Canvas>
      </div>
      <nav className="scenic__nav" aria-label="Scenic previews">
        <button
          className={`button${kind === 'park' ? ' button--primary' : ''}`}
          aria-pressed={kind === 'park'}
          onClick={() => onChange('park')}
        >
          National Park
        </button>
        <button
          className={`button${kind === 'sgr' ? ' button--primary' : ''}`}
          aria-pressed={kind === 'sgr'}
          onClick={() => onChange('sgr')}
        >
          SGR train
        </button>
      </nav>
    </div>
  )
}

function TourCamera({ kind }: { kind: ScenicKind }) {
  useFrame(({ camera, clock }) => {
    const t = clock.elapsedTime * 0.11
    // Low and slow, near the animals' eye level, so the skyline sits on the horizon.
    //
    // An arc rather than a full circle. Orbiting all the way round spends half the loop
    // looking away from the skyline with an empty foreground, and at a side view the animals
    // leave the frame entirely -- which is easy to miss without a browser to look at.
    const az = Math.PI / 2 + Math.sin(t) * 0.85
    if (kind === 'park') camera.position.set(Math.cos(az) * 34, 9.5, Math.sin(az) * 34)
    else camera.position.set(19 + Math.sin(t) * 3, 9, 19 + Math.cos(t) * 3)
    camera.lookAt(0, kind === 'park' ? 7.5 : 2, kind === 'park' ? -70 : 0)
  })
  return null
}

/**
 * A real umbrella thorn. The first version was three squashed spheres, which is why it read
 * as a round lollipop. An acacia is a flat, spreading, *faceted* crown on a forked trunk: the
 * silhouette is the whole point, so this builds a fan of angled leaf plates around a fork.
 */
function Acacia({ x, z, s = 1, seed = 1 }: { x: number; z: number; s?: number; seed?: number }) {
  const crown = useMemo(() => {
    const plates: { p: [number, number, number]; r: [number, number, number]; c: string }[] = []
    const tones = [PARK.canopyDark, PARK.canopyMid, PARK.canopyLit]
    // A wide, shallow fan rather than a ball: acacias are flatter than they are deep.
    for (let i = 0; i < 11; i++) {
      const a = hash01(seed, 70 + i) * Math.PI * 2
      const reach = Math.sqrt(hash01(seed, 80 + i)) * 2.9
      const lift = 4.3 - reach * 0.22 + hash01(seed, 90 + i) * 0.32
      plates.push({
        p: [Math.cos(a) * reach, lift, Math.sin(a) * reach],
        r: [0.85 + hash01(seed, 100 + i) * 0.7, 0.16, 0.85 + hash01(seed, 110 + i) * 0.7],
        c: tones[i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 2],
      })
    }
    // A low shoulder of foliage under the fan, so it is not a paper disc.
    for (let i = 0; i < 4; i++) {
      const a = hash01(seed, 120 + i) * Math.PI * 2
      plates.push({
        p: [Math.cos(a) * 1.1, 3.55 + hash01(seed, 130 + i) * 0.4, Math.sin(a) * 1.1],
        r: [1.0, 0.42, 1.0],
        c: PARK.canopyDark,
      })
    }
    return plates
  }, [seed])
  return (
    <group position={[x, 0, z]} scale={s}>
      {/* A forked trunk: acacias split low and spread. */}
      <mesh position={[0, 1.9, 0]} rotation={[0, 0, 0.06]}>
        <cylinderGeometry args={[0.1, 0.26, 3.8, 5]} />
        <meshLambertMaterial color={PARK.trunk} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.55, 3.5, 0]} rotation={[0, 0, side * -0.62]}>
          <cylinderGeometry args={[0.06, 0.13, 1.7, 4]} />
          <meshLambertMaterial color={PARK.trunk} />
        </mesh>
      ))}
      {crown.map((b, i) => (
        <mesh key={i} position={b.p} scale={b.r}>
          {/* Icosahedron, not sphere: faceted crowns read as foliage, smooth ones as plastic. */}
          <icosahedronGeometry args={[1, 0]} />
          <meshLambertMaterial color={b.c} flatShading />
        </mesh>
      ))}
    </group>
  )
}

function Giraffe({ x, z, turn = 0 }: { x: number; z: number; turn?: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, turn, 0]}>
      <mesh position={[0, 2.05, 0]}>
        <boxGeometry args={[0.9, 1, 1.8]} />
        <meshLambertMaterial color="#c79554" />
      </mesh>
      {[-0.3, 0.3].flatMap((dx) =>
        [-0.65, 0.65].map((dz) => (
          <mesh key={`${dx},${dz}`} position={[dx, 0.86, dz]}>
            <boxGeometry args={[0.17, 1.8, 0.18]} />
            <meshLambertMaterial color="#9b754c" />
          </mesh>
        )),
      )}
      <mesh position={[0, 3.45, -0.65]} rotation={[-0.12, 0, 0]}>
        <boxGeometry args={[0.34, 2.5, 0.34]} />
        <meshLambertMaterial color="#c79554" />
      </mesh>
      <mesh position={[0, 4.7, -0.87]}>
        <boxGeometry args={[0.38, 0.43, 0.75]} />
        <meshLambertMaterial color="#c79554" />
      </mesh>
      {[-0.15, 0.15].map((x) => (
        <mesh key={x} position={[x, 5, -0.65]}>
          <boxGeometry args={[0.07, 0.25, 0.07]} />
          <meshLambertMaterial color="#664936" />
        </mesh>
      ))}
    </group>
  )
}

function Zebra({ x, z, turn = 0 }: { x: number; z: number; turn?: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, turn, 0]}>
      <mesh position={[0, 1.15, 0]}>
        <boxGeometry args={[0.65, 0.65, 1.55]} />
        <meshLambertMaterial color="#f1efe4" />
      </mesh>
      {[-0.48, -0.22, 0.04, 0.3, 0.55].map((z) => (
        <mesh key={z} position={[0, 1.15, z]}>
          <boxGeometry args={[0.67, 0.67, 0.09]} />
          <meshLambertMaterial color="#292929" />
        </mesh>
      ))}
      {[-0.22, 0.22].flatMap((dx) =>
        [-0.55, 0.55].map((dz) => (
          <mesh key={`${dx},${dz}`} position={[dx, 0.42, dz]}>
            <boxGeometry args={[0.11, 0.85, 0.12]} />
            <meshLambertMaterial color="#33302e" />
          </mesh>
        )),
      )}
      <mesh position={[0, 1.65, -0.68]} rotation={[-0.35, 0, 0]}>
        <boxGeometry args={[0.35, 1, 0.35]} />
        <meshLambertMaterial color="#edeadf" />
      </mesh>
      <mesh position={[0, 2, -0.94]}>
        <boxGeometry args={[0.34, 0.3, 0.6]} />
        <meshLambertMaterial color="#edeadf" />
      </mesh>
    </group>
  )
}

/** Deterministic positions, so the diorama is the same every time it is opened. */
const TUFTS = Array.from({ length: 620 }, (_, i) => {
  const a = hash01(i, 11) * Math.PI * 2
  // Square-root radial spacing keeps the density even instead of clumping at the centre.
  const r = 14 + Math.sqrt(hash01(i, 12)) * 58
  return {
    x: Math.cos(a) * r,
    z: Math.sin(a) * r,
    h: 0.5 + hash01(i, 13) * 0.75,
    w: 0.34 + hash01(i, 14) * 0.5,
    tone: hash01(i, 15),
  }
})

const ROCKS = Array.from({ length: 9 }, (_, i) => {
  const a = hash01(i, 21) * Math.PI * 2
  const r = 26 + hash01(i, 22) * 42
  return { x: Math.cos(a) * r, z: Math.sin(a) * r, s: 0.5 + hash01(i, 23) * 1.1 }
})

const TREES: [number, number, number][] = [
  [15, 5, 1.0],
  [-16, 2, 1.25],
  [12, -17, 0.9],
  [-10, -18, 1.15],
  [-23, -11, 1.35],
  [21, 18, 1.05],
  [0, 21, 1.2],
  [-31, 14, 0.85],
  [30, -8, 1.3],
  [8, 30, 0.95],
]

function Terrain() {
  // A cone with its apex pulled up makes the gentle swell the real park sits on, so the
  // skyline does not sit on a dead-flat plane.
  const terrain = useMemo(() => buildParkTerrain(), [])
  return <primitive object={terrain} />
}

function SkyDome() {
  // A gradient sphere rather than one flat colour: the reference photographs have a deep
  // blue overhead fading almost to white at the horizon, and that gradient is most of what
  // makes the skyline read as distant.
  const sky = useMemo(() => {
    const geometry = new SphereGeometry(160, 24, 16)
    const position = geometry.getAttribute('position') as BufferAttribute
    const colors: number[] = []
    const top = new Color(PARK.skyTop)
    const horizon = new Color(PARK.skyHorizon)
    const mixed = new Color()
    for (let i = 0; i < position.count; i++) {
      // y runs -160..160; only the upper half of the sphere is ever seen.
      const t = Math.min(1, Math.max(0, position.getY(i) / 160))
      mixed.copy(horizon).lerp(top, Math.pow(t, 0.55))
      colors.push(mixed.r, mixed.g, mixed.b)
    }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
    return new Mesh(
      geometry,
      new MeshBasicMaterial({ vertexColors: true, side: BackSide, depthWrite: false }),
    )
  }, [])
  return (
    <>
      <primitive object={sky} />
      {/* Two cloud banks, drifting slowly, as a single flat layer rather than a shader. */}
      {[
        { y: 34, z: -70, x: -30, w: 46, h: 7, tone: PARK.cloud },
        { y: 40, z: -96, x: 34, w: 58, h: 9, tone: PARK.cloudShade },
        { y: 30, z: -48, x: 8, w: 34, h: 5, tone: PARK.cloud },
      ].map((c, i) => (
        <mesh key={i} position={[c.x, c.y, c.z]} scale={[c.w, c.h, 1]}>
          <sphereGeometry args={[1, 16, 10]} />
          <meshLambertMaterial color={c.tone} transparent opacity={0.85} />
        </mesh>
      ))}
    </>
  )
}

/**
 * A distant hill line. This has to be wide and *low*: the first version used a hemisphere of
 * radius 110, which also made it 110 tall and swallowed the skyline completely.
 */
function Ridge({ z, color, height }: { z: number; color: string; height: number }) {
  // Unlit on purpose. A Lambert ridge picks up the sun AFTER its colour has been hazed, so it
  // came out brighter than the sky behind it and read as a pale dune rather than a treeline.
  // In giraffe-skyline-haze.jpg the distant vegetation is a silhouette: luminance 0.56 against
  // 0.67 for the sky above it. The colour here is already the finished, haze-washed colour.
  return (
    <mesh position={[0, 0, z]} scale={[150, height, 26]}>
      <sphereGeometry args={[1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshBasicMaterial color={hazed(color, hazeAt(Math.abs(z), height / 2))} />
    </mesh>
  )
}

/**
 * The skyline is the whole point: the real park is famous for game grazing with the city
 * standing immediately behind them. Twelve identical grey boxes were not that.
 */
function Skyline() {
  const towers: [number, number, number, number][] = [
    // x, height, width, colour index
    [-30, 15, 3.4, 0],
    [-26, 9, 2.6, 2],
    [-23, 19, 3.0, 1],
    [-19, 11, 2.4, 0],
    [-16, 23, 3.2, 2],
    [-12, 13, 2.6, 1],
    [-9, 17, 2.8, 0],
    [-6, 26, 3.0, 2],
    [-2, 12, 2.4, 1],
    [1, 21, 3.4, 0],
    [4, 15, 2.6, 2],
    [7, 29, 3.2, 1],
    [11, 18, 2.8, 0],
    [14, 10, 2.4, 2],
    [17, 22, 3.0, 1],
    [21, 14, 2.6, 0],
    [24, 19, 3.2, 2],
    [28, 11, 2.4, 1],
    [31, 16, 2.8, 0],
  ]
  // The skyline is 62 m back, so every one of its colours is washed toward the horizon haze.
  // Measured from the reference this is what puts the towers at ~1.18x the straw's luminance
  // instead of below it. See src/ui/scenic/haze.ts.
  const tones = [PARK.tower, PARK.towerLight, PARK.towerGlass].map((c) => hazed(c, SKYLINE_HAZE))
  const warm = hazed(PARK.towerWarm, SKYLINE_HAZE)
  const mast = hazed(PARK.towerLight, SKYLINE_HAZE)
  return (
    <group name="skyline" position={[0, 0, -SKYLINE_Z]}>
      {towers.map(([x, h, w, tone], i) => (
        <group key={i} position={[x, 0, 0]}>
          <mesh position={[0, h / 2, 0]}>
            <boxGeometry args={[w, h, w]} />
            <meshLambertMaterial color={tones[tone]} />
          </mesh>
          {/* A slightly warmer glazed face so the towers read as buildings rather than blocks.
              It is hazed too: a pane of glass 62 m away is as washed out as the wall beside it. */}
          <mesh position={[0, h / 2, w / 2 + 0.02]}>
            <boxGeometry args={[w * 0.72, h * 0.86, 0.04]} />
            <meshLambertMaterial color={warm} />
          </mesh>
          {i % 3 === 0 && (
            <mesh position={[0, h + 1.2, 0]}>
              <cylinderGeometry args={[0.08, 0.14, 2.4, 4]} />
              <meshLambertMaterial color={mast} />
            </mesh>
          )}
          {/* The veil: stacked translucent bands, densest at the base. Air is denser near the
              ground, so a tower's base dissolves while its crown stays legible -- that vertical
              falloff is most of what makes a skyline read as distant. three's Fog cannot do
              this, it is distance-only, and a smooth per-vertex ramp cannot be verified here
              because SVGRenderer flattens vertex colours to one tone per face. Bands are
              coarse but they are real, and the render harness can show them. */}
          {VEIL_BANDS.map((t, b) => (
            <mesh
              key={`veil-${b}`}
              position={[0, h * (t + 0.5 / VEIL_BANDS.length), 0]}
              renderOrder={1}
              raycast={() => null}
            >
              <boxGeometry args={[w * 1.04, h / VEIL_BANDS.length, w * 1.04]} />
              <meshBasicMaterial
                color={PARK.skyHorizon}
                transparent
                opacity={0.14 + 0.5 * (1 - t) * (1 - t)}
                depthWrite={false}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

function GrassTufts() {
  const geometry = useMemo(() => {
    // Three crossed blades per tuft, one draw call for all of them.
    const blades: BufferGeometry[] = []
    for (let b = 0; b < 3; b++) {
      const g = new PlaneGeometry(1, 1)
      g.rotateY((b / 3) * Math.PI)
      g.translate(0, 0.5, 0)
      blades.push(g)
    }
    return mergeGeometries(blades)
  }, [])
  return (
    <group name="tufts">
      {TUFTS.map((t, i) => (
        <mesh key={i} geometry={geometry} position={[t.x, 0, t.z]} scale={[t.w, t.h, t.w]}>
          <meshLambertMaterial
            color={t.tone > 0.6 ? PARK.grassDry : PARK.grassLit}
            side={DoubleSide}
          />
        </mesh>
      ))}
    </group>
  )
}

function Park() {
  const van = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (van.current) {
      const t = clock.elapsedTime * 0.15
      van.current.position.set(Math.cos(t) * 10, 0, Math.sin(t) * 10)
      van.current.rotation.y = -t
    }
  })
  return (
    <group name="park-preview">
      <SkyDome />
      <Terrain />
      <Ridge z={-118} color={PARK.ridgeFar} height={13} />
      <Ridge z={-104} color={PARK.ridgeNear} height={7} />
      <Skyline />
      <GrassTufts />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[8.4, 11.6, 64]} />
        <meshLambertMaterial color={PARK.earth} />
      </mesh>
      {TREES.map(([x, z, s], i) => (
        <Acacia key={i} x={x} z={z} s={s} seed={i + 1} />
      ))}
      {ROCKS.map((r, i) => (
        <mesh key={i} position={[r.x, r.s * 0.22, r.z]} scale={[r.s * 1.5, r.s * 0.5, r.s]}>
          <dodecahedronGeometry args={[1, 0]} />
          <meshLambertMaterial color={PARK.earth} />
        </mesh>
      ))}
      <Giraffe x={-4} z={-4} turn={-0.5} />
      <Giraffe x={-6} z={-6} turn={-0.2} />
      <Zebra x={4} z={3} turn={0.7} />
      <Zebra x={6} z={5} turn={1} />
      <Zebra x={3} z={5} turn={0.4} />
      <group ref={van} name="safari-vehicle">
        <mesh position={[0, 0.8, 0]}>
          <boxGeometry args={[1.8, 1.25, 3.2]} />
          <meshLambertMaterial color="#ede3bf" />
        </mesh>
        <mesh position={[0, 1.6, 0.2]}>
          <boxGeometry args={[1.75, 0.35, 2]} />
          <meshLambertMaterial color="#e0d3ac" />
        </mesh>
        {[-0.85, 0.85].flatMap((x) =>
          [-1, 1].map((z) => (
            <mesh key={`${x},${z}`} position={[x, 0.4, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.4, 0.4, 0.22, 10]} />
              <meshLambertMaterial color="#272927" />
            </mesh>
          )),
        )}
      </group>
    </group>
  )
}

function Rail() {
  const train = useRef<Group>(null)
  const sleepers = useMemo(() => Array.from({ length: 41 }, (_, i) => i - 20), [])
  useFrame(({ clock }) => {
    if (train.current) train.current.position.x = Math.sin(clock.elapsedTime * 0.12) * 8
  })
  return (
    <group name="sgr-preview">
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[180, 180]} />
        <meshLambertMaterial color="#a5a473" />
      </mesh>
      <mesh position={[0, 0.08, 0]}>
        <boxGeometry args={[90, 0.15, 4]} />
        <meshLambertMaterial color="#858079" />
      </mesh>
      {[-0.8, 0.8].map((z) => (
        <mesh key={z} position={[0, 0.25, z]}>
          <boxGeometry args={[90, 0.12, 0.12]} />
          <meshLambertMaterial color="#c3c8c5" />
        </mesh>
      ))}
      {sleepers.map((i) => (
        <mesh key={i} position={[i * 2, 0.17, 0]}>
          <boxGeometry args={[0.24, 0.12, 2.6]} />
          <meshLambertMaterial color="#5f5b56" />
        </mesh>
      ))}
      <group ref={train} name="sgr-train">
        {[-8, 0, 8].map((x, i) => (
          <group key={x} position={[x, 0, 0]}>
            <mesh position={[0, 1.65, 0]}>
              <boxGeometry args={[7.5, 2.3, 2.5]} />
              <meshLambertMaterial color={i === 0 ? '#d84235' : '#e8e8de'} />
            </mesh>
            <mesh position={[0, 1.15, 1.26]}>
              <boxGeometry args={[7.4, 0.35, 0.03]} />
              <meshLambertMaterial color="#c63332" />
            </mesh>
            <mesh position={[0, 2, 1.27]}>
              <boxGeometry args={[6.9, 0.58, 0.04]} />
              <meshLambertMaterial color="#28516b" />
            </mesh>
            {[-2.3, 2.3].map((x) => (
              <mesh key={x} position={[x, 0.47, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.42, 0.42, 2.65, 10]} />
                <meshLambertMaterial color="#292c2c" />
              </mesh>
            ))}
          </group>
        ))}
      </group>
      {[-25, -15, 15, 27].map((x, i) => (
        <Acacia key={x} x={x} z={i % 2 ? -14 : 12} s={0.8} seed={i + 21} />
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} position={[-34 + i * 9, 2 + (i % 3), -32]}>
          <boxGeometry args={[6, 4 + (i % 3) * 2, 5]} />
          <meshLambertMaterial color="#c8bba1" />
        </mesh>
      ))}
    </group>
  )
}
