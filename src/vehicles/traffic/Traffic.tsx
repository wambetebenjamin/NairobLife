/** Background traffic follows the mapped road graph. It is decorative, not collidable. */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BufferGeometry,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  Euler,
} from 'three'
import { LIVERIES, VEHICLES } from '../../config/vehicles'
import { useGame, useQuality } from '../../state/gameStore'
import { runtime } from '../../state/runtime'
import type { LoadedZone } from '../../world/zone/loadZone'
import { buildVehicleModel, buildWheelGeometry } from '../models/vehicleModels'
import { createVehicleMaterial, createWheelMaterial } from '../view/vehicleMaterials'
import { buildRoadGraph, makeTraffic, stepTraffic, trafficPose } from './graph'

const KINDS = ['car', 'matatu', 'boda'] as const
const RANGE = { low: 120, medium: 180, high: 240 }

export function Traffic({ zone, start }: { zone: LoadedZone; start: { x: number; z: number } }) {
  const quality = useQuality()
  const group = useRef<import('three').Group>(null)
  const scene = useMemo(() => {
    const graph = buildRoadGraph(zone.file)
    const agents = makeTraffic(graph, start)
    const material = createVehicleMaterial(),
      wheelMaterial = createWheelMaterial(),
      wheel = buildWheelGeometry()
    const bodies = KINDS.map((kind) => {
      const model = buildVehicleModel(kind)
      const geo = new BufferGeometry()
      for (const key of Object.keys(model.body.attributes))
        geo.setAttribute(key, model.body.attributes[key])
      geo.setIndex(model.body.index)
      geo.setAttribute(
        'lamps',
        new InstancedBufferAttribute(new Float32Array(agents.length * 2), 2),
      )
      geo.setAttribute(
        'livery',
        new InstancedBufferAttribute(new Float32Array(agents.length * 4), 4),
      )
      const mesh = new InstancedMesh(geo, material, agents.length)
      mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(agents.length * 3), 3)
      mesh.count = 0
      mesh.frustumCulled = false
      return { model, geo, mesh }
    })
    const wheels = new InstancedMesh(wheel, wheelMaterial, agents.length * 4)
    wheels.count = 0
    wheels.frustumCulled = false
    return { graph, agents, material, wheelMaterial, wheel, bodies, wheels }
  }, [zone, start])
  useEffect(() => {
    const root = group.current
    for (const b of scene.bodies) root?.add(b.mesh)
    root?.add(scene.wheels)
    return () => {
      for (const b of scene.bodies) {
        root?.remove(b.mesh)
        b.mesh.dispose()
        b.geo.dispose()
        b.model.body.dispose()
      }
      root?.remove(scene.wheels)
      scene.wheels.dispose()
      scene.wheel.dispose()
      scene.material.dispose()
      scene.wheelMaterial.dispose()
    }
  }, [scene])
  const tools = useMemo(
    () => ({
      matrix: new Matrix4(),
      local: new Matrix4(),
      root: new Matrix4(),
      position: new Vector3(),
      scale: new Vector3(),
      rotation: new Quaternion(),
      euler: new Euler(),
      color: new Color(),
    }),
    [],
  )
  useFrame(({ camera }, delta) => {
    const playing = useGame.getState().phase === 'playing'
    const counts = [0, 0, 0]
    let wheelCount = 0
    const { matrix, local, root, position, scale, rotation, euler, color } = tools
    for (const agent of scene.agents) {
      let edge = scene.graph.edges[agent.edge]
      let pose = trafficPose(edge, agent.progress)
      const player = runtime.player
      const dx = player.x - pose.x,
        dz = player.z - pose.z
      // Slow/stop near the player; ambient traffic has no collision or player boarding yet.
      const blocked = Math.hypot(dx, dz) < 7
      if (playing) stepTraffic(agent, scene.graph, Math.min(delta, 0.05), blocked)
      edge = scene.graph.edges[agent.edge]
      pose = trafficPose(edge, agent.progress)
      if (
        (pose.x - camera.position.x) ** 2 + (pose.z - camera.position.z) ** 2 >
        RANGE[quality] ** 2
      )
        continue
      const k = KINDS.indexOf(agent.kind),
        body = scene.bodies[k],
        slot = counts[k]++,
        spec = VEHICLES[agent.kind]
      root.compose(
        position.set(pose.x, 0, pose.z),
        rotation.setFromEuler(euler.set(0, pose.yaw, 0)),
        scale.set(1, 1, 1),
      )
      body.mesh.setMatrixAt(slot, root)
      const livery = LIVERIES[agent.kind][agent.seed % LIVERIES[agent.kind].length]
      body.mesh.setColorAt(slot, color.set(livery.base))
      const a = body.geo.getAttribute('livery') as InstancedBufferAttribute
      color.set(livery.accent)
      a.setXYZW(slot, color.r, color.g, color.b, livery.pattern)
      for (const mount of body.model.wheels) {
        local.compose(
          position.set(mount.x, spec.wheelRadius, -mount.forward),
          rotation.identity(),
          scale.set(spec.wheelWidth, spec.wheelRadius * 2, spec.wheelRadius * 2),
        )
        matrix.multiplyMatrices(root, local)
        scene.wheels.setMatrixAt(wheelCount++, matrix)
      }
    }
    for (let i = 0; i < KINDS.length; i++) {
      const b = scene.bodies[i]
      b.mesh.count = counts[i]
      b.mesh.instanceMatrix.needsUpdate = true
      if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true
      b.geo.getAttribute('livery').needsUpdate = true
    }
    scene.wheels.count = wheelCount
    scene.wheels.instanceMatrix.needsUpdate = true
  }, -25)
  return <group ref={group} name="ambient-traffic" />
}
