/**
 * The one rule the rain field and the HUD share: below this much rain, there is none to
 * see, and the mesh is hidden rather than drawn with an alpha of nearly nothing.
 */
export const RAIN_VISIBLE = 0.01

/** Whether the rain field would be drawn at all: a dry day pays nothing for it. */
export function rainVisible(intensity: number): boolean {
  return intensity > RAIN_VISIBLE
}
