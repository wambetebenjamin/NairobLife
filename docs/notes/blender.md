# Getting the city into Blender (and why the MCP cannot live here)

The project ships the city as glTF, so it opens in Blender without any add-on:

```sh
npm run osm:export
# File > Import > glTF 2.0  ->  dist/export/nairobi-cbd.glb
```

That is the whole recipe. **3,072 buildings, 2,330 trees, 769,937 triangles, 34 MB**, in
metres, Y-up, X east and Z south — no axis fixing, no scaling. Colours arrive as a
`COLOR_0` attribute, so set the viewport shading to _Material Preview_ or plug the
attribute into Principled BSDF to see the city painted.

## The Blender MCP

[mcp-for-blender](https://github.com/ahujasid/mcp-for-blender) lets a _language model
driving an MCP client on your machine_ build and edit a scene by talking to a running
Blender. It is three pieces, and only the middle one runs on your side:

| Piece                | Where it runs      | What it needs                                          |
| -------------------- | ------------------ | ------------------------------------------------------ |
| MCP client           | your machine       | an agent/IDE that speaks MCP                           |
| `blender_mcp` server | your machine       | Python `mcp`, `httpx`; a socket port                   |
| `addon.py`           | **inside Blender** | `import bpy`, the add-on enabled, the listener started |

Two consequences, stated plainly because they are easy to misread:

1. **It is not something this repository can add.** The server is a bridge. It has no
   geometry to build with and no Blender of its own; the add-on imports `bpy`, so it only
   exists inside a live Blender session. Nothing can be "vendored in".
2. **A licence is not the obstacle.** The project is MIT. The obstacle is transport: this
   sandbox has no MCP connection to offer, and no runnable Blender (see below).

If you want it working, it has to be on the machine with Blender installed: install the
add-on, enable it, click _Start MCP Server_, run the Python server, then point your MCP
client at it. The `.glb` above is the piece this repository can contribute, and it means
an agent on that machine can start from the real city instead of an empty scene.

## Why `bpy` could not be installed here

Python's `bpy` wheel (374 MB) does install cleanly, but importing it needs seven system
libraries — `libXrender.so.1`, `libXfixes.so.3`, `libXi.so.6`, `libxkbcommon.so.0`,
`libSM.so.6`, `libICE.so.6`, `libGL.so.1` — and there is no reachable source for them:
apt has no network even with root, no PyPI wheel (pyopengl, pyglet, moderngl, pygame,
vispy, vtk, PySide6) bundles them, and every Blender mirror returns nothing. Only
`libX11.so.6` was present, which is not enough.

This is a sandbox constraint, not a project one. On a normal desktop, Blender is a
package install.

## What is still not a mesh

The export carries geometry and colour. It does not carry the two things the pipeline's
later steps need:

- **No LODs, no lightmaps.** One dense mesh per 400 m block. Good for Blender work; not
  yet what UE5 wants for streaming.
- **No imagery.** The pipeline's steps 2–4 need photographs and video of the real
  buildings, which is physical capture, not something a script can supply.
