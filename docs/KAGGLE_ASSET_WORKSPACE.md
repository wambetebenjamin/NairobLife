# Kaggle asset workspace plan

## Recommendation from the prior asset discussions

Yes—Kaggle can supply a GPU notebook for image-to-3D work that this coding sandbox cannot run. This repository cannot start or control a Kaggle session: the owner must import the notebook, select a GPU accelerator, and enable internet in Kaggle. Kaggle sessions are temporary; save outputs from `/kaggle/working` as notebook outputs / a dataset, then bring selected `.glb` files back to this repository for review. Do not store Kaggle tokens, Tripo credentials, or other secrets in the notebook or game repo.

### Best first model: TripoSR, not the paid Tripo CLI

- [VAST-AI-Research/TripoSR](https://github.com/VAST-AI-Research/TripoSR) is a public, MIT-licensed image-to-3D model (the repository states that the license covers source and pretrained models). Its documented single-image inference uses about 6 GB VRAM, which is a realistic Kaggle GPU notebook experiment where an accelerator is available.
- TripoSR is **image-to-3D**, not text-to-3D. Use a clean, front/three-quarter reference image on a plain background. It can infer unseen sides; it does not guarantee vehicle correctness, clean topology, a controllable humanoid rig, animation, or production quality. Generate one candidate first, review it, and only then batch.
- The included notebook `notebooks/kaggle_triposr_asset_lab.ipynb` clones the public repo and saves GLB outputs in `/kaggle/working/nairoblife-assets/`. Its commands are a starter recipe and have not been executed on Kaggle; Kaggle driver, PyTorch, network and dependency versions can change.
- [TencentARC/InstantMesh](https://github.com/TencentARC/InstantMesh) (Apache-2.0 repo license) is a secondary research option for multi-view image reconstruction. It is heavier and has a more involved setup, so try TripoSR first. Check model/data terms and current notebook instructions before commercial use.

### Existing free assets and generator options

- [rubberneck-assets](https://github.com/kimhongjae94/rubberneck-assets): CC0 exported MakeHuman characters, compact GLBs. Rosa is already used for one stationary pedestrian in this branch; it has no animation clips, so it is not a full moving-crowd solution.
- [shooter-asset-library](https://github.com/Touhid-HZ/shooter-asset-library): CC0 low-poly models. One compact car GLB is already used for a drivable showcase car; good fit for prototyping the current stylized art, not photorealism.
- [CharacterCreator](https://github.com/kblood/CharacterCreator): Blender/MPFB-based character generator. Its source tooling is GPL-3.0-or-later while its documented generated assets are CC0. This may be a better path for varied, rigged people than reconstructing them from a single image, but it needs a separate Blender/MPFB setup and a test build in Kaggle before adoption.
- [pedrosoandre/carros](https://github.com/pedrosoandre/carros): a reported 530-car set, around 2.1 GB, with model-specific CC-BY / CC-BY-SA terms. Not recommended to bulk-copy into Kaggle or the game; download only a chosen model after recording its exact license and attribution.

## Which Blender repositories / skill to use in Kaggle

- Read [`skills/blender-nairobi-game-art/SKILL.md`](../skills/blender-nairobi-game-art/SKILL.md) and [`docs/BLENDER_ASSETS.md`](BLENDER_ASSETS.md) before adapting generated models. Those are the project-specific art direction and integration contract.
- Kaggle notebooks are batch/headless environments. The Blender MCP repositories ([ahujasid/mcp-for-blender](https://github.com/ahujasid/mcp-for-blender) or [dorialn68/blender-mcp-enhanced](https://github.com/dorialn68/blender-mcp-enhanced)) are designed around an interactive Blender/MCP connection; do **not** assume those MCP servers can run in a Kaggle notebook. If Blender is required there, use Blender's background Python mode / the repo's exporter scripts. Do not run both MCP forks in one Blender session.
- `scripts/blender/export_selected_glb.py` is a useful project exporter, but it expects Blender and an authored `.blend` scene. TripoSR can export GLB itself; use Blender for inspection, orientation, origin, scale, materials, optimization and cleanup, not as a runtime dependency.

## Safe handoff back to the game

1. In Kaggle, save candidate outputs and their source image, prompt/notes, source repo commit, model/checkpoint, license and date in a candidate folder.
2. Download only a reviewed GLB; inspect it in Blender. Match project conventions (metres, Y-up, forward -Z, origin at ground contact), target under 2 MB for a hero asset when practical, and use simple collision proxies.
3. Before commit, prove that the model is consumed by the React Three Fiber runtime, preserve procedural fallbacks, and record provenance in `docs/FREE_ASSETS.md` or `public/assets/ASSET_SOURCES.md`.
4. Run `npm run check`. Do not commit Kaggle notebook caches, model checkpoints, input photos without rights, `.blend` backups, or entire asset repositories.

## Account / runtime limitations

Kaggle access and accelerator availability depend on the user's Kaggle account, current platform quotas, and notebook settings. Internet must be enabled to clone public GitHub code and download pretrained weights. A failed GPU allocation or package install should not be bypassed by exposing credentials. This sandbox cannot verify the Kaggle account, run the notebook remotely, or upload results into Kaggle on the user's behalf.
