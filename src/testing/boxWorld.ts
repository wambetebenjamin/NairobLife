/**
 * A tiny stand-in for the city, for testing how vehicles drive: flat (or sloping)
 * ground with a few boxes on it. It answers the same two questions the real collision
 * world does (see vehicles/sim/vehicleSim.ts, `Surroundings`), in plain arithmetic, so
 * the driving tests need no physics engine and run in a few milliseconds.
 */
import {
  NO_GROUND,
  type Movable,
  type SurfacePoint,
  type Surroundings,
} from '../vehicles/sim/vehicleSim'

export interface Box {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
  /** Makes this box something that gives way when hit, like another vehicle. */
  movable?: Movable
}

export interface BoxWorldOptions {
  boxes?: Box[]
  /** Height of the ground at a point. Defaults to flat ground at zero. */
  heightAt?: (x: number, z: number) => number
  /** No ground at all: only the boxes hold anything up. */
  bottomless?: boolean
}

/** A box from its centre, footprint and height, standing on y = `base`. */
export function box(
  x: number,
  z: number,
  width: number,
  depth: number,
  height: number,
  base = 0,
): Box {
  return {
    minX: x - width / 2,
    maxX: x + width / 2,
    minY: base,
    maxY: base + height,
    minZ: z - depth / 2,
    maxZ: z + depth / 2,
  }
}

export function createBoxWorld(options: BoxWorldOptions = {}): Surroundings {
  const boxes = options.boxes ?? []
  const heightAt = options.heightAt ?? (() => 0)

  return {
    ground(x, y, z, maxDrop) {
      let best = NO_GROUND
      if (!options.bottomless) {
        const floor = heightAt(x, z)
        if (floor <= y && floor >= y - maxDrop) best = floor
      }
      for (const b of boxes) {
        if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue
        // Starting inside a box counts as standing on the point itself, as it does in Rapier.
        const top = y >= b.minY && y <= b.maxY ? y : b.maxY
        if (top <= y && top >= y - maxDrop && top > best) best = top
      }
      return best
    },

    closest(x, y, z, out: SurfacePoint) {
      let bestSq = Infinity
      if (!options.bottomless) {
        const floor = heightAt(x, z)
        bestSq = (y - floor) * (y - floor)
        out.x = x
        out.y = floor
        out.z = z
        out.inside = y < floor
        out.body = -1
      }
      boxes.forEach((b, index) => {
        const px = Math.min(Math.max(x, b.minX), b.maxX)
        const py = Math.min(Math.max(y, b.minY), b.maxY)
        const pz = Math.min(Math.max(z, b.minZ), b.maxZ)
        const distanceSq = (x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2
        if (distanceSq >= bestSq) return
        bestSq = distanceSq
        out.x = px
        out.y = py
        out.z = pz
        out.inside = distanceSq === 0
        out.body = b.movable ? index : -1
      })
      return bestSq < Infinity
    },

    movable: (index) => boxes[index]?.movable,
  }
}
