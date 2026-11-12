import { describe, expect, it } from 'vitest'

/**
 * The layers of src/, lowest first. A file may import from its own layer and from the
 * ones before it, never from the ones after. docs/ARCHITECTURE.md explains each layer.
 *
 * Not covered: the files directly in src/ (they wire the layers together), src/testing,
 * test files, and `import type` lines (types vanish when the code is built).
 */
const LAYERS = ['core', 'config', 'state', 'input', 'world', 'vehicles', 'player', 'game', 'ui']

/** The text of every source file under src/, keyed by path: './core/math.ts'. */
const SOURCES = import.meta.glob<string>(['./**/*.ts', './**/*.tsx', '!./**/*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** The folder of src/ a path is in ('./core/math.ts' is in 'core'), or '' for src/ itself. */
const folderOf = (path: string) => (path.split('/').length > 2 ? path.split('/')[1] : '')

/** Where a relative import leads: ('./player/Player.tsx', '../state/runtime') -> './state/runtime'. */
function follow(from: string, specifier: string): string {
  const parts = from.split('/').slice(0, -1)
  for (const part of specifier.split('/')) {
    if (part === '..') parts.pop()
    else if (part !== '.') parts.push(part)
  }
  return parts.join('/')
}

/** Every relative import in a file that survives the build: [where it leads, the line]. */
function importsOf(path: string): [string, string][] {
  const found: [string, string][] = []
  const pattern = /^(?:import|export)\s+(type\s+)?[^'"]*?from\s+['"](\.[^'"]+)['"]/gm
  for (let match = pattern.exec(SOURCES[path]); match; match = pattern.exec(SOURCES[path])) {
    if (!match[1]) found.push([follow(path, match[2]), match[0].replace(/\s+/g, ' ')])
  }
  return found
}

describe('the layers of src/', () => {
  it('finds the source files', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(80)
    expect(SOURCES['./core/math.ts']).toContain('export')
    expect(follow('./player/Player.tsx', '../state/runtime')).toBe('./state/runtime')
    expect(follow('./vehicles/view/fleetView.ts', '../../core/math')).toBe('./core/math')
    expect(importsOf('./player/Player.tsx').map(([target]) => folderOf(target))).toContain(
      'vehicles',
    )
  })

  it('only import from their own layer and the ones below', () => {
    const wrong: string[] = []
    for (const path of Object.keys(SOURCES)) {
      const layer = folderOf(path)
      if (!LAYERS.includes(layer)) continue
      for (const [target, line] of importsOf(path)) {
        const targetLayer = folderOf(target)
        if (!LAYERS.includes(targetLayer)) {
          wrong.push(`${path} reaches outside the layers: ${line}`)
        } else if (LAYERS.indexOf(targetLayer) > LAYERS.indexOf(layer)) {
          wrong.push(`${path} (${layer}) imports from ${targetLayer}: ${line}`)
        }
      }
    }
    expect(wrong).toEqual([])
  })

  it('are all listed', () => {
    const folders = new Set(Object.keys(SOURCES).map(folderOf))
    folders.delete('')
    expect([...folders].filter((name) => !LAYERS.includes(name))).toEqual(['testing'])
  })
})
