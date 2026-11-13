/**
 * What a person looks like: their height and build, and the colours of their clothes,
 * skin and hair, all from their seed. Kept apart from the component so a test can check
 * that two people in a hundred get two different shirts, and that nobody is 1 cm tall.
 */
import { hash01 } from '../../core/random'
import type { Body, PartName } from './body'

/** Shirt colours: the bright prints you see on a Nairobi pavement. */
const SHIRTS = [
  '#c8402c',
  '#1f7f96',
  '#e0b23f',
  '#3f6aa8',
  '#d8d2c0',
  '#9d3f7f',
  '#3c7a54',
  '#a8642f',
  '#5aa0c4',
  '#e0704a',
  '#2f3f63',
  '#b8b05a',
]
const TROUSERS = ['#26333f', '#33323a', '#46433c', '#22384d', '#5a5346', '#20262c']
const SHOES = ['#171717', '#2a2a2a', '#4a3a2a', '#e8e4da', '#1e3247']
/** Skin tones, deliberately a real spread rather than one shade. */
const SKINS = ['#6b3f28', '#7d4a2e', '#8f5638', '#5a3320', '#a06845', '#4a2a19', '#9a5f3c']
const HAIR = ['#141010', '#1d1512', '#2a1d16']

/** sRGB hex to the linear RGB three wants for a vertex or instance colour. */
export function linear(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16)
  const channel = (shift: number) => {
    const c = ((value >> shift) & 255) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return [channel(16), channel(8), channel(0)]
}

/** Build a body from a person's seed. Same seed, same person, every visit. */
export function makeBody(seed: number): Body {
  const pick = <T>(list: readonly T[], salt: number): T =>
    list[Math.floor(hash01(seed, salt) * list.length) % list.length]
  return {
    // From a young teenager to a tall man; the proportions scale with it.
    height: 1.42 + hash01(seed, 20) * 0.5,
    build: 0.86 + hash01(seed, 21) * 0.38,
    stance: (hash01(seed, 22) - 0.5) * 0.1,
    leadingFoot: hash01(seed, 23) < 0.5 ? 0 : 1,
    shirt: linear(pick(SHIRTS, 24)),
    legs: linear(pick(TROUSERS, 25)),
    shoes: linear(pick(SHOES, 26)),
    skin: linear(pick(SKINS, 27)),
    hair: linear(pick(HAIR, 28)),
    hairstyle: Math.floor(hash01(seed, 29) * 4),
    // One person in eight is bald or close-cropped enough that no hair reads.
    hasHair: hash01(seed, 31) < 0.12 ? 0 : 1,
    bag: hash01(seed, 30) < 0.2 ? 1 : 0,
    bagColour: linear(pick(['#1f2733', '#3a2c2c', '#2f4034', '#4a4030', '#232323'], 32)),
  }
}

/** The colour each part of the body takes. */
export function tintOf(part: PartName, body: Body): [number, number, number] {
  switch (part) {
    case 'torso':
    case 'upperArm':
    case 'forearm':
      return body.shirt
    case 'neck':
    case 'head':
    case 'hand':
      return body.skin
    case 'hair':
      return body.hair
    case 'thigh':
    case 'shin':
      return body.legs
    case 'foot':
      return body.shoes
    case 'bag':
      return body.bagColour
  }
}
