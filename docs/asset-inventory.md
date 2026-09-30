# Asset Inventory

> Roadmap item: `asset-audit` (Phase 2). Prerequisite for `asset-compression` and for
> scoping the Phase 4 landmarks.
>
> Every number below was read directly from the committed `scene.gltf` files — triangle
> counts from accessor counts, bounding boxes from `POSITION` accessor `min`/`max`, byte
> figures from the files on disk. Sizes are **MiB** (1024²) throughout. Figures were
> independently re-derived in a second pass; the corrections from that pass are folded in.

---

## Summary of findings

Four findings change the plan:

1. **The Tiki head and Krusty Krab both exist in `bikini_bottom_map_3d_model`** and are
   extractable. Neither needs to be sourced separately. `landmark-tiki` and
   `landmark-krusty-krab` are unblocked.
2. **`sbfbb-spongebob_house` is an interior, not a Pineapple exterior.** All 60 of its
   materials are interior surfaces (`Bathroom_Carpet`, `Kitchen_Sink`, `Library_Wall`,
   `Ceiling`, `Sand_Floor`). It contains no pineapple shell. The Pineapple *landmark* must be
   extracted from the map instead. The manifest id `pineapple-house` is currently misleading.
3. **The two character models are not needed for the MVP** and are 74% of the raw payload.
   `spongebob-character` alone is 519,664 triangles — 7.4× the entire town map.
4. **The map has no per-building parent nodes, and its accessor coordinates are 100× scene
   world space.** Extraction is a node allowlist plus re-centering, and every coordinate in
   this document is in raw accessor space. See
   [Extraction mechanics](#extraction-mechanics-for-asset-compression) — this is the section
   that most constrains the `asset-compression` script.

---

## Per-model inventory

| Model | Manifest id | Triangles | Meshes | Materials | Images | `scene.bin` | Textures | Dir total |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| `bikini_bottom_map_3d_model` | `bikini-bottom-map` | 70,246 | 259 | 100 | 99 | 3.26 | 0.98 | 4.71 |
| `sbfbb-spongebob_house` | `pineapple-house` | 16,022 | 60 | 60 | 55 | 1.37 | 0.68 | 2.18 |
| `sponge_on_the_run_spongebob_base_model` | `spongebob-character` | **519,664** | 15 | 15 | 4 | 15.32 | 1.21 | 16.55 |
| `sponge_on_the_run_patrick_base_model_textured` | `patrick-character` | 65,208 | 2 | 1 | 1 | 2.99 | 0.25 | 3.24 |
| | | **671,140** | | | | **22.93** | **3.11** | **26.68** |

**Textures are not the problem.** All four models combined carry 3.11 MiB of PNG, and the
map's largest single texture is 101 KB. The payload is **geometry**: 22.93 MiB of the
26.68 MiB total — 86% — is `scene.bin`.

### Why the geometry is so large

All four models store `POSITION` and `NORMAL` as `F32/VEC3`, UVs as `F32/VEC2`, and indices
as **`U32/SCALAR`**. Additional per-vertex data:

| Model | Extra attributes |
|---|---|
| `bikini-bottom-map` | `COLOR_0` (F32/VEC4) and `TEXCOORD_1` (F32/VEC2) on **all 259 primitives** |
| `pineapple-house` | `JOINTS_0` (U16/VEC4), `WEIGHTS_0` (F32/VEC4) — it is rigged, 12 joints |
| `spongebob-character` | `TANGENT` (F32/VEC4), 38,973 entries, for its normal map |

Two free wins before any lossy step:

- **No model needs 32-bit indices.** Maximum `POSITION` count in any single primitive:
  map 3,183 · house 2,927 · spongebob 50,766 · patrick 65,532. All are under 65,536, so
  every primitive in all four files narrows to `U16` — halving 22.93 MiB of index data at
  zero quality cost. Patrick's 65,532 is only 4 vertices under the ceiling, so re-check this
  after any step that could add vertices (seam splitting, tangent regeneration).
- **`COLOR_0` on the map costs 16 bytes per vertex** across all 259 primitives. If the
  vertex colours are unused by the materials — check before assuming — `gltf-transform prune`
  removes them outright.

Meshopt quantisation (`--level medium`) targets this shape and is where the remaining bulk
of the reduction comes from, not from texture work.

---

## Landmark extraction map

The four blueprint landmarks, against what actually exists:

| Landmark | Roadmap item | Source | Status |
|---|---|---|---|
| Pineapple (about) | `landmark-pineapple` | `bikini_bottom_map` nodes | **Extractable** |
| Complaints Bureau (contact) | `landmark-bureau` | — | **Missing — author or reskin** |
| Tiki head (résumé) | `landmark-tiki` | `bikini_bottom_map` node 263 | **Extractable, single node** |
| Krusty Krab (services) | `landmark-krusty-krab` | `bikini_bottom_map`, 10 nodes | **Extractable** |

> [!IMPORTANT]
> **All coordinates below are raw accessor values.** Scene-world position is these × 0.01
> (see [Extraction mechanics](#extraction-mechanics-for-asset-compression)). Raw values are
> given because that is what a script parsing the glTF reads directly.
>
> **The `Group` column matters.** `HB01` (node 3) has six children —
> `terrain` (4), `buildings` (151), `details` (306), `level_signs` (505), `shadows` (534),
> `skybox` (541) — and several landmark parts live under `details`, not `buildings`. An
> allowlist scoped to the `buildings` subtree silently drops them.

### Pineapple — extractable

Centre `[78.85, 7.10, -10.08]` raw.

| Node | Name | Group | Tris | Include |
|---:|---|---|---:|---|
| 259 | `surface_house_spongebob2` | `buildings` | 846 | core — the shell |
| 223 | `mesh_leaf_pineapple` | `buildings` | 182 | core — the crown |
| 229 | `airlock` | `buildings` | 120 | optional — door frame |
| 247 | `object_door_blue02` | `buildings` | 80 | optional — door |
| 241 | `beach_chair` | `buildings` | 12 | optional — roof chair |
| 353 | `house_sb_flowers01` | **`details`** | 8 | optional — dressing |
| 355 | `house_sb_flowers02` | **`details`** | 16 | optional — dressing |

- **Core (259 + 223):** 1,028 tris, 2 materials, 2 images, 31 KB texture, bbox
  `7.50 × 12.50 × 7.45`.
- **With dressing (all 7):** 1,264 tris, 4 materials, 3 images, 31 KB texture, bbox
  `7.77 × 12.80 × 7.78`, centre `[78.91, 6.95, -9.92]`.

> [!WARNING]
> Do **not** use `sbfbb-spongebob_house` for this landmark. It is the pineapple *interior* —
> 16,022 triangles of furniture across 55 textures, rigged with a 12-joint skin, with no
> exterior shell. Its largest meshes are `Library_Wall`, `Ceiling`, `Sand_Floor` and
> `Netting`; its bounding box describes an open interior, not a closed pineapple. It is only
> useful if an interior walkthrough is ever added, which is not on the roadmap. Recommend
> demoting it to `minimumTier: 'high'` or dropping it from `SOURCE_ASSETS`.

### Tiki head — extractable, cleanest of the four

| Node | Name | Group | Tris | Materials | Textures |
|---:|---|---|---:|---:|---:|
| 263 | `surface_house_squidward` | `buildings` | 815 | 1 | 17 KB |

A single node with a single material. Bbox `7.13 × 11.84 × 6.80`, centre
`[65.15, 7.00, -19.21]` — 16.5 units from the Pineapple, so the two are adjacent in the
source map and extract in the same script pass.

Optional companion: node 239 `wood_purple` (40 tris) is the path slab at its base.

### Krusty Krab — extractable, but by allowlist

Ten sibling nodes under `buildings`, clustered at centre `[-55.40, 4.09, -37.53]`, bbox
`17.23 × 9.02 × 13.91`. Total **621 tris**, 8 materials, 7 images, 36 KB texture.

| Node | Name | Tris |
|---:|---|---:|
| 175 | `building_wood_krusty3` | 330 |
| 187 | `building_wood_krusty2` | 91 |
| 209 | `mesh_krustykrab_net` | 76 |
| 183 | `mh_krustycrabwd5` | 60 |
| 173 | `rope` | 22 |
| 181 | `m_krustycrabwin4` | 16 |
| 171 | `krustycrabflg1` | 10 |
| 179 | `_krustycrabdor` | 8 |
| 177 | `_krustycrabwin` | 4 |
| 185 | `me_krustycrabwin2` | 4 |

Optional but recommended: nodes 342 `krustycrabsng2` + 344 `krustycrabsng1` — the roadside
sign, 424 tris, 19 KB texture, centre `[-67.81, 10.59, -23.32]`, ~20 units away. **Both are
under `details`, not `buildings`.** The sign is more recognisable than the building itself.

With the sign: 1,045 tris, 54 KB texture.

> [!CAUTION]
> **Name matching alone selects the wrong geometry.** Eighteen non-`_mat_` nodes match
> `/krusty|krab/i`. Nine are in the table above (`rope` does not match), two are the roadside
> sign, and the remaining six belong to unrelated buildings that reuse the same texture
> atlas: 213 `krustycrabwin4` and 215 `krustycrabdor` (x ≈ −99.8), 219 `krustycrabflg`
> (x ≈ −99.0), 227 `building_wood_krusty` (x ≈ −58.6, z ≈ −7.0), 253 `krustycrabwin3`
> (x ≈ −24.3), 522 `krustykrab_net` (x ≈ +52.2). The extraction script must filter by
> **bounding-box position**, not by node name.

### Complaints Bureau — missing

No node in any bundled model is a municipal booth, kiosk, or office. This landmark has no
source geometry. Two options:

**Option A — reskin the Chum Bucket (recommended).** Nodes 199 `Chum_Bucket`, 201
`surface_chum2`, 203 `chum_hand` (all `buildings`) and 357 `chumbucket_robo_sign`
(**`details`**) — 1,357 tris, 4 materials, 33 KB texture, bbox `20.29 × 35.06 × 18.36` at
centre `[-60.57, 17.18, -0.87]`. It already reads as a squat institutional building with a
signboard, which is the silhouette a municipal bureau needs. Replacing the sign texture with
an Arabic municipal notice does the work. It stays within CC-BY (same source model, same
credit) and matches the art direction's rule that geometry may read as the trend while copy
must not read as licensed merchandise.

**Option B — author it.** A booth is a box, a counter, a window, and a signboard — a few
hundred triangles of primitive geometry, fully original, no licence obligation, built to the
exact proportions the overlay transition needs. Costs modelling time this project has not
budgeted.

Recommend **Option A** for the MVP, with Option B as the fallback if the reskin reads as
cartoon reference rather than civic. Either way `landmark-bureau` is **not blocked** by asset
sourcing.

---

## Extraction mechanics for `asset-compression`

Four properties of the map file constrain the pipeline script:

**1. There are no per-building parent nodes.** The hierarchy is
`Sketchfab_model > hb01.fbx > RootNode > HB01 > {terrain, buildings, details, level_signs,
shadows, skybox}`, and each group holds flat siblings that are material-atlas splits rather
than objects. `gltf-transform` cannot extract "the Krusty Krab" by node path; the script
needs an explicit node allowlist per landmark, checked against a position filter — and the
allowlist must span both `buildings` and `details`.

**2. Ancestor nodes carry a 100× scale, and geometry is world-space baked below them.**

- Node 0 `Sketchfab_model` has a matrix that is a −90° rotation about X.
- Node 1 `hb01.fbx` has a matrix combining a **0.01 uniform scale** with the counter-rotation.
- Composed, these are exactly `diag(0.01, 0.01, 0.01)` — **uniform scale, no net rotation.**
- All 154 descendants of `buildings` have fully identity local transforms. Only nodes 0, 1,
  546, 547, 549 and 550 in the entire 552-node file carry any transform at all.

So vertex data is in a world space **100× larger** than the scene's. The Pineapple sits at
raw `[78.85, 7.10, -10.08]` but scene-world `[0.789, 0.071, -0.101]`, and its 7.5-unit raw
bounding box is 0.075 units in scene space.

Two consequences the script must handle:

- Extracted sub-meshes must be **re-centered** on their bounding-box centre, with the
  original offset recorded for the landmark kernel to place them. Skipping this leaves every
  landmark's local transform meaningless and breaks hit-testing.
- A position filter written against **scene-world** coordinates will match nothing. Filter
  in raw accessor space, or bake the 0.01 scale into the geometry first and then filter.

Baking the ancestor scale into the extracted geometry (`gltf-transform` will flatten it) and
re-centering in one step is the cleaner option — it removes the trap permanently rather than
documenting it.

**3. Some nodes span the whole map.** Material-merged nodes such as 279 `house_patrick_rock`
(40.7 units wide) and 313 `mesh_porthole_big_3` (18.2 units) contain geometry from multiple
buildings in one mesh. None of the four landmark sets depend on these, but any future
extraction must check bounding-box extent before assuming a node is one object.

**4. Index width and vertex colours** — see
[Why the geometry is so large](#why-the-geometry-is-so-large). Both are free reductions that
belong before any lossy step.

### Suggested pipeline order

1. `prune` + `dedup` on the map. Confirm whether `COLOR_0` and `TEXCOORD_1` survive pruning;
   if the materials do not read them, they are pure waste.
2. Extract each landmark by node allowlist, spanning `buildings` **and** `details`, filtered
   by bounding-box position → one GLB per landmark.
3. Flatten the ancestor 0.01 scale into the geometry and re-center each landmark on its
   bounding-box centre. Record the original scene-world offset.
4. Narrow indices to `U16` — every primitive in all four models qualifies.
5. `meshopt --level medium`. Check the silhouette after: these are low-poly stylised models
   where the silhouette *is* the read, and `--level high` will visibly warp them.
6. `etc1s` the base colour maps. Skip UASTC — only `spongebob-character` has a normal map and
   it is not in the MVP.
7. `validate`, then load in the actual scene, not a viewer.

---

## Budget implications

The extracted MVP landmarks are minuscule:

| Landmark | Tris | Textures |
|---|---:|---:|
| Pineapple (with dressing) | 1,264 | 31 KB |
| Tiki head | 815 | 17 KB |
| Krusty Krab (with sign) | 1,045 | 54 KB |
| Bureau (Chum Bucket reskin) | 1,357 | 33 KB |
| **All four** | **4,481** | **134 KB** |

All four landmarks together are 6.4% of the map's triangles. Even uncompressed they sit well
inside the 0.5–2 MB per-landmark guidance. **The landmarks are not the payload problem** —
the environment geometry and the unused character models are.

### Recommended manifest changes

Proposals for `asset-compression` to act on, not changes made by this item:

- Split `bikini-bottom-map` into per-landmark entries with their own budgets, keeping the raw
  map as the shared source. A single 1.5 MB budget for the whole map hides which landmark
  regressed.
- Reclassify `spongebob-character` (16.55 MiB, 519,664 tris) and `patrick-character`
  (3.24 MiB, 65,208 tris) as lazily loaded and excluded from the initial-load budget. Neither
  is an MVP landmark. If either is ever placed in-scene it needs decimation *before*
  compression — Meshopt will not rescue a half-million-triangle character.
- Correct or rename `pineapple-house`; the id implies an exterior the asset does not contain.
- `sourceBytes` in the manifest are round numbers (`5.0 * MB`, `2.3 * MB`, `17 * MB`,
  `3.3 * MB`). Actual directory totals are 4.71, 2.18, 16.55 and 3.24 MiB. Worth correcting
  so `perf-budget` compares against real figures.

> [!IMPORTANT]
> All four models stay in `SOURCE_ASSETS` and keep their CC-BY-4.0 attribution regardless of
> whether they ship. Compressed and extracted outputs are derivative works carrying the same
> licence terms, so extracting the Tiki head from the map does not detach it from the
> `bikini-bottom-map` credit.
