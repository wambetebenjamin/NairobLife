# Roadmap

Where kaNAIRO is, and the order things are planned in. Each phase should end with
something playable. The feature list is modelled on [CodedLife](reference/README.md);
the content is Nairobi's own.

Phase 3 is in progress. Later phases are plans, not promises.

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
- [ ] Sound on foot: footsteps, and the city ambience around them. Ambient traffic engines
      and horns are in (see Phase 2).
- [ ] Gamepad support

## Phase 2: vehicles (this version)

- [x] Drivable car: enter and exit with `F`, chase camera, handbrake
- [x] Boda boda (nduthi): leans into corners, turns tighter than anything else
- [x] Matatu: slow, heavy, with the yellow line; parked at the stages in the map data and
      carrying their names
- [x] Around 330 vehicles parked at stages, in car parks, at fuel stations and along the kerbs
- [x] Drivable nganya with original procedural liveries, wing and decorative lights
- [x] Speedometer and vehicle name in the HUD; touch controls for driving
- [x] Headlights, tail lamps and brake lights on the vehicle you are driving
- [x] Road paint: kerb lines, lane lines, zebra crossings and stop lines
- [ ] Speed bumps. The map data has none for the CBD, so they need a fresh download
      or mapping on OpenStreetMap first
- [ ] Raised pavements with kerbs a wheel has to climb; lane lines on the flyover decks
- [x] Engine and horn sounds, synthesised in the browser rather than sampled: the nearest
      few ambient vehicles get an engine note panned to where they are, and a matatu
      sounds its horn as it pulls up at a stage. Volume and mute are in Settings, and
      nothing starts until the player's first click. Tyre and road noise, and everything
      on foot, are still missing.
- [ ] Damage, and vehicles that can roll over (they cannot yet, so there is nothing to
      flip upright)
- [ ] Detailed hand-painted matatu art and readable name and route boards
- [ ] Load Rapier's WASM as its own file (saves download size)

## Phase 3: a living city

- [x] Directed ground-road graph using mapped one-way streets and stored lane counts
- [x] Ambient cars, matatus and bodas follow the graph; matatus pause near stages.
      Solid approximate boxes, a near-player forward-vehicle probe and same-segment
      spacing make them interact with players and some other traffic. Dead-end restarts
      wait for an unoccupied location away from the player and camera. This is still not a
      complete traffic simulation: restarts are not seamless and elevated roads are not
      used.
- [x] Three fictional police patrol motorcycles among CBD traffic, with helmeted riders,
      marked uniforms and blue lights. They follow ordinary ambient traffic rules; there
      is no pursuit, siren or policing gameplay, and State House is outside the map.
- [x] Separate looping 3D scenic previews inspired by Nairobi National Park and SGR,
      accessible from Teleport. These are stylised fictional dioramas, not real mapped
      routes, wildlife simulation, railway service or walkable destinations.
- [x] Pedestrians on clear pavements, with extra candidates near mapped stages and City
      Market; short walking paths include pauses. People are visual-only, not AI agents.
- [x] Fictional stage-to-stage matatu shuttle with a moving city view, cancel and skip.
      Pick stages from Teleport; the journey starts at the selected departure stage and
      follows a shortest directed route, not an official route or existing traffic vehicle.
- [x] Mapped lamps, stage signs and traffic signals. Each mapped signal is matched to the
      junction box it stands on, and that box goes green along one axis while the other
      waits, with an all-red pause between; ambient traffic obeys it. The cycle is
      simplified — two axes, fixed timings — and player vehicles and guided rides are not
      governed.
- [x] In-world "ADVERTISE HERE" placeholders; no ad booking or contact system
- [x] Fictional non-partisan campaign rally near City Square, with an animated speaker
      and crowd (silent and non-interactive)
- [ ] Street-level Sheng flavour reviewed by native speakers: the optional language
      remains a draft until that external review happens.
- [x] Junction priority at crossing roads. A crossing search finds every place roads meet
      — shared graph vertices, geometric crossings where two ways share no node, and T
      joins — and merges meeting points within a few metres into one junction box: about
      500 boxes and 6,800 conflicting approach pairs in the CBD, found once per zone.
      Vehicles stop on the line, claim the box only when no conflicting approach holds it,
      and a vehicle that has crossed its line always clears. A vehicle that has a clear
      approach still takes its turn in order of how long it has waited. Motion within a
      box is still simplified: turn paths are not predicted, so the conflicts kept are
      conservative, and a vehicle turns at the junction's centre rather than tracing a
      lane. Not a complete traffic simulation.

## Phase 4: a bigger, better-looking Nairobi

- [ ] More zones, loaded as you approach them: Upper Hill, Westlands, Kilimani, then
      JKIA and Mombasa Road. State House, Nyayo, Talanta and Kasarani stadiums,
      Nairobi National Park, the SGR and major malls need their own actual mapped zones;
      they cannot be visited from the current CBD map.
- [ ] Terrain: the real slope from Upper Hill down to the Nairobi River
- [ ] Hand-made models for the icons: KICC, Parliament's clock tower, Jamia Mosque,
      the National Archives, the Railway Station
- [ ] Water that looks like water; the Nairobi River
- [x] Rain: the long rains and the short rains, on the real calendar, with overcast
      skies, wet dark tarmac and a rain field that follows the camera. Settings can force
      either season or turn it off.
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
- Billboards with real (opt-in) community art
- A WebGPU renderer as an opt-in for capable devices
