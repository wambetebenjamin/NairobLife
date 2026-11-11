/**
 * Places you can teleport to.
 *
 * Coordinates are real WGS84 positions (check them on openstreetmap.org). `spawn` is
 * where your feet land; it must be open ground, which a unit test verifies against the
 * baked building footprints. `lookAt` is what you face on arrival.
 *
 * To add one: pick a point on the map, add an entry, run `npm test`.
 *
 * TODO(landmarks): matatu stages as fast-travel points once routes exist (Phase 3).
 */
import type { LatLon } from '../core/geo'

export interface Landmark {
  id: string
  /** Zone the landmark is in (config/zones.ts). */
  zone: string
  name: string
  /** One line for the teleport menu. */
  blurb: string
  group: 'Downtown' | 'Parks & campus' | 'Up high'
  spawn: LatLon
  lookAt: LatLon
  /**
   * Land on top of whatever is at the spawn point (a roof, a bridge deck) instead of
   * on the ground.
   */
  onTop?: boolean
  /**
   * Camera tilt on arrival, in radians. Negative looks up, which is what a tower needs
   * when you arrive at its foot; leave it out for the usual level view.
   */
  pitch?: number
}

const KICC: LatLon = { lat: -1.28862, lon: 36.82316 }

export const LANDMARKS: readonly Landmark[] = [
  {
    id: 'kicc',
    zone: 'nairobi-cbd',
    name: 'KICC & City Square',
    blurb: 'The 1973 tower that defines the skyline.',
    group: 'Downtown',
    // On City Square, far enough back that the whole tower fits in the opening view.
    spawn: { lat: -1.28763, lon: 36.82208 },
    lookAt: KICC,
    pitch: -0.1,
  },
  {
    id: 'kenyatta-avenue',
    zone: 'nairobi-cbd',
    name: 'Kenyatta Avenue',
    blurb: "The city's grand avenue, by Teleposta Towers and the GPO.",
    group: 'Downtown',
    spawn: { lat: -1.28609, lon: 36.8187 },
    lookAt: { lat: -1.28641, lon: 36.81924 },
  },
  {
    id: 'archives',
    zone: 'nairobi-cbd',
    name: 'Kenya National Archives',
    blurb: '"Meet me at Archives": the meeting point on Moi Avenue.',
    group: 'Downtown',
    spawn: { lat: -1.28492, lon: 36.82632 },
    lookAt: { lat: -1.28492, lon: 36.82592 },
  },
  {
    id: 'kencom',
    zone: 'nairobi-cbd',
    name: 'Kencom & the Hilton',
    blurb: 'The busiest bus stage in town, under the round Hilton tower.',
    group: 'Downtown',
    spawn: { lat: -1.28541, lon: 36.82516 },
    lookAt: { lat: -1.28532, lon: 36.82463 },
  },
  {
    id: 'jamia',
    zone: 'nairobi-cbd',
    name: 'Jamia Mosque',
    blurb: 'Twin minarets and silver domes, a block from City Market.',
    group: 'Downtown',
    spawn: { lat: -1.28313, lon: 36.82041 },
    lookAt: { lat: -1.28328, lon: 36.82083 },
  },
  {
    id: 'basilica',
    zone: 'nairobi-cbd',
    name: 'Holy Family Basilica',
    blurb: 'The cathedral on City Hall Way, next door to City Hall.',
    group: 'Downtown',
    spawn: { lat: -1.28736, lon: 36.82118 },
    lookAt: { lat: -1.28721, lon: 36.82076 },
  },
  {
    id: 'nyayo-house',
    zone: 'nairobi-cbd',
    name: 'Nyayo House',
    blurb: 'Government offices where Kenyatta Avenue meets Uhuru Highway.',
    group: 'Downtown',
    spawn: { lat: -1.28723, lon: 36.81891 },
    lookAt: { lat: -1.28713, lon: 36.81833 },
  },
  {
    id: 'parliament',
    zone: 'nairobi-cbd',
    name: 'Parliament Buildings',
    blurb: 'The National Assembly and its clock tower.',
    group: 'Downtown',
    spawn: { lat: -1.29037, lon: 36.8194 },
    lookAt: { lat: -1.28988, lon: 36.81999 },
  },
  {
    id: 'times-tower',
    zone: 'nairobi-cbd',
    name: 'Times Tower',
    blurb: 'The tallest building in this zone, on Haile Selassie Avenue.',
    group: 'Downtown',
    spawn: { lat: -1.29063, lon: 36.82457 },
    lookAt: { lat: -1.29051, lon: 36.82391 },
  },
  {
    id: 'railway-station',
    zone: 'nairobi-cbd',
    name: 'Nairobi Railway Station',
    blurb: 'Where it started: the city grew out of an 1899 railway depot.',
    group: 'Downtown',
    spawn: { lat: -1.29181, lon: 36.828 },
    lookAt: { lat: -1.29173, lon: 36.82844 },
  },
  {
    id: 'globe',
    zone: 'nairobi-cbd',
    name: 'Globe Roundabout',
    blurb: "Matatu country, under the Murang'a Road flyover.",
    group: 'Downtown',
    spawn: { lat: -1.27858, lon: 36.8213 },
    lookAt: KICC,
  },
  {
    id: 'uhuru-park',
    zone: 'nairobi-cbd',
    name: 'Uhuru Park',
    blurb: 'Lily Lake, Freedom Corner and the postcard view of the skyline.',
    group: 'Parks & campus',
    spawn: { lat: -1.2899, lon: 36.8172 },
    lookAt: KICC,
  },
  {
    id: 'jeevanjee',
    zone: 'nairobi-cbd',
    name: 'Jeevanjee Gardens',
    blurb: 'A quiet garden given to the city in 1906.',
    group: 'Parks & campus',
    spawn: { lat: -1.2812, lon: 36.81989 },
    lookAt: KICC,
  },
  {
    id: 'uon',
    zone: 'nairobi-cbd',
    name: 'University of Nairobi',
    blurb: 'The Great Court of the main campus.',
    group: 'Parks & campus',
    spawn: { lat: -1.27993, lon: 36.81666 },
    lookAt: { lat: -1.28001, lon: 36.81733 },
  },
  {
    id: 'kicc-helipad',
    zone: 'nairobi-cbd',
    name: 'KICC Helipad',
    blurb: '105 m up. The best view in the city.',
    group: 'Up high',
    // Towards the northern rim of the deck, looking across the heart of the CBD.
    spawn: { lat: -1.28856, lon: 36.8232 },
    lookAt: { lat: -1.2853, lon: 36.8246 },
    onTop: true,
    pitch: 0.2,
  },
  {
    id: 'expressway',
    zone: 'nairobi-cbd',
    name: 'Nairobi Expressway',
    blurb: 'On the deck of the toll road, above Uhuru Highway.',
    group: 'Up high',
    spawn: { lat: -1.28901, lon: 36.81859 },
    lookAt: { lat: -1.29133, lon: 36.81961 },
    onTop: true,
  },
]

export function getLandmark(id: string): Landmark | undefined {
  return LANDMARKS.find((landmark) => landmark.id === id)
}
