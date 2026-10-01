# asset-pipeline

Compresses the raw models under `assets/` into the web-ready GLBs under `apps/web/public/models/`,
and fails when any output is over its byte budget. The outputs are **committed**; the site never
builds them at deploy time.

```
npm run assets:compress    # build every asset, write placements.json + the report table, then verify
npm run assets:verify      # re-read the committed GLBs and check them; builds nothing
```

Both run from a clean checkout with `npm install` and nothing else (no native tools, no network).

## What it does

The asset list, paths and budgets come from `WEB_ASSETS` and `SOURCE_MODELS` in
`@qa3elhamor/world-domain` (`libs/world/domain/src/lib/asset-manifest.ts`). This tool never edits them.

1. **Drift check.** Every `WEB_ASSETS` entry must have a recipe here, and every recipe an entry,
   or the run fails. A `.glb` in `models/` that the manifest does not list fails both commands; delete it or add the asset.
2. **Region check.** Every allowlisted landmark node must match the audit: its bounding-box centre
   within 1 raw unit of the measured `nodeCentres` value and inside the part's (tight) region, its
   bbox diagonal under `maxNodeDiagonal`, and the part's union bbox within 10% of the audited size and
   1.5 units of the audited centre. No node may be claimed twice and landmark ids must be unique.
   Selection is by node index, never by name (six non-Krusty-Krab nodes match `/krusty|krab/i`), and
   a nearby node that is wrong, such as 227 beside the Chum Bucket, fails on its centre.
3. **Extract** (map only). `environment` is the map with every landmark node removed. Each landmark
   is its allowlisted nodes. The map's ancestors apply a uniform 0.01 scale; it is baked into the
   vertices, so outputs are in scene-world units with no ancestor transform.
4. **Re-centre** (landmarks). Geometry is moved so its bounding-box centre is the origin. The
   scene-world position it came from is recorded as `offset` in `placements.json`; `environment`
   and the whole-model assets have `offset: null` (already in place).
5. `dedup` + `prune`; drop JOINTS/WEIGHTS streams when no skin remains; `weld` and `simplify`
   where configured; `join` by material where configured.
6. Textures to WebP (max 1024 px, quality 80 unless overridden). See below.
7. Meshopt `medium` (reorder, quantise, `EXT_meshopt_compression`). Indices are written as U16
   automatically because every primitive has fewer than 65,535 vertices (Patrick's 65,532 is
   checked by the same rule; the writer would fall back to U32 otherwise and the size shows it).
8. **Verify.** Everything is built and verified in memory first, and only written if all of it passes.
   Each GLB is re-read with the Meshopt decoder registered; it must parse,
   contain triangles, and be at most `budgetBytes`.

Per-asset knobs (`join`, `weld`, `simplify`, `stand`, `dropNormalMaps`, `bakeVertexColours`,
`maxTextureSize`, `textureQuality`) live in the
`OPTIONS` table in `compress.ts`. Output is deterministic: two runs give byte-identical files.

### Narrator LODs (`spongebob-narrator`, `patrick-narrator`)

Talking-narrator versions of the two characters, cut from the raw sources: about 12k and 10k
triangles, 139 KB and 62 KB. Both are lazy, `medium` tier, stood on the ground (`stand`: feet at y = 0,
bounding box centred on x/z, facing +z, source units) with the height recorded as `standingHeight` in
the manifest and `height` in `placements.json`. `verify` fails when an output is not standing at the
origin, differs from `standingHeight` by more than 1%, or is over its `triangleBudget`.

- `simplify` is attribute-aware (`simplifyAttributeAware`): UV and normal error count, not only
  position. glTF-Transform's own `simplify` ignores UVs and opened dark slits in SpongeBob's face.
  `ratioByMaterial` keeps more triangles on the face-bearing meshes (the body skin cracks at 1-2%).
- Patrick's texture is one flat colour per quad, every quad its own UV island, which pins the
  simplifier at 16k triangles however hard it is asked. `bakeVertexColours` samples that colour at
  each triangle's UV centroid onto `COLOR_0`, smooths the quad-border normal splits, and drops the
  texture. Same look at 3 to 6 m, 62 KB, no texture fetch.
- `dropNormalMaps` removes SpongeBob's normal map and tangents; invisible at that distance.
- Before/after captures and the tuning notes: `.ptah/specs/narrators/`.

### Two deliberate departures from `meshopt({ level: 'medium' })`

Both are in `compressGeometry` in `pipeline.ts`:

- Normals are quantised to 8 bits, not 10. Ten-bit normals are stored as int16 and barely compress.
- Skinned models (`pineapple-interior`) are quantised against one scene-wide volume and their then
  identical skins are merged. Per-mesh volumes make glTF-Transform clone the skin once per mesh
  (60 skins, about 100 KB of JSON and inverse-bind data).

`high` is not used: it visibly warps these low-poly silhouettes.

## Texture format: WebP, not KTX2

The brief prefers KTX2 (ETC1S) and says to fall back to WebP when the KTX-Software `ktx` binary is
not installed and cannot be installed at user level. On the machine this was built on `ktx`/`toktx`
were absent, and the only Windows package (`KTX-Software-4.4.2-Windows-x64.exe`) is an installer that
writes to Program Files and edits the system PATH. So outputs use `EXT_texture_webp` via `sharp`.

The cost of that choice is small: the four raw models carry 3.11 MiB of PNG in total, and the
whole initial-load set ships about 0.28 MiB of WebP. The GPU-memory advantage of KTX2 matters more
for large atlases than for these.

**To switch to KTX2 later:** `@gltf-transform/functions` 4.x no longer ships a `toktx` transform; it
only exists in `@gltf-transform/cli`, which shells out to `ktx`. Install KTX-Software, then replace
the `textureCompress({ targetFormat: 'webp' })` step in `optimise` (`pipeline.ts`) with a KTX2 encode
(`gltf-transform etc1s` on the intermediate GLB, or `toktx` per texture with `--encode etc1s` for
base colour), register `KHRTextureBasisu` (already in `ALL_EXTENSIONS`), copy the Basis transcoder
from `node_modules/three/examples/jsm/libs/basis/` into `apps/web/public/basis/`, and wire
`KTX2Loader` as described in `docs/asset-compression-report.md`. Note that the clean-checkout
guarantee above then needs the `ktx` binary on `PATH`.

## Adding or changing an asset

Add the entry to `WEB_ASSETS` (owned by `libs/world/domain`), then add a recipe here: a landmark
goes in `landmarks.ts` with its nodes and region; a whole model goes in `WHOLE_MODEL_IDS` and, if it
needs knobs, `OPTIONS` in `compress.ts`. Run `npm run assets:compress` and commit the outputs, the
updated `placements.json` and the updated table in `docs/asset-compression-report.md`.

## Licence

Every output is a derivative of a CC-BY-4.0 source model and carries that model's credit: a landmark
extracted from `bikini_bottom_map_3d_model` keeps the map's attribution, exactly as the map itself
does. Credits are keyed by `sourceModel` in `ATTRIBUTIONS`
(`libs/world/domain/src/lib/attribution.ts`); the licence texts are in each `assets/*/license.txt`.
Extracting or compressing does not detach an output from its source's credit.
