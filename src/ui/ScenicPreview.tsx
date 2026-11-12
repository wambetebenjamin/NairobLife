/** Guided fictional scenic journeys; these are not geographically accurate playable zones. */
import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState, type RefObject } from 'react'
import { Group } from 'three'
import { advanceScenicTime, SCENIC_DURATION, scenicPose, type ScenicKind } from './scenicMotion'

export function ScenicPreview({
  kind,
  onClose,
  onChange,
}: {
  kind: ScenicKind
  onClose: () => void
  onChange: (kind: ScenicKind) => void
}) {
  const [paused, setPaused] = useState(false)
  const [overview, setOverview] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const time = useRef(0)
  const finished = elapsed >= SCENIC_DURATION[kind]
  const restart = () => {
    time.current = 0
    setElapsed(0)
    setPaused(false)
  }
  const change = (next: ScenicKind) => {
    restart()
    onChange(next)
  }
  return (
    <div
      className="scenic"
      role="dialog"
      aria-modal="true"
      aria-label={kind === 'park' ? 'Nairobi National Park scenic tour' : 'SGR scenic tour'}
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
          <span className="scenic__eyebrow">kaNAIRO · FICTIONAL SCENIC TOUR</span>
          <h2>{kind === 'park' ? 'Nairobi National Park' : 'SGR · Madaraka Express'}</h2>
        </div>
        <button className="button" onClick={onClose} autoFocus>
          Back to map
        </button>
      </header>
      <p className="scenic__note">
        A short guided 3D journey inspired by{' '}
        {kind === 'park' ? 'the park and its wildlife' : 'the railway'}. This stylised scene is not
        a mapped route, real-time service or walkable destination.
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
          camera={{ position: [19, 10, 20], fov: 45, near: 0.1, far: 400 }}
          dpr={[1, 1.25]}
          gl={{ antialias: true }}
        >
          <color attach="background" args={[kind === 'park' ? '#b9d6df' : '#badbe2']} />
          <ambientLight intensity={1.4} />
          <directionalLight position={[20, 35, 12]} intensity={2} />
          <TourScene
            kind={kind}
            time={time}
            paused={paused}
            overview={overview}
            onProgress={setElapsed}
          />
        </Canvas>
      </div>
      <div className="scenic__progress" aria-live="off">
        <span>
          {finished ? 'Journey complete' : paused ? 'Paused' : 'On tour'} ·{' '}
          {Math.min(Math.floor(elapsed), SCENIC_DURATION[kind])} / {SCENIC_DURATION[kind]} sec
        </span>
        <progress
          aria-label="Journey progress"
          value={Math.min(elapsed, SCENIC_DURATION[kind])}
          max={SCENIC_DURATION[kind]}
        />
      </div>
      <nav className="scenic__nav" aria-label="Scenic tour controls">
        <button className="button" disabled={finished} onClick={() => setPaused(!paused)}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button className="button" onClick={restart}>
          Restart
        </button>
        <button className="button" onClick={() => setOverview(!overview)}>
          {overview ? 'Follow view' : 'Overview'}
        </button>
        <button
          className={`button${kind === 'park' ? ' button--primary' : ''}`}
          aria-pressed={kind === 'park'}
          onClick={() => change('park')}
        >
          National Park
        </button>
        <button
          className={`button${kind === 'sgr' ? ' button--primary' : ''}`}
          aria-pressed={kind === 'sgr'}
          onClick={() => change('sgr')}
        >
          SGR train
        </button>
      </nav>
    </div>
  )
}

function TourScene({
  kind,
  time,
  paused,
  overview,
  onProgress,
}: {
  kind: ScenicKind
  time: RefObject<number>
  paused: boolean
  overview: boolean
  onProgress: (time: number) => void
}) {
  const vehicle = useRef<Group>(null)
  const lastUpdate = useRef(-1)
  useFrame(({ camera }, delta) => {
    time.current = advanceScenicTime(kind, time.current, delta, paused)
    const pose = scenicPose(kind, time.current)
    if (vehicle.current) {
      vehicle.current.position.set(pose.x, 0, pose.z)
      vehicle.current.rotation.y = pose.yaw
    }
    if (kind === 'park') {
      if (overview) {
        camera.position.set(25, 18, 25)
        camera.lookAt(0, 0, 0)
      } else {
        camera.position.set(pose.x - pose.dx * 6, 4, pose.z - pose.dz * 6)
        camera.lookAt(pose.x * 0.75 + pose.dx * 3, 1.7, pose.z * 0.75 + pose.dz * 3)
      }
    } else if (overview) {
      camera.position.set(pose.x + 14, 11, 20)
      camera.lookAt(pose.x, 1, 0)
    } else {
      camera.position.set(pose.x + 4, 4.3, 8.5)
      camera.lookAt(pose.x - 3, 1.7, 0)
    }
    // Update accessible progress at most four times a second, including the last frame.
    const tick = Math.floor(time.current * 4)
    if (pose.progress === 1 ? lastUpdate.current !== -2 : tick !== lastUpdate.current) {
      lastUpdate.current = pose.progress === 1 ? -2 : tick
      onProgress(time.current)
    }
  })
  return kind === 'park' ? <Park vehicle={vehicle} /> : <Rail vehicle={vehicle} />
}

function Acacia({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position={[0, 2, 0]}>
        <cylinderGeometry args={[0.14, 0.3, 4, 6]} />
        <meshLambertMaterial color="#6c4934" />
      </mesh>
      <mesh position={[0, 4.15, 0]} scale={[1, 0.42, 0.8]}>
        <sphereGeometry args={[2.5, 10, 6]} />
        <meshLambertMaterial color="#4c7446" />
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
      {[-1, 1].flatMap((side) =>
        [-0.5, 0, 0.5].map((z, i) => (
          <mesh key={`${side},${z}`} position={[side * 0.455, 2.04 + (i % 2) * 0.2, z]}>
            <boxGeometry args={[0.02, 0.22, 0.3]} />
            <meshLambertMaterial color="#805c3e" />
          </mesh>
        )),
      )}
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

function Park({ vehicle }: { vehicle: RefObject<Group | null> }) {
  return (
    <group name="park-preview">
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[140, 140]} />
        <meshLambertMaterial color="#aaa667" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[8.4, 11.6, 64]} />
        <meshLambertMaterial color="#b98d66" />
      </mesh>
      {[
        [15, 5],
        [-16, 2],
        [12, -17],
        [-10, -18],
        [-23, -11],
        [21, 18],
        [0, 21],
      ].map(([x, z], i) => (
        <Acacia key={i} x={x} z={z} s={i % 2 ? 1.2 : 0.8} />
      ))}
      {Array.from({ length: 45 }, (_, i) => {
        const angle = i * 2.399,
          radius = 13 + ((i * 17) % 35),
          x = Math.cos(angle) * radius,
          z = Math.sin(angle) * radius
        return (
          <mesh key={`grass-${i}`} position={[x, 0.17, z]} rotation={[0, angle, 0]}>
            <boxGeometry args={[0.14, 0.34, 0.14]} />
            <meshLambertMaterial color={i % 2 ? '#788653' : '#c4ae67'} />
          </mesh>
        )
      })}
      <Giraffe x={-4} z={-4} turn={-0.5} />
      <Giraffe x={-6} z={-6} turn={-0.2} />
      <Zebra x={4} z={3} turn={0.7} />
      <Zebra x={6} z={5} turn={1} />
      <Zebra x={3} z={5} turn={0.4} />
      <group ref={vehicle} name="safari-vehicle">
        <mesh position={[0, 0.8, 0]}>
          <boxGeometry args={[1.8, 1.25, 3.2]} />
          <meshLambertMaterial color="#ede3bf" />
        </mesh>
        <mesh position={[0, 1.6, 0.2]}>
          <boxGeometry args={[1.75, 0.35, 2]} />
          <meshLambertMaterial color="#e0d3ac" />
        </mesh>
        {[-1, 1].map((x) => (
          <mesh key={x} position={[x * 0.91, 1.1, -0.25]}>
            <boxGeometry args={[0.03, 0.4, 1.6]} />
            <meshLambertMaterial color="#405f67" />
          </mesh>
        ))}
        <mesh position={[0, 1.1, -1.61]}>
          <boxGeometry args={[1.35, 0.36, 0.03]} />
          <meshLambertMaterial color="#405f67" />
        </mesh>
        <mesh position={[0, 1.78, 0.2]}>
          <boxGeometry args={[1.6, 0.08, 1.8]} />
          <meshLambertMaterial color="#83775b" />
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
      {/* A suggestive city skyline, not an accurate survey. */}
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={i} position={[-22 + i * 4, 3 + (i % 4), -40]}>
          <boxGeometry args={[3, 6 + (i % 4) * 2, 3]} />
          <meshLambertMaterial color="#9aa7a1" />
        </mesh>
      ))}
    </group>
  )
}

function Rail({ vehicle }: { vehicle: RefObject<Group | null> }) {
  const sleepers = useMemo(() => Array.from({ length: 41 }, (_, i) => i - 20), [])
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
      <mesh position={[-34, 0.35, -4.8]}>
        <boxGeometry args={[20, 0.7, 3]} />
        <meshLambertMaterial color="#c7bda9" />
      </mesh>
      <mesh position={[-34, 2.4, -6]}>
        <boxGeometry args={[9, 0.12, 3.5]} />
        <meshLambertMaterial color="#884942" />
      </mesh>
      {[-38, -30].map((x) => (
        <mesh key={x} position={[x, 1.4, -6]}>
          <boxGeometry args={[0.15, 2, 0.15]} />
          <meshLambertMaterial color="#5c5145" />
        </mesh>
      ))}
      <group ref={vehicle} name="sgr-train">
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
