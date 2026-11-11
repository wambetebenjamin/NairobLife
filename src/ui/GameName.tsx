import { GAME_WORDMARK } from '../config/game'

/**
 * The game's name as the display face draws it: kaNAIRO.
 *
 * That face has capitals only, so the "ka" is set as small capitals, the height lower-case
 * letters would have (see `.name__small` in ui.css). The text in the page is still
 * "kaNAIRO", which is what a screen reader reads and what copying gives.
 *
 * The loading screen in index.html draws the same thing in plain HTML.
 */
export function GameName() {
  const [small, big] = GAME_WORDMARK
  return (
    <>
      <span className="name__small">{small}</span>
      <span className="name__big">{big}</span>
    </>
  )
}
