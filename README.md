# Kanairo

**Free-roam Nairobi in your browser. No download, no install.**

Kanairo is an open-world game set in a 3D Nairobi built from real map data. This is
**Phase 2**: you explore the Central Business District on foot, or at the wheel of a car,
a boda boda or a matatu. Every street and building footprint comes from
[OpenStreetMap](https://www.openstreetmap.org), so Kenyatta Avenue is where Kenyatta
Avenue is, and KICC stands 105 m over City Square.

Kanairo is Sheng for Nairobi. The project began as "NairobLife", and the repository still
has that name.

The idea comes from [CodedLife](https://codedlife.app), which does the same for Accra. The
code, art and data pipeline here are original. See [`docs/reference`](docs/reference/README.md).

## What is in it

- **The real CBD**, about 2.3 km square: 3,065 buildings, 162 named streets, Uhuru Park,
  Central Park, Jeevanjee Gardens and the University of Nairobi main campus.
- **On foot**: jog, sprint, jump, crouch. You collide with every building and can walk up
  onto the flyovers and footbridges.
- **Three vehicles to drive**: a car, a boda boda and a matatu, each with its own
  handling. 328 of them are parked around the CBD: in the car parks, along the kerbs, at
  the fuel stations, and a matatu at every named stage, carrying the stage's name. Walk up
  to one and press `F`. They are parked on the left, facing the way traffic runs, and the
  driver gets out on the right, as in Kenya.
- **Roads that read as roads**: kerb lines (black and white on the main streets), lane
  lines, and zebra crossings where the map has them. Headlights after dark.
- **16 teleports** to landmarks, including the KICC helipad.
- **A day that passes**: 24 real minutes per game day, with dusk, lit windows at night, and
  a haze setting for the dry season.
- **A HUD that knows where you are**: street name, district, radar, compass heading, your
  real latitude and longitude, and a speedometer.
- **Keyboard and mouse, or touch.** Third-person and first-person cameras, on foot and at
  the wheel.
- **Runs on modest hardware**: quality drops by itself if the frame rate struggles.

What is _not_ here yet: traffic, pedestrians, sound, multiplayer. They are planned, in
that order. See the [roadmap](docs/ROADMAP.md).

## Run it

You need [Node.js](https://nodejs.org) 22 (20.19 or newer also works).

```bash
npm install
npm run dev
```

Open the address it prints (usually <http://localhost:5173>). The map data is already in
the repository, so there is nothing else to set up and no keys to configure.

| Command               | What it does                                                   |
| --------------------- | -------------------------------------------------------------- |
| `npm run dev`         | Start the game with live reload                                |
| `npm run build`       | Type-check and build the production site into `dist/`          |
| `npm run preview`     | Serve the production build locally                             |
| `npm test`            | Run the tests                                                  |
| `npm run check`       | Type-check, lint, test and build: run this before you push     |
| `npm run format`      | Format the code with Prettier                                  |
| `npm run osm:fetch`   | Download fresh map data from OpenStreetMap                     |
| `npm run osm:bake`    | Turn the raw map data into the file the game loads             |
| `npm run osm:preview` | Draw the baked map as a flat SVG, to check it without the game |

## Controls

| Key     | On foot                        | At the wheel                                        |
| ------- | ------------------------------ | --------------------------------------------------- |
| `W` `S` | Forward, back                  | Accelerate; brake, then reverse                     |
| `A` `D` | Left, right                    | Steer                                               |
| Mouse   | Look (click the game to start) | Look around; let go and the view settles behind you |
| `Space` | Jump                           | Handbrake                                           |
| `Shift` | Sprint                         |                                                     |
| `C`     | Crouch                         |                                                     |
| `F`     | Get into the nearest vehicle   | Get out (below 15 km/h)                             |

The arrow keys work in place of `W A S D`.

| Key         | Action                        |
| ----------- | ----------------------------- |
| `T` or `M`  | Teleport menu and map         |
| `V`         | Third person / first person   |
| `[` and `]` | Move the clock back / forward |
| `L`         | Haze: clear, hazy, dusty      |
| `G`         | Graphics quality              |
| `H`         | Hide the HUD                  |
| `K`         | Fullscreen                    |
| `Esc`       | Pause                         |

On a phone or tablet: the left thumb moves, dragging anywhere else looks around, and there
are buttons for jump, run and duck. Next to a vehicle a **Drive** button appears. At the
wheel the same thumb stick is the pedals and the steering, and the buttons become **Brake**
and **Get out**.

## The vehicles

|           | Top speed | 0 to 100 km/h | Stops from 100 km/h in | Tightest turn (radius) |
| --------- | --------- | ------------- | ---------------------- | ---------------------- |
| Car       | 137 km/h  | 5.5 s         | 30 m                   | 7.3 m                  |
| Boda boda | 112 km/h  | 5.2 s         | 37 m                   | 4.4 m                  |
| Matatu    | 104 km/h  | 12.6 s        | 40 m                   | 7.7 m                  |

The boda leans into corners and slips through gaps. The matatu is slow off the line and
heavy enough to shove a parked car out of its way. The handbrake breaks the tyres' grip,
so pull it in a corner to slide. All the handling numbers are in
[`src/config/vehicles.ts`](src/config/vehicles.ts).

## How it works, in one minute

```
OpenStreetMap ──fetch──▶ data/osm/*.osm.json.gz ──bake──▶ data/zones/*.json ──▶ the game
   (the map)              raw extract, committed           compact, committed     meshes it in
                                                                                  a Web Worker
```

1. **Fetch** (`scripts/osm/fetch.ts`) downloads a zone's raw map data.
2. **Bake** (`scripts/osm/bake.ts`) turns it into a small file of footprints, heights,
   roads and parks, already converted to metres around KICC.
3. **The game** loads that file in a background thread and builds the 3D city from it.
   Windows and roofs are drawn by small shaders, and the vehicles are built in code, so
   there are no textures or models to download. The whole game is about 1.4 MB over the
   wire.

Both data files are committed, so `npm install && npm run dev` works offline.

The stack is [React Three Fiber](https://r3f.docs.pmnd.rs) (three.js) for rendering,
[Rapier](https://rapier.rs) for physics, [Zustand](https://zustand.docs.pmnd.rs) for UI
state, and [Vite](https://vite.dev) + TypeScript to build it.

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): how the code is organised and why.
- [`docs/DATA.md`](docs/DATA.md): the map pipeline, and what the current map gets wrong.
- [`docs/ROADMAP.md`](docs/ROADMAP.md): the phases from here to multiplayer.

## Where things are

```
src/
  config/      the dials: speeds, camera, landmarks, zones, key bindings, UI text
  core/        maths and geography helpers with no dependencies
  world/       the city: zone loading, mesh building, materials, sky, collision
  vehicles/    the driving model, where vehicles are parked, their shapes and drawing
  player/      the character, its animation and the camera
  input/       keyboard, mouse and touch, merged into one input state
  game/        actions (start, pause, teleport, get in) and world loading
  state/       UI state (Zustand) and per-frame state
  ui/          menus, HUD, minimap, touch controls
scripts/osm/   the map pipeline (fetch, bake, preview)
data/osm/      raw OpenStreetMap extracts
data/zones/    baked zones the game loads
docs/          architecture, data notes, roadmap, the CodedLife reference
```

To change how the game feels, start in `src/config/game.ts` (on foot) and
`src/config/vehicles.ts` (at the wheel). To add a teleport, add an
entry to `src/config/landmarks.ts` and run `npm test`, which checks that it lands on open
ground. To add a district, see "Adding a zone" in [`docs/DATA.md`](docs/DATA.md).

## Known limits of this version

- **The map data is a snapshot, not a fresh download.** It was assembled from two public
  GitHub repositories that contain OpenStreetMap extracts, because the machine that built
  this version could not reach OpenStreetMap's servers. It is real map data, but it has
  gaps: the Nairobi River is missing, and parts of the Expressway sit on the ground.
  Running `npm run osm:fetch -- nairobi-cbd && npm run osm:bake` fixes this.
  Details in [`data/osm/README.md`](data/osm/README.md).
- **Most building heights are estimates.** OpenStreetMap gives a height for 244 of the
  3,065 buildings (the towers, mostly). The rest are guessed from footprint size and
  neighbours, so the skyline is right and the side streets are plausible.
- **The ground is flat.** The real CBD drops about 30 m from Upper Hill to the river.
- **Landmarks are generic.** KICC has its crown and the amphitheatre its cone, but there
  are no hand-made models yet: Parliament has no clock tower and Jamia Mosque no domes.
- **Driving is arcade, not simulation.** Vehicles cannot roll over, take no damage and
  make no sound. Kerbs are painted lines, not steps. Nothing else moves yet: every other
  vehicle is parked.
- **No speed bumps**, although Nairobi has plenty: the map data has none for the CBD.
- **Tested in headless Chrome only.** It has not yet been played on a real phone, in
  Safari or in Firefox, or with a real graphics card, so the frame rate on real devices is
  not known.

## Deploying

It is a static site: `npm run build` and host the `dist/` folder anywhere.
[`vercel.json`](vercel.json) is set up for Vercel:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/wambetebenjamin/NairobLife)

No environment variables are needed. [`.env.example`](.env.example) lists the ones later
phases will use.

Automatic checks on pull requests are written but not switched on yet:
[`docs/ci/github-actions-ci.yml`](docs/ci/github-actions-ci.yml) says how to enable them.

## Credits

- Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright),
  available under the [Open Database License](https://opendatacommons.org/licenses/odbl/).
  If you see a building missing or a street misnamed, fix it on OpenStreetMap and it will
  show up here after the next fetch.
- Display typeface: [Bungee](https://github.com/djrrb/Bungee) by David Jonathan Ross,
  SIL Open Font License 1.1 (`public/fonts/Bungee-OFL.txt`).
- Inspired by [CodedLife](https://codedlife.app).
