/**
 * A uniform grid for "what is near this point?" queries on the ground plane.
 * Items are registered by bounding box and may appear in several cells; queries return
 * the candidates in the cell(s) around a point, and the caller does the exact test.
 */
export class SpatialGrid<T> {
  private readonly cells = new Map<number, T[]>()
  private readonly cell: number

  constructor(cellSize: number) {
    this.cell = cellSize
  }

  private key(cx: number, cz: number): number {
    // Two 16-bit signed cell coordinates packed into one number.
    return (cx + 32768) * 65536 + (cz + 32768)
  }

  insert(item: T, minX: number, minZ: number, maxX: number, maxZ: number): void {
    const x0 = Math.floor(minX / this.cell)
    const x1 = Math.floor(maxX / this.cell)
    const z0 = Math.floor(minZ / this.cell)
    const z1 = Math.floor(maxZ / this.cell)
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const key = this.key(cx, cz)
        const bucket = this.cells.get(key)
        if (bucket) bucket.push(item)
        else this.cells.set(key, [item])
      }
    }
  }

  /** Candidates in the cell containing the point. */
  at(x: number, z: number): readonly T[] {
    return this.cells.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell))) ?? EMPTY
  }

  /** Visit every candidate within `radius` of the point (cell-accurate; items can repeat). */
  near(x: number, z: number, radius: number, visit: (item: T) => void): void {
    const x0 = Math.floor((x - radius) / this.cell)
    const x1 = Math.floor((x + radius) / this.cell)
    const z0 = Math.floor((z - radius) / this.cell)
    const z1 = Math.floor((z + radius) / this.cell)
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const bucket = this.cells.get(this.key(cx, cz))
        if (bucket) for (const item of bucket) visit(item)
      }
    }
  }
}

const EMPTY: readonly never[] = []
