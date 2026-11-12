import { describe, expect, it } from 'vitest'
import { LIVERIES, LIVERY, VEHICLES, VEHICLE_KINDS } from '../../config/vehicles'
import { buildVehicleModel } from './vehicleModels'

describe('vehicle models and liveries', () => {
  it.each(VEHICLE_KINDS)(
    'builds finite, indexed geometry and correctly sized wheels for %s',
    (kind) => {
      const model = buildVehicleModel(kind)
      const positions = model.body.getAttribute('position')
      const paint = model.body.getAttribute('paint')
      const lamp = model.body.getAttribute('lamp')
      expect(model.body.index?.count).toBeGreaterThan(0)
      expect(positions.array.every(Number.isFinite)).toBe(true)
      expect(paint.count).toBe(positions.count)
      expect(lamp.count).toBe(positions.count)
      expect(model.wheels).toHaveLength(kind === 'boda' ? 2 : 4)
      for (const wheel of model.wheels) {
        expect(Math.abs(wheel.forward)).toBeLessThan(VEHICLES[kind].length / 2)
        expect(Math.abs(wheel.x)).toBeLessThan(VEHICLES[kind].width / 2)
      }
      model.body.dispose()
    },
  )

  it('marks nganya accent trim and decorative lamps for the livery shader', () => {
    const model = buildVehicleModel('nganya')
    expect(Array.from(model.body.getAttribute('paint').array)).toContain(2)
    expect(Array.from(model.body.getAttribute('lamp').array)).toContain(3)
    expect(LIVERIES.nganya.every((livery) => livery.pattern !== LIVERY.plain)).toBe(true)
    model.body.dispose()
  })
})
