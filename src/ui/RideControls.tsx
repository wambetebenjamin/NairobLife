import { finishRide } from '../game/actions'
import { useGame } from '../state/gameStore'

export function RideControls() {
  const ride = useGame((state) => state.ride)
  if (!ride) return null
  return (
    <div className="ride-controls" aria-label="Matatu ride controls">
      <strong>
        Matatu ride: {ride.from} → {ride.to}
      </strong>
      <span>Fictional shuttle · scenic route</span>
      <div>
        <button onClick={() => finishRide(true)}>Skip to destination</button>
        <button onClick={() => finishRide(false)}>Cancel ride</button>
      </div>
    </div>
  )
}
