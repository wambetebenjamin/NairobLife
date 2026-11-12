/** x or z direction receives green; null is an all-red clearance. */
export function greenAxis(seconds: number): 'x' | 'z' | null {
  const t = ((seconds % 30) + 30) % 30
  return t < 13 ? 'x' : t < 15 ? null : t < 28 ? 'z' : null
}
