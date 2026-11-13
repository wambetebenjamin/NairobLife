/** Background traffic follows the mapped road graph with approximate solid boxes. */
import { useFrame } from '@react-three/fiber'
import { useBeforePhysicsStep, useRapier } from '@react-three/rapier'
import type { Collider } from '@dimforge/rapier3d-compat'
import { useEffect, useMemo, useRef } from 'react'
import {
  BufferGeometry,
  BoxGeometry,
  CanvasTexture,
  MeshLambertMaterial,
  MeshBasicMaterial,
  PlaneGeometry,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  Euler,
} from 'three'
import { honkAt, updateEngines } from '../../audio/ambience'
import { LIVERIES, VEHICLES } from '../../config/vehicles'
import { useGame, useQuality } from '../../state/gameStore'
import { runtime } from '../../state/runtime'
import type { LoadedZone } from '../../world/zone/loadZone'
import { buildVehicleModel, buildWheelGeometry } from '../models/vehicleModels'
import { createVehicleMaterial, createWheelMaterial } from '../view/vehicleMaterials'
import { buildRoadGraph, makeTraffic, trafficPose, type TrafficAgent } from './graph'
import { findCrossings, type Crossing } from './crossings'
import { signalCrossings } from './signals'
import { TrafficSimulation } from './simulation'
import {
  clearRestart,
  createTrafficCollider,
  placeTrafficCollider,
  vehicleAhead,
} from './colliders'

const KINDS = ['car', 'matatu', 'boda'] as const
const RANGE = { low: 120, medium: 180, high: 240 }

/**
 * Junction discovery walks every pair of nearby roads (about a fifth of a second for the
 * CBD), and it only depends on the map, so it is done once per zone and shared by every
 * simulation, remount and zone reload.
 */
const junctionCache = new WeakMap<object, Crossing[]>()
function crossingsFor(zone: LoadedZone): Crossing[] {
  const cached = junctionCache.get(zone.file)
  if (cached) return cached
  const found = findCrossings(buildRoadGraph(zone.file))
  junctionCache.set(zone.file, found)
  return found
}

export function Traffic({ zone, start }: { zone: LoadedZone; start: { x: number; z: number } }) {
  const quality = useQuality()
  const { world, rapier } = useRapier()
  const colliders = useRef<Collider[]>([])
  const group = useRef<import('three').Group>(null)
  const scene = useMemo(() => {
    const graph = buildRoadGraph(zone.file)
    const agents = makeTraffic(graph, start)
    const crossings = crossingsFor(zone)
    const signalised = signalCrossings(zone.file, graph, crossings)
    const simulation = new TrafficSimulation(graph, agents, { signalised })
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
    const signCanvas = document.createElement('canvas')
    signCanvas.width = 128
    signCanvas.height = 48
    const ctx = signCanvas.getContext('2d')!
    ctx.fillStyle = '#153463'
    ctx.fillRect(0, 0, 128, 48)
    ctx.fillStyle = 'white'
    ctx.font = 'bold 30px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('POLICE', 64, 24)
    const signTexture = new CanvasTexture(signCanvas)
    const patrolParts = [
      {
        name: 'patrol-rider',
        geometry: new BoxGeometry(0.42, 0.6, 0.26),
        material: new MeshLambertMaterial({ color: '#17335c' }),
        x: 0,
        y: 1.27,
        z: 0.13,
      },
      {
        name: 'patrol-helmet',
        geometry: new BoxGeometry(0.3, 0.3, 0.3),
        material: new MeshLambertMaterial({ color: '#eff2ed' }),
        x: 0,
        y: 1.73,
        z: 0.08,
      },
      {
        name: 'patrol-light',
        geometry: new BoxGeometry(0.16, 0.15, 0.16),
        material: new MeshLambertMaterial({
          color: '#2399f5',
          emissive: '#0051aa',
          emissiveIntensity: 0.8,
        }),
        x: 0,
        y: 1.08,
        z: 0.9,
      },
      {
        name: 'patrol-sign',
        geometry: new PlaneGeometry(0.4, 0.15),
        material: new MeshBasicMaterial({ map: signTexture }),
        x: 0,
        y: 1.31,
        z: 0.265,
      },
    ].map((part) => ({
      ...part,
      mesh: new InstancedMesh(part.geometry, part.material, agents.length),
    }))
    for (const part of patrolParts) {
      part.mesh.count = 0
      part.mesh.frustumCulled = false
      part.mesh.name = part.name
    }
    const wheels = new InstancedMesh(wheel, wheelMaterial, agents.length * 4)
    wheels.count = 0
    wheels.frustumCulled = false
    return {
      graph,
      agents,
      simulation,
      material,
      wheelMaterial,
      wheel,
      bodies,
      wheels,
      patrolParts,
      signTexture,
    }
  }, [zone, start])
  useEffect(() => {
    const root = group.current
    for (const b of scene.bodies) root?.add(b.mesh)
    root?.add(scene.wheels)
    for (const part of scene.patrolParts) root?.add(part.mesh)
    return () => {
      for (const part of scene.patrolParts) {
        root?.remove(part.mesh)
        part.mesh.dispose()
        part.geometry.dispose()
        part.material.dispose()
      }
      scene.signTexture.dispose()
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
  useEffect(() => {
    colliders.current = scene.agents.map((agent) =>
      createTrafficCollider(
        world,
        rapier,
        agent,
        trafficPose(scene.graph.edges[agent.edge], agent.progress),
      ),
    )
    return () => {
      for (const collider of colliders.current) world.removeCollider(collider, true)
      colliders.current = []
    }
  }, [scene, world, rapier])
  useBeforePhysicsStep(() => {
    scene.agents.forEach((agent, i) => {
      const collider = colliders.current[i]
      if (collider)
        placeTrafficCollider(
          collider,
          agent,
          trafficPose(scene.graph.edges[agent.edge], agent.progress),
        )
    })
  })
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
    if (playing) runtime.trafficTime += Math.min(delta, 0.05)
    const counts = [0, 0, 0]
    let wheelCount = 0,
      patrolCount = 0
    // Candidates for an engine note: the nearest handful, gathered while drawing them.
    const heard: { id: number; x: number; z: number; speed: number; kind: string }[] = []
    const { matrix, local, root, position, scale, rotation, euler, color } = tools
    // Collect physical obstacles before advancing anyone, then arbitrate all shared
    // junctions from the same snapshot instead of giving the first rendered car priority.
    if (playing) {
      const blocked = new Set<TrafficAgent>()
      scene.agents.forEach((agent, i) => {
        const pose = trafficPose(scene.graph.edges[agent.edge], agent.progress)
        const distance = Math.hypot(runtime.player.x - pose.x, runtime.player.z - pose.z)
        const collider = colliders.current[i]
        if (
          distance < 7 ||
          (distance < 180 && collider && vehicleAhead(world, rapier, collider, agent, pose))
        )
          blocked.add(agent)
      })
      scene.simulation.step(Math.min(delta, 0.05), runtime.trafficTime, blocked, (agent, pose) => {
        // Restart outside the camera's largest draw radius, not on a parked/driven car.
        if (
          Math.hypot(runtime.player.x - pose.x, runtime.player.z - pose.z) < 260 ||
          Math.hypot(camera.position.x - pose.x, camera.position.z - pose.z) < 260
        )
          return false
        const collider = colliders.current[scene.agents.indexOf(agent)]
        return !!collider && clearRestart(world, rapier, collider, agent, pose)
      })
    }
    for (const agent of scene.agents) {
      const edge = scene.graph.edges[agent.edge]
      const pose = trafficPose(edge, agent.progress)
      if (
        (pose.x - camera.position.x) ** 2 + (pose.z - camera.position.z) ** 2 >
        RANGE[quality] ** 2
      )
        continue
      const k = KINDS.indexOf(agent.kind),
        body = scene.bodies[k],
        slot = counts[k]++,
        spec = VEHICLES[agent.kind]
      heard.push({
        // The agent's seed is stable for the life of the simulation, which is all the
        // mixer needs to tell one voice from another.
        id: agent.seed,
        x: pose.x,
        z: pose.z,
        speed: agent.speed,
        kind: agent.kind,
      })
      if (agent.horn) {
        // One-shot: a matatu has pulled up at a stage.
        agent.horn = false
        honkAt(pose.x, pose.z, agent.kind === 'matatu' ? 'matatu' : 'car')
      }
      root.compose(
        position.set(pose.x, 0, pose.z),
        rotation.setFromEuler(euler.set(0, pose.yaw, 0)),
        scale.set(1, 1, 1),
      )
      body.mesh.setMatrixAt(slot, root)
      const livery = agent.patrol
        ? { base: '#e9edf1', accent: '#143766', pattern: 3 }
        : LIVERIES[agent.kind][agent.seed % LIVERIES[agent.kind].length]
      body.mesh.setColorAt(slot, color.set(livery.base))
      const a = body.geo.getAttribute('livery') as InstancedBufferAttribute
      color.set(livery.accent)
      a.setXYZW(slot, color.r, color.g, color.b, livery.pattern)
      if (agent.patrol) {
        for (const part of scene.patrolParts) {
          local.compose(
            position.set(part.x, part.y, part.z),
            rotation.identity(),
            scale.set(1, 1, 1),
          )
          matrix.multiplyMatrices(root, local)
          part.mesh.setMatrixAt(patrolCount, matrix)
        }
        patrolCount++
      }
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
    for (const part of scene.patrolParts) {
      part.mesh.count = patrolCount
      part.mesh.instanceMatrix.needsUpdate = true
    }
    scene.wheels.count = wheelCount
    scene.wheels.instanceMatrix.needsUpdate = true
    // Only the nearest few get an engine: a dozen at once is a din, not a city.
    if (heard.length) {
      heard.sort(
        (a, b) =>
          (a.x - runtime.player.x) ** 2 +
          (a.z - runtime.player.z) ** 2 -
          ((b.x - runtime.player.x) ** 2 + (b.z - runtime.player.z) ** 2),
      )
      updateEngines(heard.slice(0, 8))
    } else updateEngines([])
  }, -25)
  return <group ref={group} name="ambient-traffic" />
}
