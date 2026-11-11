# Roadmap

Where Kanairo is, and the order things are planned in. Each phase should end with
something playable. The feature list is modelled on [CodedLife](reference/README.md);
the content is Nairobi's own.

Phases 3 onwards are plans, not promises: nothing in them is built yet.

## Phase 1: the city on foot (done)

- [x] Map pipeline: OpenStreetMap to a compact zone file, with tests
- [x] The CBD in 3D: buildings with real footprints, streets, parks, flyovers, trees
- [x] Walk, sprint, jump, crouch, with collision against the whole city
- [x] Third-person and first-person cameras
- [x] Day and night, haze settings, lit windows after dark
- [x] HUD: street and district names, radar, heading, altitude, coordinates
- [x] Teleport menu with a map and 16 landmarks
- [x] Keyboard and mouse, and touch controls
- [x] Loading screen, main menu, pause menu, settings (saved between visits)
- [x] Automatic quality step-down on slow devices
- [ ] Replace the bootstrap map snapshot with a live OpenStreetMap download
      (`npm run osm:fetch -- nairobi-cbd`, see [DATA.md](DATA.md))
- [ ] Play-test on real phones, Safari and Firefox
- [ ] Sound: footsteps, city ambience
- [ ] Gamepad support

## Phase 2: vehicles (this version)

- [x] Drivable car: enter and exit with `F`, chase camera, handbrake
- [x] Boda boda (nduthi): leans into corners, turns tighter than anything else
- [x] Matatu: slow, heavy, with the yellow line; parked at the stages in the map data and
      carrying their names
- [x] 328 vehicles parked at stages, in car parks, at fuel stations and along the kerbs
- [x] Speedometer and vehicle name in the HUD; touch controls for driving
- [x] Headlights, tail lamps and brake lights on the vehicle you are driving
- [x] Road paint: kerb lines, lane lines, zebra crossings and stop lines
- [ ] Speed bumps. The map data has none for the CBD, so they need a fresh download
      or mapping on OpenStreetMap first
- [ ] Raised pavements with kerbs a wheel has to climb; lane lines on the flyover decks
- [ ] Engine, tyre and horn sounds
- [ ] Damage, and vehicles that can roll over (they cannot yet, so there is nothing to
      flip upright)
- [ ] Matatu liveries: graffiti art and route boards
- [ ] Load Rapier's WASM as its own file (saves download size)

## Phase 3: a living city

- [ ] Road graph built from the baked streets (one-way flags and lane counts are stored)
- [ ] Traffic that follows it: cars, matatus that stop at stages, bodas that do not
- [ ] Pedestrians on the pavements, thickest around stages and markets
- [ ] Matatu routes you can ride, as fast travel with a view
- [ ] Street furniture from the map: street lamps, traffic lights, stage signs
- [ ] Street-level flavour in Sheng, reviewed by native speakers

## Phase 4: a bigger, better-looking Nairobi

- [ ] More zones, loaded as you approach them: Upper Hill, Westlands, Kilimani, then
      JKIA and Mombasa Road
- [ ] Terrain: the real slope from Upper Hill down to the Nairobi River
- [ ] Hand-made models for the icons: KICC, Parliament's clock tower, Jamia Mosque,
      the National Archives, the Railway Station
- [ ] Water that looks like water; the Nairobi River
- [ ] Rain: the long rains and the short rains
- [ ] Simpler distant buildings, so far-off districts stay cheap to draw
- [ ] A rigged character model, with outfits

## Phase 5: multiplayer

Needs a backend. Supabase is the plan: its realtime channels cover presence and position
sync, and it brings accounts and a database. See `.env.example` for the settings it needs.

- [ ] Accounts and saved progress
- [ ] See other players in the city
- [ ] City chat
- [ ] Rooms for friends

## Phase 6: battle royale

- [ ] A match mode on the University of Nairobi main campus: a shrinking zone, loot,
      last one standing
- [ ] Bots to fill a lobby
- [ ] Health, a HUD for it, and spectating

## Ideas without a phase yet

- Jacaranda season: purple trees in October and November, tied to the real date
- A street search and walking route line in the map, like a sat-nav
- Nairobi National Park on the southern edge
- Billboards with real (opt-in) community art
- A WebGPU renderer as an opt-in for capable devices
