# Map-data defects found in kaNAIRO, and what was done about them

All three came from sweeping the baked zone (`data/zones/nairobi-cbd.json`) for objects that
contradict each other, not from reading the roadmap. All three are **shipped and live**.

| #   | Defect                               | Measured                                                                                            | Fix                                                                                    | PR  |
| --- | ------------------------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --- |
| 1   | Traffic spawned inside buildings     | 560 of 54,665 agents (1.0%)                                                                         | `makeTraffic` takes `buildingAt`, skips candidates in a footprint                      | #10 |
| 2   | Mapped trees planted in carriageways | 11 of 271 mapped trees; one 1.58 m from the centre line of a 4.2 m road, plus 1 inside a building   | `scatterTrees` runs mapped positions through the same `blocked` test as scattered ones | #11 |
| 3   | Traffic routed through walls         | 27/5,280 segments put their centre line in a wall; 658 have a building over part of the carriageway | `buildRoadGraph` drops a segment buried ≥90% of its length                             | #12 |

Commits: `04c8b12` → `f8b9391`, `1620ce3` → `a4c1765`, `6090d06` → **`3b55bf1`**.

Live: `dpl_BpAhRSygg7tJVMganVDCahHhGpDy`, READY/PROMOTED, aliased to
`playkanairo.vercel.app` and `nairoblife.vercel.app`, serving `index-Bep5nIL_.js`.

## The measurement that decided fix 3

This is the part worth remembering. The obvious check — is the road's centre line inside a
building? — finds only 27 segments. A car is ~2 m wide, so that misses most of it: **658**
segments have a building over some part of the carriageway.

But dropping all 658 strands **89 of 2,754 junctions**, because most are corners clipped at a
junction, where the _building_ is what is wrong and the street is real. Dropping only segments
buried ≥90% of their length removes one 7 m street in both directions, and the main road
network is unchanged at **2,666** junctions.

The lesson generalises: **sample the volume the object occupies, not its centre line.** The
same mistake would hide defects in kerbs, pavements and parking bays.

## Also checked, clean — do not re-investigate

- **Pedestrian routes**: validated at 9 points per route with a 0.45 m margin against buildings
  and trunks. Nothing found.
- **Parked vehicles**: 0 of 327 overlap a building, sampled on a 13×13 grid across each body.
- **Parked trees in parks** were already covered by `blocked()`; only the mapped ones weren't.

## Verification style

Every claim is a count from the baked map, produced by a temporary vitest file that was deleted
after the numbers were recorded. No browser was available in this environment, so none of it is
a claim about pixels. Each fix has a test that was confirmed to **fail when the guard is
removed**, and fix 3's test also fails when its threshold is loosened enough to cut real
streets — so it cannot be "fixed" later by over-deleting.

`npm run check`: **359 tests**, 37 files, green.

## The National Park diorama, rebuilt

The diorama was the weakest thing in the game and the user said so. It was not a limitation
of the approach -- it was four mistakes, only one of which was visible by reading the code.

| Problem                        | Measured                                                            | Fix                                                      |
| ------------------------------ | ------------------------------------------------------------------- | -------------------------------------------------------- |
| Palette invented, not observed | ground `#aaa667` (olive-grey) vs the real straw `#9c814a`–`#b79941` | colours sampled from reference photographs               |
| Over-lit by 3.4×               | ambient 1.4 + directional 2 washed straw to pale sand `#e7cb9c`     | hemisphere + sun at real daylight ratios                 |
| **Ground lit pure black**      | `computeVertexNormals()` returned **4,225 / 4,225 zero normals**    | rotate the plane flat _before_ displacing it             |
| Skyline absent from frame      | 12 grey boxes hidden behind a 110 m-radius hill                     | 19 towers on the horizon, 2 ridgelines, camera on an arc |

The third one is the interesting one. `PlaneGeometry` lies in its own XY plane; writing
heights into Y and only then rotating the _mesh_ leaves every triangle edge-on to the plane
it was generated from, so the normals come back all zero and the ground renders black. It
looks like a missing mesh, not a lighting bug, which is why it survived. `rotateX(-PI/2)` on
the _geometry_ before displacing fixes it, and `parkTerrain.test.ts` now pins both the fix and
the failure (it asserts the broken order really does produce 4,225 zero normals).

The camera had the same flavour of invisible bug: a full circle orbit spent half the loop
pointing away from the skyline with an empty foreground, and at side views the animals left
the frame entirely. It now runs an arc of ±0.85 rad across the front; measured at 32/32
sampled frames, animals and skyline are both in view.

### How this was verified without a browser

`scripts/render-scenic.mjs` builds the scene in node and renders it through three.js's real
projection pipeline with `SVGRenderer`, then `scripts/svg-to-png.py` rasterises the flat
triangles. It cannot show shaders or exact lighting, but it catches what mattered here:
something seen edge-on, hidden inside something else, or out of frame.
`docs/notes/img/park-real-render.png` is that output.

`scripts/check-terrain-parity.py` keeps the harness's copy of the terrain formula in step with
the real module, so the picture cannot quietly drift from the shipped code.
