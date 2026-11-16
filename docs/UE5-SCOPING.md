# Moving kaNAIRO to UE5: a scoping document

This is a decision document, not a plan to execute. It answers four questions: what would
have to be **rebuilt**, what can be **kept**, what it would **cost**, and how the two
engines could **coexist**. Every number in it was measured in this repository on
2026-11-12, not estimated for the occasion.

The short version: the engine decision is not the interesting one, and switching it
tomorrow would buy very little. The things that would actually make Nairobi look real —
splats of the buildings, real heights, real terrain — are blocked by **what does not exist
in the data**, not by which engine draws it.

---

## 1. What UE5 would replace, measured

The repository is **25,688 lines** of TypeScript across 216 tracked files, plus **39 test
files** and the bake pipeline.

| Area                                                                      | Lines     | Fate in UE5                                               |
| ------------------------------------------------------------------------- | --------- | --------------------------------------------------------- |
| `src/world` — geometry, materials, zone loading, pedestrians, environment | **9,880** | **Lost.** C++/Blueprint equivalents, written again        |
| `src/vehicles` — driving model, models, traffic, placement                | **6,915** | Driving model **portable**; the rest lost                 |
| `src/ui` — HUD, menus, map, touch                                         | **2,567** | **Lost.** UMG, and the browser's touch support with it    |
| `src/audio` — synthesised footsteps, engines, horns                       | 1,248     | Lost; UE5 has its own audio                               |
| `src/player` — camera rig, controller, teleport                           | 1,159     | Lost; re-done with UE5's character/controller             |
| `src/config` — zones, landmarks, controls, strings                        | 1,082     | **Portable as data**                                      |
| `src/input` — unified keyboard/mouse/touch/pad                            | 843       | Lost; UE5 Enhanced Input                                  |
| `src/core` — geo projection, geometry maths, RNG                          | 731       | **Portable**, it is plain maths with 1:1 C++ translations |
| `src/game`                                                                | 479       | Lost                                                      |
| `src/state`                                                               | 348       | Lost                                                      |
| `scripts` — fetch, bake, audit, export, renderers                         | 2,833     | **Kept entirely, and reusable**                           |

So roughly **1,700 lines are genuinely portable** (`core` + `config` + the bake pipeline),
and about **21,000 would be written again in a language and ecosystem that has no tests
here yet**. That is the real cost of the engine decision, and it is the number that should
drive it.

### The 769,937-triangle export

`npm run osm:export` already produces the city as glTF: **3,072 buildings, 2,330 trees,
769,937 triangles, 34 MB, 2,426 × 2,339 m, 140 m tall**. That is real work already done
and it is engine-neutral — it is the single biggest reason the two paths are not mutually
exclusive.

---

## 2. What the splat step actually requires

The pipeline's step 4 is Gaussian splatting. Scoped honestly, splats are not a rendering
feature you switch on; they are the output of a **capture rig**.

| Requirement                    | Reality here                                                                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input                          | **Dozens to hundreds of photographs per structure**, with parallax: walk around it, overlap 60–80%                                                  |
| Camera poses                   | SfM (COLMAP) solve; fails on glass curtain walls, repeating grids, and anything moving                                                              |
| Compute                        | `gsplat` (Apache-2.0, the only commercially usable trainer of the mainstream ones) needs CUDA; PyTorch 2.7+, CUDA 12.8/13.2 for the current release |
| Data in the repo to start from | **4 photographs**, all of other parts of the city, none of them suited to reconstruction                                                            |
| Flight authority               | The Expressway and Westlands passes need KCAA authorization and a licensed pilot                                                                    |
| People                         | The CrowdSplat step is 20–50 consenting people, recorded                                                                                            |

`splatfacto` / `gsplat` can run on a single 12 GB card; that is the cheapest honest entry
point. But the binding constraint is not the GPU. **It is that nobody has taken the
photographs**, and this repository has no capture tooling, no flight plan and no consent
process. Everything in this section is a project of its own.

### The split that makes splats affordable

A splat of a whole city block would be enormous and would not respond to light. The
workable split, and what §3 adopts:

- **Buildings, roads, ground stay mesh.** They are cheap, they are already real (footprints
  from OSM), they can be lit, collided with, and walked through.
- **Splats are for the small number of things the mesh cannot describe**: the KICC's
  facade, Jamia Mosque's domes, the Expressway's deck furniture, a handful of shopfronts.
  Each is a separate, small, pre-lit splat placed as an actor.

---

## 3. The licence situation is better than recorded, with one trap

This was checked against the GitHub API rather than assumed, and it changes an earlier
conclusion.

| Project                                       | Licence            | Verdict                                                             |
| --------------------------------------------- | ------------------ | ------------------------------------------------------------------- |
| `nerfstudio-project/gsplat`                   | **Apache-2.0**     | ✅ Use it. Commercially usable, actively developed                  |
| `graphdeco-inria/gaussian-splatting`          | **non-commercial** | ❌ Reference only. Do **not** train the shipping product with it    |
| `Italink/GaussianSplattingForUnrealEngine`    | **MIT**            | ✅ Usable. UE 5.5+, drives COLMAP + the INRIA trainer through a GUI |
| `mlslabs/MLSLabsGaussianSplattingRenderer-UE` | **Apache-2.0**     | ✅ Usable. UE 5.5.x, **Windows only**, DX12/Vulkan, RTX 20-series+  |
| `JI20/unreal-splat`                           | **MIT**            | ✅ Usable. Smallest of the three                                    |

> **Trap.** There was never a project named "UnrealSplat". The three UE5 splat renderers
> that exist are the ones above, and they are all permissively licensed. But the _training_
> pipeline the most convenient of them (Italink) shells out to is **graphdeco-inria**, which
> is non-commercial. An MIT wrapper does not launder a non-commercial dependency: if the
> splats are trained with it and shipped, the licence question is live. Train with
> `gsplat`; render with any of the four.
>
> **Second trap, rendering.** Splats bake their lighting. They cannot receive UE5's Lumen
> or Nanite lighting, cast shadows, or be relit. A splat of KICC at noon is a splat of KICC
> at noon forever. This is why §2 splits mesh from splat rather than splatting the city.

---

## 4. The three engines do not have to be exclusive

UE5 is not a browser platform. Shipping kaNAIRO to `playkanairo.vercel.app` and shipping a
UE5 build are two products with one data pipeline. That is affordable **because of the
work already done**: the bake is engine-neutral JSON, and the exporter is standard glTF.

```
                    OSM extract ─▶ bake ─▶ data/zones/*.json
                                              │
                          ┌───────────────────┴───────────────────┐
                          ▼                                       ▼
                zoneWorker (TS)                         export-gltf (Node)
                          │                                       │
                three.js + Rapier, in browser           .glb ──▶ UE5 import
                (what ships today)                      .ply (splats) ──▶ UE5 actors
```

What the UE5 project would _consume_ from this repo, and nothing else:

- `data/zones/nairobi-cbd.json` — footprints, heights, roads, trees, POIs
- `dist/export/nairobi-cbd.glb` — the geometry, with colours and the georeference in
  `extras`
- `data/zones/*.json` for every future zone, generated by the same bake

That is a **data contract**, not a code dependency. It means the UE5 work can start without
touching this repository's source at all, which is the cheapest possible way to find out
whether it is worth continuing.

---

## 5. Staged plan, with exit points

Each stage is independently useful and can stop. Stages 1–3 need no GPU and no captures and
can be done here; that is deliberate, because those are the only ones this environment can
prove.

### Stage 0 — decide the product (free, do first)

The question that must be answered before any code: **is the UE5 build meant to replace
the browser game, or to be a high-fidelity showpiece beside it?**

- _Replace_: mobile, touch, and instant-load are gone. The 9,880 lines of `world` and 2,567
  of `ui` are a write-off. This needs a team, not a session.
- _Beside it_: the browser game stays the product; UE5 becomes a capture/film tool fed by
  the same bake. **This is the only version that is affordable now**, and it is the one the
  rest of this document assumes.

### Stage 1 — the data contract (doable now, no GPU)

- Freeze and document the zone format as a versioned schema with a `.glb` companion. ✅
  Mostly done; `docs/DATA.md` and the `extras` block cover it.
- ✅ **Done:** `npm run osm:export -- --tiles` writes one `.glb` per 400 m block
  (`tile_<cx>_<cz>.glb`, plus `ground.glb`). Verified: **39 files, 34 MB, and the triangle
  count is exactly 769,937 in both the tiled and single-file exports**, with identical
  bounds — so tiling moves geometry between files without dropping or duplicating it.
- Verify the import path in **Blender** as the proxy for UE5's importer (both read glTF
  2.0). Done for geometry via `GLTFLoader` round-trip; not done in real Blender here.

### Stage 2 — the first honest splat (needs captures, GPU)

- Pick **one** structure with good public access and no glass: Jamia Mosque, the Railway
  Station trainshed, or the Archives colonnade.
- Capture 150–300 stills walking around it; COLMAP; train with `gsplat`.
- Ship it as a single `.ply` actor, pre-lit, placed by its measured coordinates.
- **Exit point:** if this looks worse than the hand-built landmark at gameplay distance,
  stop. That is a real possible outcome and costs a weekend to find out.

### Stage 3 — UE5 vertical slice (needs a workstation)

- One 500 m × 500 m area of the CBD: the `.glb` cell plus two splat actors.
- The portable core: first-person controller, the driving model (`src/vehicles/drive.ts`
  is a table of numbers and a step function), and the sky/haze model.
- **Exit point:** measure frame time and memory. A 34 MB glb of 770k triangles is trivial
  for UE5; the question is whether the splat actors hold 90 fps on the target card.

### Stage 4 — only if stages 1–3 succeeded

Zone streaming, the rest of the city's zones, traffic, pedestrians. This is where the
21,000 lost lines get written again, and it should not be started before stage 3 has a
number attached to it.

---

## 6. What this document does not claim

- **No UE5 build exists.** Nothing here has been compiled, opened, or run. There is no
  Unreal Engine in this environment and no way to install one.
- **No splat exists.** No photographs have been taken, no SfM has been solved, no GPU
  training has run.
- **The licence table is metadata, not legal advice.** Three of the five are permissive
  with confidence; the non-commercial one is the one that matters and its text should be
  read before shipping anything trained with it.
- **Estimates are labelled.** The 21,000 "lines written again" is an upper bound on effort:
  a C++ port of a geometry builder is not line-for-line, and much of `world` is data
  preparation that the exporter already does once.

## 7. Recommendation

**Do not switch engines now.** The two facts that would justify it — real heights for the
city and real captures for the splats — do not exist yet, and neither is produced by an
engine. Meanwhile the split above costs almost nothing: the bake stays the source of truth,
the `.glb` keeps the UE5 path open, and the browser game keeps shipping.

The cheapest next step that actually advances this is **Stage 1**: make the export stream
by block so it is World-Partition-ready, and get it in front of real Blender. That is
software work, it is testable here, and it is useful on both paths.

The cheapest next step that advances the _look_ of the city is not in this document at all:
**getting real heights** for the 292 named, heightless CBD landmarks, which needs a machine
with open egress to run `npm run osm:fetch`.
