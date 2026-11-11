import { useCallback } from 'react'
import { translate, type StringKey } from '../config/strings'
import { useGame } from '../state/gameStore'

/** `const t = useT()` then `t('play')`: UI text in the player's chosen language. */
export function useT(): (key: StringKey) => string {
  const language = useGame((state) => state.settings.language)
  return useCallback((key: StringKey) => translate(language, key), [language])
}
