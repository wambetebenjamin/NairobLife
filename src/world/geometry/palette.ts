/**
 * The colours of Nairobi, as far as a procedural city can carry them: cream and grey
 * concrete downtown, grey Nairobi stone, tinted glass on the newer towers, and painted
 * mabati (iron sheet) roofs on everything low.
 *
 * Colours are authored as sRGB hex and converted once to linear RGB, which is what
 * three.js expects in vertex colour attributes.
 */
import { hash01 } from '../../core/random'

export type RGB = readonly [number, number, number]

function channelToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** "#rrggbb" -> linear RGB in 0..1. */
export function hexToLinear(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16)
  return [
    channelToLinear(((n >> 16) & 255) / 255),
    channelToLinear(((n >> 8) & 255) / 255),
    channelToLinear((n & 255) / 255),
  ]
}

const palette = (...hex: string[]): RGB[] => hex.map(hexToLinear)

export function scale(c: RGB, k: number): RGB {
  return [c[0] * k, c[1] * k, c[2] * k]
}

export function pick<T>(list: readonly T[], id: number, salt: number): T {
  return list[Math.min(list.length - 1, Math.floor(hash01(id, salt) * list.length))]
}

// ------------------------------------------------------------------ buildings

/** Painted render: the low and mid-rise bulk of the CBD, creams and greys with the odd ochre or pastel. */
export const WALLS_MASONRY = palette(
  '#d9cdb2',
  '#e3d7bd',
  '#cfc0a0',
  '#c7c1b4',
  '#b9b4aa',
  '#e8e4da',
  '#d6c7a9',
  '#c8ad82',
  '#cfab8c',
  '#c29a82',
  '#b3c4c7',
  '#bccab8',
  '#dcc9b6',
  '#bfb7a8',
)

/** Bare and painted concrete for the taller blocks, which are rarely colourful. */
export const WALLS_CONCRETE = palette(
  '#cfc8b8',
  '#bdb8ae',
  '#d8d2c4',
  '#aeb0b0',
  '#c4bca8',
  '#b3aa9a',
  '#c9c4bb',
)

/** Dressed grey "Nairobi stone", common on older and institutional buildings. */
export const WALLS_STONE = palette('#8f9296', '#9a9b98', '#a39f97', '#888b8c')

/** Curtain-wall glass tints for the towers. */
export const WALLS_GLASS = palette(
  '#5f8098',
  '#6b93a8',
  '#557a83',
  '#7f9aa6',
  '#8a7a66',
  '#4f6f8a',
  '#6c8f86',
)

export const ROOFS_FLAT = palette('#8d8a84', '#9a968e', '#7f7c78', '#a39e94', '#86827b')

/** Mabati: corrugated iron sheets, painted or left to weather. */
export const ROOFS_MABATI = palette(
  '#8e4a3a',
  '#9c5744',
  '#7d4034',
  '#4f7358',
  '#4d6a86',
  '#a9adb0',
  '#7d7065',
  '#8a8f94',
  '#a0523d',
)

// ------------------------------------------------------------------ ground

export const GROUND = {
  /** Whatever lies between the mapped features downtown: worn paving, dust, hardstanding. */
  earth: hexToLinear('#a29a8c'),
  // Sun-bleached and dusty rather than fresh black tarmac.
  asphalt: hexToLinear('#4e4f52'),
  asphaltMajor: hexToLinear('#47494d'),
  asphaltWorn: hexToLinear('#5b5a59'),
  sidewalk: hexToLinear('#b5aea2'),
  footway: hexToLinear('#b8a98f'),
  paving: hexToLinear('#bcb09a'),
  steps: hexToLinear('#9a958c'),
  marking: hexToLinear('#e9e6da'),
  rail: hexToLinear('#5b4f47'),
  ballast: hexToLinear('#8a8177'),
  concrete: hexToLinear('#9d9a94'),
  concreteDark: hexToLinear('#7f7c77'),
} as const

export const AREA_COLOURS = {
  park: hexToLinear('#6f9a4e'),
  garden: hexToLinear('#79a556'),
  grass: hexToLinear('#86a85c'),
  wood: hexToLinear('#56803f'),
  water: hexToLinear('#3c6a7c'),
  parking: hexToLinear('#77777a'),
  pitch: hexToLinear('#6aa35a'),
  plaza: hexToLinear('#c3b8a2'),
} as const

// ------------------------------------------------------------------ trees

export const TREE_GREENS = palette('#4f7d3a', '#5d8a3f', '#3f6e36', '#6b9446', '#47733f', '#59803a')
/** Jacaranda in bloom: Nairobi turns purple every October and November. */
export const TREE_JACARANDA = palette('#8f6fc4', '#a07fd0', '#7f62b5')
/** Nandi flame. */
export const TREE_FLAME = palette('#c9552f')
export const TREE_TRUNK = hexToLinear('#5c4a3a')
