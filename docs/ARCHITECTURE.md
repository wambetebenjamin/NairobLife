# Architecture

How kaNAIRO is put together, and the reasoning behind the choices that would be
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
  Steering input is the other way round, because that is how a wheel works: +1 is right.
- **Traffic keeps left**, as in Kenya. The driver's door is on the right.
- **Baked coordinates are whole decimetres**, packed flat as `[x0, z0, x1, z1, …]`.
- **Colours in vertex data are linear RGB**, authored as sRGB hex in `palette.ts`.

`src/core/geo.test.ts` pins the first three down. A sign error there mirrors the city, and
a mirrored city still looks like a city.

## Run-time layers

| Folder         | Role                                                                   | Imports from                                |
| -------------- | ---------------------------------------------------------------------- | ------------------------------------------- |
| `src/core`     | Maths, geometry, projection. No DOM, no three.js.                      | nothing                                     |
| `src/config`   | Tunables and content: speeds, landmarks, zones, key bindings, UI text. | `core`                                      |
| `src/state`    | `gameStore` (UI state, Zustand) and `runtime` (per-frame state).       | `config` (and one type from `world`)        |
| `src/input`    | Keyboard, mouse and touch folded into one input state.                 | `config`                                    |
| `src/world`    | The city: zone format, mesh builders, materials, sky, collision.       | `core`, `config`, `state`                   |
| `src/vehicles` | The driving model, the fleet, where vehicles park, how they are drawn. | `core`, `config`, `state`, `input`, `world` |
| `src/player`   | Character controller, character model, camera.                         | all of the above                            |
| `src/game`     | Actions (start, pause, teleport, cycle settings) and world loading.    | all of the above                            |
| `src/ui`       | React DOM: menus, HUD, minimap, touch controls.                        | all of the above                            |

Imports only point up this table, never down. `src/core` and `src/config` know nothing
about three.js or React, and nothing imports from `src/ui`. `src/layers.test.ts` fails if
a file breaks the rule. The files directly in `src/` (`App.tsx`, `GameCanvas.tsx`) are the
wiring, and may import from anywhere.

The mesh builders in `src/world/geometry` and everything in `scripts/osm` use no three.js:
they work in plain typed arrays. That is what lets the same code run in a Web Worker, in
Node for the bake, and in the tests. (`toBufferGeometry.ts` is the one file there that
wraps the finished arrays for the GPU.)

### Two kinds of state

- **`state/gameStore.ts`** (Zustand): which screen is showing, settings, toasts. Changes a
  few times a minute. React components subscribe to it. Settings persist in
  `localStorage`.
- **`state/runtime.ts`**: player position, camera angles, time of day, which vehicle is
  being driven. Changes every frame. It is a plain object that three.js code reads and
  writes inside `useFrame`. The HUD samples it four times a second.

Keeping per-frame data out of React is the single most important performance rule in the
codebase. A store update per frame would re-render the UI sixty times a second.

### Frame order

Set with `useFrame` priorities in `GameCanvas.tsx`. Lower numbers run first.

| Priority | What runs                                                                     |
| -------- | ----------------------------------------------------------------------------- |
| −50      | Physics steps at a fixed 60 Hz. The player and the vehicles move on each step |
| −45      | `StepClock` works out how far this frame falls between the last two steps     |
| −30      | Vehicles are drawn at that in-between position                                |
| −20      | The player reads its new position                                             |
| −10      | The camera follows the player, or the vehicle being driven                    |
| 0        | Everything else: sky, lights, animation; then the render                      |

### The world

- **Zones.** The map is cut into zones (`src/config/zones.ts`). Phase 1 ships one, the
  CBD. Each zone is one baked JSON file. All zones share one projection origin, so
  neighbouring zones line up without any stitching.
- **Chunks.** Inside a zone, buildings are grouped into 400 m squares. Each chunk is one
  draw call and one collision mesh, and three.js skips the chunks that are off screen.
- **Buildings** are extruded footprints. One material draws every facade: the mesh
  carries a "window grid" coordinate and a style number per wall, and a small shader patch
  on top of three's Lambert material draws windows, shopfronts and night lighting from
  them. Landmark pieces may flare at the top and can override their facade style. No textures.
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

### Vehicles

Everything about vehicles is in `src/vehicles`, in four parts that do not know about each
other's insides:

- **How one vehicle moves** (`sim/vehicleSim.ts`). An arcade model written by hand: a
  point with a heading. The engine and brakes change its speed, the tyres hold it
  sideways up to a limit and then let it slide, each axle follows the ground under it (so
  ramps and flyovers need no special case), and the body is a row of circles that get
  pushed out of whatever they overlap. It sees the world through two questions, "how
  high is the ground here?" and "what is the nearest surface to this point?". In the game
  Rapier answers them (`sim/rapierSurroundings.ts`); in most tests a few lines of
  arithmetic do (`src/testing/boxWorld.ts`).
- **The fleet** (`fleet.ts`). Every vehicle in the zone, and one collision box for each.
  A vehicle is asleep until someone gets in or something hits it. Asleep, it is only a
  box and costs nothing per frame; awake, it runs through the driving model on every
  physics step, and it goes back to sleep after standing still for half a second. Moving
  vehicles shove each other according to their weight.
- **Where they are parked** (`placement.ts`). A pure function of the zone file: matatus
  queue at the stages with boda bodas waiting beside them, cars stand in the car parks
  and along the kerbs, the fuel stations get a couple of each, and one of each kind is
  left in front of the player at the start. The same zone always gives the same plan.
- **How they are drawn** (`view/`, `models/`). The four models are built in code. Every
  vehicle of a kind shares one mesh, so the whole fleet is ten instanced meshes however
  many vehicles there are. Near the camera a vehicle gets wheels, a patch of shade and a
  sun shadow; further off, just the body; beyond that, nothing. Only the vehicles that
  are awake are touched each frame. A shader paints original procedural nganya liveries
  from per-instance colours; parked nganyas have glowing decorative lights after dark.

`driving.ts` handles getting in and out. `runtime.driving` holds the id of the vehicle
being driven, or −1, and is the one fact everything else reads: the fleet (who gets the
player's input), the player (whether to walk), the camera (which rig), the HUD. While
driving, the player's capsule rides along inside the vehicle where nothing can touch it,
so getting out is one step to the side.

Two details that are easy to trip over:

- **Drawing between physics steps.** The physics library smooths the motion of bodies it
  manages, but keeps the in-between fraction to itself, and the fleet moves its vehicles
  by hand. `world/physics/StepClock.tsx` recovers that fraction from the library; read it
  with `stepFraction()`.
- **Headlights.** The vehicle being driven carries one real spot light. A lamp at knee
  height meets the road at a degree or two, and a matte surface lit that way stays black.
  So the ground materials ignore the angle a spot light arrives at
  (`catchHeadlights` in `world/materials/groundMaterials.ts`), which is roughly what
  rough tarmac does. This rewrites one line of three.js's shader code; a test fails if a
  three.js upgrade changes that line.

## Decisions and their reasons

**WebGL2 through React Three Fiber, not WebGPU.** WebGL2 runs on practically every phone
and laptop in use. R3F gives a component model that suits a growing team, and the escape
hatch to raw three.js is always open. WebGPU can come later as an opt-in renderer.

**Rapier for physics.** A solid character controller, and fast answers to "what is under
this point?" and "what is near it?" for the vehicles. The cost is download size: Rapier
is 60% of the bundle. The roadmap has a task to load its WASM separately.

**Our own driving model, not Rapier's vehicle controller.** Phase 1 planned to use
Rapier's ray-cast vehicle. Phase 2 wrote a small arcade model instead, for four reasons.
The feel is a table of plain numbers in `config/vehicles.ts` (top speed, grip, turning
circle), not spring and friction settings to be coaxed. It behaves the same at 30, 60 and
144 steps a second, and runs without a physics engine, so it is tested in Node. A parked
vehicle is a box that costs nothing, which is what lets hundreds of them stand around the
city. And a vehicle's whole state is a dozen numbers, which is what multiplayer will want
to send. The price: no suspension, no roll-overs and no damage. Those would need a real
rigid body, and could be added for the one vehicle being driven without touching the
rest.

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
- that every teleport lands on open ground, or on a roof when it is meant to;
- how each vehicle drives: top speed, braking, which way the wheel turns it, that it
  cannot pass through a wall even at a low step rate, that it climbs a kerb and not a
  ledge;
- the fleet, run against Rapier itself: waking and sleeping, shoving, and every fallback
  for where to stand when getting out, including "nowhere";
- the real flyovers: each vehicle is driven by a small autopilot up a ramp, along the
  deck and down again, and then steered hard into the crash barriers, which must hold;
- that no vehicle is parked inside a building, a tree or another vehicle, and that every
  named stage has a matatu;
- which side of the road the paint goes on;
- the import rule between the folders of `src/`.

There are no automated browser tests yet. During development the game was driven in
headless Chrome through a debug handle: add `?debug` to the URL and `window.kanairo`
exposes the store, the runtime state, the actions, the fleet and the three.js scene
(`src/game/debug.ts`).

## Where the next phases plug in

Search the code for `TODO(` followed by a topic:

| Marker              | Where                                               | What goes there                                        |
| ------------------- | --------------------------------------------------- | ------------------------------------------------------ |
| `TODO(traffic)`     | `World.tsx`, `vehicles/fleet.ts`                    | A road graph, and drivers other than the player        |
| `TODO(matatus)`     | `World.tsx`, `TeleportMenu.tsx`, `vehicleModels.ts` | Routes between stages; text on livery and route boards |
| Pedestrians         | `world/pedestrians/`                                | Ambient walkers; interaction remains future work       |
| `TODO(roads)`       | `geometry/ground.ts`, `geometry/raisedRoads.ts`     | Raised kerbs; lane lines on the flyover decks          |
| `TODO(multiplayer)` | `vehicles/fleet.ts`, `MainMenu.tsx`                 | What a server would send for the vehicles              |
| `TODO(art)`         | `vehicleModels.ts`, `PlayerModel.tsx`               | Hand-made models, with the built ones as the fallback  |
| `TODO(terrain)`     | `Ground.tsx`, `config/zones.ts`                     | Height field under the decals                          |
| `TODO(landmarks)`   | `scripts/osm/landmarks.ts`                          | Hand-made models for the icons                         |
| `TODO(gamepad)`     | `config/controls.ts`                                | Map a controller onto the same actions                 |
| `TODO(sheng)`       | `config/strings.ts`, `Hud.tsx`                      | A native speaker's pass over the draft                 |
