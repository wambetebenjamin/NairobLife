# Roadmap

Where NairobLife is, and the order things are planned in. Each phase should end with
something playable. The feature list is modelled on [CodedLife](reference/README.md);
the content is Nairobi's own.

Phases 2 onwards are plans, not promises: nothing in them is built yet.

## Phase 1: the city on foot (this version)

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

## Phase 2: vehicles

The first thing to build next. Rapier already provides a ray-cast vehicle controller.

- [ ] Drivable car: enter and exit with `F`, chase camera, handbrake
- [ ] Boda boda (nduthi): leaning, faster off the line
- [ ] Matatu: slow, heavy, loud paint; parked at the stages already in the map data
- [ ] Vehicles spawn at stages, car parks and fuel stations
- [ ] Speedometer for vehicles, flip-upright prompt
- [ ] Road surface detail: kerbs, lane lines on one-way roads, zebra crossings, bumps
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
