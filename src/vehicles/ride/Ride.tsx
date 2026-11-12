/** The fictional matatu tour follows the road graph while a chase camera shows the city. */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { MeshLambertMaterial, Vector3, type Group } from 'three'
import { VEHICLES } from '../../config/vehicles'
import { useGame } from '../../state/gameStore'
import { runtime } from '../../state/runtime'
import { buildVehicleModel, buildWheelGeometry } from '../models/vehicleModels'
import { ridePose } from './routes'

export function Ride({ onArrival }: { onArrival: () => void }) {
  const ref = useRef<Group>(null)
  const assets = useMemo(
    () => ({
      model: buildVehicleModel('matatu'),
      wheel: buildWheelGeometry(),
      material: new MeshLambertMaterial({ vertexColors: true }),
    }),
    [],
  )
  const target = useMemo(() => new Vector3(), [])
  useEffect(
    () => () => {
      assets.model.body.dispose()
      assets.wheel.dispose()
      assets.material.dispose()
    },
    [assets],
  )
  useFrame(({ camera }, delta) => {
    const ride = runtime.ride,
      group = ref.current
    if (!group) return
    group.visible = !!ride
    if (!ride) return
    if (useGame.getState().phase === 'playing')
      ride.distance = Math.min(
        ride.route.length,
        ride.distance + ride.speed * Math.min(delta, 0.05),
      )
    const p = ridePose(ride.route, ride.distance)
    group.position.set(p.x, 0, p.z)
    group.rotation.y = p.yaw
    Object.assign(runtime.player, {
      x: p.x,
      y: 0,
      z: p.z,
      yaw: p.yaw,
      speed: ride.speed,
      verticalSpeed: 0,
    })
    // Keep a clear view over the vehicle towards the street ahead.
    camera.position.set(p.x + Math.sin(p.yaw) * 12, 6.5, p.z + Math.cos(p.yaw) * 12)
    target.set(p.x - Math.sin(p.yaw) * 10, 2, p.z - Math.cos(p.yaw) * 10)
    camera.lookAt(target)
    if (ride.distance >= ride.route.length) onArrival()
  }, -9)
  const spec = VEHICLES.matatu
  return (
    <group ref={ref} visible={false} name="ride-matatu">
      <mesh geometry={assets.model.body} material={assets.material} />
      {assets.model.wheels.map((wheel, i) => (
        <mesh
          key={i}
          geometry={assets.wheel}
          material={assets.material}
          position={[wheel.x, spec.wheelRadius, -wheel.forward]}
          scale={[spec.wheelWidth, spec.wheelRadius * 2, spec.wheelRadius * 2]}
        />
      ))}
    </group>
  )
}
