# What is blocking each open roadmap item

`ROADMAP.md` says what is planned. This file says, for each item still open, **what
actually stands in the way** — because most of them are not blocked by code, and the
difference matters when deciding what to do next. Measured 2026-11-12.

Three kinds of blocker:

- **Code** — it is a software problem, and this repository can do it.
- **Data** — the information does not exist in the map extract (or not in the zone).
- **Environment** — it needs hardware or network this working environment does not have.
- **Outside** — it needs a person, a licence, or a device that is not software at all.

## Phase 1

| Item                                                | Blocker         | Detail                                                                                                                                                                                                                                                      |
| --------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live OSM download instead of the committed snapshot | **Environment** | `npm run osm:fetch` is written and tested for its failure paths but has never returned real data: every Overpass mirror returns `000` from here. If the code has a bug, nobody has seen it work. Run it on a machine with egress and read the bake summary. |
| Play-test on real phones, Safari, Firefox           | **Outside**     | Needs devices and hands. Touch and gamepad decoding are covered by tests; nothing has been held.                                                                                                                                                            |

## Phase 2

| Item                                           | Blocker                | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Speed bumps                                    | **Data**               | Measured in the committed extract: **0** `traffic_calming` tags in the whole CBD. There is nothing to build from. They also need mapping on OSM, or a survey.                                                                                                                                                                                                                                                                                                                             |
| Raised pavements with kerbs                    | **Code**               | The player steps over 0.5 m (tested) and vehicles would climb 0.15 m. What is missing is the kerb geometry and collider. This one is genuinely doable here — but a live collider under every pavement is exactly the kind of change that needs to be _seen_, and there is no browser in this environment. High risk of shipping an invisible bug.                                                                                                                                         |
| Damage and roll-overs                          | **Code**               | Needs a real rigid body for the driven vehicle only. The arcade model is deliberately separate, so this can be added without touching the rest (see ARCHITECTURE decisions).                                                                                                                                                                                                                                                                                                              |
| Hand-painted matatu art, readable route boards | **Outside**            | Art. The boards need text, and the text needs a native speaker's pass (below).                                                                                                                                                                                                                                                                                                                                                                                                            |
| Load Rapier's WASM as its own file             | **Code, but not free** | Measured: the WASM on disk is **1.50 MB raw, 0.56 MB gzip**; base64-inlined in `rapier.mjs` it makes a **2.13 MB** chunk that gzips to **0.80 MB**. So the saving is real on the wire (~0.24 MB gzip) but smaller than the raw figures suggest, because base64 of compressed data still gzips well. Making it happen means replacing `RAPIER.init()` with a URL fetch, which is a load-path change that cannot be verified without a browser — the same class of risk as the kerbs below. |

## Phase 3

| Item                              | Blocker     | Detail                                                                  |
| --------------------------------- | ----------- | ----------------------------------------------------------------------- |
| Sheng reviewed by native speakers | **Outside** | Explicitly waiting on a person. Do not ship the draft as authoritative. |

## Phase 4

| Item                                                | Blocker                 | Detail                                                                                                                                                                                                                                         |
| --------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| More zones (Upper Hill, Westlands, Kilimani, JKIA…) | **Data + Environment**  | Each zone is a bounding box plus a fetch. The boxes exist in `config/zones.ts`; the fetch needs Overpass. Without it there is no new extract, so no new zone. **This is the single item that unblocks the most.**                              |
| Terrain: the real slope                             | **Data**                | `BASE_ELEVATION_M = 1661` and a flat ground plane, with `TODO(terrain)` in two places. SRTM/FABDEM both need network (all mirrors `000`). The extract has **4** `ele` tags in 37,515 elements, so it cannot be derived from what is committed. |
| Water that looks like water; the Nairobi River      | **Code**                | There are 26 water areas in the baked zone but no water material or flow. Buildable here.                                                                                                                                                      |
| Simpler distant buildings (LOD)                     | **Code, but premature** | The `TODO(lod)` gates this on _more than one zone loaded_. With one zone, there is nothing distant to simplify. Doing it now would be optimising a case the game cannot reach.                                                                 |
| Rigged character model, with outfits                | **Outside**             | Needs artist-made glTF with animation clips. The procedural figure is the fallback until then.                                                                                                                                                 |

## Phases 5 and 6

| Item                                                  | Blocker              | Detail                                                                                                                                                                                                                                     |
| ----------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Accounts, saved progress, seeing players, chat, rooms | **Infrastructure**   | Needs a backend. Supabase is the plan and `.env.example` names the variables, but there is no project provisioned and no schema. `vehicles/fleet.ts` already keeps vehicle state as plain numbers and stable ids _because_ this is coming. |
| Battle royale: zone, loot, bots, health, spectating   | **Code, downstream** | Depends on the health/gameplay layer that does not exist yet. `TODO(hud)` in `Hud.tsx` reserves space for it.                                                                                                                              |

## The engine question

Not in the roadmap. Scoped separately in [UE5-SCOPING.md](UE5-SCOPING.md); the short
version is that it is blocked by the same data as everything else, which is why it is not
the next thing to do.

---

## What that adds up to

Of 20 open items: **4 are code that could be done here** (damage, water, LOD — with
caveats — and the Rapier split), **5 need data or network that is unreachable**, **4 need a
person or a device**, and the rest are downstream of those. Two more sit in between: the
kerb geometry and the Rapier split are both _writeable_ but both change a runtime load path
or add a live collider, and neither can be checked without a browser.

Two things follow:

1. **Most "code" tasks here are not as free as they look.** The ones that only add a
   material or a number (water, damage with a single rigid body) are safely doable. The
   ones that change _how the game boots_ or _what the player collides with_ are not, and
   the distinction is worth more than a line in a backlog.
2. **Nothing that changes how Nairobi looks can be finished here.** Heights, terrain,
   new zones and splats all need the same missing thing: a machine that can reach
   OpenStreetMap. That is worth saying once, plainly, rather than attempting each item and
   reporting the same failure.
