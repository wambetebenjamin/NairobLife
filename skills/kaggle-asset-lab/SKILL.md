---
name: kaggle-asset-lab
description: Prepare and run GPU-backed Kaggle notebooks for kaNAIRO free 3D asset experiments; read before exporting Kaggle-generated models into the game.
---

# Kaggle asset lab skill

## Purpose

Use Kaggle as a temporary, user-owned GPU workstation when the coding sandbox lacks GPU memory or Blender. Kaggle is an asset-authoring environment, not the game runtime or a remote service controlled from this repository. Do not claim a Kaggle run happened unless its output was actually returned and inspected.

## Before a run

1. Read `docs/KAGGLE_ASSET_WORKSPACE.md`, `docs/BLENDER_ASSETS.md`, and `skills/blender-nairobi-game-art/SKILL.md`.
2. Prefer the checked-in `notebooks/kaggle_triposr_asset_lab.ipynb` for the first free image-to-3D experiment. TripoSR is image-conditioned, not text-conditioned. Use one clean, rights-cleared input image and one candidate first.
3. User must import/run the notebook in Kaggle, enable internet and select an available GPU. Never ask for Kaggle credentials, tokens or secrets in chat or commit them to notebook/repository.
4. Check current upstream license, dependency setup, Kaggle accelerator/quotas, and model-weight terms at run time. Stop on dependency/CUDA errors rather than silently replacing Kaggle's PyTorch/CUDA stack.

## Asset acceptance

- Treat every generated model as an unapproved candidate. Verify the exact input-image rights, upstream repository commit, model/checkpoint, date, license, output size and file hashes.
- Inspect in Blender before import: orientation (`-Z` forward, `+Y` up), metres, origin at ground, normals, topology, UV/materials, alpha, texture sizes, dimensions, and intended in-game use.
- TripoSR does not create a rig or animation clips. Do not replace the animated player or instanced pedestrian crowd with its outputs without a separate tested rigging and animation pass.
- Keep output under `/kaggle/working` and download only a reviewed GLB plus provenance manifest. Do not put checkpoints, caches, source photos without rights, `.blend` backups, or Kaggle secrets in Git.
- For vehicle models, match `src/config/vehicles.ts`, existing wheel/collision/paint/light behavior, and retain procedural fallbacks. For people, retain a low-cost crowd path and avoid multiplying full-resolution skeletal models across the city.
- Add assets to `public/assets/` only when consumed by the Three.js runtime and documented in `docs/FREE_ASSETS.md` or `public/assets/ASSET_SOURCES.md`; run `npm run check` before pushing.

## Tool selection

- Use TripoSR for a free, single-image reconstruction test where a Kaggle GPU is available. It is not equivalent to paid Tripo's text-to-model pipeline.
- Consider CharacterCreator/MPFB for configurable rigged humans, after a successful clean Blender/MPFB build and an export/licensing review.
- Use Blender in batch/headless Python mode on Kaggle. Do not assume Blender MCP forks can connect to a Kaggle notebook session; MCP is an interactive Blender workflow and is not required by the notebook.
