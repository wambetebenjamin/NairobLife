# Architecture

How NairobLife is put together, and the reasoning behind the choices that would be
expensive to change later.

## The shape of it

```
                         build time                                  run time
 ┌───────────────┐   ┌──────────────────┐   ┌──────────────┐   ┌─────────────────────────┐
 │ OpenStreetMap │──▶│ scripts/osm/fetch │──▶│ data/osm/    │   │ Web Worker              │
 └───────────────┘   └──────────────────┘   │  raw extract │   │  world/zone/zoneWorker  │
                     ┌──────────────────┐   └──────┬───────┘   │  downloads the zone and │
                     │ scripts/osm/bake │◀─────────┘           │  builds meshes          │
                     └────────┬─────────┘                      └───────────┬─────────────┘
                              ▼                                            ▼ typed arrays
                     ┌──────────────────┐        fetch           ┌─────────────────────────┐
                     │ data/zones/*.json│───────────────────────▶│ Main thread             │
                     └──────────────────┘                        │  three.js scene, Rapier │
                                                                 │  physics, React UI      │
                                                                 └─────────────────────────┘
```

Everything heavy happens before the game starts or off the main thread. The main thread
receives finished vertex buffers and only has to hand them to the GPU.

## Conventions that everything relies on

- **Units are metres.** One world unit is one metre.
- **x is east, y is up, z is south.** The origin is the KICC tower. This is three.js's
  usual right-handed frame with north along −z, so a map drawn north-up matches the world
  seen from above.
- **Yaw 0 faces north; positive yaw turns left.** A compass bearing is the negated yaw.
- **Baked coordinates are whole decimetres**, packed flat as `[x0, z0, x1, z1, …]`.
- **Colours in vertex data are linear RGB**, authored as sRGB hex in `palette.ts`.

`src/core/geo.test.ts` pins the first three down. A sign error there mirrors the city, and
a mirrored city still looks like a city.

## Run-time layers

| Folder       | Role                                                                   | Imports from                                |
| ------------ | ---------------------------------------------------------------------- | ------------------------------------------- |
| `src/core`   | Maths, geometry, projection. No DOM, no three.js.                      | nothing                                     |
| `src/config` | Tunables and content: speeds, landmarks, zones, key bindings, UI text. | `core`                                      |
| `src/state`  | `gameStore` (UI state, Zustand) and `runtime` (per-frame state).       | `config` (and one type from `world`)        |
| `src/input`  | Keyboard, mouse and touch folded into one input state.                 | `config`                                    |
| `src/world`  | The city: zone format, mesh builders, materials, sky, collision.       | `core`, `config`, `state`                   |
| `src/player` | Character controller, character model, camera.                         | `core`, `config`, `state`, `input`, `world` |
| `src/game`   | Actions (start, pause, teleport, cycle settings) and world loading.    | all of the above                            |
| `src/ui`     | React DOM: menus, HUD, minimap, touch controls.                        | all of the above                            |

Imports only point up this table, never down. `src/core` and `src/config` know nothing
about three.js or React, and nothing imports from `src/ui`.

The mesh builders in `src/world/geometry` and everything in `scripts/osm` use no three.js:
they work in plain typed arrays. That is what lets the same code run in a Web Worker, in
Node for the bake, and in the tests. (`toBufferGeometry.ts` is the one file there that
wraps the finished arrays for the GPU.)

### Two kinds of state

- **`state/gameStore.ts`** (Zustand): which screen is showing, settings, toasts. Changes a
  few times a minute. React components subscribe to it. Settings persist in
  `localStorage`.
- **`state/runtime.ts`**: player position, camera angles, time of day. Changes every
  frame. It is a plain object that three.js code reads and writes inside `useFrame`. The
  HUD samples it four times a second.

Keeping per-frame data out of React is the single most important performance rule in the
codebase. A store update per frame would re-render the UI sixty times a second.

### Frame order

Set with `useFrame` priorities in `GameCanvas.tsx`. Lower numbers run first.

| Priority | What runs                                                |
| -------- | -------------------------------------------------------- |
| −50      | Physics steps at a fixed 60 Hz and places bodies         |
| −20      | The player reads its new position                        |
| −10      | The camera follows the player                            |
| 0        | Everything else: sky, lights, animation; then the render |

### The world

- **Zones.** The map is cut into zones (`src/config/zones.ts`). Phase 1 ships one, the
  CBD. Each zone is one baked JSON file. All zones share one projection origin, so
  neighbouring zones line up without any stitching.
- **Chunks.** Inside a zone, buildings are grouped into 400 m squares. Each chunk is one
  draw call and one collision mesh, and three.js skips the chunks that are off screen.
- **Buildings** are extruded footprints. One material draws every facade: the mesh
  carries a "window grid" coordinate and a style number per wall, and a small shader patch
  on top of three's Lambert material draws windows, shopfronts and night lighting from
  them. No textures.
- **The ground** is one large plane plus a single "decal" mesh of roads, pavements, parks
  and water, painted in a fixed order so layers never flicker against each other.
- **Raised roads** (flyovers, footbridges, the Expressway) are real geometry with ramps,
  piers and collision.
- **Sky and light** come from `skyModel.ts`, a small hand-tuned model keyed off the sun's
  height. Fog colour equals the sky's horizon colour, which is what makes the distance
  fade out instead of stopping.

### The player

A capsule moved by Rapier's kinematic character controller: it slides along walls, steps
up kerbs and sticks to ramps. Velocity, gravity, jump buffering and coyote time are our
own code in `Player.tsx`, so the feel is tuned in `config/game.ts` rather than fought out
of a rigid body. The character model is a few dozen boxes animated with trigonometry: no
model file to load, and every pose is readable code.

## Decisions and their reasons

**WebGL2 through React Three Fiber, not WebGPU.** WebGL2 runs on practically every phone
and laptop in use. R3F gives a component model that suits a growing team, and the escape
hatch to raw three.js is always open. WebGPU can come later as an opt-in renderer.

**Rapier for physics.** A solid character controller now, and ray-cast vehicles in Phase 2
without changing engines. The cost is download size: Rapier is 60% of the bundle. The
roadmap has a task to load its WASM separately.

**Bake the map; do not parse OpenStreetMap in the browser.** The raw extract is 2.9 MB of
JSON with tags the game never reads. The baked zone is 190 KB compressed and needs no
interpretation. It also means map bugs are fixed once, at build time, and tested.

**Commit both the raw extract and the baked zone.** The build never depends on a
third-party server, a change to the map shows up as a reviewable diff, and anyone can run
the game offline straight after cloning.

**Procedural everything, for now.** No textures, models or audio files means nothing to
license, a tiny download and instant loads. It also sets the art ceiling. The roadmap
swaps in hand-made landmark models where they matter most.

**One input state.** Keyboard, mouse and touch all write into `input/input.ts`. The
player code never asks which device is in use, so adding a gamepad is one new file.

**Text in one table.** All UI wording lives in `config/strings.ts`, with a draft Sheng
variant, so the game can speak the way Nairobi does without touching components.

## Testing

`npm test` runs Vitest in Node. The tests concentrate on what a person would not notice by
looking:

- the projection and compass conventions;
- that every building mesh faces outwards, across the whole CBD;
- that the baked zone matches the format and projection the game expects;
- that every teleport lands on open ground, or on a roof when it is meant to.

There are no automated browser tests yet. During development the game was driven in
headless Chrome through a debug handle: add `?debug` to the URL and `window.nl` exposes the
store, the runtime state and the actions (`src/game/debug.ts`).

## Where the next phases plug in

Search the code for `TODO(` followed by a topic:

| Marker              | Where                                   | What goes there                         |
| ------------------- | --------------------------------------- | --------------------------------------- |
| `TODO(vehicles)`    | `Player.tsx`, `actions.ts`, `CameraRig` | Enter/exit, chase camera, vehicle group |
| `TODO(matatus)`     | `World.tsx`, `TeleportMenu.tsx`         | Stages are already in the zone data     |
| `TODO(traffic)`     | `World.tsx`                             | Road graph from baked one-way and lanes |
| `TODO(pedestrians)` | `World.tsx`                             | Crowds on pavements                     |
| `TODO(terrain)`     | `Ground.tsx`                            | Height field under the decals           |
| `TODO(landmarks)`   | `scripts/osm/landmarks.ts`              | Hand-made models for the icons          |
| `TODO(gamepad)`     | `config/controls.ts`                    | Map a controller onto the same actions  |
| `TODO(sheng)`       | `config/strings.ts`                     | A native speaker's pass over the draft  |
