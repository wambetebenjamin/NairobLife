# Reference photographs

These are real photographs of Nairobi National Park and the Nairobi CBD. They exist so that
the diorama's palettes, proportions and haze can be checked against something observed
rather than against memory.

**This directory is reference only. No image here is shipped in the built game, drawn as a
texture, or used as an asset.** The game builds its geometry from OpenStreetMap and its
colours from the measurements recorded below.

## Why these and not others

Every photo here was chosen because its licence permits redistribution in a public
repository. Searching for "Nairobi National Park" mostly returns Adobe Stock, Getty and
iStock results, and those are **not** usable: their preview images are still copyright the
photographer or agency, and committing one to a public repo would be a licence violation,
not a citation. They were used to check a measurement and then discarded. If a photo is not
in this directory, assume it was not licensed for distribution.

## The images

### `giraffe-skyline-haze.jpg`

- **Subject** A lone Maasai giraffe with the Nairobi skyline directly behind it.
- **Author** Mkimemia (English Wikipedia)
- **Date** 16 October 2006
- **Source** https://commons.wikimedia.org/wiki/File:A_lone_giraffe_in_Nairobi_National_Park.jpg
- **Licence** [CC BY-SA 3.0 Unported](https://creativecommons.org/licenses/by-sa/3.0/deed.en), also GFDL 1.2+
- **Why it matters** This is the composition the diorama is trying to hit: game in the
  foreground, city immediately behind. It is also the clearest example of atmospheric haze
  washing the towers toward the sky, which the diorama had no implementation of at all.

### `skyline-savannah-overcast.jpg`

- **Subject** The Nairobi skyline seen from the park's savannah on an overcast afternoon.
- **Author** Timothy A. Gonsalves ([User:Tagooty](https://commons.wikimedia.org/wiki/User:Tagooty))
- **Date** 4 May 2019, 15:01
- **Source** https://commons.wikimedia.org/wiki/File:Nairobi_Skyline_Savannah_Kenya_May19_R1600687.jpg
- **Licence** [CC BY-SA 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/deed.en)
- **Why it matters** The honest counterweight to the more dramatic photos: under flat light
  the skyline is small on the horizon and nearly colourless. Useful for not over-tuning the
  diorama against a golden-hour shot and calling it a bug.

### `acacia-tree.jpg`

- **Subject** A mature flat-topped acacia in Amboseli National Park.
- **Author** Skymani87
- **Date** 1 June 2019, 15:33
- **Source** https://commons.wikimedia.org/wiki/File:Acacia_tree_in_Amboseli_National_Park.jpg
- **Licence** [CC BY-SA 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/deed.en)
- **Why it matters** The canopy reference. A real acacia crown is a flat, spreading umbrella
  on a forked trunk — nowhere near a sphere.

### `kicc.jpg`

- **Subject** The Kenyatta International Convention Centre, the tower at the world origin
  (`WORLD_ORIGIN` in `src/config/zones.ts` is KICC itself).
- **Author** K.Gituma ([User:Mwenjew](https://commons.wikimedia.org/wiki/User:Mwenjew))
- **Date** 16 September 2012, 15:01
- **Source** https://commons.wikimedia.org/wiki/File:KICC-.JPG
- **Licence** [CC BY-SA 3.0 Unported](https://creativecommons.org/licenses/by-sa/3.0/deed.en)
- **Why it matters** The landmark the skyline is anchored on, in daylight, for silhouette and
  colour.

## Changes made

All four were resized so the long edge is at most 1200 px and re-encoded as JPEG at quality
88, to keep the repository small. No cropping, colour grading or retouching. CC BY-SA asks
that modifications be indicated, so: **resized and re-compressed**.

## Measurements taken from these

Recorded here so the next person does not have to redo the sampling. Reference values for
buildings and grass come from `giraffe-skyline-haze.jpg`; the sky figure comes from
`skyline-savannah-overcast.jpg`, because the giraffe photo is dominated by a hazy upper sky.

| Quantity | Observed | Diorama before |
| --- | --- | --- |
| Sky saturation | **0.06** (near-neutral, overcast) | 0.29 (too blue) |
| Building luminance ÷ grass luminance | **1.18** (haze lifts buildings above the straw) | 0.93 (buildings darker than the ground) |
| Building saturation | **0.02** (almost grey) | 0.17 (too coloured) |
| Grass | `rgb(172,137,83)`, sat **0.52** | `rgb(187,157,87)`, sat 0.53 |

The single largest error they exposed was not colour: the diorama had **no distance haze at
all**, so a 26 m tower and a 5 m rock were equally crisp and the city looked pasted onto the
grass rather than standing in the same air.
