#!/usr/bin/env python3
"""Export the current Blender selection as a game-ready glTF binary.

Example:
  blender --background art/nairobi_landmarks.blend \
    --python scripts/blender/export_selected_glb.py -- \
    --output public/assets/kicc-tower.glb

The game must only reference the output after it has been committed and integrated.
"""
from __future__ import annotations

import argparse
import os
import sys

import bpy


def parse_args() -> argparse.Namespace:
    argv = sys.argv
    user_args = argv[argv.index("--") + 1 :] if "--" in argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, help="Output .glb path")
    args = parser.parse_args(user_args)
    if not args.output.lower().endswith(".glb"):
        parser.error("--output must end in .glb")
    return args


def main() -> None:
    args = parse_args()
    selected = [obj for obj in bpy.context.selected_objects if obj.type in {"MESH", "ARMATURE"}]
    if not any(obj.type == "MESH" for obj in selected):
        raise SystemExit("Select at least one mesh (and its armature, if animated) before export.")

    output = os.path.abspath(args.output)
    os.makedirs(os.path.dirname(output), exist_ok=True)
    result = bpy.ops.export_scene.gltf(
        filepath=output,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_animations=True,
        export_materials="EXPORT",
    )
    if "FINISHED" not in result or not os.path.isfile(output):
        raise SystemExit(f"glTF export failed: {result}")
    print(f"Exported {len(selected)} selected objects to {output}")


if __name__ == "__main__":
    main()
