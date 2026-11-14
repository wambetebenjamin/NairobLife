/** Compact, fictional scenic previews; these are not geographically accurate playable zones. */
import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BackSide, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, SphereGeometry } from 'three'
import { BufferAttribute, BufferGeometry, Float32BufferAttribute } from 'three'
import { PlaneGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { hash01 } from '../core/random'
import { buildParkTerrain } from './scenic/parkTerrain'

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

function Acacia({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position={[0, 2, 0]}>
        <cylinderGeometry args={[0.12, 0.28, 4, 6]} />
        <meshLambertMaterial color={PARK.trunk} />
      </mesh>
      {/* Acacias are umbrella-shaped: broad, flat and very dark against the straw grass. */}
      <mesh position={[0, 4.1, 0]} scale={[1.18, 0.34, 1]}>
        <sphereGeometry args={[2.5, 12, 7]} />
        <meshLambertMaterial color={PARK.canopyDark} />
      </mesh>
      <mesh position={[0, 4.32, 0.2]} scale={[0.82, 0.26, 0.7]}>
        <sphereGeometry args={[2.5, 10, 6]} />
        <meshLambertMaterial color={PARK.canopyMid} />
      </mesh>
      <mesh position={[-0.5, 4.5, -0.3]} scale={[0.46, 0.18, 0.42]}>
        <sphereGeometry args={[2.5, 8, 5]} />
        <meshLambertMaterial color={PARK.canopyLit} />
      </mesh>
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

/**
 * Colours sampled from photographs of the real park, not invented. The old scene used a flat
 * `#aaa667` for the ground -- an olive-grey that reads as mud rather than dry grass -- a
 * saturated toy-brown ring for the track, and one `#4c7446` green for every tree. The savannah
 * in the reference photographs is a warm straw-yellow (#9c814a to #b79941) against very dark
 * olive canopies (#2f3217 to #404411), and the interest comes almost entirely from the
 * skyline: sixteen towers standing on the horizon with the park in front of them.
 */
const PARK = {
  skyTop: '#3e6b7e',
  skyHorizon: '#7fa3b3',
  cloud: '#c3ccd2',
  cloudShade: '#9aa9b2',
  ridgeFar: '#998666',
  ridgeNear: '#6f7355',
  grassLit: '#a8894a',
  grassMid: '#9c814a',
  grassDry: '#b79941',
  earth: '#8a6f3f',
  trunk: '#6d5a3c',
  canopyDark: '#2f3217',
  canopyMid: '#404411',
  canopyLit: '#4f5219',
  tower: '#7d93a0',
  towerLight: '#b3b8b6',
  towerGlass: '#48697a',
  towerWarm: '#8f8371',
} as const

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
  return (
    <mesh position={[0, 0, z]} scale={[150, height, 26]}>
      <sphereGeometry args={[1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshLambertMaterial color={color} />
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
  const tones = [PARK.tower, PARK.towerLight, PARK.towerGlass]
  return (
    <group name="skyline" position={[0, 0, -62]}>
      {towers.map(([x, h, w, tone], i) => (
        <group key={i} position={[x, 0, 0]}>
          <mesh position={[0, h / 2, 0]}>
            <boxGeometry args={[w, h, w]} />
            <meshLambertMaterial color={tones[tone]} />
          </mesh>
          {/* A darker glazed face so the towers read as buildings rather than blocks. */}
          <mesh position={[0, h / 2, w / 2 + 0.02]}>
            <boxGeometry args={[w * 0.72, h * 0.86, 0.04]} />
            <meshLambertMaterial color={PARK.towerWarm} />
          </mesh>
          {i % 3 === 0 && (
            <mesh position={[0, h + 1.2, 0]}>
              <cylinderGeometry args={[0.08, 0.14, 2.4, 4]} />
              <meshLambertMaterial color={PARK.towerLight} />
            </mesh>
          )}
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
        <Acacia key={i} x={x} z={z} s={s} />
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
        <Acacia key={x} x={x} z={i % 2 ? -14 : 12} s={0.8} />
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
