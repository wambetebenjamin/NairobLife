"""
The scenic preview harness re-implements buildParkTerrain() because node cannot import the
TypeScript module without a loader. That duplication is a drift risk: the picture could keep
looking fine while the shipped terrain changed underneath it.

This compares the numbers in the two files. Run it after touching either one.
"""
import re
import sys

ts = open('src/ui/scenic/parkTerrain.ts').read()
js = open('scripts/render-scenic.mjs').read()

BAND = r'\(r - (\d+)\) / (\d+)\)\) \* Math\.min\(1, Math\.max\(0, \((\d+) - r\) / (\d+)\)\)'
WAVES = r'Math\.sin\(x \* ([\d.]+)\) \* Math\.cos\(z \* ([\d.]+)\) \* band \* ([\d.]+)'


def find(pattern, src, label):
    match = re.search(pattern, src)
    if not match:
        sys.exit(f'could not find {label}')
    return match.groups()


checks = [
    ('band edges', find(BAND, ts, 'ts band'), find(BAND, js, 'js band')),
    ('wave shape', find(WAVES, ts, 'ts waves'), find(WAVES, js, 'js waves')),
]

ok = True
for label, a, b in checks:
    same = a == b
    ok = ok and same
    print(f'{"ok  " if same else "DIFF"} {label:12} {a}{"" if same else f"  vs  {b}"}')
print('RESULT', 'in step' if ok else 'DRIFTED')
sys.exit(0 if ok else 1)
