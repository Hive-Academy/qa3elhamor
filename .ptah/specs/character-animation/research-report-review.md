Verdict: REVISE

Score: 6/10

Reviewer: in-process code-logic-reviewer subagent (same side as author — weaker evidence; all CLI lanes out of quota 2026-10-02)

Scope: read `research-report.md` in full; verified against `tools/asset-pipeline/{pipeline,compress,verify}.ts`, `libs/world/feature/src/lib/{narrator.tsx,use-compressed-model.ts,ocean-floor.tsx}`, `apps/web/src/app/narrators/{landmark-narrator,narrated-visit,dialogue}.ts*`, `libs/world/domain/src/lib/asset-manifest.ts`, the shipped GLBs (read-only node scripts in the OS temp dir), and the installed `@gltf-transform/functions` 4.5.1 / `three` 0.185.1 sources. Nothing was run in a browser. The skinned runtime path was not executed anywhere.

Bottom line: the choice of (b) over Mixamo and the shader-mask option is well supported, and the asset facts hold. But three claims about how the design plugs into the existing code are wrong or unproven, and one cheaper alternative was never compared. None of these kills (b). The report should be corrected before a team builds from it, and a short runtime spike should come before the full pipeline step.

## Verified (spot-checks that held)

- SpongeBob GLB: 12 nodes, 12 meshes, 0 skins, 0 animations, 7,877 vertices, 12,024 triangles. Attributes are `POSITION` int16n, `NORMAL` int8n and `TEXCOORD_0` u16n. Per-node scales differ (3.33, 4.60, 2.28, ...), so the per-primitive local quantization claim is right. File is 138,768 B and Patrick's is 61,664 B, so the headroom figures against 250 / 200 KiB (`asset-manifest.ts:162,173`) are right. Patrick has 1 node, 6,063 vertices, 9,780 triangles, with `COLOR_0` as u8n.
- Command: `node a.mjs` in `/tmp/rv` using `@gltf-transform/core` and the meshopt decoder.
- The pipeline survives skinning at the file level. The shipped `pineapple-interior.glb` has 1 skin shared by 60 nodes (so `mergeIdenticalSkins` works). It has 12 joints, `JOINTS_0` u8 and `WEIGHTS_0` u8n, all through meshopt and quantize. Quantize's skinned branch folds the dequantization transform into the IBMs (`@gltf-transform/functions/dist/index.cjs` `transformMeshParents` and `transformSkin`, ~3990-4023), and `quantizationVolume: 'scene'` gives every mesh the same transform, so the skins are identical and merge. So the per-primitive quantization worry applies to (c), not to (b). `SkeletonUtils.clone` in three 0.185.1 maps bones by index (`SkeletonUtils.js:392-427`), not by name, so blank names do not break cloning.

## Findings

### 1. [major] The rig lookup via `skin.extras` cannot work; the report's own risk #5 resolution is wrong

- Evidence: the report (5.1) says to put `skin.extras = { rig, joints }` and read it "via `userData` in three". `three/examples/jsm/loaders/GLTFLoader.js` `loadSkin` (3987-4030) never calls `assignExtrasToUserData`. It is called only for nodes (4368), meshes, materials, scenes, cameras, animations, textures and geometries. Skin extras are dropped. `stripNames` (`pipeline.ts:568-579`) also blanks every node and skin name, so bones are anonymous after the existing pipeline.
- Required change: specify one of two options. (i) Put `extras: { bone: 'shoulder.R' }` on each joint node. These reach `Object3D.userData`, and `quantize`, `prune` and the Meshopt writer preserve node extras (verify in the spike). (ii) Run the rig step after `stripNames` and exempt joint nodes from it. Name the chosen mechanism and add a runtime test that loads the built GLB and resolves every `BoneName`.

### 2. [major] `verify.ts` will fail on a skinned narrator; "pipeline already supports skinned input" is overstated

- Evidence: `verify.ts` `measureStanding` takes `getBounds(scene)` and requires lowest y ~0, the x/z centre ~0 and a height within 1% of `standingHeight` (10.033 / 14.889, `asset-manifest.ts:166,177`). `getBounds` ignores skins. With scene-volume quantization the dequantization lives only in the IBMs, so it reads raw quantized positions. Measured on the shipped skinned GLB: `getBounds(pineapple-interior)` returns min `[-0.75,-0.78,-1.0]`, max `[0.75,0.78,1.0]`. That is quantized space, not the real size of ~100+ units. Interior has no `standingHeight`, so this path has never been exercised on a skinned asset. `standOnGround` also throws on skinned input (`pipeline.ts:270-272`). This is harmless only because the rig step runs after it, so the order must be stated as a constraint.
- Required change: add to the plan that `measureStanding` must compute bounds from skinned bind-pose positions (apply IBM-inverse or dequantize). Alternatively, measure on the pre-compression document and record the result. Also list the order `stand` -> `join` -> `rig` -> `stripNames` -> `compressGeometry` as an explicit invariant, with a test. Add a numeric round-trip check to the pipeline spec: decode the final GLB, skin it in bind pose, and compare to the pre-quantization positions within a tolerance. "Weights sum to 255" does not detect a wrong IBM.

### 3. [major] No runtime precedent for a skinned GLB exists in the app; the report implies one

- Evidence: the report cites `pineapple-interior.glb` as precedent (3, last bullet). It admits it did not check where that skin is used. `Grep` for `SkinnedMesh|isSkinnedMesh|skeleton` under `libs` and `apps` (excluding dist) finds no source usage. The interior's skin is a vestigial import artefact that has never been rendered skinned here. So the claim "a skinned+meshopt+quantized GLB loads through the existing path" is proven only at the gltf-transform level. Three's loader, `measureNarratorModel`, `SkeletonUtils.clone`, `retainModel` and the shader recompile for `USE_SKINNING` have not run on one.
- Required change: make a runtime spike the first batch, before investing in the full pipeline step. Hand-skin the SpongeBob LOD with a trivial two-bone rig and a rotation test. Confirm the load, clone, `Box3.setFromObject` bind-pose bounds, a visible deformation, and unmount. The report can keep its design but must label this "unverified".

### 4. [major] Disposal: `disposeObjectTree` does not release skeletons, and the clone path creates one per mesh

- Evidence: `ocean-floor.tsx:44-60` disposes geometry, materials and textures only. It never calls `Skeleton.dispose()`. `SkeletonUtils.clone` gives every `SkinnedMesh` its own `skeleton.clone()` (`SkeletonUtils.js:414`). SpongeBob's 12 primitives therefore give 12 `Skeleton`s per narrator mount, each with its own float `boneTexture` created lazily on first render. `retainModel` disposal only walks the cached `gltf.scene`, not the per-caller clones. Narrators mount and unmount on every visit, so each visit leaks 12 small GPU textures. Also 12 bone-matrix updates per frame per pass, and shadow passes if any.
- Required change: have the hook that creates the clone dispose every `skeleton` of its own clone on unmount. Do not use `disposeObjectTree` on clones, because it would dispose shared geometry and materials. Or share one `Skeleton` across the meshes of one narrator. The report's "check `disposeObjectTree`" is answered: it does not handle it.

### 5. [major] Alternative not compared: weights computed at runtime (or rigid-part splitting), with the GLB unchanged

- Evidence: the report compares only (a), (b) and (c), and (b) is defined as "generate in the pipeline". The same capsule-weight algorithm in pure TS can run once at load. It takes the clone's float positions (node matrix applied), builds `JOINTS_0`/`WEIGHTS_0` as BufferAttributes on a `SkinnedMesh`, and builds the `Bone`s from the rig spec. 7.9k / 6.1k vertices is sub-millisecond work.
  - It costs 0 bytes in the GLB.
  - It needs no `verify.ts` change, no IBM or quantization interaction (findings 2 and 3) and no `stripNames` problem (finding 1).
  - A bad rig only affects the unmodified GLB, so the fallback is exact: just skip it.
  - It unit-tests as plain TS on `.spec.ts` files, matching the repo's functional core pattern better than a pipeline step.
  - Downsides to weigh: it runs on every mount (cache the weights per model), and it is not visible in the committed GLB.
- A second untested option is rigid segments: split the Skin and Shirt primitives at the shoulder and hip planes into per-limb meshes parented to bone nodes. That needs no skinning, JOINTS/WEIGHTS or IBM, and works with the existing per-mesh quantization. It is cheaper, with risk of a seam at the joint.
- Required change: add this as option (d) with a decision. Either justify rejecting it or adopt it (the "runtime skin" variant is probably the lower-risk first prototype for the SpongeBob sign-off).

### 6. [major] Click reaction: R3F pointer delivery to the canvas and hit testing are unverified and cost-unbounded as proposed

- Evidence: the in-world stage layer is `position: fixed; inset: 0; z-index: 40; pointer-events: none` (`landmark-stage.css:7-11`) and passes the pointer through, but the report never checks that the `ocean-canvas` receives pointer events. All current in-world interaction is HTML (`visit-hud.tsx:300-307`). `Canvas` at `dive-shell.tsx:146` has no `eventSource`. The report proposes `onClick` on the root group (5.3) and treats a hit-proxy as optional. A raycast against 12 `SkinnedMesh`es runs CPU skinning of ~7.9k vertices each time the bounding sphere is not cached, and the bind-pose bounds miss the swung arm.
- Required change: make a hit-proxy (invisible capsule on `body`) mandatory, with `raycast = () => {}` on the skinned meshes. Add a spike that confirms a canvas click on the narrator fires on the dive page and in the Bureau scene (`bureau-scene.tsx:418` sets `pointerEvents: 'none'` on something) without conflicting with tap-to-advance (`narrated-visit.tsx:271`, `speech-bubble.tsx:75`). Decide that touch devices can tap the narrator, and give a keyboard/AT story (or state that the click reaction is decorative and has no accessible equivalent).

### 7. [moderate] Failure handling in the render loop is not covered by the fallback

- Evidence: the fallback is `NarratorModelBoundary` (`landmark-narrator.tsx:153-181`), a React error boundary catching load failures. The report's plan puts rig lookup and `apply(pose)` in `useFrame` (5.2). An exception inside `useFrame` is not caught by a React boundary. A missing bone, a NaN pose or a mis-sized pose array would therefore stop the loop rather than fall back to the original cast. Section 5.5's "no rig found" branch only handles the clean case.
- Required change: resolve the rig once in a layout effect or memo; on any failure (missing bone, joint count mismatch, mesh without skin) use the static path and `console.error`. Guard `apply` against non-finite values (use the existing `finite` helper pattern, `narrator.tsx:96`). Add a test for a malformed rig.

### 8. [moderate] Contradiction: "`stepNarrator` unchanged" versus hop arcs and the added presence logic

- Evidence: 5.2 says the root offset "still comes from `stepNarrator`'s travel, with an added hop arc `4*h*p*(1-p)`", yet 5.5 says `stepNarrator` and its spec are unchanged except for `talkStretch`. The hop arc has to live somewhere: in `narrator-motion.ts` (changing the pure core and its spec) or in the animator adding a Y offset that `narrator.tsx:171` then has to combine with `p.offsetY`. Pick one and say so. The `visit` state the animator needs (`arriving`/`leaving`) is also not what `stepNarrator` consumes (`present`). `visitStateOf` returns `leaving` only during the `farewell` stage (`dialogue.ts:212-219`), not while the narrator swims out. The report's mapping table treats `present=false` and `leaving` as one trigger. They are different moments.
- Required change: define the animator's inputs from `presence` and the motion state (travel progress) rather than from `visit` alone, and state which module owns the hop offset.

### 9. [moderate] The rest pose and measurement interact

- Evidence: the models are T-posed. `measureNarratorModel` measures the bind pose (the report notes width 12.8 for SpongeBob). The obstruction-aware placement in the narrator kit and `fallbackOf`/post layout use height and measured bounds. Lowering the arms for idle (and under reduced motion, 5.4) changes the true footprint from ~12.8 to ~6.6 wide. Also, a SpongeBob arm hinged at the box edge (|x| ~3.0-3.3, report 5.1) and swung 80-90 degrees down overlaps the sponge box (|x| <= 3.3, y 3.0-10.0), because the arm is ~1 unit thick and the pivot sits on the box edge. The report assumes a clean "arms lowered" pose without checking clipping.
- Required change: state the rest-pose arm angle, check intersection against the body box in the spike, and decide whether placement should use the bind width or the rest width (probably the bind width, harmlessly conservative; say so).

### 10. [moderate] Weight pins by material can open cracks at shared positions

- Evidence: 5.1 step 3 pins whole materials (`Base.002`, `Material.001`, ...) to `body` and gives `Shirt`/`Skin`/`Pants` distance weights. Vertices at the same position in different materials (shoulder, waist, neck line) receive different weights, which opens visible slits when a bone moves. The same hazard already burned the project (UV-seam slits, `compress.ts:45-47`, report risk #2). The report's mitigation is a visual check only.
- Required change: add to the validation pass a coincident-vertex test (same position within epsilon implies same joint/weight set, or an explicitly whitelisted boundary), plus the bind-pose displacement test, run at amplitudes the clips actually use.

### 11. [minor] Byte estimates are inferred and the 'deterministic from bounds' claim is overstated

- The estimate of ~15-30 KiB for SpongeBob is plausible against 111 KiB of headroom, and the report labels it as inferred. The bone positions are hard-coded fractions of H (5.1) and the report itself says they are "to be recomputed from the mesh rather than hard-coded". Reconcile: either the spec is data tuned by hand (reproducible, but not "derived from bounds") or an algorithm. Do not describe it as derived. The spike should record measured sizes.

### 12. [minor] Further small gaps

- First-frame T-pose: before the first `useFrame` applies a pose, the bones are in bind pose. The body group is `visible=false` until `stepNarrator` marks it visible (`narrator.tsx:170`), but the animator's apply must run in the same frame, before render. State this.
- Rigged/unrigged parity: an unrigged fork GLB (`VITE_BUNDLED_CHARACTERS`) keeps today's T-pose static narrator. Fine, but say that the T-pose is the intended fallback look.
- First draw of a skinned material triggers a shader compile (`USE_SKINNING` variant) on a lazy-loaded asset. Check for a visible hitch on the first arrival; warm it with `renderer.compile` if needed.
- Credits/attribution: report 5.1/risks says the rigged derivative must be marked as modified. Name the file (`libs/world/domain/src/lib/attribution.ts`, which already carries an entry for the interior) so the task has a concrete deliverable.

## Answers to the review questions

1. Asset facts: confirmed (see Verified). Per-primitive node matrices are real (12 distinct scales).
2. Feasibility of (b): the pipeline path is sound at file level (finding evidence above) but not at app level (findings 1-4). `JOINTS_0`/`WEIGHTS_0` survive reorder, quantize (kept as u8 / u8n) and meshopt, as the interior GLB shows. Per-primitive quantization does not break a shared skeleton because `scene` volume is used and IBMs absorb the transform.
3. Codebase fit: the pure-clip / thin-hook split matches `narrator-motion.ts`. Reduced motion is handled by the design on paper (5.4). The fallback is intact for load errors but not for render-loop errors (finding 7).
4. Missed risks: findings 2, 4, 6, 7, 9, 10. Better option dismissed: finding 5.

## Conditions for building

1. Fix the rig-identification mechanism (finding 1): node `extras` or exempt joints from `stripNames`; test that the runtime resolves all bones from the built GLB.
2. Start with a runtime spike (finding 3) on SpongeBob: skin, clone, measure, deform, unmount. Include a decision on option (d) runtime-generated weights / rigid segments (finding 5). Choose between pipeline-generated and load-time weights on the spike's evidence, and update the report.
3. If the pipeline step is kept, amend `verify.ts` `measureStanding` for skinned assets and add a bind-pose round-trip numeric test (finding 2). Document the step order `stand` -> `join` -> `rig` -> `stripNames` -> `compressGeometry`.
4. Dispose skeletons of the per-mount clone, or share one skeleton per narrator (finding 4), with a test.
5. Make the click path real before promising a react clip: mandatory hit-proxy, `raycast` disabled on skinned meshes, and verified canvas pointer delivery in dive and Bureau; no conflict with tap-to-advance (finding 6).
6. Rig setup failures must degrade to the static path inside effects/memos, never throw inside `useFrame`; guard non-finite poses (finding 7).
7. Resolve the hop-offset ownership and the `visit` vs presence input mapping (finding 8) and the rest-pose clipping and placement width (finding 9).
8. Add coincident-vertex weight consistency to the validation pass (finding 10).
9. Record the measured file sizes against the 250 / 200 KiB budgets from the spike or first build, and the attribution update (finding 12).
