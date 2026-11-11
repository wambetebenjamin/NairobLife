# Reference: CodedLife (codedlife.app)

NairobLife is inspired by [CodedLife](https://codedlife.app), a browser game that turns
Accra, Ghana into a playable open world. This folder holds what we learned from it.

- `codedlife-page-source.html` is the "view source" capture of the CodedLife landing page
  that was uploaded to this repo. It contains **markup only** (no game code, no assets).
  It is kept for reference and is not shipped, imported, or copied from.

> We take the _idea_ and the _feature shape_. All NairobLife code, art, copy and data
> pipelines are original. Do not paste CodedLife code, CSS, icons or text into `src/`.

## What the reference game is

| Area       | What CodedLife does                                                                                                                        | Evidence in the page source                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| World      | Real city built from OpenStreetMap, hand-made hero landmarks on top                                                                        | modules named `accra-geodata`, `buildings`, `road-mesh`, `landmarks`, `balme-library`, `great-hall`, `accra-mall` |
| Modes      | Free roam, plus a 40-fighter battle royale on a university campus                                                                          | menu items, `game/match`, `game/storm`, `game/loot`, `game/bots`                                                  |
| Movement   | Walk, sprint, crouch, slide, jump, ledge/wall climb, jetpack                                                                               | loading tips and the controls table                                                                               |
| Vehicles   | Taxis, trotros (shared minibuses), bikes; boost; flip-upright prompt; cars burn and explode                                                | `game/vehicles`, `trotro`, `traffic`, `#flip-prompt`                                                              |
| Life       | Traffic and pedestrians on the road network                                                                                                | `traffic`, `pedestrians`, `pedestrian-routes`, `road-network`                                                     |
| Sky        | 24-minute day cycle, season-aware haze (Harmattan dust)                                                                                    | `day-cycle`, `lighting`, clock tooltip, loading tip                                                               |
| Navigation | Teleport list, radar minimap, full-screen street atlas with search and GPS route                                                           | `#teleport-popover`, `#minimap-canvas`, `#fullmap-modal`                                                          |
| Input      | Keyboard + mouse, gamepad, touch stick with drag-to-look and pinch zoom                                                                    | `controllers`, `gamepad-controls`, `touch-controls`                                                               |
| Shell      | Staged loading screen with rotating tips, menu over the live city, settings tabs (view, graphics, audio, controls, accessibility, privacy) | `#loading-overlay`, `#menu`, `#settings`                                                                          |
| Online     | Accounts, presence count, city chat, rooms with voice, coins/wallet, billboards                                                            | `account`, `presence`, `city-chat`, `interiors/room-voice`, `wallet`, `billboards`                                |

Technically it is vanilla three.js (the WebGPU build with TSL materials) loaded through an
import map from a CDN, split into ~90 hand-written ES modules, with no framework and no
bundler. Quality is `auto / high / medium / low`, where auto steps down when frames run slow.

## What we adopt for Nairobi

- **Real geography first.** OSM footprints and streets, real names, real coordinates.
- **Loading that feels alive.** A staged progress bar ("Starting the engine…"), local tips.
- **HUD layout.** Toolbar top-right, street name + radar bottom-left, speed cluster
  bottom-right, controls hint bottom-centre.
- **Teleports to landmarks** as the way to get around a big map before vehicles exist.
- **Season-aware sky.** Their Harmattan becomes our dry-season dust.
- **Input parity.** Keyboard/mouse, touch, and (later) gamepad drive one shared input state.
- **Quality tiers** with an automatic fallback so mid-range laptops and phones stay smooth.

## What we do differently (on purpose)

| Topic         | CodedLife                      | NairobLife                                                                    | Why                                                                                                                        |
| ------------- | ------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Rendering     | three.js WebGPU + TSL, vanilla | React Three Fiber on WebGL2                                                   | Widest device reach today (phones in particular), and a component model that scales with a team. WebGPU is a later opt-in. |
| Build         | Import map + CDN, no bundler   | Vite, hashed assets, self-hosted fonts                                        | Works offline, cacheable forever, no third-party runtime dependency.                                                       |
| Physics       | Custom                         | Rapier (WASM)                                                                 | Robust character controller now, raycast vehicles in Phase 2.                                                              |
| Map data      | Shipped as JS modules          | Compact baked JSON per zone, meshed in a Web Worker                           | Small download, no main-thread stall, zones can stream in later.                                                           |
| Local flavour | Trotros, taxis, Harmattan      | Matatus, boda bodas (nduthi), Sheng UI text, jacaranda season, the Expressway | It should feel like Nairobi, not a reskin.                                                                                 |

## Feature parity checklist

Tracked in [`docs/ROADMAP.md`](../ROADMAP.md).
