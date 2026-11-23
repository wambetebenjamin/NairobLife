# Repository agent guidance

- Keep the playable game on the current React Three Fiber / Three.js runtime unless the user explicitly approves an engine migration.
- For Blender-authored or Blender-imported game art, read [`skills/blender-nairobi-game-art/SKILL.md`](skills/blender-nairobi-game-art/SKILL.md) before creating assets. It defines Nairobi-specific art direction, MCP/Poly Haven workflow, licensing/provenance rules, and mobile budgets.
- The Blender MCP repositories are authoring tools, not game runtime dependencies. Do not vendor their server code or add Blender binaries/API keys to the browser build.
- Use the baked OpenStreetMap world geometry as the source of truth for streets and ordinary building placement; keep Three.js fallbacks until an optimized GLB is integrated and tested.
