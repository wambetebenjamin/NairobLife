#!/usr/bin/env python3
"""
Draw a top-down plan of an exported .glb, to check it without opening Blender.

    python3 scripts/glb-preview.py dist/export/nairobi-cbd.glb docs/notes/img/city-export.png

This is deliberately not a renderer. It pulls POSITION and COLOR_0 out of the binary
chunk and rasterises every triangle flat, seen from above, shaded by how steep it is --
so roofs come out bright and walls dark, which is enough to tell whether the city is
upright, the right shape, and in the right place. If the plan is wrong, something is
wrong; if it is right, that proves nothing about lighting or materials.

No dependencies beyond numpy and Pillow.
"""
import json
import struct
import sys

import numpy as np
from PIL import Image

COMPONENT = {5120: "i1", 5121: "u1", 5122: "i2", 5123: "u2", 5125: "u4", 5126: "f4"}
WIDTH = {5121: 1, 5123: 2, 5125: 4, 5126: 4}
SIZE = max(1400, 1200)  # long edge of the output, in pixels


def read_glb(path):
    """Split a binary glTF into its JSON and its BIN chunk."""
    with open(path, "rb") as f:
        data = f.read()
    magic, version, length = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67:
        raise SystemExit(f"{path} is not a .glb (magic 0x{magic:08x})")
    if version != 2:
        raise SystemExit(f"{path} is glTF version {version}, expected 2")
    if length != len(data):
        raise SystemExit(f"{path} declares {length} bytes but is {len(data)}")
    off = 12
    gltf, blob = None, None
    while off < len(data):
        size, kind = struct.unpack_from("<II", data, off)
        body = data[off + 8 : off + 8 + size]
        if kind == 0x4E4F534A:
            gltf = json.loads(body.decode("utf-8"))
        elif kind == 0x004E4942:
            blob = body
        off += 8 + size
    if gltf is None or blob is None:
        raise SystemExit(f"{path} is missing its JSON or BIN chunk")
    return gltf, blob


def accessor(gltf, blob, index):
    """An accessor as a numpy array, flattened to (count, components)."""
    acc = gltf["accessors"][index]
    view = gltf["bufferViews"][acc["bufferView"]]
    fmt = COMPONENT[acc["componentType"]]
    width = WIDTH[acc["componentType"]]
    count = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[acc["type"]]
    start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    span = acc["count"] * count * width
    if start + span > view.get("byteOffset", 0) + view["byteLength"]:
        raise SystemExit(f"accessor {index} runs past its bufferView")
    flat = np.frombuffer(blob, dtype=np.dtype("<" + fmt), count=acc["count"] * count, offset=start)
    return flat.reshape(acc["count"], count)


def triples(gltf, blob):
    """Every triangle in the file: its three world positions and one colour."""
    positions, colours, indices = [], [], []
    vertex_base = 0
    for mesh in gltf["meshes"]:
        for prim in mesh["primitives"]:
            attrs = prim["attributes"]
            if "COLOR_0" not in attrs:
                continue
            pos = accessor(gltf, blob, attrs["POSITION"]).astype(np.float32)
            col = accessor(gltf, blob, attrs["COLOR_0"]).astype(np.float32)
            if col.shape[1] == 4:
                col = col[:, :3]
            idx = (
                accessor(gltf, blob, prim["indices"]).ravel().astype(np.int64)
                if "indices" in prim
                else np.arange(len(pos), dtype=np.int64)
            )
            if idx.size % 3:
                raise SystemExit(f"primitive in {mesh.get('name')} has {idx.size} indices, not a multiple of 3")
            positions.append(pos)
            colours.append(col)
            indices.append(idx + vertex_base)
            vertex_base += len(pos)
    if not positions:
        raise SystemExit("no primitives with COLOR_0: nothing to draw")
    pos = np.concatenate(positions)
    col = np.concatenate(colours)
    idx = np.concatenate(indices).reshape(-1, 3)
    corners = pos[idx]  # (triangle, corner, xyz)
    return corners, col[idx].mean(axis=1), corners[:, :, 1].mean(axis=1)


def draw(tris, tint, y):
    """Rasterise flat, seen from above. Y is up, so X runs east and Z runs south."""
    # The game is in linear space; lift to sRGB so the picture matches what a viewer shows.
    srgb = np.where(tint <= 0.0031308, tint * 12.92, 1.055 * np.power(np.clip(tint, 0, None), 1 / 2.4) - 0.055)
    srgb = np.clip(srgb, 0, 1)

    flat = abs(y.max() - y.min()) < 1e-6
    if flat:
        shade = np.ones(len(tris), dtype=np.float32)
    else:
        # How horizontal each triangle is: a roof faces up, a wall faces out.
        shade = np.clip((y - y.min()) / (y.max() - y.min()) * 0.75 + 0.45, 0.45, 1.2)
    rgb = np.clip(srgb * shade[:, None], 0, 1)

    x = tris[:, :, 0]
    z = tris[:, :, 2]
    x0, x1 = x.min(), x.max()
    z0, z1 = z.min(), z.max()
    span = max(x1 - x0, z1 - z0) or 1.0
    scale = (SIZE - 40) / span
    w = int(round((x1 - x0) * scale)) + 40
    h = int(round((z1 - z0) * scale)) + 40

    px = (x - x0) * scale + 20
    pz = (z - z0) * scale + 20

    # Painter's order: low ground first, then roads, then the buildings on top.
    order = np.argsort(y)
    img = np.full((h, w, 3), 1.0, dtype=np.float32)

    for t in order:
        ax, ay = px[t, 0], pz[t, 0]
        bx, by = px[t, 1], pz[t, 1]
        cx, cy = px[t, 2], pz[t, 2]
        area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
        if abs(area) < 0.5:  # thinner than a pixel: it would only be noise
            continue
        lo_x = max(0, int(np.floor(min(ax, bx, cx))))
        hi_x = min(w - 1, int(np.ceil(max(ax, bx, cx))))
        lo_y = max(0, int(np.floor(min(ay, by, cy))))
        hi_y = min(h - 1, int(np.ceil(max(ay, by, cy))))
        if hi_x < lo_x or hi_y < lo_y:
            continue
        gx, gy = np.meshgrid(np.arange(lo_x, hi_x + 1) + 0.5, np.arange(lo_y, hi_y + 1) + 0.5)
        w0 = ((bx - ax) * (gy - ay) - (by - ay) * (gx - ax)) / area
        w1 = ((cx - bx) * (gy - by) - (cy - by) * (gx - bx)) / area
        w2 = ((ax - cx) * (gy - cy) - (ay - cy) * (gx - cx)) / area
        inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        if inside.any():
            img[lo_y : hi_y + 1, lo_x : hi_x + 1][inside] = rgb[t]
    return np.flipud(img)


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__.strip().splitlines()[2].strip())
    src, out = sys.argv[1], sys.argv[2]

    gltf, blob = read_glb(src)
    tris, tint, y = triples(gltf, blob)
    print(f"{src}: {len(tris):,} triangles, {len(gltf['meshes'])} meshes")
    print(f"  extent  x {tris[:,:,0].min():.0f}..{tris[:,:,0].max():.0f} m, z {tris[:,:,2].min():.0f}..{tris[:,:,2].max():.0f} m")
    print(f"  height  y {y.min():.1f}..{y.max():.1f} m")

    img = draw(tris, tint, y)
    Image.fromarray((img * 255).astype(np.uint8)).save(out)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
