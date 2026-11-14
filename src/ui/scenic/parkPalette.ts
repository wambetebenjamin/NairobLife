/**
 * The park diorama's palette and its skyline constants.
 *
 * Lives here rather than beside the component so that a test can import the values that
 * actually ship. Keeping a copy in both places is how an earlier test passed while the
 * component shipped a different colour, and exporting them from `ScenicPreview.tsx` breaks
 * Fast Refresh (`react-refresh/only-export-components`).
 */
import { hazeAt } from './haze'

/**
 * Colours sampled from photographs in `docs/reference/`, not invented. The old scene used a flat
 * `#aaa667` for the ground -- an olive-grey that reads as mud rather than dry grass -- a
 * saturated toy-brown ring for the track, and one `#4c7446` green for every tree. The savannah
 * in the reference photographs is a warm straw-yellow (#9c814a to #b79941) against very dark
 * olive canopies (#2f3217 to #404411), and the interest comes almost entirely from the
 * skyline: sixteen towers standing on the horizon with the park in front of them.
 */
export const PARK = {
  // Sampled from docs/reference/giraffe-skyline-haze.jpg. The old pair (#3e6b7e -> #7fa3b3)
  // was saturation 0.29: roughly twice the colour the reference sky actually has (0.03-0.08),
  // and it dragged every measurement taken against it, including the towers'.
  skyTop: '#b8bbc8',
  skyHorizon: '#a8a6ab',
  cloud: '#c9cbd2',
  cloudShade: '#b3b4bc',
  ridgeFar: '#998666',
  ridgeNear: '#6f7355',
  grassLit: '#a8894a',
  grassMid: '#9c814a',
  grassDry: '#b79941',
  earth: '#8a6f3f',
  trunk: '#6d5a3c',
  canopyDark: '#2f3217',
  canopyMid: '#404411',
  canopyLit: '#4f5219',
  // Re-based on the reference: every neutral building pixel in giraffe-skyline-haze.jpg
  // measures luminance 0.63-0.74, and a 26 m CBD tower 62 m away in haze can never be dark.
  // The old `towerGlass` was #48697a (luminance 0.40, saturation 0.25) -- a dark blue that
  // stayed a dark blue behind the veil and read as a hole in the skyline.
  tower: '#7d93a0',
  towerLight: '#b3b8b6',
  towerGlass: '#93a9b8',
  towerWarm: '#8f8371',
} as const

/**
 * The skyline sits 62 m back. Every colour there is washed toward the horizon haze by this
 * much, so the city measures against the straw the way the reference photograph does.
 * `docs/reference/README.md` records the target ratios.
 */
export const SKYLINE_Z = 62
// Sampled low on the tower, not at its crown. Reference "building" pixels come from the body
// of a building, and haze thins with height: at 14 m the model gave 0.50, which left the
// towers visibly blue at saturation 0.115 against the photograph's 0.02.
export const SKYLINE_HAZE = hazeAt(SKYLINE_Z, 3)

/** How many stacked haze bands wrap each tower. Five is enough to read as a gradient at 62 m. */
export const VEIL_BANDS = [0, 0.2, 0.4, 0.6, 0.8]
