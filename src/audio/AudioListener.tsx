/**
 * Starts the city's sound on the first gesture, and stops it when the game pauses.
 *
 * Browsers refuse to start audio before the player has clicked or tapped, so this arms a
 * one-shot listener on the window and starts the graph the first time anything is
 * pressed. Nothing is created before that: no context, no buffers, no cost.
 */
import { useEffect } from 'react'
import { useGame } from '../state/gameStore'
import { audio, bindSettings, resumeAudio, silence, startAudio, unsilence } from './ambience'

export function AudioListener() {
  const phase = useGame((state) => state.phase)

  useEffect(() => {
    const start = () => {
      startAudio()
      resumeAudio()
      window.removeEventListener('pointerdown', start)
      window.removeEventListener('keydown', start)
    }
    window.addEventListener('pointerdown', start)
    window.addEventListener('keydown', start)
    return () => {
      window.removeEventListener('pointerdown', start)
      window.removeEventListener('keydown', start)
    }
  }, [])

  useEffect(() => bindSettings(), [])

  // A paused city is a silent city: it also means a tab left open behind a menu does
  // not keep burbling at the player.
  useEffect(() => {
    if (!audio.ready) return
    if (phase === 'playing') unsilence()
    else silence()
  }, [phase])

  useEffect(() => {
    const wake = () => {
      if (document.visibilityState === 'visible') resumeAudio()
    }
    document.addEventListener('visibilitychange', wake)
    return () => document.removeEventListener('visibilitychange', wake)
  }, [])

  return null
}
