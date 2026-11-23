# Blender asset workflow

The game remains on its React Three Fiber / Three.js runtime. Blender is used as an **asset-authoring tool**, not embedded as a second game engine: export optimized glTF 2.0 (`.glb`) models, then load selected assets through Three.js. Keep current OSM-driven buildings and tree meshes as the scalable fallback for the full city; use authored Blender models for hero landmarks, close-up vegetation, and wildlife.

## Tooling references

The project-specific, agent-readable Blender skill is in [`skills/blender-nairobi-game-art/SKILL.md`](../skills/blender-nairobi-game-art/SKILL.md); the reusable selected-object exporter is `scripts/blender/export_selected_glb.py`. The upstream tools are intentionally **not vendored** into the game bundle. Install them in a local Blender workspace when Blender/MCP is available:

- [ahujasid/mcp-for-blender](https://github.com/ahujasid/mcp-for-blender) — Blender MCP server and add-on.
- [dorialn68/blender-mcp-enhanced](https://github.com/dorialn68/blender-mcp-enhanced) — animation / rigging-oriented MCP fork.
- [Poly-Haven/polyhavenassets](https://github.com/Poly-Haven/polyhavenassets) — Blender asset-browser add-on.
- [Poly-Haven/Public-API](https://github.com/Poly-Haven/Public-API) — Poly Haven API reference for reproducible, license-aware asset downloads.
- [Poly Haven MCP integration guide](https://www.mcp-for-blender.com/docs/integrations/poly-haven).

Choose one MCP server (do not run both forks against the same Blender instance). In a local Blender-capable environment, follow the selected project’s current setup steps; the upstream `uvx mcp-for-blender setup` command is documented by its maintainers. `mcp.json.example` contains a no-secret configuration sample for the primary server; copy its `mcpServers.blender` entry into the MCP client config your editor actually uses (do not assume every client reads this repo file). Confirm Blender and the MCP server can exchange a simple scene command before making assets.

## Asset rules for this game

1. Use real Nairobi OSM geometry for streets and ordinary building footprints; keep textures/models for landmarks and close-range detail rather than replacing the entire CBD with disconnected props.
2. Use Poly Haven assets only when their exact asset ID, license, and source URL are recorded. Their assets are CC0; preserve source metadata and avoid fetching large HDRIs at runtime.
3. Prefer 1–2K textures for game assets, baked lighting where it helps, simple collision proxies, and LODs for vegetation. Do not ship 8K/16K source textures.
4. Export `.glb` into `public/assets/` only when it is actually consumed by the game. Keep `.blend` working files and caches local; the repository ignores them.
5. Give each model a Three.js fallback until the optimized asset is committed, so missing art never breaks the playable scene.

## Current asset status

- Streets and building footprints come from the committed, baked OpenStreetMap CBD data. Building massing and city trees are generated and chunked by the project’s own pipeline to preserve location accuracy and performance.
- The national-park preview uses Three.js-built acacias, giraffes, and zebras. Blender/MCP is not installed in the coding environment, so no third-party binaries or unverified Poly Haven downloads are checked in yet.
- The Blender references above are an optional local authoring workflow, not runtime dependencies. Do not add an MCP server or editor dependency to `package.json`.
