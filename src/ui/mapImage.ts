/**
 * Draws the whole zone once into an off-screen canvas: a dark street map. The minimap
 * and the teleport map both show pieces of this picture, so drawing the map every frame
 * costs one drawImage call instead of thousands of shapes.
 */
import type { RoadKind, ZoneFile } from '../world/zone/format'

export interface MapImage {
  canvas: HTMLCanvasElement
  /** Pixels per metre. */
  scale: number
  /** World coordinates of the image's top-left corner. */
  originX: number
  originZ: number
  /** Size of the mapped area in metres. */
  width: number
  height: number
}

const COLOURS = {
  ground: '#1d2128',
  building: '#39404c',
  buildingEdge: '#4a5261',
  park: '#27432f',
  water: '#1f4a63',
  parking: '#262b33',
  plaza: '#2c313a',
  road: '#5b6472',
  major: '#8892a3',
  trunk: '#c9a93f',
  expressway: '#e6c552',
  path: '#454c58',
  rail: '#8a6f6f',
}

const ROAD_STYLE: Record<RoadKind, { colour: string; order: number; minWidth: number }> = {
  footway: { colour: COLOURS.path, order: 0, minWidth: 1 },
  steps: { colour: COLOURS.path, order: 0, minWidth: 1 },
  pedestrian: { colour: COLOURS.path, order: 0, minWidth: 1.5 },
  service: { colour: COLOURS.road, order: 1, minWidth: 1.2 },
  residential: { colour: COLOURS.road, order: 1, minWidth: 1.8 },
  tertiary: { colour: COLOURS.road, order: 2, minWidth: 2.2 },
  secondary: { colour: COLOURS.major, order: 3, minWidth: 2.6 },
  primary: { colour: COLOURS.major, order: 4, minWidth: 3 },
  trunk: { colour: COLOURS.trunk, order: 5, minWidth: 3.4 },
  motorway: { colour: COLOURS.expressway, order: 6, minWidth: 3 },
}

export function renderMapImage(zone: ZoneFile, scale: number): MapImage {
  const [minX, minZ, maxX, maxZ] = zone.bounds
  const width = maxX - minX
  const height = maxZ - minZ
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(width * scale)
  canvas.height = Math.ceil(height * scale)
  const ctx = canvas.getContext('2d')!

  // From stored integers straight to pixels.
  const px = (v: number) => (v / zone.q - minX) * scale
  const pz = (v: number) => (v / zone.q - minZ) * scale
  const trace = (ring: number[], close: boolean) => {
    ctx.moveTo(px(ring[0]), pz(ring[1]))
    for (let i = 2; i < ring.length; i += 2) ctx.lineTo(px(ring[i]), pz(ring[i + 1]))
    if (close) ctx.closePath()
  }

  ctx.fillStyle = COLOURS.ground
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // ---- ground cover
  for (const area of zone.areas) {
    ctx.beginPath()
    trace(area.p, true)
    for (const hole of area.hs ?? []) trace(hole, true)
    ctx.fillStyle =
      area.k === 'water'
        ? COLOURS.water
        : area.k === 'parking'
          ? COLOURS.parking
          : area.k === 'plaza'
            ? COLOURS.plaza
            : COLOURS.park
    ctx.fill('evenodd')
  }

  // ---- roads on the ground, minor first so major roads draw over them
  const drawRoads = (raised: boolean) => {
    const roads = zone.roads.filter((road) => !!road.br === raised)
    roads.sort((a, b) => ROAD_STYLE[a.k].order - ROAD_STYLE[b.k].order)
    for (const road of roads) {
      const style = ROAD_STYLE[road.k]
      ctx.beginPath()
      trace(road.p, false)
      ctx.strokeStyle = style.colour
      ctx.lineWidth = Math.max(style.minWidth, road.w * scale)
      ctx.stroke()
    }
  }
  drawRoads(false)

  // ---- railways: a solid line with ticks
  ctx.strokeStyle = COLOURS.rail
  for (const rail of zone.rails) {
    ctx.beginPath()
    trace(rail.p, false)
    ctx.lineWidth = 1.4
    ctx.setLineDash([])
    ctx.stroke()
    ctx.lineWidth = 4
    ctx.setLineDash([1.5, 7])
    ctx.stroke()
  }
  ctx.setLineDash([])

  // ---- buildings
  ctx.fillStyle = COLOURS.building
  ctx.strokeStyle = COLOURS.buildingEdge
  ctx.lineWidth = 0.6
  for (const building of zone.buildings) {
    if ((building.b ?? 0) > 3) continue // parts that float above the ground
    ctx.beginPath()
    trace(building.p, true)
    for (const hole of building.hs ?? []) trace(hole, true)
    ctx.fill('evenodd')
    ctx.stroke()
  }

  // ---- flyovers pass over everything
  drawRoads(true)

  return { canvas, scale, originX: minX, originZ: minZ, width, height }
}

const cache = new WeakMap<ZoneFile, MapImage>()

/** The map picture for a zone, drawn on first use and then reused. */
export function getMapImage(zone: ZoneFile): MapImage {
  let image = cache.get(zone)
  if (!image) {
    // Phones get a smaller picture: it is shown smaller, and memory is tighter.
    const coarse = window.matchMedia?.('(pointer: coarse)').matches
    image = renderMapImage(zone, coarse ? 0.5 : 0.75)
    cache.set(zone, image)
  }
  return image
}
