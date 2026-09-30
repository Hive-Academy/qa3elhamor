# Code Logic Review — asset-compression pipeline, round 2 (`tools/asset-pipeline/`)

**Verdict: APPROVED** — **Score: 9/10** (all 9 original defects addressed and verified against the code and the real source map; 2 new minor gaps, no regressions found)

Reviewer: code-logic-reviewer (independent, read-only). Verified by reading the updated sources,
running `npm run assets:verify` (passes, exit 0, all 8 assets under budget), and three read-only
probe scripts against `assets/bikini_bottom_map_3d_model/scene.gltf`: the real config through
`assertLandmarkRegions`, the four audit decoys with correctly re-measured pinned centres, and a
margin measurement of every new pinned value. `assets:compress` was NOT run; the determinism claim
(two identical-md5 runs) is the author's report, consistent with the code, but unverified by me.

## Status of the 9 original defects

| # | Original defect | Status | Evidence |
|---|---|---|---|
| 1 | Extra output files never fail anything | **fixed** | `assertNoExtraOutputs` (`compress.ts:89-99`) throws on any unlisted `.glb` in `models/` and runs in BOTH modes before any work (`compress.ts:112`); the silent `removeStaleOutputs` is gone (no `rm` import left, `compress.ts:11`). README:20 documents the fail-don't-delete behaviour. Probe: logic read; the guard is on the common path, so CI (`ci.yml:34`) now fails on an extra committed GLB. |
| 2 | Report update failure swallowed | **fixed** | `renderReport` throws on missing file/markers (`report.ts:49-51`), and is called after the verification gate and before the first disk write (`compress.ts:176`, comment `:175`). No `console.warn`-and-continue path remains. |
| 3 | Region radii too permissive to catch nearby wrong nodes | **fixed** | Three new layers: per-node pinned centres within 1 raw unit (`landmarks.ts:38,48`, check `pipeline.ts:174-180`), per-part `maxNodeDiagonal` (`landmarks.ts:40`, check `pipeline.ts:181-188`), and union-bbox size ±10% / centre ±1.5 vs the audit (`landmarks.ts:33,44-46`, check `pipeline.ts:190-200`); radii tightened to 7/3/6/4/16 (`landmarks.ts:65,87,101,121,139`). A `nodeCentres`-keys-must-match-nodes guard rejects stale pins outright (`pipeline.ts:151-154`). **Probe, real map:** the real config passes; each of the four decoys **227→bureau, 279→tiki, 313→pineapple, 213→krusty fails even when its pinned centre is correctly re-measured** (measured distances 16.93 > 16, 6.16 > 3, 8.18 > 7, 50.75 > 6). Margins are healthy, not over-tight: every pinned centre is within **0.008** raw units of the measured value (tolerance 1), union-size deviation ≤0.1% (limit 10%), and `getBounds` is deterministic for a given file — the pins cannot trip on the committed source, only on a genuinely changed one, which is exactly when re-measurement is required. Worst real region distance is 14.41/16 (bureau node 357) vs the nearest decoy at 16.93 — the corridor is thin but the 1-unit pin is the primary gate and fires first for any geometry change. |
| 4 | Landmark `sourceModel` never validated | **fixed** | `assertNoDrift` requires every landmark entry's `sourceModel` to equal the environment's (`compress.ts:75-80`). Combined with the existing `sourcePath` throw (`compress.ts:51-55`), a mis-pointed landmark now fails before anything is read. |
| 5 | `OPTIONS` keys not validated | **fixed** | `compress.ts:72-74`: an `OPTIONS` key outside `RECIPE_IDS` is a drift error. |
| 6 | Duplicate `LANDMARKS` ids silently lose geometry | **fixed** (residual: new defect N1) | `compress.ts:68-71` fails on duplicate ids, in both modes. |
| 7 | Scale tolerance tighter than float32 guarantees | **fixed** | `pipeline.ts:102` uses 1e-6. |
| 8 | Non-atomic output writes | **fixed** | Compress mode builds every asset and runs `verifyBytes` in memory, collecting failures (`compress.ts:129-139`); the failure gate (`:148`) and `renderReport` (`:176`) both run before the write phase (`:177-182`, "only now touch the disk"). A failed run leaves the committed set untouched. `verifyBytes` enforces the same budget on the in-memory bytes (`verify.ts:14-24`). |
| 9 | Report prose contradicts the generated table | **fixed** | `docs/asset-compression-report.md:39-40` now reads "budgets summing to 1,800 KiB", matching the table (1200 + 4×150). |

No regressions found in verify-mode behaviour: it gains the extra-output guard and the duplicate-id
/OPTIONS/sourceModel drift checks, and keeps the missing-file (ENOENT → exit 1), parse, decode
(eager meshopt decode on read, unchanged), triangles and budget checks; `npm run assets:verify`
passes on this Windows machine. CI (`ci.yml:31-34`) installs with `npm ci` and runs the verify
gate on every push and PR.

## New defects

### N1. Cross-set id collisions between `LANDMARKS` and the fixed recipe ids are silently deduped (minor)

- **File:** `compress.ts:49` (`RECIPE_IDS = new Set(['environment', ...landmarkIds, ...WHOLE_MODEL_IDS])`), `compress.ts:68-71` (duplicate check covers only ids *within* `LANDMARKS`), `pipeline.ts:410-412` (`buildAsset` dispatches `id === 'environment'` first, then landmark, then whole-model default)
- **Scenario:** the round-1 fix catches two `LANDMARKS` entries sharing an id, but a landmark spec named `'environment'` or `'pineapple-interior'` still slips through: the Set collapses the collision, the drift check passes, and `buildAsset`'s dispatch silently routes the manifest entry to the wrong recipe — for a `WHOLE_MODEL_IDS` collision the site's `pineapple-interior` entry would ship a ~30 KiB landmark extract that still passes its 600 KiB budget (wrong content, green run); for an `'environment'` collision the landmark's nodes are removed from the map by `allLandmarkNodes()` (`pipeline.ts:218-220`) but never emitted, the exact silent-geometry-loss failure class defect 6 was filed against.
- **Fix:** in `assertNoDrift`, also fail if `landmarkIds` intersects `new Set(['environment', ...WHOLE_MODEL_IDS])`.

### N2. The landmark config is never validated against the source map by any CI gate (minor)

- **File:** `compress.ts:118-128` (`assertLandmarkRegions` runs only inside the compress branch), `ci.yml:34` (CI runs only `assets:verify`, which never reads `assets/`)
- **Scenario:** `landmarks.ts` (indices, pins, sizes) can drift from the committed source map while every automated gate stays green — the region assertion fires only when a developer happens to run `assets:compress` locally. The whole point of the round-1 fix 3 was that this config must be checked against the map; today nothing enforces that on a branch that edits only `landmarks.ts` and `landmark-*.glb` outputs.
- **Fix:** expose a `--check-regions` mode (read the map, run `assertLandmarkRegions`, exit) — it touches no outputs and no network — and add it to the CI job next to `assets:verify`.

## Residual uncertainty

- Determinism ("two runs gave identical md5s") could not be independently tested — `assets:compress` was forbidden. Nothing in the changed code affects it: no new timestamps, iteration orders, or randomness were introduced; the build path is unchanged apart from assertion code that runs before any encoding.
- Visual quality of the outputs (silhouettes, interior skin deformation) remains out of scope for a logic review; wiring was verified intact in round 1 and is untouched by these fixes.