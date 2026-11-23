---
name: blender-nairobi-game-art
description: Use Blender MCP and Poly Haven to author optimized, license-tracked Nairobi buildings, indigenous trees, and wildlife for kaNAIRO. Read before creating or importing any Blender asset.
---

# Blender skill: Nairobi game art

Use this skill when asked to make or improve a building, tree, landmark, vehicle prop, or animal in kaNAIRO. The deliverable is a small, production-ready glTF asset plus its source metadata—not a large `.blend` file or an untracked screenshot.

## Repository context

- This is a React Three Fiber / Three.js game, not a Blender runtime. Export glTF 2.0 binary (`.glb`) and consume it with Three.js; never require Blender at player runtime.
- Real road lines, building footprints, trees, and terrain bounds come from the baked Nairobi OpenStreetMap data and game geometry pipeline. Preserve their locations and collision contracts. A Blender asset should add believable detail at a selected landmark / close-range subject, not replace accurate city placement with a generic model.
- Keep generated or imported assets optional until the game loader and a lightweight fallback are implemented. Do not leave a broken path to a missing model.
- Keep asset size appropriate for mobile: target under 2 MB per hero GLB, use 1K–2K textures, compress textures/meshes when supported, and do not ship 8K/16K HDRIs.

## Toolchain

Choose **one** Blender MCP implementation per Blender session:

1. Primary: [ahujasid/mcp-for-blender](https://github.com/ahujasid/mcp-for-blender) (MIT). Its current upstream quickstart uses `uvx mcp-for-blender setup`; check upstream instructions before setup because commands can change.
2. Alternative: [dorialn68/blender-mcp-enhanced](https://github.com/dorialn68/blender-mcp-enhanced) (MIT), useful when rigging, keyframes, or Poly Haven integration are the main task. Do not run it alongside the primary server on the same port.
3. Optional Blender asset-browser plugin: [Poly-Haven/polyhavenassets](https://github.com/Poly-Haven/polyhavenassets) (GPL-3.0).
4. API reference: [Poly-Haven/Public-API](https://github.com/Poly-Haven/Public-API) (AGPL-3.0); use it only for API behavior, not as code to copy into the game.
5. For the MCP workflow with Poly Haven, use the [Poly Haven integration guide](https://www.mcp-for-blender.com/docs/integrations/poly-haven).

The upstream repos are references/tools and are **not vendored into the shipped game**. Their licenses differ; do not copy GPL/AGPL implementation code into the project. Third-party runtime assets must have an explicit license and source record.

## Art direction

Make Nairobi recognizable and grounded rather than generically futuristic. Use field references for materials and proportions; keep sign text sparse, legible, and relevant. Avoid oversized floating text, novelty billboards, or decorative signage with invented gibberish. Do not add a billboard unless a specific OSM place or real source justifies it.

### Buildings

- Prefer Nairobi-specific references: KICC, Times Tower, City Hall, Kenyatta Avenue shopfronts, CBD arcades, and the relevant building's real facade proportions.
- Model one landmark at a time. Use a correct silhouette, facade rhythm, window depth, roofline, and restrained material palette. Preserve OSM placement and rotation in-game.
- Use efficient repeated facade geometry or trim sheets for windows; keep glass roughness believable, not mirror-black. Use real dimensions and a simple collision proxy.
- Record which source reference informed the shape. Do not present a made-up facade as a photogrammetric replica.

### Trees

- Match Nairobi street / park planting: umbrella acacia in park scenes; appropriate palms, jacaranda, and evergreen forms where the source data supports them.
- Build a few reusable LODs. Keep trunks/canopies separate where collision or wind is needed; avoid dense leaf geometry. Supply a compact wind pivot/vertex-color convention if the game shader will sway it.
- Never place trees inside roads or buildings; defer to the existing baked placement and collision validation.

### Animals

- Use local species appropriate to the scene (e.g. giraffe and zebra in the Nairobi National Park preview). Keep anatomy and scale credible; use smooth silhouettes, restrained fur/coat detail, and rig only when a game animation will consume it.
- For animated animals, use a small idle/walk loop with foot contact and export the active action in glTF. Avoid an armature if the scene only needs static preview animals.

## Poly Haven asset handling

When using the MCP's Poly Haven search/import tools:

1. Search only for the material/HDRI/asset needed for the actual scene. Prefer CC0 Poly Haven assets; capture the exact asset ID and original URL.
2. Use a small game-ready resolution (normally 1K or 2K), not the default maximum. Avoid HDRIs as giant game textures; bake or use a compact environment source.
3. Keep a provenance record in `public/assets/ASSET_SOURCES.md` with filename, Poly Haven asset ID, source URL, license, selected resolution, and any modifications.
4. Do not commit caches, source archives, `.blend` backups, renders, or 8K+ textures. Commit only optimized assets referenced by application code.

## Build / export workflow

1. Read this skill and `docs/BLENDER_ASSETS.md`; inspect the existing Three.js fallback and the intended in-game scale before modeling.
2. Use Blender MCP to create or refine the scene. Name the deliverable collection `KANAIRO_<asset-name>` and keep helper lights/cameras out of the exported selection.
3. Apply transforms, set origin at the asset's ground contact, orient forward as `-Z` and up as `+Y`, and remove hidden/unused objects.
4. Export selected objects as `.glb` under `public/assets/`. `scripts/blender/export_selected_glb.py` is a convenience exporter for a saved `.blend` scene.
5. Add/retain a Three.js fallback; load the GLB through the project's asset-loader conventions and test its scale, shadows, material color space, animation, and loading failure path.
6. Run `npm run check`. Include source/license metadata for every external image or model.

## Do not

- Add the Blender MCP server, Blender binary, or Poly Haven API key as a browser dependency.
- Commit `.blend` files or generated 3D binaries unless the game actually uses the optimized asset.
- fetch arbitrary Google/image-search results as textures without confirming rights and provenance.
- Invent Nairobi geography, put text-heavy billboards in the city, or use huge high-resolution textures that harm mobile loading.
