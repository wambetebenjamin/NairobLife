"""
How data/osm/nairobi-cbd.osm.json.gz was first made. Kept for the record; you should not
need to run it. The normal way to get map data is `npm run osm:fetch` (see ../README.md).

It merges two public OpenStreetMap extracts of central Nairobi into one file in Overpass
API JSON format, so that scripts/osm/bake.ts can treat it exactly like a live Overpass
download. It was written because the machine that built the first version of the game
could not reach the Overpass API.

Sources (both are conversions of OpenStreetMap data, (c) OpenStreetMap contributors, ODbL):
  A  github.com/drwjkirkpatrick-web/ascii-city @ 559d536   ascii_city/data/nairobi_osm.json
     raw Overpass JSON with full tags; bbox 36.810,-1.290 .. 36.825,-1.280
  B  github.com/Samuel-Kasusya/nairobi-3d-city @ 120478a   data/nairobi-buildings.geojson
                                                           data/nairobi-roads.geojson
     GeoJSON with reduced tags; bbox 36.810,-1.295 .. 36.830,-1.275 (roads padded)

Where both sources have the same object, A wins because it keeps every tag. Objects that
exist only in B have no node ids in GeoJSON, so their nodes get made-up negative ids.
Housekeeping tags (addresses, phone numbers, edit notes) are dropped to keep the file small.

Usage:
  python3 make_seed.py nairobi_osm.json nairobi-buildings.geojson nairobi-roads.geojson out.osm.json.gz
"""
import json, gzip, math, re, sys, collections

if len(sys.argv) != 5:
    sys.exit(__doc__)
A = json.load(open(sys.argv[1]))
B_BLD = json.load(open(sys.argv[2]))
B_RDS = json.load(open(sys.argv[3]))

def ckey(lon, lat):
    return (round(lon * 1e7), round(lat * 1e7))

nodes = {}            # id -> {lat, lon, tags?}
coord_to_node = {}    # ckey -> id
ways = []             # {id, nodes, tags}
relations = []
used_way_ids = set()
_neg = [0]
def new_id():
    _neg[0] -= 1
    return _neg[0]

def node_for(lon, lat):
    k = ckey(lon, lat)
    i = coord_to_node.get(k)
    if i is None:
        i = new_id()
        coord_to_node[k] = i
        nodes[i] = {'lat': lat, 'lon': lon}
    return i

DROP_TAG = re.compile(r'^(name:(?!sw$|en$)[\w-]+|old_name:.*|.*:wikidata|wikidata|wikipedia|.*:wikipedia|source(:.*)?|check_date(:.*)?|created_by|note|fixme|FIXME|website|phone|email|contact:.*|opening_hours|internet_access(:.*)?|addr:.*|survey:date|start_date|description|operator:.*|brand:.*|payment:.*)$')
def clean(tags):
    return {k: v for k, v in (tags or {}).items() if not DROP_TAG.match(k)}

def ring_sig(coords):
    """(centroid lon, centroid lat, area m2) of a lon/lat ring."""
    k = 111320.0; c = math.cos(math.radians(-1.285))
    pts = [(lon * k * c, lat * k) for lon, lat in coords]
    a = 0.0
    for i in range(len(pts) - 1):
        a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1]
    n = max(1, len(coords) - 1)
    return (sum(p[0] for p in coords[:n]) / n, sum(p[1] for p in coords[:n]) / n, abs(a) / 2)

class SigIndex:
    """Find polygons that are (nearly) the same footprint: centroid within ~1.5 m, area within 6%."""
    def __init__(self): self.grid = collections.defaultdict(list)
    def _cell(self, lon, lat): return (round(lon * 5e4), round(lat * 5e4))   # ~2.2 m cells
    def add(self, sig):
        self.grid[self._cell(sig[0], sig[1])].append(sig)
    def has(self, sig):
        cx, cy = self._cell(sig[0], sig[1])
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for s in self.grid.get((cx + dx, cy + dy), ()):
                    d = math.hypot((s[0] - sig[0]) * 111320, (s[1] - sig[1]) * 111320)
                    if d < 1.5 and abs(s[2] - sig[2]) <= 0.06 * max(s[2], sig[2], 1.0):
                        return True
        return False

stats = collections.Counter()

# ---------------------------------------------------------------- source A (full tags)
for sid, n in A['nodes'].items():
    i = int(sid)
    rec = {'lat': n['lat'], 'lon': n['lon']}
    t = clean(n.get('tags'))
    if t: rec['tags'] = t
    nodes[i] = rec
    coord_to_node.setdefault(ckey(n['lon'], n['lat']), i)

a_building_ids = set()
a_bld_sigs = SigIndex()
a_area_sigs = SigIndex()
a_hw_segs = set()
a_rail_segs = set()
for w in A['ways']:
    wid = int(w['id']); t = clean(w['tags']); nds = [int(x) for x in w['nodes']]
    ways.append({'id': wid, 'nodes': nds, 'tags': t}); used_way_ids.add(wid)
    coords = [(nodes[x]['lon'], nodes[x]['lat']) for x in nds]
    closed = len(nds) >= 4 and nds[0] == nds[-1]
    if 'building' in t or 'building:part' in t:
        a_building_ids.add(wid); stats['A buildings'] += 1
        if closed: a_bld_sigs.add(ring_sig(coords))
    elif 'highway' in t or 'railway' in t:
        segs = a_hw_segs if 'highway' in t else a_rail_segs
        for p, q in zip(coords, coords[1:]):
            kp, kq = ckey(*p), ckey(*q)
            segs.add((kp, kq)); segs.add((kq, kp))
        stats['A highways' if 'highway' in t else 'A rail'] += 1
    else:
        stats['A other ways'] += 1
        if closed: a_area_sigs.add(ring_sig(coords))

# ---------------------------------------------------------------- source B buildings
def bld_tags(p):
    t = {}
    if p.get('part'):
        t['building:part'] = 'yes'
        if p.get('building') and p['building'] != 'yes': t['building'] = p['building']
    else:
        t['building'] = p.get('building') or 'yes'
    if p.get('name'): t['name'] = p['name']
    def num(v): return ('%g' % v)
    if p.get('height') is not None: t['height'] = num(p['height'])
    if p.get('levels') is not None: t['building:levels'] = num(p['levels'])
    if p.get('minHeight') is not None: t['min_height'] = num(p['minHeight'])
    if p.get('minLevel') is not None: t['building:min_level'] = num(p['minLevel'])
    return t

def emit_ring_way(coords, tags, wid=None):
    nds = [node_for(lon, lat) for lon, lat in coords]
    if wid is None or wid in used_way_ids: wid = new_id()
    used_way_ids.add(wid)
    ways.append({'id': wid, 'nodes': nds, 'tags': tags})
    return wid

for f in B_BLD['features']:
    p = f['properties']; rings = f['geometry']['coordinates']
    if p['id'] in a_building_ids:
        stats['B buildings: same OSM id as A (skipped)'] += 1; continue
    if a_bld_sigs.has(ring_sig(rings[0])):
        stats['B buildings: same footprint as A (skipped)'] += 1; continue
    t = bld_tags(p)
    if len(rings) == 1:
        emit_ring_way(rings[0], t, p['id']); stats['B buildings added (way)'] += 1
    else:
        members = [{'type': 'way', 'ref': emit_ring_way(rings[0], {}), 'role': 'outer'}]
        for hole in rings[1:]:
            members.append({'type': 'way', 'ref': emit_ring_way(hole, {}), 'role': 'inner'})
        relations.append({'id': new_id(), 'members': members, 'tags': dict(t, type='multipolygon')})
        stats['B buildings added (multipolygon)'] += 1

# ---------------------------------------------------------------- source B roads / rail / parks
for f in B_RDS['features']:
    p = f['properties']; g = f['geometry']
    if p['kind'] == 'park':
        ring = g['coordinates'][0]
        if a_area_sigs.has(ring_sig(ring)):
            stats['B parks: same as A (skipped)'] += 1; continue
        t = {'leisure': 'park'}
        if p.get('name'): t['name'] = p['name']
        emit_ring_way(ring, t); stats['B parks added'] += 1
        continue
    coords = g['coordinates']
    known = a_rail_segs if p['kind'] == 'rail' else a_hw_segs
    t = {'railway': 'rail'} if p['kind'] == 'rail' else {'highway': p['class']}
    if p.get('name'): t['name'] = p['name']
    # keep only the runs of segments that source A does not already have
    run = []; kept_any = False; dropped_any = False
    def flush():
        global kept_any
        if len(run) >= 2:
            nds = [node_for(lon, lat) for lon, lat in run]
            ways.append({'id': new_id(), 'nodes': nds, 'tags': dict(t)})
            kept_any = True
    for a, b in zip(coords, coords[1:]):
        if (ckey(*a), ckey(*b)) in known:
            dropped_any = True
            flush(); run = []
        else:
            if not run: run = [a]
            run.append(b)
    flush()
    kind = 'rail' if p['kind'] == 'rail' else 'roads'
    if kept_any and dropped_any: stats[f'B {kind}: partly in A (remainder added)'] += 1
    elif kept_any: stats[f'B {kind} added'] += 1
    else: stats[f'B {kind}: already in A (skipped)'] += 1

# ---------------------------------------------------------------- write Overpass-format JSON
used = set()
for w in ways: used.update(w['nodes'])
elements = []
for i, n in nodes.items():
    if i in used or n.get('tags'):
        e = {'type': 'node', 'id': i, 'lat': n['lat'], 'lon': n['lon']}
        if n.get('tags'): e['tags'] = n['tags']
        elements.append(e)
for w in ways:
    e = {'type': 'way', 'id': w['id'], 'nodes': w['nodes']}
    if w['tags']: e['tags'] = w['tags']
    elements.append(e)
for r in relations:
    elements.append({'type': 'relation', 'id': r['id'], 'members': r['members'], 'tags': r['tags']})

out = {
    'version': 0.6,
    'generator': 'Kanairo seed (merged public OSM extracts; see docs/DATA.md)',
    'osm3s': {'copyright': 'The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.'},
    'elements': elements,
}
raw = json.dumps(out, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
dst = sys.argv[4]
with gzip.GzipFile(dst, 'wb', compresslevel=9, mtime=0) as fh:
    fh.write(raw)

for k in sorted(stats): print(f'  {stats[k]:6d}  {k}')
tc = collections.Counter(e['type'] for e in elements)
print('elements:', dict(tc), '| raw %.2f MB' % (len(raw) / 1e6))
