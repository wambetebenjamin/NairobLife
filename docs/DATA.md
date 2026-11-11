# Map data

How the city gets from OpenStreetMap into the game, how to change it, and what the
current map gets wrong.

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), under the
[Open Database License](https://opendatacommons.org/licenses/odbl/). The game shows this
credit on the menu and in the HUD. Keep it there: the licence requires it.

## The pipeline

```
npm run osm:fetch    OpenStreetMap ─▶ data/osm/<zone>.osm.json.gz     (raw, as downloaded)
npm run osm:bake     raw extract   ─▶ data/zones/<zone>.json          (what the game loads)
npm run osm:preview  baked zone    ─▶ data/zones/<zone>.preview.svg   (a flat map to check by eye)
```

Both data files are committed. You only run the pipeline when you want to change the map.

### Fetch (`scripts/osm/fetch.ts`)

Sends one query per zone to the [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API),
a free public service, and saves the answer untouched. It tries several servers in turn.
With no arguments it only fetches zones that have no data yet, so it never overwrites a
map by accident; name a zone or pass `--all` to refresh.

> **Not yet run against the live service.** This script was written and tested for its
> argument handling and failure paths, but the machine it was written on could not reach
> any Overpass server. The query has therefore never returned real data. Expect to adjust
> it the first time you run it, and read the bake summary afterwards.

### Bake (`scripts/osm/bake.ts`)

Reads the raw extract and writes a compact zone file. In order, it:

1. **Projects** every point from latitude/longitude to metres east and south of KICC.
2. **Buildings**: reads footprints (including courtyards), decides a height, and resolves
   3D "building parts" against their outlines so a tower is not drawn twice.
3. **Roads**: classifies each by type, gives it a width, clips it to the zone, and works
   out which stretches are raised (bridges) and how the ramps reach the ground.
4. **Ground cover**: parks, gardens, woods, water, car parks, squares.
5. **Places and points**: named areas for the "where am I" label, mapped trees, matatu
   stages, fuel stations, fountains, pedestrian crossings.
6. **Writes** integers in decimetres with short keys, and prints a summary.

Run it with `--verbose` to see every building-part decision.

The format is defined, with comments, in `src/world/zone/format.ts`. A change that an
older build could not read needs a new `ZONE_FORMAT_VERSION`. Adding a kind of point, as
Phase 2 did for crossings, does not: builds that do not know the kind ignore it.

### What the game does with it

Besides the buildings, streets and parks you can see, the baked data decides:

- **Where vehicles are parked** (`src/vehicles/placement.ts`): matatus and boda bodas at
  each stage, cars in the mapped car parks, a few cars and bodas at each fuel station, and
  cars along the kerbs of streets wide enough to park on.
- **Road paint** (`src/world/geometry/ground.ts`): lane lines from the `lanes` tag where a
  road has one and from its width where it does not, a solid centre line on roads with two
  or more lanes each way, and a zebra crossing with stop lines at each mapped crossing.

### How heights are decided

1. A `height` tag, if the building has one.
2. Otherwise `building:levels` × 3.4 m, plus a parapet.
3. Otherwise an **estimate** from the building type, the footprint size and how tall the
   tagged neighbours are, with a per-building variation so a street is not a row of
   identical boxes. A guessed building is never more than 1.25 times as tall as its
   footprint is wide. Estimated buildings are flagged `est` in the zone file.

In the CBD, 244 of 3,065 buildings have a real height. They are mostly the towers, so the
skyline is trustworthy and the side streets are a reasonable guess.

### Landmark overrides

`scripts/osm/landmarks.ts` holds hand-written fixes, keyed by OpenStreetMap id, for
buildings whose shape tags cannot express. There is one today: KICC, whose mapped outline
is really the saucer at the top of the tower. Keep the list short. If the map is wrong,
the right fix is to correct OpenStreetMap, which helps everyone, and fetch again.

## What the current map gets wrong

**It is not a fresh download.** `data/osm/nairobi-cbd.osm.json.gz` was merged from two
public GitHub repositories that hold OpenStreetMap extracts, because the build machine
could not reach OpenStreetMap. [`data/osm/README.md`](../data/osm/README.md) lists the
sources and the exact commits. The consequences:

| Problem                                           | Cause                                     | Fixed by a fresh fetch? |
| ------------------------------------------------- | ----------------------------------------- | ----------------------- |
| The Nairobi River is missing                      | Neither source included waterways         | Yes                     |
| Stretches of the Expressway lie on the ground     | One source dropped the bridge tags        | Yes                     |
| The southern and eastern edges have fewer details | Only the less detailed source covers them | Yes                     |
| The data is as old as those repositories          | They are snapshots                        | Yes                     |

Thin spots that matter more now there are roads to drive:

- **17 pedestrian crossings** are mapped in the whole CBD. The real number is far higher.
- **Lane counts** are tagged on 66 of the 1,550 drivable road pieces. The rest are
  guessed from the road's width.
- **No speed bumps** are mapped at all, so the game has none.
- **25 matatu stages** are mapped, 20 of them with a name.

A fresh fetch may improve these. Mapping them on OpenStreetMap certainly will.

Limits that a fresh fetch will **not** fix:

- **Most heights are estimates** (see above). Adding `building:levels` to buildings on
  OpenStreetMap is the lasting fix.
- **The ground is flat.** Terrain is on the roadmap.
- **Times Tower** is drawn from its mapped parts, which cover exactly half the outline.
  It reads as a stepped tower, which is right, but the podium is thin.
- **Some small buildings beside KICC** are plain outlines with no tags. The game draws
  them as low blocks. They may be kiosks, tents or nothing at all.
- **Shop fronts and window styles are invented.** They are chosen from the building's id,
  so they are stable between runs, but they say nothing about the real facade.

## Adding a zone

1. Add an entry to `ZONES` in `src/config/zones.ts` with a bounding box, or flip one of
   the planned zones to `status: 'live'`. Keep zones to a few square kilometres.
2. `npm run osm:fetch -- <zone-id>` then `npm run osm:bake -- <zone-id>`.
3. `npm run osm:preview -- <zone-id>` and open the SVG. Check that north is up and the
   streets are where you expect.
4. Add landmarks for it in `src/config/landmarks.ts` and run `npm test`.

The game currently loads one zone at a time. Loading neighbours as you approach the edge
is a roadmap item; the shared projection origin means they will already line up.

## Changing how the map looks

| To change                               | Edit                                                  | Re-bake? |
| --------------------------------------- | ----------------------------------------------------- | -------- |
| Wall, roof, road and park colours       | `src/world/geometry/palette.ts`                       | No       |
| Windows, shop fronts, night lighting    | `src/world/materials/buildingMaterial.ts`             | No       |
| Which buildings get which facade style  | `styleFor` in `src/world/geometry/buildings.ts`       | No       |
| Kerb lines, lane lines, zebra stripes   | `src/world/geometry/ground.ts`                        | No       |
| Where vehicles are parked, and how many | `src/vehicles/placement.ts`, `src/config/vehicles.ts` | No       |
| Road widths, what counts as a park      | `scripts/osm/lib/tags.ts`                             | Yes      |
| Height estimates                        | `scripts/osm/lib/heights.ts`                          | Yes      |
| Tree density                            | `src/world/geometry/trees.ts`                         | No       |
