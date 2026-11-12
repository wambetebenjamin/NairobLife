import { CONTROLS_HELP, DRIVING_HELP } from '../config/controls'

/**
 * The key list, generated from the same table the input system reads.
 *
 * `compact` is the strip along the bottom of the HUD: the few keys that matter right
 * now, which are different ones at the wheel.
 */
export function ControlsCard({
  compact = false,
  driving = false,
}: {
  compact?: boolean
  driving?: boolean
}) {
  const all = driving ? DRIVING_HELP : CONTROLS_HELP
  const rows = compact ? all.filter((row) => !row.soon).slice(0, 7) : all
  return (
    <div className={`controls${compact ? ' controls--compact' : ''}`}>
      {!compact && <h2 className="controls__title">Controls</h2>}
      <ul>
        {rows.map((row) => (
          <li key={row.label} className={row.soon ? 'is-soon' : undefined}>
            <span className="controls__keys">
              {row.keys.map((key) => (
                <kbd key={key}>{key}</kbd>
              ))}
            </span>
            <span>{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
