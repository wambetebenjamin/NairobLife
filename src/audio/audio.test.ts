import { describe, expect, it } from 'vitest'
import { falloff, panOf } from './placement'
import { ENGINE_LOOP, HORN_SECONDS, SAMPLE_RATE, engineLoop, horn } from './synth'

/** Peak, RMS and the share of samples at exactly the same value. */
function shape(samples: Float32Array) {
  let peak = 0
  let sum = 0
  let repeats = 0
  for (let i = 0; i < samples.length; i++) {
    peak = Math.max(peak, Math.abs(samples[i]))
    sum += samples[i] * samples[i]
    if (i > 0 && samples[i] === samples[i - 1]) repeats++
  }
  return { peak, rms: Math.sqrt(sum / samples.length), repeats: repeats / samples.length }
}

describe('engine loop', () => {
  it('is the length it says, at the sample rate it says', () => {
    expect(engineLoop('car').length).toBe(Math.round(ENGINE_LOOP * SAMPLE_RATE))
  })

  it('fills the buffer, loudly, without clipping', () => {
    for (const kind of ['car', 'matatu', 'boda']) {
      const { peak, rms, repeats } = shape(engineLoop(kind))
      expect(peak).toBeLessThanOrEqual(1)
      expect(peak).toBeGreaterThan(0.5)
      expect(rms).toBeGreaterThan(0.15)
      // A constant, or a DC offset with a spike, would be almost all repeats.
      expect(repeats).toBeLessThan(0.2)
    }
  })

  it('gives each kind its own character', () => {
    // Roughness is how much the wave jumps from sample to sample: a smooth tone is
    // near zero, a single-cylinder two-stroke with grit in the exhaust is high. A boda
    // should sit above a car, and a diesel matatu below a boda.
    const roughness = (samples: Float32Array) => {
      let sum = 0
      for (let i = 1; i < samples.length; i++) sum += (samples[i] - samples[i - 1]) ** 2
      return Math.sqrt(sum / samples.length)
    }
    const boda = roughness(engineLoop('boda'))
    expect(boda).toBeGreaterThan(roughness(engineLoop('car')))
    expect(boda).toBeGreaterThan(roughness(engineLoop('matatu')))
  })

  it('loops without a click: its ends meet', () => {
    for (const kind of ['car', 'matatu', 'boda']) {
      const samples = engineLoop(kind)
      // The wrap must be a continuation: the last sample and the first a beat later.
      const jump = Math.abs(samples[samples.length - 1] - samples[0])
      expect(jump).toBeLessThan(0.35)
    }
  })
})

describe('horn', () => {
  it('is a blast: silent at the edges, loud in the middle', () => {
    const samples = horn('matatu')
    expect(samples.length).toBe(Math.round(HORN_SECONDS * SAMPLE_RATE))
    expect(Math.abs(samples[0])).toBeLessThan(0.02)
    expect(Math.abs(samples[samples.length - 1])).toBeLessThan(0.02)
    const middle = samples.subarray(
      Math.round(samples.length * 0.3),
      Math.round(samples.length * 0.6),
    )
    expect(shape(middle).rms).toBeGreaterThan(0.2)
  })

  it('is a chord, not a single tone: two pitches beat against each other', () => {
    const samples = horn('matatu')
    // Amplitude should wander as the two tones drift in and out of phase. A 105 Hz
    // difference beats about twice in the length of the blast; count how often the
    // loudness of a 5 ms window crosses its own average, past the attack.
    const window = Math.round(0.005 * SAMPLE_RATE)
    const levels: number[] = []
    for (let i = 0; i + window < samples.length; i += window) {
      levels.push(shape(samples.subarray(i, i + window)).rms)
    }
    const steady = levels.slice(Math.round(levels.length * 0.1), Math.round(levels.length * 0.8))
    const average = steady.reduce((sum, value) => sum + value, 0) / steady.length
    let beats = 0
    for (let i = 1; i < steady.length; i++) {
      if (steady[i - 1] < average !== steady[i] < average) beats++
    }
    expect(beats).toBeGreaterThanOrEqual(2)
  })

  it('never clips, whatever the volume it is played at', () => {
    expect(shape(horn('matatu')).peak).toBeLessThanOrEqual(1)
    expect(shape(horn('car')).peak).toBeLessThanOrEqual(1)
  })
})

describe('placing a sound', () => {
  it('pans a source to the side it is really on, at every facing', () => {
    // Facing north (yaw 0): right is +x.
    expect(panOf(10, 0, 0)).toBeCloseTo(1, 5)
    expect(panOf(-10, 0, 0)).toBeCloseTo(-1, 5)
    // Facing east (yaw pi/2): right is +z.
    expect(panOf(0, 10, Math.PI / 2)).toBeCloseTo(1, 5)
    // Dead ahead and dead behind are both centred.
    expect(panOf(0, -10, 0)).toBeCloseTo(0, 5)
    expect(panOf(0, 10, 0)).toBeCloseTo(0, 5)
  })

  it('is centred at zero distance, rather than dividing by it', () => {
    expect(panOf(0, 0, 1.234)).toBe(0)
  })

  it('fades to nothing exactly at the range, and is loudest close by', () => {
    expect(falloff(0, 100)).toBe(1)
    expect(falloff(100, 100)).toBe(0)
    expect(falloff(150, 100)).toBe(0)
    // It falls away faster than distance: a vehicle twice as far is a quarter as loud.
    expect(falloff(50, 100)).toBeCloseTo(0.25, 5)
    expect(falloff(10, 100)).toBeGreaterThan(falloff(20, 100))
  })
})
