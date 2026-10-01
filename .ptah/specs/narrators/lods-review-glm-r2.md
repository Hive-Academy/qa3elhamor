# Code Logic Review — Narrator LODs, Round 2 (revision 1)

Reviewer: code-logic-reviewer (glm). Re-review scope: revision 1 of `tools/asset-pipeline/pipeline.ts` and
`compress.ts` against the eight defects in `lods-review-glm.md`. Read-only; compress not re-run (it rewrites
public GLBs), so revision claims are cross-checked with `assets:verify`, the committed GLB hashes, and
`git status`.

## Summary

| Metric              | Value    |
| ------------------- | -------- |
| Overall score       | 8/10     |
| Assessment          | APPROVED |
| r1 defects fixed    | 8/8      |
| New blocking        | 0        |
| New serious/moderate| 0        |
| New minor/notes     | 3        |

Verification runs (mine, this session):

- `npm run assets:verify` — green. Narrators: `spongebob-narrator` 138,768 B / 12,024 tris (budget 256,000 B /
  12,500), `patrick-narrator` 61,664 B / 9,780 tris (budget 204,800 B / 10,000); standing origin/height checks
  pass for both. Every other asset reports the same byte/triangle counts as revision 0
  (environment 1,169,620 B / 65,765; `spongebob-character` 548,468 B / 77,937), and git status confirms their
  GLBs are untouched since HEAD — the dedup reorder changed no existing output except `patrick-narrator`
  (61,704 → 61,664 B, same 9,780 tris).
- `npx nx run-many -t lint,typecheck,test -p world-domain --skipSync` — green (Nx cache hit on identical inputs).
- md5 of the committed narrator GLBs, computed by me:
  `spongebob-narrator.glb a01d0720434e34833cf81690a7311dad`, `patrick-narrator.glb 884864b3f9dc201d523220ee208c1a2a`
  — both exactly match the two-run hashes recorded in the revision-1 notes. The committed state is byte-identical
  to what the author's repeated runs produced.

## Verdict

**APPROVED** — every defect from round 1 is fixed with the guard I asked for or an acceptable equivalent, the
fail-loud paths are correctly placed and cannot false-positive on the current asset set, and the dedup reorder is
empirically inert for the untouched outputs. Remaining items are notes, not defects.

## Fixed / not-fixed table

| # | r1 defect | Status | Evidence |
| - | --------- | ------ | -------- |
| 1 | `ratioByMaterial` silent fallback; 2 of 6 keys dead | **FIXED** | Materials are no longer deduped before simplify: first pass excludes MATERIAL (`pipeline.ts:302-304`), `dedup({propertyTypes: [MATERIAL]})` moved to after simplify (`pipeline.ts:312`), so `ratioByMaterial` sees the source's 15 material names. A `matched` set is populated per primitive (`pipeline.ts:474`) and any configured key matching no primitive throws (`pipeline.ts:509-514`). Proof the intent now holds: the build succeeded with the dead-key guard armed, so all six keys — including `Teeth.002` and `Eyelashes.002` — matched. Teeth/lashes output tris changed accordingly (12,099 → 12,024 with the default ratio retuned 1.1 % → 0.9 %, `compress.ts:57`, still under the 12,500 budget). |
| 2 | `bakeVertexColours` stripped textures from materials it never baked | **FIXED** | `baked` set collected per primitive (`pipeline.ts:355`); only baked materials lose their texture (final loop iterates `baked`, not all materials); a textured primitive without UVs or still indexed now throws naming the mesh (`pipeline.ts:350-353`). Patrick verified green: 0 images / 0 textures in the committed GLB. |
| 3 | `stand` in OPTIONS without manifest `standingHeight` unchecked | **FIXED** | XOR check in `assertNoDrift` (`compress.ts:113-115`): `stand` configured without `standingHeight`, or `standingHeight` without `stand`, both push a drift problem. Runs in compress *and* `--verify` modes (assertNoDrift is called before the verifyOnly branch). Logic walked for all four combinations — only a mismatch pushes. |
| 4 | No visual regression capture of the changed full `spongebob-character` | **FIXED (author-attested)** | Four captures exist: `lods/spongebob-character-{before,after}-{front,face}.jpg` (existence verified by glob; I cannot open images under this session's rules). Author reports visually identical; the GLB itself is unchanged from revision 0 (548,468 B / 77,937 tris in both my verify runs). |
| 5 | `standOnGround` would gut a skinned model silently | **FIXED** | Throws when the document has skins (`pipeline.ts:270-271`). Narrator sources have `skins: 0` (verified in their `scene.gltf` last round), so the current builds are unaffected. |
| 6 | Silent skip of unindexed/non-triangle prims; per-prim empty decimation undetected | **FIXED** | `console.warn` naming mesh + material for non-indexed/non-triangle primitives under `simplify` (`pipeline.ts:438-443`); a primitive decimated to zero indices throws (`pipeline.ts:499-500`). |
| 7 | 1e-4 normal bucket undocumented | **FIXED** | Comment added at `pipeline.ts:398-399`; the stated scale checks out (1e-4 / 14.889 ≈ 6.7e-6 of Patrick's height). |
| 8 | Reproducibility author-attested only | **FIXED (as far as read-only allows)** | The committed GLBs' md5s, computed independently, match the recorded two-run hashes exactly (see Summary). Two-run identity itself remains the author's run — I cannot execute `assets:compress` without rewriting public GLBs — but the committed state is now anchored to those recorded runs. |

## Checks for new defects introduced by the fixes

- **Material dedup after simplify — effect on other assets.** For assets without `ratioByMaterial`, per-primitive
  simplification never depended on material identity, and the merged-material *result set* is the same (same
  comparison, later timing; `pipeline.ts:312` still runs before `wrapTexcoordsIntoUnitRange` and `join`, matching
  the old relative order). Empirical confirmation: environment, all four landmarks, `pineapple-interior`,
  `patrick-character` and `spongebob-character` all report byte/triangle counts identical to revision 0, and git
  status shows their GLBs unmodified since HEAD. `patrick-narrator` moved −40 B (dedup/join ordering) with
  unchanged 9,780 tris and unchanged height. No regression.
- **New throw paths — false positives.** Dead-key throw armed only for `ratioByMaterial` configs (one asset);
  current build green ⇒ no dead keys. Empty-decimation throw requires a full collapse within the 5 % error bound —
  not reachable at the current ratios. `bakeVertexColours` throw armed only for the one asset using that option.
  Skins throw: both sources have no skins. All five fail-loud paths are correctly scoped to the recipe that
  opts into them.
- **The 0.9 % default ratio.** A deliberate retune to stay under 12,500 tris now that teeth/lashes keep their
  intended geometry (12,024 tris, `compress.ts:57`, verify-confirmed). The author documented the visible cost
  (slight belt/pants blockiness at 3 m) and re-captured face/3 m/6 m shots. Tuning inside budget with the guard
  armed — acceptable, no action.

## New minor findings and notes

1. **MINOR — empty-decimation throw message could mislead.** `pipeline.ts:499-500` throws "decimated to nothing"
   when a legitimately tiny part receives `target = 0` at the 0.9 % default and fully collapses within the error
   bound. Fail-loud is the right behaviour, but the message does not hint at the remedy (a `ratioByMaterial`
   override for that part). Suggest appending that hint. Not reachable with today's assets.
2. **NOTE — regression captures are author-attested.** The four `spongebob-character-{before,after}` JPEGs exist
   (`lods/`), but image content cannot be verified under this session's text-only rule. The claim rests on the
   author's viewing plus the GLB being byte-stable since revision 0.
3. **NOTE — two-run determinism remains author-run evidence.** The hash anchor (committed files == recorded run
   hashes) is independent; the identity *between* the two recorded runs is not something I could re-execute.
   Risk rated low: MeshoptSimplifier is deterministic and the sharp WebP path is unchanged.

## Five logic questions (delta this round)

1. **Silent failure?** The round-1 silent paths are now all fail-loud or guarded (pipeline.ts:499, :509-514,
   :270-271, :350-353, compress.ts:113-115). No new silent path introduced.
2. **User action with unexpected behaviour?** A maintainer adding a `ratioByMaterial` key that matches nothing now
   gets a build error naming the dead keys — the tuning knob can no longer be a silent no-op.
3. **Input data producing a wrong answer?** A re-exported source with renamed materials now fails the dead-key
   guard instead of silently retuning the face. Duplicate material names pre-dedup would both match a key — same
   name, same ratio, harmless.
4. **Dependency failure?** Unchanged from round 1 (Meshopt readiness awaited at init; sharp failures throw). The
   new throws convert previously silent simplifier edge cases into errors.
5. **Missing from requirements?** Nothing new. The consumer-side caveat from round 1 (a manual material path must
   set `vertexColors = true` for Patrick; glTF itself needs no flag) remains with the out-of-scope renderer work.

## Verdict detail

- Recommendation: **APPROVE**.
- Confidence: HIGH on defects 1–3, 5–8 (structural guard verified in source plus green runs); MEDIUM on defect
  4 (existence verified, content author-attested).
- Top residual risk: the 0.9 % default keeps the body/parts geometry close to the threshold where the author
  observed blockiness at 3 m; any further pressure on the 12,500-triangle budget should come out of the default
  ratio consciously, not silently.
- Nothing a further revision must add; the two minor/notes are optional polish.