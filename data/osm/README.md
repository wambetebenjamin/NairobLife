# Raw map data

`nairobi-cbd.osm.json.gz` is the raw OpenStreetMap extract for the CBD zone, in the JSON
format the Overpass API returns. `npm run osm:bake` turns it into
`data/zones/nairobi-cbd.json`, which is the file the game loads.

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), licensed
under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

## Where this file came from

It was **not** downloaded straight from OpenStreetMap. The first version of the game was
built on a machine that could not reach the Overpass API, so the file was assembled from
two public GitHub repositories that already contained OpenStreetMap extracts of central
Nairobi:

| Source                                                                                        | Commit    | Files                                                         | Coverage                                                  |
| --------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------- | --------------------------------------------------------- |
| [drwjkirkpatrick-web/ascii-city](https://github.com/drwjkirkpatrick-web/ascii-city)           | `559d536` | `ascii_city/data/nairobi_osm.json`                            | Raw Overpass JSON, every tag. 36.810 to 36.825 E, 1.280 to 1.290 S |
| [Samuel-Kasusya/nairobi-3d-city](https://github.com/Samuel-Kasusya/nairobi-3d-city)           | `120478a` | `data/nairobi-buildings.geojson`, `data/nairobi-roads.geojson` | GeoJSON, fewer tags. 36.810 to 36.830 E, 1.275 to 1.295 S |

`provenance/make_seed.py` is the script that merged them, and running it on those files
reproduces this file exactly. Where both sources describe the same object, the first one
wins because it keeps every tag. The result holds 32,047 nodes, 5,456 ways and 12
relations.

What that means in practice:

- The data is real OpenStreetMap data, but it is a snapshot of whenever those two
  repositories were made, not of today.
- Objects that came only from the GeoJSON source have made-up negative node ids, and only
  the tags that repository chose to keep.
- Neither source included waterways, so the Nairobi River is missing.
- Parts of the Nairobi Expressway came from the GeoJSON source without their bridge tags,
  so some of the deck sits on the ground.

## Replacing it with a fresh download

On any machine with normal internet access:

```bash
npm run osm:fetch -- nairobi-cbd   # download from the Overpass API (one request)
npm run osm:bake                   # rebuild data/zones/nairobi-cbd.json
npm test                           # checks the new map still fits the game
```

Commit both changed files. A fresh download fixes every limitation listed above. The fetch
script has not yet been run against the live Overpass API (see `docs/DATA.md`), so read
its output the first time.
