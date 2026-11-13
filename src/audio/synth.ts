/**
 * The voices: what a matatu, a boda and a Nissan actually sound like, written as maths.
 *
 * Nothing here touches Web Audio. It builds `AudioBuffer`s full of samples, which
 * `ambience.ts` plays; a buffer is just a Float32Array, so the tests can look at the shape
 * of a horn blast or an idling engine without a sound card. That matters more for sound
 * than for geometry, because it is the one thing in the game you cannot check in a
 * screenshot.
 *
 * The engine sounds are short loops, a whole number of cycles long, so they can be played
 * over and over without a click at the seam.
 */

/** Seconds of audio in one engine loop. Long enough not to sound obviously looped. */
export const ENGINE_LOOP = 0.5
/** Seconds in a horn blast. */
export const HORN_SECONDS = 0.55
/** Samples per second for every buffer here. CD quality is plenty. */
export const SAMPLE_RATE = 44100

/** A pulse wave: the blunt, reedy tone of a small engine. */
function pulse(phase: number, width: number): number {
  return phase % 1 < width ? 1 : -1
}

/**
 * An engine at idle.
 *
 * A four-stroke engine fires once per two revolutions, so a 900 rpm idle is 7.5 Hz of
 * firing. That is a thump, not a note, so the buffer is the firing cycle itself: a low
 * pulse for the thump, harmonics for the mechanics, a little noise for the exhaust, all
 * faded together. Pitched up by `playbackRate` as the vehicle speeds up.
 */
export function engineLoop(kind: string, rate = SAMPLE_RATE): Float32Array<ArrayBuffer> {
  const length = Math.round(ENGINE_LOOP * rate)
  const out = new Float32Array(length)
  // Cycles per loop, chosen so the loop is a whole number of firing cycles. A boda idles
  // faster than a matatu, but a few more of them in the loop would break the seam.
  const cycles = kind === 'boda' ? 8 : kind === 'matatu' ? 5 : 5
  // A boda is a single cylinder and buzzes; a matatu is a diesel and is all low thump.
  const base = kind === 'boda' ? 0.55 : kind === 'matatu' ? 0.34 : 0.42
  let noise = 0.5
  for (let i = 0; i < length; i++) {
    const phase = (i / length) * cycles
    // The firing pulse: sharp, then decaying through the rest of the cycle.
    const fire = pulse(phase, kind === 'matatu' ? 0.18 : 0.12)
    // A second, weaker pulse one revolution on. Two cylinders out of phase.
    const second = pulse(phase + 0.5, 0.1) * 0.6
    const drone =
      Math.sin(phase * Math.PI * 2) * 0.25 + Math.sin(phase * Math.PI * 4) * 0.12
    // Cheap white noise, deterministic so the same loop is always the same loop.
    noise = (noise * 9301 + 49297) % 233280
    const grit = (noise / 233280 - 0.5) * (kind === 'boda' ? 0.3 : 0.16)
    const envelope = 0.55 + 0.45 * Math.cos(phase * Math.PI * 2)
    out[i] = (fire * base + second * base * 0.5 + drone * base + grit) * envelope
  }
  // Close the loop: fold the last few milliseconds into the start, so the sample at the
  // end runs into the sample at the beginning with no step and no click.
  seamless(out, Math.round(0.02 * rate))
  // Fit exactly in [-1, 1] rather than clipping: a clipped loop clicks.
  normalise(out, 0.9)
  return out
}

/**
 * A horn.
 *
 * Matatus and lorries in Nairobi are fitted with loud dual-tone air horns, which is why
 * one is a chord rather than a beep. This is the two-tone interval most of them are tuned
 * to, with a slight rise at the start and a soft attack, and a little distortion because
 * they are not played quietly.
 */
export function horn(
  kind: 'matatu' | 'car' = 'matatu',
  rate = SAMPLE_RATE,
): Float32Array<ArrayBuffer> {
  const length = Math.round(HORN_SECONDS * rate)
  const out = new Float32Array(length)
  // A major third apart, near A and C#: the classic matatu interval.
  const low = kind === 'matatu' ? 415 : 440
  const high = kind === 'matatu' ? 520 : 554
  for (let i = 0; i < length; i++) {
    const t = i / rate
    // Attacked over 12 ms, held, released over the last third.
    const attack = Math.min(1, t / 0.012)
    const release = Math.min(1, (HORN_SECONDS - t) / 0.18)
    const envelope = attack * release
    // A short upward bend when the horn is first pressed.
    const bend = 1 + 0.03 * Math.max(0, 1 - t / 0.08)
    const a = Math.sin(2 * Math.PI * low * bend * t)
    const b = Math.sin(2 * Math.PI * high * bend * t)
    // A touch of third harmonic: air horns are not pure.
    const c = Math.sin(4 * Math.PI * low * bend * t) * 0.18
    out[i] = Math.tanh((a + b * 0.8 + c) * 1.6) * envelope * 0.5
  }
  normalise(out, 0.85)
  return out
}

/**
 * Make a loop seamless by crossfading its last `fade` samples over its first ones, so the
 * wrap is a continuation rather than a jump.
 */
function seamless(buffer: Float32Array, fade: number): void {
  // Copy the tail first: the head is about to be overwritten while the tail is read.
  const tail = buffer.slice(buffer.length - fade)
  for (let i = 0; i < fade; i++) {
    const t = i / fade
    buffer[i] = buffer[i] * t + tail[i] * (1 - t)
  }
}

/** Scale a buffer so its loudest sample is exactly `peak`. */
function normalise(buffer: Float32Array, peak: number): void {
  let loudest = 0
  for (const value of buffer) loudest = Math.max(loudest, Math.abs(value))
  if (loudest === 0) return
  const scale = peak / loudest
  for (let i = 0; i < buffer.length; i++) buffer[i] *= scale
}

/**
 * How long a horn blast is, in seconds, so a player can hear one arriving before it
 * passes. Kept here next to the buffer it describes.
 */
export function hornSeconds(): number {
  return HORN_SECONDS
}

/** A reusable engine note: what the ambience hands every nearby vehicle. */
export interface VehicleVoice {
  /** How loud, how fast, and how far to the side, right now. */
  update(now: number, level: number, speed: number, pan: number): void
  /** Fade out and become available again. */
  release(now: number): void
  /** Whether another vehicle may take this voice. */
  busy(): boolean
  /** Load this vehicle's engine and mark the voice in use. */
  attach(kind: string): void
}

/**
 * Build the pool of voices: `count` engines and half as many horns, all silent until
 * something asks for them. Web Audio's nodes are cheap to keep and expensive to create,
 * so they are made once.
 */
export function vehicleVoices(
  context: AudioContext,
  count: number,
  output: AudioNode = context.destination,
): VehicleVoice[] {
  const engines: VehicleVoice[] = []
  const buffers = new Map<string, AudioBuffer>()
  const bufferFor = (kind: string) => {
    let buffer = buffers.get(kind)
    if (!buffer) {
      const samples = engineLoop(kind)
      buffer = context.createBuffer(1, samples.length, context.sampleRate)
      buffer.copyToChannel(samples, 0)
      buffers.set(kind, buffer)
    }
    return buffer
  }

  for (let i = 0; i < count; i++) {
    const source = context.createBufferSource()
    source.loop = true
    const gain = context.createGain()
    gain.gain.value = 0
    const pan = context.createStereoPanner()
    // Keep every engine quiet on its own: together they are the city, not a jet engine.
    source.connect(gain).connect(pan).connect(output)
    source.start()
    let inUse = false
    const voice: VehicleVoice = {
      attach(kind) {
        try {
          source.buffer = bufferFor(kind)
        } catch {
          // An unknown kind keeps whatever it had; nothing here should throw, but a
          // silent voice is better than a broken frame.
        }
        inUse = true
      },
      update(now, level, speed, panValue) {
        inUse = true
        // Idle pitch rises with speed: 1 at rest, about 2.4 at town speed.
        source.playbackRate.setTargetAtTime(1 + speed * 1.4, now, 0.08)
        gain.gain.setTargetAtTime(level * 0.22, now, 0.06)
        pan.pan.setTargetAtTime(panValue, now, 0.05)
      },
      release(now) {
        gain.gain.setTargetAtTime(0, now, 0.1)
        inUse = false
      },
      busy() {
        return inUse
      },
    }
    engines.push(voice)
  }
  return engines
}
