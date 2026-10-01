# Code Logic Review — Narrator LODs (`narrators` item, uncommitted)

Reviewer: code-logic-reviewer (glm). Scope: `tools/asset-pipeline` (pipeline.ts, compress.ts, verify.ts, README),
`libs/world/domain` (asset-manifest.ts + spec), docs, and the committed GLB outputs. `libs/world/feature`,
`libs/content`, `content/` excluded per instructions.

## Summary

| Metric              | Value          |
| ------------------- | -------------- |
| Overall score       | 6/10           |
| Assessment          | REVISE         |
| Blocking issues     | 0              |
| Serious issues      | 1              |
| Moderate issues    | 3              |
| Minor issues        | 4              |
| Failure modes found | 5              |

Verification runs (mine, this session): `npm run assets:verify` green (all 11 assets, narrators 139,316 B / 12,099 tris
and 61,704 B / 9,780 tris, both standing checks pass). `npx nx run-many -t test,typecheck,lint -p world-domain
--skipSync` green (Nx cache hit on identical inputs). GLB JSON chunks inspected with a script (never opened as
binaries): Patrick output has `COLOR_0`, zero images/textures, no `TEXCOORD_0`, uint16 indices, 6,063 verts;
SpongeBob output has 3 base-colour textures only on the 3 UV-bearing materials, no `TANGENT`, all indices uint16.

## Verdict

**REVISE** — the machinery is sound and the acceptance criteria are met, but one tuning mechanism is silently
half-inert today (`ratioByMaterial`), which is exactly the brittleness the orchestrator asked about, and nothing in
the pipeline can detect a recurrence.

## Numbered defects

### 1. SERIOUS — `ratioByMaterial` keys silently miss; two of six tuned keys are already dead

- File: `tools/asset-pipeline/pipeline.ts:446` (`config.ratioByMaterial?.[prim.getMaterial()?.getName() ?? ''] ?? config.ratio`), config at `tools/asset-pipeline/compress.ts:56-63`.
- Evidence: the source (`assets/sponge_on_the_run_spongebob_base_model/scene.gltf`) has 15 materials, including
  `Teeth.002` (index 13) and `Eyelashes.002` (index 4). The shipped `apps/web/public/models/spongebob-narrator.glb`
  has 12 materials — `Teeth.002`, `Eyelashes.002` and `Skin.002` are absent, because `dedup()`
  (`pipeline.ts:295`) merges identical materials *before* `simplifyAttributeAware` runs (`pipeline.ts:300`), keeping
  only one name per merged group. So at simplify time the lookup for `Teeth.002` (intended 0.10) and
  `Eyelashes.002` (intended 0.04) matches nothing and falls back to the default 0.011 — the teeth/eyelash geometry
  was decimated up to ~9× harder than tuned, with no warning anywhere. The keys are also Blender dedup artifacts
  (`.002` suffixes) that shift on any re-export; a future `Base.002` → `Base.003` rename silently drops the body
  skin to 1.1% and re-opens the dark face slits the author tuned against.
- Impact: silent visual-quality regression on a shipped face asset; a maintainer cannot tell whether a ratio they
  add ever applies. Today's output passed the author's 3–6 m screenshot review by luck of scale (eyelashes and
  teeth are small), not because the config worked.
- Fix: in `simplifyAttributeAware` (`pipeline.ts:414-477`), record every key that matched at least one primitive
  and `throw` listing the unmatched `ratioByMaterial` keys after the pass. That single guard converts every future
  silent miss into a build failure. Optionally key by something that survives `dedup` (mesh/node name at simplify
  time, before `stripNames`), or log the effective per-material ratio in the compression report so tuning is
  auditable.

### 2. MODERATE — `bakeVertexColours` strips base-colour textures from materials it never baked

- File: `tools/asset-pipeline/pipeline.ts:366` — `for (const material of ...) material.setBaseColorTexture(null);` runs
  over *all* materials, while the bake loop skips primitives at `pipeline.ts:337`
  (`if (!texture || !uv || prim.getIndices()) continue;`).
- Scenario: any model with one textured primitive lacking `TEXCOORD_0` (or that somehow kept an index buffer after
  `unweld`) skips baking, then loses its texture anyway at :366 — it ships with colour = `baseColorFactor` only,
  silently, and its dead `TEXCOORD_0` survives into the output.
- Impact: latent silent colour loss for the next model configured with `bakeVertexColours`. Patrick today is
  single-material, fully UV-mapped, so the shipped output is correct (verified: 0 images, 0 textures, `COLOR_0`
  present).
- Fix: collect the materials whose primitives were actually baked and null only those; `throw` if a skipped
  primitive still references a base-colour texture.

### 3. MODERATE — `stand` in OPTIONS without `standingHeight` in the manifest is unchecked

- File: `tools/asset-pipeline/verify.ts:58` only calls `measureStanding` when `asset.standingHeight !== undefined`;
  OPTIONS at `compress.ts:49,69` carry `stand` with no cross-check.
- Scenario: the next stood asset is added to OPTIONS with `stand` but the manifest entry omits
  `standingHeight`. It builds, verifies green (byte + triangle budgets only), and ships standing at the origin with
  nothing enforcing the 1 %-height / origin contract; `placements.json` records a height nobody validates.
- Fix: in `assertNoDrift` (`compress.ts:93-121`) or `main`, require `entry.standingHeight` whenever
  `OPTIONS[entry.id]?.stand` is set.

### 4. MODERATE — the changed full `spongebob-character` has no visual regression evidence

- File: `tools/asset-pipeline/compress.ts:43` (still `simplify: { ratio: 0.15, error: 0.01 }`, now attribute-aware via
  `pipeline.ts:300`), output changed 537.6 → 535.6 KiB / 77,936 → 77,937 tris
  (`docs/asset-compression-report.md` diff).
- The before/after captures in `.ptah/specs/narrators/lods/` cover only the narrator LODs. The full character is
  still shipped and named by the ambient `characters` config (author notes line 35), and its collapse choices
  changed (UV/normal weights now steer the simplifier). Byte and budget checks say nothing about whether the
  sponge skin still reads right at ambient distance.
- Fix: one before/after capture of `spongebob-character` at its ambient placement, or an explicit note in the
  compression report that the change was eyeballed. Attribute-aware collapse is almost certainly *safer* for UVs
  than the position-only simplify it replaced — this is a missing-verification finding, not a suspected regression.

### 5. MINOR — `standOnGround` would gut a skinned model silently

- File: `tools/asset-pipeline/pipeline.ts:271` disposes every non-mesh node; joint nodes are non-mesh. `prune()`
  inside `optimise` would then drop the orphaned skin and `dropOrphanedSkinAttributes` (`pipeline.ts:593-602`)
  strips `JOINTS_n`/`WEIGHTS_n` — the model would ship in bind pose and still pass every verify check.
  Both current sources have `skins: 0` (verified in their `scene.gltf`), so this is latent.
- Fix: `throw` in `standOnGround` (or `buildAsset`) when `doc.getRoot().listSkins().length > 0`.

### 6. MINOR — `simplifyAttributeAware` silently skips un-indexed and non-triangle primitives

- File: `tools/asset-pipeline/pipeline.ts:417` (`getMode() !== 4`) and `:423` (`!position || !indices`).
  Unreachable today because `weld()` at `:299` indexes everything first; a future mode-5 (strip) primitive under a
  `simplify` recipe would silently keep full detail with no signal. A `console.warn` or throw would do.

### 7. MINOR — `smoothNormals` conflates vertices within 1e-4 units

- File: `tools/asset-pipeline/pipeline.ts:380` (`Math.round(x * 1e4)`). Two distinct vertices closer than 1e-4
  source units share a normal bucket. Harmless at Patrick's ~14.9-unit scale; worth a comment, not a change.

### 8. MINOR — reproducibility of `assets:compress` not independently re-verified

- The read-only mandate forbids running compress (it rewrites `apps/web/public/models/*.glb`). The
  byte-identical-rerun claim in the notes rests on the author's run. `assets:verify` (run by me) confirms the
  committed outputs satisfy every check; MeshoptSimplifier is deterministic by construction, so I rate the risk
  low, but it is a stated residual uncertainty, not verified fact.

## The six requested checks

1. **Attribute-aware simplify for all assets — safe?** Yes for determinism and untouched outputs: only
   `spongebob-character` and the two narrators have `simplify` in OPTIONS (`compress.ts:43,48-73`); environment,
   landmarks, interior and `patrick-character` never enter the new path, and git status confirms their GLBs are
   byte-unchanged. Index widths are safe: the explicit uint16 downcast at `pipeline.ts:472-474` is guarded on the
   post-compaction vertex count ≤ 65,534 (conservative vs the real 65,535-index limit), and both narrator outputs
   are uint16 throughout. `join()` runs after simplify, so per-material ratios see pre-join primitives — ordering
   fine. Error bounds: `config.error` passes straight to Meshopt as extent-relative `target_error`, the same
   semantics as the glTF-Transform `simplify` it replaces; empirically the character output moved by 1 triangle at
   the same ratio, confirming equivalent ratio semantics. The per-mesh keep logic, however, is **brittle and
   already partly broken** — defect 1.
2. **Patrick's baked colours.** sRGB→linear is correct: sharp `.raw()` yields stored sRGB bytes, the LUT at
   `pipeline.ts:317-318,332` converts them to linear, matching glTF's linear `COLOR_0` convention; the material's
   `baseColorFactor` is left in place and still multiplies, so `factor × COLOR_0` equals the original
   `factor × texture`. No vertex-colour flag exists to set in glTF 2.0 (core spec applies `COLOR_0` when present;
   three.js GLTFLoader enables it automatically) — but any *manual* material path must set
   `vertexColors = true`; the out-of-scope `libs/world/feature` consumer should confirm this. No leftover refs:
   output has 0 images, 0 textures, no `TEXCOORD_0` (verified in the GLB JSON). The residual over-broad texture
   strip is defect 2.
3. **Standing recipe.** `standOnGround` (`pipeline.ts:268-283`) bakes world transforms into vertices
   (`bakeWorldTransform`, shared-mesh clone handled at `:150-152`) before `unionBounds`, so the bbox is true world
   space; height returned in raw source units, rounded to 3 dp into `placements.json` (`compress.ts:201`) and
   pinned in the manifest (10.033 / 14.889). `measureStanding` (`verify.ts:28-43`) re-reads the written GLB,
   `getBounds` includes node transforms (the quantize offsets visible in the output nodes), origin tolerance
   0.5 % of height, height tolerance 1 % — both enforced. `triangleBudget` enforced at `verify.ts:55-57`. Correct.
4. **Manifest.** `triangleBudget`/`standingHeight` typed optional with accurate doc comments
   (`asset-manifest.ts:47-56`), entries lazy + `minimumTier: 'medium'` (`:157-175`), the "Initial load" budget row in
   the compression report is unchanged (narrators excluded from initial load, confirmed by the spec test
   `asset-manifest.spec.ts:120-129`). `sourceModel` → `shippedCredits()` derives one entry per source model and
   throws on a missing attribution (`credits.ts`), so the narrators ride the existing NickBob credits; pinned by
   `asset-manifest.spec.ts:131-140`. Gap: nothing forces `stand` ⇒ `standingHeight` (defect 3).
5. **Verify preserve list.** `git diff` on verify.ts is purely additive. Everything at HEAD survives: Meshopt-decoder
   parse (`verify.ts:47`), triangles > 0 (`:49`), byte budget (`:50-54`), committed-file re-read (`:63-65`). Added:
   triangle budget (`:55-57`) and the standing checks (`:58`). Nothing lost.
6. **Runs.** `assets:verify`: 11/11 green, `asset-compression: OK`. `nx run-many test,typecheck,lint -p world-domain`:
   green (cache hit on identical inputs — a previous run of these exact sources passed).

## Five logic questions

1. **Silent failure?** Defect 1 is the live one: two tuned ratios silently fall back to the default. Defect 2's
   skipped-primitive colour loss and defect 3's unchecked stance are the latent ones. Defect 5's bind-pose ship is
   the most dramatic but least likely.
2. **User action with unexpected behaviour?** A maintainer tunes `ratioByMaterial`, reruns compress, verify stays
   green regardless of whether the key matched — the knob can be a no-op with a green build.
3. **Input data producing a wrong answer?** A re-exported source model whose material names shift (`.002` → `.003`),
   or whose materials dedup differently, silently changes every effective ratio. A textured primitive without UVs
   under `bakeVertexColours` loses its colour entirely.
4. **Dependency failure?** `MeshoptSimplifier.ready` is awaited in `initCodecs` (`pipeline.ts:100`) before any
   build, so the simplifier is initialised. sharp decode failures throw. If `simplifyWithAttributes` returned an
   empty index array (ratio ≈ 0 on a small mesh), the primitive would silently ship empty — verify's
   triangles > 0 is per-document, not per-primitive, so one vanishing mesh among many passes.
5. **Missing from requirements?** Nothing the brief asked for is absent. Not addressed anywhere: what a *consumer*
   must do with `standingHeight` and `height` (only the manifest comment says "scale by desired/standingHeight"),
   and the manual-material `vertexColors` caveat for the renderer side.

## Failure modes

| # | Trigger | Symptom | Evidence |
| - | -------- | ------- | -------- |
| 1 | Material renamed/re-exported, or dedup merges a tuned material | Tuned ratio silently not applied; face cracks return | pipeline.ts:446, compress.ts:56-63, output GLB lacks `Teeth.002`/`Eyelashes.002` |
| 2 | Textured primitive without UV / still indexed under `bakeVertexColours` | Prim ships colourless | pipeline.ts:337 vs :366 |
| 3 | New stood asset, manifest `standingHeight` forgotten | Stance never verified, build green | verify.ts:58 |
| 4 | Skinned model given `stand` | Joints disposed, bind-pose ship, verify green | pipeline.ts:271 |
| 5 | Tiny ratio on a small mesh | Primitive decimated to empty, undetected | pipeline.ts:447, verify.ts:49 per-document only |

## Requirements fulfilment

| Requirement | Status | Gap |
| ----------- | ------ | --- |
| `spongebob-narrator` ≤ 12.5k tris, ≤ 250 KiB | COMPLETE | 12,099 / 139,316 B (verify output) |
| `patrick-narrator` ≤ 10k tris, ≤ 200 KiB | COMPLETE | 9,780 / 61,704 B (verify output) |
| Feet y=0, x/z centred, facing +z, height recorded | COMPLETE | Enforced by verify.ts:28-43; yaw=0 both |
| `minimumTier: 'medium'`, lazy, out of initial budget | COMPLETE | Manifest + spec test pins both |
| Credited via `shippedCredits()` | COMPLETE | sourceModel → NickBob, spec-pinned |
| `assets:compress` reproducible | PARTIAL | Author-verified only; not re-run here (read-only) — see defect 8 |
| `assets:verify` keeps every HEAD check | COMPLETE | Diff purely additive |
| Tuned per-mesh decimation actually applied | PARTIAL | 4 of 6 keys live; `Teeth.002`, `Eyelashes.002` dead — defect 1 |

## Edge cases

| Case | Handled | Concern |
| ---- | ------- | ------- |
| Mesh shared by several nodes before standing | YES | clone at pipeline.ts:150-152 |
| UVs outside [0,1] when sampling Patrick's colour | YES | `u - Math.floor(u)` at :351-352 |
| Vertex count near the uint16 boundary | YES | Guard ≤ 65,534 at :472, conservative |
| Skinned source | NO | Joints disposed (:271) — latent, defect 5 |
| Ratio drives a primitive to 0 triangles | NO | Per-document triangle check only |

## Verdict detail

- Recommendation: **REVISE** — fix defect 1 (unmatched-key guard, ~10 lines in `simplifyAttributeAware`) and
  re-tune the two dead keys before accepting; defects 2, 3 are small guards worth adding in the same pass.
- Confidence: HIGH on defects 1-3 (each has a shipped-artifact or file:line evidence); MEDIUM on defect 4's
  visibility impact.
- Top risk: the per-material tuning that protects SpongeBob's face is keyed by fragile names with a silent
  fallback — the next source re-export regresses the face with a fully green build.
- What a robust implementation would add: unmatched-`ratioByMaterial` throw; bake-only-the-baked-materials texture
  strip; `stand` ⇒ `standingHeight` drift check; skins guard in `standOnGround`; effective-ratio column in the
  compression report.