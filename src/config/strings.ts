/**
 * Every word the player reads, in one place, so the game can speak more than English.
 *
 * `sheng` is a first draft of a Sheng/Swahili voice for the UI. It is switchable in
 * Settings, and anything missing falls back to English.
 *
 * TODO(sheng): this draft needs a pass by someone who actually speaks Sheng day to day.
 * Sheng moves fast and varies by estate; corrections are very welcome.
 */

const en = {
  tagline: 'Free-roam Nairobi. No download.',
  play: 'Free Roam',
  playHint: 'Explore the CBD on foot',
  resume: 'Resume',
  backToMenu: 'Main menu',
  paused: 'Paused',
  settings: 'Settings',
  teleport: 'Teleport',
  teleportTitle: 'Where to?',
  comingSoon: 'Coming soon',
  battleRoyale: 'Battle Royale',
  battleRoyaleHint: 'Last one standing on campus',
  multiplayer: 'Multiplayer',
  multiplayerHint: 'Roam with friends',
  garage: 'Vehicles',
  garageHint: 'Matatus, bodas and cars',
  welcome: 'Welcome to Nairobi',
  arrived: 'Arrived:',
  zoneEdge: 'Edge of the map. More of Nairobi is on the way.',
  qualityLowered: 'Graphics lowered to keep things smooth. Press G to change.',
  clickToPlay: 'Click to play',
  tapToPlay: 'Tap to play',
  speed: 'km/h',
  altitude: 'm above sea level',
  quality: 'Graphics',
  haze: 'Air',
  language: 'Language',
  sensitivity: 'Look sensitivity',
  invertY: 'Invert look up/down',
  showHints: 'Show controls',
  hazeClear: 'Clear',
  hazeHazy: 'Hazy',
  hazeDusty: 'Dusty',
  qualityAuto: 'Auto',
  qualityHigh: 'High',
  qualityMedium: 'Medium',
  qualityLow: 'Low',
  cameraThird: 'Third person',
  cameraFirst: 'First person',
  loadFailed: 'The map did not load',
  retry: 'Try again',
  jump: 'Jump',
  sprint: 'Run',
  crouch: 'Duck',
}

export type StringKey = keyof typeof en

const sheng: Partial<Record<StringKey, string>> = {
  tagline: 'Zurura Kanairo. Bila download.',
  play: 'Twende!',
  playHint: 'Zurura tao kwa mguu',
  resume: 'Endelea',
  backToMenu: 'Rudi mwanzo',
  paused: 'Tulia kiasi',
  teleport: 'Ruka',
  teleportTitle: 'Unaenda wapi?',
  comingSoon: 'Inakam',
  garage: 'Magari',
  garageHint: 'Mat, nduthi na ndai',
  multiplayerHint: 'Zurura na mabeshte',
  welcome: 'Karibu Kanairo',
  arrived: 'Umefika:',
  zoneEdge: 'Mwisho wa ramani. Kanairo zaidi inakam.',
  clickToPlay: 'Bonyeza uanze',
  tapToPlay: 'Gusa uanze',
  language: 'Lugha',
  jump: 'Ruka',
  sprint: 'Chomoka',
  crouch: 'Inama',
}

export type Language = 'en' | 'sheng'

export const LANGUAGES: readonly { id: Language; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'sheng', label: 'Sheng (draft)' },
]

const TABLES: Record<Language, Partial<Record<StringKey, string>>> = { en, sheng }

export function translate(language: Language, key: StringKey): string {
  return TABLES[language][key] ?? en[key]
}

/** Shown one at a time on the loading screen. Keep them true and short. */
export const LOADING_TIPS: readonly string[] = [
  'Nairobi comes from the Maasai "Enkare Nyrobi": the place of cool waters.',
  'The CBD sits about 1,660 m above sea level. The altimeter in the HUD is real.',
  'KICC opened in 1973. Teleport to its helipad for the best view in town.',
  'Every street here comes from OpenStreetMap. Map a missing building and it shows up in the game.',
  'Hold Shift to sprint. Press T to jump between landmarks.',
  'October and November are jacaranda season. Look for the purple trees.',
  'Press [ and ] to move the sun. Nairobi at dusk is worth a look.',
]
