/**
 * The whole app: the 3D canvas underneath, the HTML interface on top.
 */
import { Component, useEffect, type ReactNode } from 'react'
import { GameCanvas } from './GameCanvas'
import { loadWorld } from './game/loadWorld'
import { useGame } from './state/gameStore'
import { UI } from './ui/UI'

export function App() {
  const zone = useGame((state) => state.zone)

  useEffect(() => {
    void loadWorld()
  }, [])

  return (
    <div className="app">
      <CrashGuard>{zone && <GameCanvas zone={zone} />}</CrashGuard>
      <UI />
    </div>
  )
}

/** If the 3D scene throws (lost WebGL context, bad data), say so instead of a blank page. */
class CrashGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(error)
    useGame
      .getState()
      .setLoadError(error instanceof Error ? error.message : 'The 3D view stopped working.')
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
