/**
 * What the debug handle (`window.kanairo`, see game/debug.ts) can reach.
 *
 * It lives down here, away from the code that installs it, so that any layer can hang
 * something on the handle without importing the game's actions.
 */
export const debugHandle: Record<string, unknown> = {}

/**
 * Add something to the handle once it exists: the three.js state as `kanairo.three`, the
 * fleet as `kanairo.fleet`. Pass undefined to take it away again.
 */
export function expose(name: 'three' | 'fleet', value: unknown): void {
  if (value === undefined) delete debugHandle[name]
  else debugHandle[name] = value
}
