/**
 * Distance haze, matched to photographs of the real park.
 *
 * The diorama had no aerial perspective at all: a 26 m tower and a 5 m rock were rendered with
 * the same contrast, so the city looked pinned onto the horizon like a cutout rather than
 * standing in the same air as the grass. In `docs/reference/giraffe-skyline-haze.jpg` the
 * towers are *lighter* than the straw in front of them -- 1.18x its luminance -- because air
 * scatters skylight toward the viewer over that distance. Before this module the ratio was
 * 0.93x: the buildings were darker than the ground.
 *
 * Two things were wrong and both are needed:
 *
 *  1. The haze face emits the *sky* colour, not a grey box. Reference saturation of a far
 *     building is 0.02, and the haze around it is 0.03. A neutral overlay would still have
 *     read as a grey box; the colour has to come from the sky.
 *  2. It is *height*-graded as well as distance-graded. Air near the ground is denser, so a
 *     tower's base dissolves while its crown stays legible. That vertical falloff is most of
 *     what makes a skyline read as distant.
 *
 * `THREE.Fog` would do neither of these. It is a single flat colour applied by distance only,
 * it cannot vary with height, and it would have to fight a 160 m sky dome whose own colour is
 * a gradient. A veil mesh is also honest about its cost: the towers are still drawn twice.
 */

/** How thick the haze is, as a fraction of the sky colour, at zero distance. */
export const HAZE_NEAR = 0.08

/**
 * How thick the haze is at the skyline.
 *
 * Tuned against two numbers measured from `docs/reference/giraffe-skyline-haze.jpg`: a hazed
 * tower should be about 1.18x the luminance of the straw in front of it, and almost
 * colourless (saturation 0.02, against 0.22 for the raw tower colour). At this value the
 * four shipped tower tones land at 1.18-1.21x and saturation 0.02-0.04.
 */
export const HAZE_FAR = 0.9

/**
 * The sky colours the haze is made of.
 *
 * Deliberately not `PARK.skyTop`. The reference sky is a near-neutral haze at this hour --
 * `#b8bbc8` overhead, saturation 0.05 to 0.08 -- not the saturated blue the diorama had
 * (`#3e6b7e`, saturation 0.29). Sampled from `docs/reference/giraffe-skyline-haze.jpg`.
 */
export const HAZE_SKY = '#b8bbc8'
/** Just above the horizon the reference reads `#a3a0a5`, slightly warmer and dimmer. */
export const HAZE_HORIZON = '#a8a6ab'

/**
 * The haze colour to blend a surface toward.
 *
 * The skyline sits at the horizon, where the haze is close to neutral (`HAZE_HORIZON`,
 * saturation 0.03), not up in the blue of the zenith. Blending toward the zenith colour
 * instead leaves a visible blue cast on distant buildings -- measured at saturation 0.12
 * against the reference's 0.02 -- which is why this uses the horizon tone.
 *
 * @param distance how far away the surface is, in metres
 * @param height metres above the ground. Low surfaces get more haze, so the bottom of a tower
 *   dissolves before its top does.
 * @param reach the distance at which haze is fully `HAZE_FAR`. This defaults to 62 m -- the
 *   skyline's own distance -- so a tower at the skyline gets the full `HAZE_FAR` near its base
 *   instead of a fraction of it. Anything further back (the ridges) simply saturates.
 */
export function hazeAt(distance: number, height: number, reach = 62): number {
  const far = Math.min(1, Math.max(0, distance / reach))
  // Height thins the air: at 26 m (the tallest tower) haze is roughly half its ground value.
  const thin = 1 - Math.min(0.55, Math.max(0, height) / 55)
  return HAZE_NEAR + (HAZE_FAR - HAZE_NEAR) * far * far * thin
}

/**
 * Blend a colour toward the horizon haze, returning a `#rrggbb` string.
 *
 * Colours are blended in sRGB rather than linear light. That is the wrong thing physically and
 * the right thing here: the reference values were sampled from a finished JPEG, so matching
 * them is what makes the result look like the photograph.
 */
export function hazed(hex: string, amount: number): string {
  const parse = (value: string) => {
    const n = parseInt(value.replace('#', ''), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const a = parse(hex)
  const b = parse(HAZE_HORIZON)
  const channel = (i: number) => Math.round(a[i] + (b[i] - a[i]) * Math.min(1, Math.max(0, amount)))
  const to2 = (n: number) => n.toString(16).padStart(2, '0')
  return `#${to2(channel(0))}${to2(channel(1))}${to2(channel(2))}`
}
