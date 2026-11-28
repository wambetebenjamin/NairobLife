# Nairobi world expansion: wildlife, vegetation, and transport

The current shipped world is one walkable CBD zone plus two scenic previews. The previews are not real mapped areas, and the airport, stadiums, National Park, and SGR are not yet playable destinations. A realistic expansion needs both **geographic map data** and **authored hero assets**; a set of GLBs alone cannot supply roads, runways, rail alignments, terrain, collisions, or navigation.

## Target content

### Nairobi National Park wildlife

The Kaggle notebook now searches licensed image/video references for giraffe, zebra, black rhino, buffalo, wildebeest, ostrich, lion, cheetah, eland, warthog, impala, and baboon. Search results are references, not verified species inventories; manually verify every result and model against reliable local sources. TripoSR can make static candidate meshes from one selected image per animal; it does **not** rig or animate them. For a moving, performant safari scene, prefer rigged species models with explicit licenses, or complete a Blender rig/animation pass and use LODs/instancing.

### Nairobi trees and greenery

The candidate reference queries cover umbrella thorn acacia, jacaranda, street trees, and fever trees. The game should use species-specific, low-poly LODs/instances rather than one full-resolution tree for every mapped tree. Preserve OSM tree positions and avoid putting trees on carriageways, runways, rail lines, or building footprints. Use clear source/license records for photogrammetry or imported botanical meshes.

### Real transport and destinations

- **JKIA and Mombasa Road:** `jkia` is already a planned zone in `src/config/zones.ts`; fetch/bake OSM data, then model the terminal, apron/runway details, aircraft, and the Expressway interchange as hero assets. Aircraft and service vehicles should remain static/visual until flight/airport simulation is scoped.
- **Nairobi Expressway:** the CBD map already includes part of its raised road. A continuous route toward JKIA requires corrected OSM bridge/tunnel data and additional zones; do not fake continuity between disconnected map slices.
- **Stadiums:** Nyayo, Kasarani/Moi International Sports Centre, and Talanta Sports City are outside the shipped CBD zone. Add separate small mapped zones and preserve each venue's real footprint, stands, access roads, and surrounding blocks.
- **SGR:** the current SGR view is a scenic illustration, not a mapped route. A real station/track corridor needs its own OSM zone, scale, track geometry, train length, platform clearance, and a chosen playable scope (station-only first is safer than the entire Mombasa line).
- **Kenyan traffic:** the game already has procedural matatus, nganyas, bodas, and ambient traffic. The Kaggle notebook adds Nairobi matatu/police photo references and free police-car prototypes, but generic low-poly models are not Kenyan-specific. Preserve Kenyan number plates, right-hand driving, stage/SACCO identity, and truthful police livery; do not use real insignia without review.

## Kaggle workflow prepared

`notebooks/kaggle_triposr_asset_lab.ipynb` now gathers a broad license-filtered reference set, fetches a small CC0 starter pack, and batches candidate reconstructions by wildlife/trees/transport. The user still must run it in Kaggle with Internet/GPU enabled; this sandbox cannot start Kaggle. TripoSR output is a candidate only and may be anatomically or geographically wrong. Review models and licenses before import. Use the model-only ZIP for sharing game candidates; do not put source videos into the game repository.

## Safe delivery order

1. Review media and license manifests; discard unrelated/poor references.
2. Generate and inspect one representative animal, one tree, one vehicle, and one landmark before generating the full batch.
3. Establish a good LOD/instancing/fallback path in the Three.js runtime; only then integrate a larger species/asset set.
4. Add mapped zones and bake OSM data separately from asset generation; test routes, collisions, edges, and memory costs.
5. Add a destination only after both baked map data and asset/fallback coverage exist. Run `npm run check` and test in a browser preview.

## Quality expectation

Free asset collections in this pipeline are mainly low-poly prototypes. Single-view image-to-3D is not photogrammetry: unseen sides are invented, textures/topology can be poor, and static outputs are not animations. A premium pass needs repeated review, multi-view references or a rights-cleared rigged model source, LODs, good lighting/materials, and real in-game validation.
