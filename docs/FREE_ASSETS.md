# Free 3D assets for kaNAIRO

Tripo is not part of the asset plan: this project should first use free, openly licensed assets and keep paid generation optional.

## Selected sources

### People — rubberneck-assets

- Repository: https://github.com/kimhongjae94/rubberneck-assets
- Its `ASSETS.md` identifies the MakeHuman system source and exported human models as CC0 1.0, and records individual model sizes. The Rosa model is a 668,968-byte GLB in the current upstream tree and has an African female appearance.
- It is a limited set, not a diverse Nairobi crowd. The current GLBs have rigged skins but no animation clips (Rosa was inspected: eight skins, zero animations). Therefore these models must not replace the animated player or instanced walking crowd as-is. A static waiting character is a possible later use after visual/scale review.
- Do not confuse the exported CC0 models with the repository's GPL tooling.

### Vehicles — shooter-asset-library

- Repository: https://github.com/Touhid-HZ/shooter-asset-library
- Its README and attribution files describe the collection as CC0, with Kenney and Quaternius sources. It includes car, van, truck and character GLBs. Choose only models that fit the game's existing stylized low-poly look; this library is not photorealistic.
- Individual examples include `assets/vehicles/q-cars-normalcar1.glb` and `assets/vehicles/k-car-van.glb`. These are prototypes, not a convincing Nairobi matatu or a photorealistic vehicle fleet.

### Optional higher-detail cars — carros

- Repository: https://github.com/pedrosoandre/carros
- The repository reports 530 car GLBs with CC-BY / CC-BY-SA licenses. It can be used without paying, but it is not attribution-free: record the exact per-model source and license before bringing any model into the game. The reported collection is about 2.1 GB, so do not clone or bundle the whole set.

## Integration constraints

The project currently draws pedestrians as instanced custom geometry and its vehicle fleet as instanced custom geometry with per-instance paint, lamp shaders, steering wheels, collision dimensions and procedural fallbacks. Importing a GLB is not a drop-in replacement: the models need fitting to the existing rigs/animation and wheel/paint/material interfaces. Do not replace these systems or ship large model collections just to show a static demo asset.

Before integration, preview and validate a single selected GLB, its source/license, orientation, scale, materials, download size and performance. Preserve the current procedural/instanced meshes as fallbacks. For any bundled asset, record the exact upstream path, commit, model identifier, license, attribution (if applicable), and modifications in this document.

## Integrated model

- **Rosa** from `rubberneck-assets/models/rosa.glb` is bundled at `public/assets/characters/rosa.glb` (668,968 bytes; upstream Git blob `402fca90fe957e244894bb0a2997cae27ce97357`; SHA-256 `1ca48564cbc62d37ca17bd311feb5113c5cc71d532d147771afccefedf9c82ae`). The upstream asset record identifies this exported model as CC0 1.0. It is loaded with Three.js meshopt support and used for one nearby, static pavement pedestrian. The selected procedural pedestrian is omitted to avoid overlap; the rest of the crowd remains instanced and animated.
- **Compact car** from `shooter-asset-library/assets/vehicles/q-cars-normalcar1.glb` is bundled at `public/assets/vehicles/cc0-compact-car.glb` (175,680 bytes; upstream Git blob `a2e1e8ccd801a97d015a78028496aca381342538`; SHA-256 `98382199485863106d9790315778e9625d20af0117f6f19772bf28b4670c1621`). The repository identifies its assets as CC0. It replaces the procedural mesh for one car only; it follows the existing Fleet physics/collision pose, remains enterable/drivable, and the rest of the traffic stays instanced. Existing procedural cars remain the fallback for every other vehicle. The imported model is stylized low-poly, not photorealistic; its baked wheels do not spin independently.

The paid Tripo workflow is deferred. Free assets are integrated incrementally without removing existing fallbacks. This first pass is a single detailed person and one showcase compact car, not a full realistic crowd/fleet.
