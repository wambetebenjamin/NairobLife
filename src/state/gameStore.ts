/**
 * UI-facing game state: which screen is showing, the loaded zone, and the player's
 * settings (saved to localStorage). Per-frame state lives in runtime.ts instead.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Language } from '../config/strings'
import type { VehicleKind } from '../config/vehicles'
import type { LoadedZone } from '../world/zone/loadZone'

/**
 * loading -> menu -> playing <-> paused
 *
 * `loading` covers the map download and physics start-up. The 3D scene is already
 * running behind the menu, so "Free Roam" starts instantly.
 */
export type Phase = 'loading' | 'menu' | 'playing' | 'paused'

export type Quality = 'auto' | 'high' | 'medium' | 'low'
export type Haze = 'clear' | 'hazy' | 'dusty'
/** Weather follows the real calendar by default: wet in the rains, dry between them. */
export type WeatherSetting = 'season' | 'long-rains' | 'short-rains' | 'off'
export type CameraMode = 'third' | 'first'

export const QUALITY_ORDER: readonly Quality[] = ['auto', 'high', 'medium', 'low']
export const HAZE_ORDER: readonly Haze[] = ['clear', 'hazy', 'dusty']
export const WEATHER_ORDER: readonly WeatherSetting[] = [
  'season',
  'long-rains',
  'short-rains',
  'off',
]

export interface Settings {
  quality: Quality
  haze: Haze
  weather: WeatherSetting
  language: Language
  /** Multiplier on look speed, 0.3 .. 3. */
  sensitivity: number
  invertY: boolean
  showHud: boolean
  showControls: boolean
  cameraMode: CameraMode
}

const DEFAULT_SETTINGS: Settings = {
  quality: 'auto',
  // Nairobi's dry seasons hang a soft haze over the city; it is also kind to the frame rate.
  haze: 'hazy',
  // Real seasons: the long rains from late March, the short rains from late October.
  weather: 'season',
  language: 'en',
  sensitivity: 1,
  invertY: false,
  showHud: true,
  showControls: true,
  cameraMode: 'third',
}

export interface Toast {
  id: number
  text: string
}

/** A vehicle as the HUD needs to know it: what it is and, for a matatu, where it runs. */
export interface VehicleTag {
  kind: VehicleKind
  /** Nganyas: what this one is called. */
  name?: string
  label?: string
}

interface GameState {
  phase: Phase
  zone: LoadedZone | null
  /** The world has rendered at least once with physics running. */
  sceneReady: boolean
  loadError: string | null
  settings: Settings
  /** A touch has been seen: show on-screen controls. */
  touch: boolean
  pointerLocked: boolean
  teleportOpen: boolean
  settingsOpen: boolean
  /** A black overlay that hides camera cuts (teleports, starting a game). */
  curtain: boolean
  /** The vehicle the player is driving, if any. (Which one, and where, is in runtime.ts.) */
  driving: VehicleTag | null
  /** A vehicle close enough to get into, for the "press F" prompt. */
  nearVehicle: VehicleTag | null
  /** UI label for an in-progress guided ride. */
  ride: { from: string; to: string } | null
  /** Load progress, 0..1, and what is being loaded, for the loading screen. */
  progress: { value: number; label: string }
  toasts: Toast[]
  /**
   * What "auto" quality currently resolves to. Starts from a guess about the device and
   * steps down if the frame rate struggles.
   */
  autoQuality: Exclude<Quality, 'auto'>

  setZone: (zone: LoadedZone) => void
  setSceneReady: () => void
  setLoadError: (message: string | null) => void
  setPhase: (phase: Phase) => void
  setTouch: (touch: boolean) => void
  setPointerLocked: (locked: boolean) => void
  setTeleportOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setCurtain: (on: boolean) => void
  setDriving: (vehicle: VehicleTag | null) => void
  setNearVehicle: (vehicle: VehicleTag | null) => void
  setRide: (ride: { from: string; to: string } | null) => void
  setProgress: (value: number, label: string) => void
  updateSettings: (patch: Partial<Settings>) => void
  setAutoQuality: (quality: Exclude<Quality, 'auto'>) => void
  toast: (text: string) => void
  dismissToast: (id: number) => void
}

let nextToastId = 1

function guessQuality(): Exclude<Quality, 'auto'> {
  if (typeof window === 'undefined') return 'high'
  const coarse = window.matchMedia?.('(pointer: coarse)').matches
  const cores = navigator.hardwareConcurrency ?? 4
  if (coarse) return cores >= 8 ? 'medium' : 'low'
  return cores <= 4 ? 'medium' : 'high'
}

export const useGame = create<GameState>()(
  persist(
    (set) => ({
      phase: 'loading',
      zone: null,
      sceneReady: false,
      loadError: null,
      settings: DEFAULT_SETTINGS,
      touch: false,
      pointerLocked: false,
      teleportOpen: false,
      settingsOpen: false,
      curtain: false,
      driving: null,
      nearVehicle: null,
      ride: null,
      progress: { value: 0, label: '' },
      toasts: [],
      autoQuality: guessQuality(),

      setZone: (zone) => set({ zone }),
      setSceneReady: () =>
        set((state) => ({
          sceneReady: true,
          phase: state.phase === 'loading' ? 'menu' : state.phase,
        })),
      setLoadError: (loadError) => set({ loadError }),
      setPhase: (phase) =>
        set(
          phase === 'playing'
            ? { phase, settingsOpen: false }
            : { phase, teleportOpen: false, settingsOpen: false },
        ),
      setTouch: (touch) => set({ touch }),
      setPointerLocked: (pointerLocked) => set({ pointerLocked }),
      setTeleportOpen: (teleportOpen) => set({ teleportOpen }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      setCurtain: (curtain) => set({ curtain }),
      setDriving: (driving) => set({ driving, nearVehicle: null }),
      setNearVehicle: (nearVehicle) => set({ nearVehicle }),
      setRide: (ride) => set({ ride, nearVehicle: null }),
      setProgress: (value, label) => set({ progress: { value, label } }),
      updateSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
      setAutoQuality: (autoQuality) => set({ autoQuality }),
      toast: (text) =>
        set((state) => ({ toasts: [...state.toasts.slice(-2), { id: nextToastId++, text }] })),
      dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: 'kanairo-settings',
      version: 1,
      // Only settings are saved; everything else is session state.
      partialize: (state) => ({ settings: state.settings }),
      merge: (saved, current) => ({
        ...current,
        settings: {
          ...DEFAULT_SETTINGS,
          ...((saved as Partial<GameState> | undefined)?.settings ?? {}),
        },
      }),
    },
  ),
)

/** The quality level actually in effect. */
export function useQuality(): Exclude<Quality, 'auto'> {
  return useGame((state) =>
    state.settings.quality === 'auto' ? state.autoQuality : state.settings.quality,
  )
}

export function cycle<T>(order: readonly T[], current: T): T {
  return order[(order.indexOf(current) + 1) % order.length]
}
