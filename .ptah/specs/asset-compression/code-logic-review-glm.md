# Code Logic Review — asset-compression pipeline (`tools/asset-pipeline/`)

**Verdict: APPROVED** — **Score: 7/10** (sound; guard-strength and swallowed-failure gaps worth fixing)

Reviewer: code-logic-reviewer (independent, read-only). Scope: `compress.ts`, `pipeline.ts`,
`landmarks.ts`, `verify.ts`, `report.ts`, `README.md`. Verified against
`docs/asset-inventory.md` ("Landmark extraction map", "Extraction mechanics", Krusty Krab
CAUTION) by reading the installed `@gltf-transform/*` sources, running `npm run assets:verify`
(passes, exit 0), and running two read-only probe scripts against the source map and the
committed GLBs. `assets:compress` was NOT run (as instructed); the determinism claim
(README:40) is therefore untested.

## What was verified correct (evidence, not approval language)

1. **Allowlists match the audit exactly** — `landmarks.ts:42` (Pineapple 259,223,229,247,241,353,355),
   `landmarks.ts:54` (Tiki 263), `landmarks.ts:64` (Krab 175,187,209,183,173,181,171,179,177,185) +
   `landmarks.ts:70` (sign 342,344), `landmarks.ts:82` (Bureau 199,201,203,357) — all 25 nodes match
   the inventory tables node-for-node. Tiki's optional slab node 239 (`wood_purple`) is deliberately
   omitted; the audit marks it "Optional companion", so that is a documented choice, not drift
   (the slab stays in `environment`).
2. **The bbox assertion really runs and discriminates.** It executes on every compress run
   (`compress.ts:98`, inside the `!verifyOnly` branch) and PASSES on the real map. Probe: the six
   CAUTION trap nodes measure (raw units, from `getBounds`/0.01): 213 → 50.8, 215 → ~51, 219 → ~48,
   227 → 30.7, 253 → ~45, 522 → ~107 from the Krusty-Krab part centre (radius 15) — all would fail.
   `getBounds` is world-space (core `dist/index.js:455-468` applies `getWorldMatrix`), so dividing by
   `RAW_TO_WORLD` (`pipeline.ts:120-123`) compares raw-against-raw correctly.
3. **0.01 flattening and re-centring are correct.** `clearNodeParent` sets the node matrix to its
   world matrix and re-attaches it to its ancestor scene (functions `dist/index.js:384-392`, with
   `listNodeScenes:350-360` walking to the root); `clearNodeTransform` then bakes that local (= world)
   matrix into the vertices (functions `dist/index.js:1587-1597`). Shared meshes are cloned first
   (`pipeline.ts:113-115`). Committed evidence: `environment.glb` scene bbox centre is `(0, 0.562, 0)` —
   world units, not raw; each landmark GLB's bbox centre is `(0, 0, 0)`; `placements.json` offsets equal
   the audit centres × 0.01 to 4 decimals (e.g. pineapple `[0.7891, 0.0695, −0.0992]` = raw
   `[78.91, 6.95, −9.92]` × 0.01; bureau `[-0.6057, 0.1718, −0.0087]` exact). Environment and landmarks
   share the same world convention (both fully baked), so `landmark_at(offset)` reproduces the original
   position. The internal quantize dequantization node transforms left by `quantize` are benign — the
   scene bbox, not vertex coords, is what the consumer offsets.
4. **Environment excludes exactly the landmark nodes.** Probe: map total = **70,246** triangles =
   environment 65,765 + landmarks 4,481 (1,264 + 815 + 1,045 + 1,357 — each matching the audit's
   per-landmark figure exactly). No duplicated geometry, nothing extra dropped. (Node disposal only
   detaches meshes — `GraphNode.dispose` destroys edges, not shared children — and the `prune()` at
   `pipeline.ts:367` reaps the orphaned landmark meshes.)
5. **Budget and exit behaviour.** `verifyAsset` throws on a missing file (`stat`), zero triangles, and
   over-budget bytes (`verify.ts:17-23`); failures are collected and re-thrown (`compress.ts:118-122`);
   `main().catch` → `process.exit(1)` (`compress.ts:152-155`). `assertNoDrift` runs in BOTH modes
   (`compress.ts:92`) and throws on recipe/manifest mismatch, duplicate manifest ids, and bad
   `compressedPath` shape (`compress.ts:58-74`). **Meshopt really decodes**: `EXTMeshoptCompression.preread`
   decodes every compressed buffer view eagerly during `io.readBinary` (extensions `dist/index.js:786-807`),
   registered as required in `createIO` — a corrupt payload fails the read, so `verify.ts:18` is a real
   decode, not a JSON parse.
6. **U16, simplify, skins.** All seven committed GLBs use index componentType 5123; the writer narrows
   by `maxIndex < 65535` (core `dist/index.js:4859`), which Patrick's 65,532 verts satisfies
   (output 65,208 tris). `spongebob-character`'s source contains no `"skins"` string — it is **not
   skinned**, so simplification cannot break skinning; 519,664 → 77,936 = ratio 0.1495 ≈ the configured
   0.15. `pineapple-interior` (skinned): 60/60 primitives retain JOINTS_0+WEIGHTS_0, 60 skin refs merge
   into one 12-joint skin with inverse-bind matrices present — `mergeIdenticalSkins` did its job and the
   scene-volume quantize left the skins mergeable.
7. **Windows paths** are uniformly `resolve`d (`compress.ts:27-29,51-54,104,146`; `verify.ts:16`); the
   whole flow ran green on this Windows machine.
8. **`npm run assets:verify`** prints OK and exits 0 today: environment 1,169,620/1,228,800 (95%),
   all others well under budget.

## Defects

### 1. Extra output files never fail anything (moderate)

- **File:** `compress.ts:76-81` (`removeStaleOutputs`, runs only when building, deletes silently), `compress.ts:91-121` (verify path has no directory check)
- **Scenario:** a landmark is removed from `WEB_ASSETS` but its `.glb` is left committed. `npm run assets:compress` silently deletes it; `npm run assets:verify` — the only CI-style gate — passes. The task contract says the process "fails … on manifest drift (missing/extra outputs)": missing outputs fail (`stat` throws → exit 1), extra outputs never do. A stale committed file ships forever or trips a reviewer.
- **Fix:** in verify mode, `readdir(modelsDir)`, and throw if the `.glb` set differs from `WEB_ASSETS`' `compressedPath` set (fail, don't heal, when `--verify`).

### 2. Report update failure is swallowed (moderate)

- **File:** `report.ts:54-57`
- **Scenario:** if `docs/asset-compression-report.md` is missing or loses its `<!-- asset-table:start/end -->` markers, `updateReport` logs a warning and returns; `compress.ts:149` still prints `asset-compression: OK` and exits 0. The budget table the README instructs you to commit silently goes stale — a "success-looking result" after a failure, exactly the silent-failure class this pipeline is supposed to guard against.
- **Fix:** throw instead of warn (or write the table at the document end when markers are absent).

### 3. Region radii are too permissive to catch nearby wrong nodes (moderate)

- **File:** `landmarks.ts:44` (pineapple r=10), `landmarks.ts:56` (tiki r=8), `landmarks.ts:63` (krab r=15), `landmarks.ts:71` (sign r=6), `landmarks.ts:84` (bureau r=22)
- **Scenario:** probe measured every non-allowlisted map mesh node against each part's radius. Several unrelated nodes would PASS: tiki — node **279 `house_patrick_rock`, d=6.2 < 8** (the audit itself warns it is 40.7 units wide and spans multiple buildings); pineapple — 313/314 `mesh_porthole_big_3` (d=8.2, 18.2 units wide) and 243/244 `db_gumdrop_green` (d=9.8); krab — dumpsters/cannons/trees (d≈4.5–14.1); bureau — **node 227 `building_wood_krusty`, d=16.9 < 22**, one of the CAUTION's own trap nodes. The six CAUTION traps are all caught (see verification §2), but a transposed index within the same neighbourhood — the likeliest edit-time mistake — sails through, and the audit's "nodes that span the whole map" property (#3 in Extraction mechanics) is not guarded at all.
- **Fix:** additionally assert each allowlisted node's bbox extent against the audit's per-part bbox (e.g. max bbox diagonal), which rejects 279/313-class multi-building nodes outright.

### 4. Landmark `sourceModel` is never validated (minor)

- **File:** `compress.ts:97-102` (assertion reads only the `environment` entry's source), `pipeline.ts:362-366` (`buildAsset` extracts from `entry.sourceModel` with no region check at extraction time)
- **Scenario:** if a landmark entry's `sourceModel` were changed to a different model, `extractLandmark` looks up node indices in that document — silently extracting arbitrary geometry if it has ≥357 nodes, or dying on an opaque `TypeError` at `pipeline.ts:179` (`nodes[i]!` → `subtree(undefined)`) — while the environment still drops those node indices from the map. The early, well-worded `assertLandmarkRegions` error is bypassed for exactly the assets it protects.
- **Fix:** in `assertNoDrift`, require every landmark entry's `sourceModel` to equal the environment's.

### 5. `OPTIONS` keys are not validated against the manifest (minor)

- **File:** `compress.ts:35-45`
- **Scenario:** a typo (`'landmark-tikii'`) or a retired key is silently ignored and the asset builds with defaults. Losing `environment`'s `textureQuality: 65` silently ships higher-quality textures — the budget gate backstops *size*, but the intended quality knob is lost with no error. (`spongebob`'s `simplify` loss would surface as an over-budget failure, which is how the README frames budgets — but that is luck, not checking.)
- **Fix:** in `assertNoDrift`, fail if `Object.keys(OPTIONS)` ⊄ `RECIPE_IDS`.

### 6. Duplicate `LANDMARKS` ids silently lose world geometry (minor)

- **File:** `compress.ts:47-49` (`RECIPE_IDS` is a Set — duplicates collapse), `pipeline.ts:172-174` (`allLandmarkNodes` spans every spec), `pipeline.ts:195` (environment drops all of them)
- **Scenario:** two `LandmarkSpec`s sharing an `id`: the drift check passes (Set dedupe), the environment removes BOTH parts' nodes, but only the first spec ever builds an output — the second part's geometry vanishes from the world on a green run. Contrived, but the failure is silent and the node-index allowlist already gets a duplicate check (`assertLandmarkRegions`' `seen` map, `pipeline.ts:136-138`); ids get none.
- **Fix:** fail on duplicate `LANDMARKS` ids in `assertNoDrift`.

### 7. `assertUniformScale` tolerance is tighter than float32 guarantees (minor)

- **File:** `pipeline.ts:94` (`Math.abs(v - RAW_TO_WORLD) > 1e-9`)
- **Scenario:** 0.01 in float32 is 0.00999999977648 — 2.2e-10 under the target today, so the check passes; but the value comes from decomposing float32 world matrices, and a re-export of the source model with different rounding in nodes 0/1 could exceed 1e-9 and fail every compress run spuriously, with an error that points at the data rather than the tolerance.
- **Fix:** relax to ~1e-6.

### 8. Non-atomic output writes (minor)

- **File:** `compress.ts:100-107` (stale deletion + per-asset writes happen before any verification)
- **Scenario:** a run that fails on asset 6 of 8 (over budget, or a build throw) has already deleted the previous outputs' stale set and written assets 1–5 of the new generation: `public/models/` is left in a mixed state and exits 1. The next `assets:verify` correctly fails on the over-budget file — good — but a commit made before re-running ships the mixed set.
- **Fix:** all assets are already built to memory; verify bytes in memory, then write the whole set in one pass.

### 9. Hand-written report prose contradicts the generated table (minor)

- **File:** `docs/asset-compression-report.md:40` — "budgets summing to 1,829 KiB" vs the generated table's 1800.0 KiB (1200 + 4×150, `report.ts:33-43`). Misleads the reader the budgets are written for ("the numbers to argue with").
- **Fix:** correct the prose to 1,800 KiB.

## Five logic questions (answers)

1. **Silent failure?** Defects 1, 2 and 6 — extra outputs ignored, report update skipped with exit 0, duplicate-id geometry loss. All three produce a green run with something missing.
2. **Unexpected user action?** Editing `WEB_ASSETS`/`OPTIONS`/`LANDMARKS` (the documented "adding or changing an asset" workflow, README:73-78) hits defects 4, 5, 6 — the config surfaces the README tells maintainers to touch are the ones without validation.
3. **Wrong answer from bad input?** A source-map re-export (defect 7) or a neighbourhood node-index typo (defect 3) — the first fails spuriously, the second passes a check the CAUTION says must discriminate.
4. **Dependency failure?** Solid: missing file → ENOENT → exit 1; meshopt decode failure → required-extension read error → exit 1 (`verify.ts:18`); unknown sourceModel → explicit throw (`compress.ts:53`); codec init awaited before any use (`compress.ts:93`).
5. **Missing vs requirements?** "Extra outputs" half of the drift requirement (defect 1); the audit's whole-map-node extent check (defect 3); determinism is claimed (README:40) but neither tested by the pipeline nor by this review.

## Residual uncertainty

- Determinism (byte-identical outputs across runs) could not be tested without running `assets:compress`, which this review was forbidden to do. Nothing in the code obviously breaks it (no timestamps, no map-iteration-order-dependent output found), but sharp/WebP bit-reproducibility across machines/versions is unproven.
- Visual correctness of the simplified/quantized models (silhouette fidelity, pineapple-interior skin deformation under animation) is out of scope for a logic review; the wiring is verified intact (defect list aside).