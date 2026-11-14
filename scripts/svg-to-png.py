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

# First positional arg is the output PNG; an optional second is the input SVG. It used to
# hardcode /tmp/scenic.svg, which silently rasterised the wrong file for any other caller.
out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/scenic.png'
source = sys.argv[2] if len(sys.argv) > 2 else '/tmp/scenic.svg'
svg = open(source).read()
W = int(re.search(r'width="(\d+)"', svg).group(1))
H = int(re.search(r'height="(\d+)"', svg).group(1))
vb = [float(v) for v in re.search(r'viewBox="([-\d. ]+)"', svg).group(1).split()]
bg = re.search(r'background-color: rgb\((\d+), (\d+), (\d+)\)', svg)
im = Image.new('RGB', (W, H), tuple(int(g) for g in bg.groups()) if bg else (255, 255, 255))
d = ImageDraw.Draw(im)

# Paths are drawn in document order, and SVGRenderer has already depth-sorted them. A
# semi-transparent path must be COMPOSITED onto everything drawn before it, not filled
# opaquely -- the diorama's haze veil is 441 paths at fill-opacity 0.16 to 0.64, and filling
# those solid drew grey slabs over the towers and called it haze. Each translucent triangle is
# therefore rasterised onto its own layer and alpha-composited back.
PATH = re.compile(r'<path d="([^"]+)"\s+style="fill:rgb\((\d+), ?(\d+), ?(\d+)\)(?:;fill-opacity:([\d.]+))?')

filled = 0
blended = 0
for m in PATH.finditer(svg):
    colour = (int(m.group(2)), int(m.group(3)), int(m.group(4)))
    alpha = float(m.group(5)) if m.group(5) else 1.0

    polys = []
    for run in re.findall(r'M[^M]*', m.group(1)):
        # No y flip. Verified two ways: raising a cube in world space makes its SVG y more
        # negative, and the ground lands in the bottom band of the frame this way.
        pts = [
            (float(a) - vb[0], float(b) - vb[1])
            for a, b in re.findall(r'[ML]([-\d.e]+),([-\d.e]+)', run)
        ]
        if len(pts) >= 3:
            polys.append(pts)

    if not polys:
        continue

    if alpha >= 0.999:
        for pts in polys:
            d.polygon(pts, fill=colour)
            filled += 1
    else:
        layer = Image.new('RGB', (W, H), colour)
        mask = Image.new('L', (W, H), 0)
        md = ImageDraw.Draw(mask)
        for pts in polys:
            md.polygon(pts, fill=int(round(alpha * 255)))
        im.paste(layer, (0, 0), mask)
        blended += 1
        filled += len(polys)

im.save(out)
print(f'RESULT filled {filled} triangles ({blended} composited) -> {out}')
