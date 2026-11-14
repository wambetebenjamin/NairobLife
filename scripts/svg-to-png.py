"""Rasterise the flat-filled SVG that render-scenic.mjs writes. There is no cairo here.

Two things about SVGRenderer's output, both established by experiment rather than by reading:

* Its y axis points **up** (raising an object in world space makes its SVG y more negative),
  so subtracting the viewBox origin is all that is needed -- no flip.
* Triangles of the same colour are merged into one <path> with several subpaths, so each
  `M...L...z` run must be filled separately. Splitting on "M" loses the first vertex of every
  triangle unless the letter is kept.
"""
import re
import sys

from PIL import Image, ImageDraw

svg = open('/tmp/scenic.svg').read()
W = int(re.search(r'width="(\d+)"', svg).group(1))
H = int(re.search(r'height="(\d+)"', svg).group(1))
vb = [float(v) for v in re.search(r'viewBox="([-\d. ]+)"', svg).group(1).split()]
bg = re.search(r'background-color: rgb\((\d+), (\d+), (\d+)\)', svg)
im = Image.new('RGB', (W, H), tuple(int(g) for g in bg.groups()) if bg else (255, 255, 255))
d = ImageDraw.Draw(im)

filled = 0
for m in re.finditer(r'<path d="([^"]+)"\s+style="fill:rgb\((\d+), ?(\d+), ?(\d+)\)', svg):
    colour = (int(m.group(2)), int(m.group(3)), int(m.group(4)))
    for run in re.findall(r'M[^M]*', m.group(1)):
        # No y flip. Verified two ways: raising a cube in world space makes its SVG y more
        # negative, and the ground lands in the bottom band of the frame this way.
        pts = [
            (float(a) - vb[0], float(b) - vb[1])
            for a, b in re.findall(r'[ML]([-\d.e]+),([-\d.e]+)', run)
        ]
        if len(pts) >= 3:
            d.polygon(pts, fill=colour)
            filled += 1

out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/scenic.png'
im.save(out)
print(f'RESULT filled {filled} triangles -> {out}')
