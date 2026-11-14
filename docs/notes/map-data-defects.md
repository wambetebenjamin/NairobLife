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
