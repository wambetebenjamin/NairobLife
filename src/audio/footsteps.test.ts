import { describe, expect, it } from 'vitest'
import {
  SURFACE,
  cityBed,
  cityBedTone,
  crossedStep,
  stepAt,
  stepInterval,
  nearestOf,
  stepLength,
  surfaceOf,
  surfaceUnder,
} from './footsteps'

describe('footsteps', () => {
  it('takes steps at a human rate, faster when running', () => {
    // A walk of 1.3 m/s is a little over two steps a second.
    const walk = stepInterval(1.3, 'walk')
    expect(walk).toBeGreaterThan(0.35)
    expect(walk).toBeLessThan(0.7)
    // Running is quicker per step, but never a machine gun.
    expect(stepInterval(5, 'run')).toBeLessThan(stepInterval(5, 'walk'))
    expect(stepInterval(8, 'run')).toBeGreaterThanOrEqual(0.22)
  })

  it('steps faster the faster you go, at any speed', () => {
    let previous = Infinity
    for (const speed of [0.5, 1, 2, 3, 4, 6]) {
      const interval = stepInterval(speed, 'walk')
      expect(interval).toBeLessThanOrEqual(previous + 1e-9)
      previous = interval
    }
  })

  it('alternates feet with every step', () => {
    const feet: number[] = []
    const length = stepLength(1.3, 'walk')
    for (let i = 0; i < 8; i++) {
      const step = stepAt(i * length + 0.001, 1.3, 'walk', 'pavement')
      expect(step).not.toBeNull()
      feet.push(step!.foot)
    }
    expect(feet).toEqual([0, 1, 0, 1, 0, 1, 0, 1])
  })

  it('says nothing while standing still', () => {
    expect(stepAt(0, 0, 'walk', 'tarmac')).toBeNull()
    expect(stepAt(12, 0.1, 'walk', 'tarmac')).toBeNull()
  })

  it('gives the same walk the same sound twice', () => {
    const a = stepAt(7.3, 1.4, 'walk', 'gravel', 42)
    const b = stepAt(7.3, 1.4, 'walk', 'gravel', 42)
    expect(a).toEqual(b)
  })

  it('makes neighbouring steps different, and louder when running', () => {
    const length = stepLength(1.3, 'walk')
    const one = stepAt(length * 2.5, 1.3, 'walk', 'tarmac')!
    const two = stepAt(length * 3.5, 1.3, 'walk', 'tarmac')!
    expect(one.tone).not.toBe(two.tone)
    const jog = stepAt(length * 2.5, 3.5, 'walk', 'tarmac')!
    expect(jog.gain).toBeGreaterThan(one.gain)
  })

  it('hears a different surface underfoot', () => {
    const on = (surface: Parameters<typeof stepAt>[3]) => stepAt(4, 1.4, 'walk', surface, 1)!
    const tarmac = on('tarmac')
    const gravel = on('gravel')
    const steps = on('concrete')
    // Gravel is duller and longer; concrete is brighter than the road.
    expect(gravel.tone).toBeLessThan(tarmac.tone)
    expect(gravel.decay).toBeGreaterThan(tarmac.decay)
    expect(steps.tone).toBeGreaterThan(tarmac.tone)
    for (const surface of ['tarmac', 'pavement', 'gravel', 'concrete'] as const) {
      expect(SURFACE[surface].gain).toBeGreaterThan(0)
      expect(SURFACE[surface].tone).toBeGreaterThan(0)
    }
  })

  it('counts the steps crossed between two frames, and none at a standstill', () => {
    const length = 0.6
    expect(crossedStep(0, length * 0.5, length)).toBe(0)
    expect(crossedStep(0, length * 1.5, length)).toBe(1)
    expect(crossedStep(length * 0.5, length * 2.5, length)).toBe(2)
    expect(crossedStep(3, 3, length)).toBe(0)
    // Walking backwards steps too, rather than falling silent.
    expect(crossedStep(length * 1.5, 0, length)).toBe(1)
    expect(crossedStep(0, 5, 0)).toBe(0)
  })

  it('maps what you stand on to what your feet sound like', () => {
    expect(surfaceOf('road')).toBe('tarmac')
    expect(surfaceOf('pavement')).toBe('pavement')
    expect(surfaceOf('gravel')).toBe('gravel')
    expect(surfaceOf('steps')).toBe('concrete')
    expect(surfaceOf('unknown')).toBe('pavement')
  })
})

describe('the city bed', () => {
  it('is never silent, and louder beside a big road and a stage', () => {
    const quiet = cityBed(8, 400, 0, false)
    const big = cityBed(30, 400, 0, false)
    const stage = cityBed(8, 0, 0, false)
    expect(quiet).toBeGreaterThan(0)
    expect(big).toBeGreaterThan(quiet)
    expect(stage).toBeGreaterThan(quiet)
    // And it is a bed, not the main event: quieter than a passing engine.
    expect(big).toBeLessThan(0.2)
  })

  it('drops indoors and softens in the rain', () => {
    expect(cityBed(30, 0, 0, true)).toBeLessThan(cityBed(30, 0, 0, false))
    expect(cityBed(30, 0, 1, false)).toBeLessThan(cityBed(30, 0, 0, false))
  })

  it('never asks for a negative or absurd level', () => {
    for (const rain of [0, 0.5, 1]) {
      for (const width of [0, 8, 30, 120]) {
        for (const stage of [0, 60, 2000]) {
          const level = cityBed(width, stage, rain, false)
          expect(level).toBeGreaterThanOrEqual(0)
          expect(level).toBeLessThan(0.3)
        }
      }
    }
  })

  it('keeps a steady pitch: it is a drone, not a wobble', () => {
    expect(cityBedTone(30)).toBeGreaterThan(cityBedTone(8))
    // Clamped at both ends of the road-width range, so no absurd pitch.
    expect(cityBedTone(0)).toBe(200)
    expect(cityBedTone(500)).toBe(400)
  })
})

describe('the ground under the player', () => {
  it('is tarmac on the carriageway and paving beyond the kerb', () => {
    const road = { halfWidth: 6, pavement: 2, drivable: true }
    expect(surfaceUnder(road, 0)).toBe('tarmac')
    expect(surfaceUnder(road, 5.9)).toBe('tarmac')
    expect(surfaceUnder(road, 6.1)).toBe('pavement')
    expect(surfaceUnder(road, 40)).toBe('pavement')
  })

  it('is paving off any road at all, including a raised or closed one', () => {
    expect(surfaceUnder(null, 50)).toBe('pavement')
    expect(surfaceUnder({ halfWidth: 6, pavement: 2, drivable: false }, 1)).toBe('pavement')
  })

  it('finds the nearest point, and copes with none', () => {
    const points = [
      { x: 0, z: 0 },
      { x: 100, z: 0 },
    ]
    expect(nearestOf(points, 10, 0)).toBe(10)
    expect(nearestOf(points, 60, 0)).toBe(40)
    expect(nearestOf([], 5, 5)).toBe(Infinity)
  })
})
