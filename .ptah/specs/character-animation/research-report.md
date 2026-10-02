# Research Report - Narrator character animation (SpongeBob / Patrick)

Decision this supports: how to make the bundled narrators (`spongebob-narrator`, `patrick-narrator`) animate (idle, wave, talk-gesture, hop in/out, react), given the decimated LODs have no skeleton.
Bounds: not investigated - Blender/manual rigging by an artist, re-sourcing already-rigged models, physics/cloth. Nothing was run in a browser; every byte figure for skinned output is an estimate unless marked measured.

Labels used below: **[measured]** = I ran a script on the GLB or read the file; **[read]** = read from source; **[web]** = external source; **[inferred]** = my reasoning, not verified.

## 1. Summary & recommendation

Recommend **option (b): a pipeline-generated skeleton + distance-weighted skin, with the clips authored as pure TypeScript pose functions that mutate the bones each frame** (no animation data in the GLB). Both LOD files stay far inside their budgets (about 111 KiB and 138 KiB of headroom [measured]); the skeleton is generated deterministically from bounds, so it is reproducible in CI, needs no owner account, and the unskinned original-cast fallback is untouched.

Why it wins: the meshes are rigid-ish boxes/cones with limbs that are cleanly separable by position (below), so a hand-tuned capsule-weight scheme gives a better result than Mixamo's humanoid auto-rig can (no neck/elbows/knees; Patrick is not a humanoid), and it keeps the existing "functional core / imperative shell" split (`narrator-motion.ts` already works exactly this way). Option (c) is the cheapest in bytes but is fragile here because every primitive is quantized in its own local space (see 2 and 4).

Prototype SpongeBob first; Patrick reuses the same pipeline step with a different rig spec.

## 2. Asset facts (table)

All **[measured]** with @gltf-transform/core + the Meshopt decoder on `apps/web/public/models/*.glb`. Positions are quantized `int16 normalized` per primitive with the real size carried on the node (scale+translation), so the world-unit boxes below are decoded (`v*scale+translation`).

| Fact | spongebob-narrator | patrick-narrator |
|---|---|---|
| File size / budget (`asset-manifest.ts:158-178`) | 138,768 B (135.5 KiB) / 250 KiB -> **~111 KiB headroom** | 61,664 B (60.2 KiB) / 200 KiB -> **~138 KiB headroom** |
| Triangles / budget | 12,024 / 12,500 | 9,780 / 10,000 |
| Vertices | 7,877 | 6,063 |
| Meshes / primitives | 12 nodes, 12 meshes, 1 primitive each (one per material) | 1 node, 1 mesh, 1 primitive |
| Materials | 12 (Base.002, BeltShoes, Cheeks.002, EyeWhites.002, Material.001, Pants, Pupils.002, Shirt, ShoeBottom, Skin, Socks, material); 3 WebP 512x512 textures (Base.002, Pupils.002, Socks) | 1 (`patrick`), no texture; colour in `COLOR_0` vertex colours |
| Attributes | POSITION, NORMAL, TEXCOORD_0 (some) | POSITION, NORMAL, COLOR_0 |
| Extensions | EXT_meshopt_compression, EXT_texture_webp, KHR_mesh_quantization | EXT_meshopt_compression, KHR_mesh_quantization |
| Skins / joints / animations | **0 / 0 / 0** | **0 / 0 / 0** |
| Axes | Y up, stands on y=0, faces **+Z** (face materials sit at z>0: EyeWhites z 0.15..1.41, Pupils z 1.27..1.42) | Y up, y=0 floor, +Z forward |
| World-unit box | X -6.39..6.39 (arms), Y 0..10.03, Z -2.57..2.56 | X -4.89..4.90, Y 0..14.88, Z -3.21..3.21 |
| Source models | `assets/sponge_on_the_run_spongebob_base_model` (0 skins, 0 anims, 15 meshes) and the Patrick one (0 skins, 2 meshes), both CC-BY-4.0 by NickBob | same |

Both **sources are also unrigged**, so "recover the original rig" is not an option [read: scene.gltf of both, `skins`/`animations` absent].

Approximate T-pose segmentation **[measured, world units]**:

SpongeBob (height 10.03, centred on x=0):
- Torso+head: one rigid sponge box, |x| <= ~3.3, y ~3.0..10.0 (Base.002 spans y 4.12..10.03, face meshes y 5.5..8.8). It has no neck: head and body are the same box.
- Arms: horizontal, thin, at y ~4.7..5.9, running from the body side at |x| ~3.0 to the hand tip at |x| = 6.39 (Skin mesh x +-6.39; Shirt sleeves x +-3.96). ~3.4 units long (about a third of the height). Band y 4.5..5.0 shows empty |x|>3 bins, confirming they are thin (about 1 unit tall).
- Pants/hip: y ~2.2..3.6 (Pants mesh, |x| <= 2.55).
- Legs: two sticks, |x| 0.5..1.4 each (empty centre column at y<2.5), y 0.5..2.9; Socks y 0.51..1.59; shoes y 0..1.3 (ShoeBottom y 0..0.13, x +-1.46, feet extend forward to z 0.78).
- Face parts (EyeWhites, Pupils, Cheeks, Eyelashes, Teeth) must follow the torso box rigidly.

Patrick (height 14.89):
- Head point: y > ~9.9, narrowing from x +-1.8 to +-0.8 at the top.
- Body/limb points: widest at y ~3.9..5.9 (x +-4.9, z +-3.2); the arms are the star's side points, thick cones x 3..4.9, y ~3.5..8 (x +-3.99 at y 7.9, +-4.55 at 6.9, +-4.83 at 5.9, +-4.89 at 4.9, +-4.67 at 3.9).
- Legs/base: y < ~3.0, x +-2.7 at y 1.9 (1,352 vertices in that band: the densest part). Whether the two legs are separated at the bottom was not resolved from the band histogram (see Unknowns).

These are band histograms, not a vertex-level classification; the pipeline step must classify per-vertex.

## 3. Current narrator runtime [read]

- `libs/world/feature/src/lib/narrator.tsx`: `<Narrator cast present talking ...>`. `cast` is a built-in id or `{ object, height?, clone? }` (a static model). A `useFrame` calls pure `stepNarrator` then copies the pose onto one `body` group (position/rotation/scale) and writes `uniforms.talk/swim/time`. Comment states "brought to life without bones". Model objects are mounted directly (`<primitive object={model}/>`) under a fit-to-height group.
- `narrator-motion.ts`: pure, allocation-free. State: `presence` (0..1), springs for yaw/talk/swim, a wrapped `clock`; `NarratorPose` struct (offset, yaw/pitch/roll, scale, `talk`, `swim`, `visible`, `phase`); events `'settled'|'exited'`. Idle = bob + sway; talking = squash-and-stretch + hop (`talkPulse`, `squashStretch`); presence travel = `enterFrom/exitTo` swim. Reduced motion: no travel/bob/sway, `talk` scale pulse only. Spec: `narrator-motion.spec.ts`.
- `narrator-material.ts` / `narrator-uniforms.ts` / `vertex-motion.ts`: shader patches via `onBeforeCompile` for the **procedural cast only** (fish/crab); the bundled models use the GLB's own materials, no vertex motion.
- `narrator-cast.ts`: `measureNarratorModel` (Box3 of the object, cached per object), `narratorHeight`, `narratorMotion(cast)` (tuning per cast; the original cast is the fallback).
- `use-compressed-model.ts`: `GLTFLoader` + `MeshoptDecoder`; returns `gltf.scene.clone(true)` per caller. **Its doc comment says "Static models only: skinned meshes need SkeletonUtils.clone".** This must change for a rigged narrator.
- `apps/web/src/app/narrators/landmark-narrator.tsx`: `LandmarkNarrator` picks the original cast (`CastNarrator`) when `choice.kind === 'cast'`, the tier gates the model (`assetAllowed`), or load fails (`NarratorModelBoundary`); otherwise `ModelNarrator` loads the GLB lazily under `Suspense` and renders `<Narrator cast={{object,height}}/>`. This is the fallback seam that must stay intact.
- `narrated-visit.tsx:211-230`: passes `talking={dialogue.typing}` and `present` to `LandmarkNarrator`; `visitStateOf(dialogue)` (`dialogue.ts:212`) maps stage/typing to `'arriving' | 'talking' | 'ready' | 'leaving'` and is surfaced as `data-visit-state` in `visit-hud.tsx:237` and `bureau-hud.tsx:181`. The 3D narrator currently receives only the booleans `present` and `talking`, not the four-state value, and has no pointer handling (no click/react today).
- Registered asset budgets `ASSET`: manifest entries `spongebob-narrator` (250 KiB, 12,500 tris, standingHeight 10.033) and `patrick-narrator` (200 KiB, 10,000 tris, standingHeight 14.889), both `lazy: true`, `minimumTier: 'medium'` (`asset-manifest.ts:158-178`).
- Pipeline (`tools/asset-pipeline/compress.ts:36-62` OPTIONS, `pipeline.ts:298-330` `optimise`, `:609-630` `compressGeometry`): decimate (`simplifyAttributeAware`) -> `join` -> textureCompress -> `stripNames` -> reorder+quantize+meshopt. **The pipeline already supports skinned input**: `mergeIdenticalSkins`, `dropOrphanedSkinAttributes`, `quantizationVolume: skinned ? 'scene' : 'mesh'`; `pineapple-interior.glb` currently ships 1 skin [measured], so a skinned+meshopt+quantized GLB loads through the existing path. (Which skin it is and whether it is ever rendered skinned was not checked.)

## 4. Options compared

Only (a), (b), (c) from the charter were examined; plus the (b)/(c) hybrid considered below. Byte figures for (b) are **[inferred]** from vertex counts, not built.

| | (a) Mixamo auto-rig | (b) Pipeline skeleton + procedural clips (recommended) | (c) Vertex-shader region masks |
|---|---|---|---|
| Quality - SpongeBob | Poor-to-fair: auto-rigger wants a humanoid with chin/wrist/elbow/knee/groin markers [web]; SpongeBob has no neck, a box torso and stick limbs, so the spine/neck bones would bend a rigid box; ~65-bone standard skeleton, mocap clips are realistic-human, wrong for a cartoon. | Good: arms/legs are cleanly separable; torso+face pinned rigid; you author cartoon poses (big wave, squash hop). | Fair-good: arm swing about a shoulder pivot works; hop/leg bend works; no true hierarchy (forearm), normals/flat shading need rotating in the shader. |
| Quality - Patrick | Likely rejects/garbles (not humanoid). | Good: star points get one bone each (+ small head/tail), cone limbs rotate about the body centre. | Good for point swings. |
| Eng. cost | Low code, **high manual**: owner uploads, downloads FBX/DAE, convert to glTF (extra tool), re-run decimation/weights check; repeats for each model/LOD change; not CI-reproducible. | Medium: one pipeline step (~300-400 lines + tests), runtime rig/clip modules, small clone-path change, tests. | Medium-low pipeline (none), high shader work: loaded GLB materials are shared, so needs `onBeforeCompile` patching of loaded `MeshStandardMaterial`s (+ depth/shadow variants), per-primitive constants. |
| Runtime cost | 65 bones: matrix palette fine on GPU, but 65 CPU bone updates for nothing. | ~13-14 bones, GPU skinning (4 influences). CPU: ~14 quaternion sets per frame. | Per-vertex ALU only; no CPU. |
| Bytes (after meshopt) | Mixamo's weights are full-precision 4-influence on 65 bones: likely 30-60 KiB per model [inferred]. | JOINTS_0 (u8x4) + WEIGHTS_0 (u8x4 normalized) = 8 B/vertex raw: SpongeBob ~63 KB raw / Patrick ~48 KB raw; meshopt attribute coding on mostly-rigid weights (long runs of 1 joint, 1.0) is likely 25-40% of that, so **~15-30 KiB (SpongeBob), ~12-25 KiB (Patrick)** [inferred]. Plus skin (14 IBMs, ~1 KB). No animation data (clips in code). Stays within budget; **measure with `assets:compress`**. | 0 bytes (maybe 4 B/vertex if a mask attribute is baked, not required). |
| Licence | Adobe FAQ (search snippet, page itself returned 403 to me [web, unverified in full]): characters and animations "royalty free for personal, commercial, and non-profit projects". Mixamo needs an Adobe ID for the upload [web]. The owner must upload a model derived from Nickelodeon IP; ToS wording on uploaded content not retrieved. CC-BY-4.0: the rigged output is an adaptation of NickBob's work and must keep the credit and indicate changes (same as today's decimation). | None added: our own derivative of the CC-BY source; same attribution + "changes indicated" as the current LODs (README/credits page must say rigged). | Same as (b). |
| Risk | Account/ToS dependency on the owner, non-reproducible binary blob, bad deformation on box/star shapes, can't be automated or re-run when decimation changes. | Weight painting by distance can tear at joints (arm root into sleeve) -> mitigate with smooth falloff and per-material pins; skinned bounding boxes/culling; clone path (`SkeletonUtils.clone`). | **Per-primitive quantization**: every primitive has its own scale/translate (12 distinct node matrices in SpongeBob [measured]), so a shader mask expressed in "model" coordinates is wrong unless the node matrix is passed in or the quantization volume changed; mask regions hard-coded per model; harder to attach props/accessories; harder to unit test (GLSL). |
| Compat. with meshopt/quantization | Fine (same path as the interior's skin). | Fine: `quantize` with `quantizationVolume: 'scene'` bakes the dequantization into inverse bind matrices for skinned meshes [web: KhronosGroup/glTF#2411, gltf-transform.dev quantize doc]; pipeline already does this. | Works but see per-primitive volume problem. |
| Fit with functional core / shell | Poor: clips are Mixamo data blobs or GLB animations, not pure code. | **Best**: clip = pure function `(t, params) -> bone rotations`, mirrors `stepNarrator`. | OK: pose math pure, but result lands in GLSL. |

Hybrid note: (b) subsumes (c)'s benefit - the weights ARE position-derived masks, just baked once in the pipeline (2-4 influences per vertex) instead of recomputed per frame in a shader, and the hierarchy/bytes cost is small. I do not recommend (c) except as a zero-byte stopgap for the arm-wave only.

SpongeBob vs Patrick under each option: SpongeBob = rigid box + thin limbs (all options OK; (b) best); Patrick = starfish where limbs are body-mass (a) fails, (b) works with radial/capsule weights from a body centre, (c) works but limb bases are blurry cones with no clear pivot.

## 5. Recommended design

### 5.1 Pipeline step (tools/asset-pipeline)

New file `tools/asset-pipeline/rig.ts` (pure functions over a glTF-Transform `Document`), wired in `pipeline.ts` `optimise()` **after `join`/before `compressGeometry`** (so weights are computed on the decimated, welded, joined geometry in world/standing coordinates, and `quantize` + `mergeIdenticalSkins` handle the rest). New option on `AssetOptions`: `rig?: RigSpecId` (e.g. `'spongebob' | 'patrick'`), set in `compress.ts` `OPTIONS` for the two narrator ids only. Specs live in `tools/asset-pipeline/rig-specs.ts`: data, in the character's *relative* coordinates (fractions of standing height, since `standOnGround` already normalises position and the manifest records `standingHeight`).

Inputs: the decimated doc (positions in world units after node baking: `join({keepMeshes:false})` yields one node per material; bake node transforms before skinning, as `bakeWorldTransform` does for landmarks), plus the rig spec. Outputs: one `Skin` with joints as child nodes of a `root` node, `JOINTS_0` (u8) and `WEIGHTS_0` (u8 normalized, sum to 255) on every primitive, IBMs from bind-pose world matrices; **no animations**. Names: joints keep stable names (`stripNames` currently blanks names; skip joints in that pass or write a `extras.rig` map with joint index -> semantic name; runtime needs to find bones). Prefer `skin.extras = { rig: 'spongebob', joints: [...] }` read via `userData` in three.

Bone positions derived from bounds (SpongeBob, with H = 10.03; numbers from section 2, to be recomputed from the mesh rather than hard-coded: x extents from the Skin mesh bounds, y from slab histograms):
- `root` (0,0,0); `hips` (0, 0.29H, 0); `body` (0, 0.30H, 0) - rigid sponge box incl. all face meshes.
- `shoulder.L/R` (+-0.30H, 0.51H, 0) (arm root just inside the box edge, |x| ~3.0); `elbow.L/R` midway (|x| ~4.7); `hand.L/R` (|x| ~6.2). Arm axis is horizontal +-X.
- `hip.L/R` (+-0.095H, 0.26H, 0); `knee.L/R` (+-0.095H, 0.14H, 0); `foot.L/R` (+-0.095H, 0.02H, 0.05H).
- ~14 joints. A `head` bone is optional (box has no neck); recommend omitting it and nodding by torso pitch.
Patrick (H = 14.89): `root`, `body` (0, 0.37H, 0), `head` (0, 0.66H, 0), `arm.L/R` pivots at the body centre side (+-0.12H, 0.43H, 0) with tip near (+-0.33H, 0.33H), `leg.L/R` (+-0.09H, 0.20H, 0); optional `armTip.L/R` for a wave curl. ~8 joints.

Weight scheme (deterministic, no per-vertex hand painting):
1. Per bone a capsule (head, tail, radius) from the spec; compute point-to-segment distance `d_i` per vertex.
2. Raw weight `w_i = exp(-(d_i / r_i)^2 * k)` (k ~ 1.5-2) -> smooth falloff; keep the top **3** (max 4), renormalise, quantise to u8 with the residual added to the largest weight so the sum is exactly 255.
3. **Pins by material** (the spec names materials, as `ratioByMaterial` does): `EyeWhites.002, Pupils.002, Cheeks.002, Eyelashes.002, Teeth.002, Base.002, Material.001, material` -> 100% `body`; this keeps the face un-sheared. `Shirt`/`Skin` use capsule weights (arm sleeves, glove, legs). `Pants` blends `body` <-> `hip.*`. `Socks/BeltShoes/ShoeBottom` -> legs/feet, 1 influence.
4. Arm root blend zone: skin weight transitions `body -> shoulder` over ~0.5 units inside the box edge, so the shirt sleeve does not tear when the arm rotates.
5. A validation pass (fails the build, like `assertLandmarkRegions`): every vertex has weight sum 255, <= 4 influences, joints index < joint count, no vertex with bone weight > 0 for a bone whose capsule is farther than 3r (catches a mislocated spec), skin count == 1, and the output stays within `budgetBytes` (existing `verify.ts`).
6. A bind-pose snapshot test: apply a known rotation to `shoulder.R` in node, check max vertex displacement is confined to the right arm region and the face vertices are unmoved.

Triangle budget is untouched (no geometry change); `triangleBudget` stays at 12,500/10,000. Raise `budgetBytes` only if measured output exceeds it (not expected).

### 5.2 Runtime modules (convention: kebab-case, pure `.ts` + `.spec.ts`, thin `.tsx`)

In `libs/world/feature/src/lib/`:
- `narrator-rig.ts` (pure data+types): `BoneName`, `NarratorRigSpec` (rest rotations per bone, per-character tuning scale), `type BonePose = Record<BoneName, [qx,qy,qz,qw]>` or a flat `Float32Array`; plus `identityPose`, `blendPose(a,b,w,out)` allocation-free (slerp-free nlerp is fine at these angles).
- `narrator-clips.ts` (pure): each clip is `(t: number, params, out: BonePose) => void`, composed by weights. Clips: `idle` (breath/sway: arms low sway +-4 deg, slow knee flex), `wave` (right arm raised to ~100 deg abduction, forearm oscillating +-25 deg at ~5 rad/s for ~1.6 s), `talkGesture` (alternating small arm raises on `talkPulse` beats, accent every few syllables; shares `talkPulse` from `narrator-motion.ts`), `hopIn` / `hopOut` (anticipation crouch: knees+hips bend, body scale squash; flight: arms up, legs tucked; landing: squash then settle; the root offset still comes from `stepNarrator`'s travel, with an added hop arc `4*h*p*(1-p)` per hop, count 2-3 along the path), `react` (clicked: quick surprise jump + arm flare then wave-back; ~0.7 s one-shot, spring back).
- `narrator-animator.ts` (pure state machine): `createNarratorAnimator`, `stepNarratorAnimator(state, input, tuning, out)` where input = `{ dt, visit: 'arriving'|'talking'|'ready'|'leaving', present, reducedMotion, poked: boolean }`. Mirrors `stepNarrator`: critically damped weights per clip (`springStep` reused), one-shot clips with a time cursor, no allocations.
- `use-rigged-narrator.ts` (thin hook): given the loaded `Object3D`, finds the `SkinnedMesh`es and bones by name (from the skin's `userData`), returns a `{ bones, apply(pose) }` imperative applier; sets `frustumCulled = false` on the skinned meshes (or inflate the bounding sphere) because bind-pose bounds exclude the swung arms.
- `narrator.tsx` (edit): `NarratorModel` gains an optional `rig?: RiggedModel`; in `useFrame` call `stepNarratorAnimator` then `rig.apply(pose)`; `stepNarrator` still owns presence/travel/facing/events (single source of truth for `settled`/`exited`); under a rig the squash-stretch of `stepNarrator` is reduced (tuning `talkStretch` ~0.03) so the clips carry the gesture. `NarratorProps` gains `visit?: VisitState` (optional; default derived from `present`/`talking`: `!present -> leaving`, `talking -> talking`, else `ready`) and `onPoke?`/`poked` (see 5.3).
- `use-compressed-model.ts` (edit): when the loaded scene contains a `SkinnedMesh`, use `SkeletonUtils.clone(gltf.scene)` (three/examples/jsm/utils/SkeletonUtils.js) instead of `scene.clone(true)`, update the doc comment. Disposal path (`retainModel`, `disposeObjectTree`) must also dispose `skeleton.boneTexture` for each skinned mesh (check `disposeObjectTree` in `ocean-floor.tsx` handles it; not verified).
- `narrator-cast.ts` (edit): `measureNarratorModel` on a skinned object measures the bind pose (arms out in T-pose, width 12.8 for SpongeBob). Height-based fitting uses `bounds.height` and centring uses `centreX/Z`, so the T-pose width is harmless; do not change.

In `apps/web/src/app/narrators/` (edit): `landmark-narrator.tsx` passes `visit` from `visitStateOf(dialogue)` (computed in `narrated-visit.tsx`, which already has `dialogue`) in addition to `talking`/`present`; `ModelNarrator` stays the only rigged path, `CastNarrator` and the fallback boundary are unchanged.

### 5.3 State and interaction mapping

| Trigger | Clip |
|---|---|
| `visit === 'arriving'` / presence 0..1 | `hopIn` (hop arc along the existing enter path; arms up in flight), then on `settled` auto-play `wave` once |
| `'talking'` (typing) | `idle` + `talkGesture` weight 1 (existing talk spring) |
| `'ready'` | `idle` only (calm breathing); `talkGesture` decays |
| `'leaving'` / `present=false` | optional `wave` goodbye at the start (first 0.6 s), then `hopOut` along the exit path |
| Click/tap on the narrator (R3F `onClick` on the root group, `stopPropagation`, ignored while `arriving`/`leaving`) | `react` one-shot, with a 1.2 s cooldown; also fires an optional `onPoke` for a speech reaction later |
Hover: none (touch parity). Raycasting a skinned mesh uses the bind-pose geometry unless `boundingSphere`/`computeBoundingBox` is updated; click on a swung arm may miss: acceptable, or add an invisible capsule hit-proxy on `body`.

### 5.4 Reduced motion

Same contract as today: no travel, bob, sway, hop or wave. The animator emits a single static pose (bind pose, arms lowered by a fixed pose preset) and only a gentle uniform scale pulse while talking (existing `reducedTalkScale`), `react` becomes a 150 ms scale pulse or nothing. The `settled`/`exited` events are still emitted immediately by `stepNarrator`.

### 5.5 Fallback intact

- `LandmarkNarrator`'s tier gate and `NarratorModelBoundary` are untouched: a load failure or a tier below `medium` still renders `CastNarrator` (the original cast).
- A model with no skin (e.g. an older GLB, a fork using `VITE_BUNDLED_CHARACTERS` with custom models) hits `use-rigged-narrator`'s "no rig found" branch and runs exactly today's static path (squash-and-stretch via `stepNarrator`). So rigging is purely additive; unrigged GLBs still work.
- `stepNarrator` and its spec are unchanged except for the optional `talkStretch` tuning for rigged characters.

### 5.6 Test strategy

- `rig.spec.ts` (pipeline): synthetic box-and-sticks document -> weights sum to 255, <= 3-4 influences, face-material vertices pinned to `body`, arm vertices weighted to the correct side (L/R not crossed), joint indices valid; plus a snapshot of joint positions for the real SpongeBob LOD (reads the committed GLB, like `verify.ts`).
- `narrator-clips.spec.ts`, `narrator-animator.spec.ts` (pure, no three): clip periodicity, one-shot end state returns to identity within epsilon, state machine transitions for `arriving -> talking -> ready -> leaving`, `poked` cooldown, reduced-motion emits only the static pose, non-finite dt/clock safe (follow `narrator-motion.spec.ts`).
- `narrator.spec.tsx`: renders with a tiny hand-built `SkinnedMesh` (two bones) and asserts bone quaternions change on `talking`; a rigless model path still renders (regression for fallback).
- E2E: existing narrator flows (nightly) gain an assertion that `data-visit-state` and the canvas still progress; no screenshot-pixel assertions on the clips. Run `assets:compress` + `assets:verify` and diff against budgets.

## 6. Risks & unknowns

Risks:
1. Weight quality at arm roots and pants/legs may need tuning; mitigated by the pins, the falloff and a one-screen visual check (an inspector page or a `tools/asset-pipeline` debug export that colours vertices by dominant bone - suggested, not existing).
2. The decimated mesh was chosen for static silhouette: UV-seam slits on the face (see `compress.ts` comment) can open when the skin deforms; the face is pinned rigid so risk is mostly confined to the sleeves/legs.
3. Skinned meshes are not instanced/culled as before: `frustumCulled=false` and a boneTexture per narrator clone (tiny). GPU cost for 12k tris / 14 bones is negligible [inferred]; verify with the existing perf budget run.
4. `SkeletonUtils.clone` plus the shared-cache dispose rules (`retainModel`) - bone textures must be released on unmount.
5. Joint names are currently stripped by `stripNames`; the rig lookup must survive that (use `skin.extras` or exclude joints from stripping).
6. Click hit-testing against the bind-pose bounds (see 5.3).
7. IP/licence posture is unchanged by (b) but not improved: the models are Nickelodeon characters under the owner's recorded risk acceptance (`.ptah/scope-decisions.md`); a rigged derivative must keep the CC-BY credit and say it was modified.

Unknowns (smallest experiment in brackets):
- Actual compressed size of the skinned LODs (estimates above) [run `npm run assets:compress` on a branch with the rig step and read the report].
- Whether Patrick's legs are separate below y~2 and where the arm/leg pivot should sit [per-vertex x-histogram on y<3 and a coloured-by-bone debug export].
- Mixamo's current ToS on uploaded third-party-IP characters and the rigged export's redistribution terms [Adobe FAQ returned HTTP 403 to my fetch; the owner or a browser session must read https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html and the Adobe ToS]. Not needed if (b) is chosen.
- Whether `disposeObjectTree` already disposes skeleton bone textures [read `ocean-floor.tsx`, not done].
- Which `pineapple-interior.glb` node uses its skin and how it is cloned today (a useful precedent for the clone path) [not checked].
- Perceived quality of the hand-authored clips: needs an artist/owner review pass; the clip list is deliberately small (5 clips).

## 7. Sources

External (retrieved via search, dates not shown by the tool; treat as undated):
- Mixamo FAQ, Adobe (search-result snippet: characters and animations "royalty free for personal, commercial, and non-profit projects"; page itself returned HTTP 403): https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html
- Adobe: upload and rig 3D characters with Mixamo (log in with Adobe ID; auto-rig for uploaded characters): https://helpx.adobe.com/creative-cloud/help/mixamo-rigging-animation.html
- Mixamo auto-rigger works only for humanoid characters with specific requirements (forum snippet, practitioner claim): https://blenderartists.org/t/mixamo-rigging-error/1460009
- glTF-Transform `quantize` doc (applies a compensating transform to the parent node, or inverse bind matrices for a skin): https://gltf-transform.dev/modules/functions/functions/quantize
- KhronosGroup/glTF issue 2411 (KHR_mesh_quantization on skinned meshes bakes the dequantization matrix into the IBMs): https://github.com/KhronosGroup/glTF/issues/2411
- glTF tutorial on skins (inverse bind matrices semantics): https://github.khronos.org/glTF-Tutorials/gltfTutorial/gltfTutorial_020_Skins.html

Local (all read/measured this session): `apps/web/public/models/{spongebob,patrick}-narrator.glb`; `libs/world/domain/src/lib/asset-manifest.ts:158-178`; `tools/asset-pipeline/{compress.ts,pipeline.ts}`; `docs/asset-compression-report.md:26-27`; `libs/world/feature/src/lib/{narrator.tsx,narrator-motion.ts,narrator-material.ts,narrator-uniforms.ts,narrator-cast.ts,use-compressed-model.ts}`; `apps/web/src/app/narrators/{landmark-narrator.tsx,narrated-visit.tsx,dialogue.ts,visit-hud.tsx}`; `assets/sponge_on_the_run_*/license.txt` (CC-BY-4.0, NickBob).
