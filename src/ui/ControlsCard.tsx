import { CONTROLS_HELP } from '../config/controls'

/** The key list, generated from the same table the input system reads. */
export function ControlsCard({ compact = false }: { compact?: boolean }) {
  const rows = compact ? CONTROLS_HELP.filter((row) => !row.soon).slice(0, 7) : CONTROLS_HELP
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
