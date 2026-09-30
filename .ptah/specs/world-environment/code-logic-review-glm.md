# Code Logic Review — `world-environment` (independent, read-only)

**Verdict: REVISE — 7/10** · 0 blocking · 1 serious · 4 moderate · 4 minor · 8 failure modes

Scope read in full: all 18 files under `libs/world/feature/src` (11 sources, 6 specs, index),
`apps/web/src/app/app.tsx`, `app.spec.tsx`, `main.tsx`, `apps/web/public/models/placements.json`.
Tests run uncached: `world-feature` 22/22 pass, `web` 3/3 pass. The scene renders (visual
suite, per orchestrator). The score reflects a sound core — correct GPU lifecycle for
everything the feature itself creates, tested idempotent shader patching, clamped and
deterministic config — held back by one unguarded failure path that blanks the site and a
cluster of lifecycle gaps around the loaded GLB.

---

## Numbered defects

### 1. Serious — a failed GLB load has no error boundary: the scene never renders and nothing tells the visitor

- File: `apps/web/src/app/app.tsx:28`, `libs/world/feature/src/lib/ocean-world.tsx:109-111`,
  `libs/world/feature/src/lib/ocean-floor.tsx:34`
- Failure scenario: `useLoader(GLTFLoader, url)` rejects (404 on a sub-path deploy where
  `BASE_URL` is wrong, CDN hiccup, visitor goes offline mid-load, meshopt decode error).
  The only guard in the tree is `<Suspense fallback={null}>` (`ocean-world.tsx:109`), which
  covers the *loading* state, not the *failed* state. The thrown rejection propagates past
  every component in both files — neither `App` nor `OceanWorld` installs an error boundary —
  so the R3F tree is left failed: the user gets an empty page/canvas whose only trace is a
  console error. Worse, R3F's loader cache keeps the rejected promise keyed by URL, so even
  a later re-mount of `OceanFloor` re-reads the cached rejection and re-throws: the failure
  is permanent for the session with no recovery path.
- Suggested fix: an `ErrorBoundary` class component inside the `<Canvas>` (or just inside
  `<WorldSpace>`, wrapping the `<Suspense>` at `ocean-world.tsx:109`) rendering a null or
  minimal fallback, plus calling `useLoader.clear(environmentUrl)` before any retry so the
  poisoned cache entry is dropped. This belongs in `OceanWorld` itself, not `App`, so every
  consumer inherits it.

### 2. Moderate — GLTF geometries/materials/textures are never disposed; the loader cache pins them forever

- File: `libs/world/feature/src/lib/ocean-floor.tsx:33-44`
- Failure scenario: `OceanFloor` unmounts (HMR, a future route change, a swap of
  `environmentUrl`) with no cleanup effect. `useLoader`'s global cache retains `gltf.scene`,
  so ~65k triangles of geometry plus all materials and textures stay resident in JS *and*
  GPU memory. Repeated environment swaps accumulate one full scene per URL. The contrast
  with the rest of the feature is stark: particles (`ocean-particles.tsx:31-32`) and the
  caustics texture (`ocean-world.tsx:95`) are disposed correctly; the heaviest asset in the
  app is the one thing nobody releases.
- Suggested fix: a `useEffect` cleanup that calls `useLoader.clear(url)` and traverses
  `gltf.scene` disposing geometries/materials (and their textures) — with a comment that
  disposal forces re-upload if the cached scene is reused; or adopt drei's `useGLTF` with
  its `dispose` convention if the meshopt-version rationale (documented at
  `ocean-floor.tsx:8-13`) ever stops applying.

### 3. Moderate — StrictMode double-invoked constructors leak GPU objects every dev mount

- File: `libs/world/feature/src/lib/ocean-world.tsx:85-88`,
  `libs/world/feature/src/lib/ocean-particles.tsx:25-32` (via `particle-field.ts:49-58,116-144`)
- Failure scenario: `main.tsx:10` mounts the app in `<StrictMode>`. React double-invokes the
  `useState` initializers at `ocean-world.tsx:85-88` (two 256×256 `DataTexture`s + their
  128 KB `Uint8Array` patterns created, one discarded unreleased) and the `useMemo` bodies in
  `ParticleField` (a duplicate `InstancedBufferGeometry` + `ShaderMaterial` per field per
  render pass). The *kept* objects are disposed correctly by the cleanup effects; the
  *discarded* duplicates from the first invocation are never disposed. Dev-only, but it
  happens on every hot-reload cycle of every dev session and inflates dev memory/GPU
  profiling, which is exactly when people go looking for leaks.
- Suggested fix: accept and document (R3F's own docs acknowledge this StrictMode wrinkle),
  or construct the texture/uniforms inside the `useEffect` that already exists for them, or
  memoize module-level singletons since they are content-identical across mounts
  (`createCausticsTexture()` takes no config).

### 4. Moderate — `resolveOceanConfig` clamps a subset; NaN speeds and bad colours pass through and fail silently

- File: `libs/world/feature/src/lib/ocean-config.ts:120-134`
- Failure scenario: the clamp list covers `fog.density`, `caustics.intensity`,
  `caustics.scale`, `particles.count`, `bubbleShare`, `reducedMotionScale` — but not
  `caustics.speed`, `planktonSize`/`bubbleSize`, or the rise/drift speeds, and no colour
  string is ever parsed. Consequences, all silent: `caustics.speed: NaN` makes
  `causticsTime.value` NaN (`ocean-world.tsx:61`), so the caustics sample at NaN UVs and the
  pattern simply vanishes — no error, no warning. A NaN `bubbleRiseSpeed` makes
  `home.y = fract(NaN)` in the vertex shader (`particle-field.ts:77`), so every bubble vertex
  is NaN, is clipped, and the entire bubble field disappears without a console trace. A
  malformed hex in `fog.color` reaches `THREE.Color`, which logs once and renders black —
  the visitor sees a black page, not an error. These knobs are exactly what the planned
  `template-config`/`quality-tiers` layers will drive, so the unguarded surface is the
  surface future code will touch.
- Suggested fix: extend the clamps in `resolveOceanConfig` to `speed` (e.g. 0–2), sizes
  (>0–10), and rise/drift speeds (0–20); validate colours with a `new THREE.Color(s)` +
  `try/catch`-style parse at resolve time (the feature already depends on three) and fall
  back to the default colour on failure.

### 5. Moderate — `sceneToWorld`'s default scale can silently disagree with `OceanWorld`'s `worldScale` prop

- File: `libs/world/feature/src/lib/world-space.tsx:27-31` vs `ocean-world.tsx:75`
- Failure scenario: the WORLD_SCALE=20 convention is excellently documented
  (`world-space.tsx:1-22`) and the happy path is unambiguous: landmarks are children of
  `<WorldSpace>` in raw scene-world units, camera targets go through `sceneToWorld`. But
  the API allows the two halves to diverge: `OceanWorld` accepts a `worldScale` prop that
  rescales the *rendered* world, while `sceneToWorld()` defaults to the constant 20 and
  knows nothing about it. A consumer that passes `worldScale={30}` and later has
  landmark-kernel compute camera targets via bare `sceneToWorld(offset)` gets every target
  1.5× short of its landmark — a camera that aims beside the pineapple with no error
  anywhere. The invariants hold only by comment, not by construction.
- Suggested fix: cheapest — delete the `worldScale` prop and make 20 the only scale (the doc
  already says "change the scale here ... never per landmark"); or provide a
  `useWorldScale()` context that both `WorldSpace` and a scale-aware `sceneToWorld` variant
  read, so the conversion cannot drift from the transform.

### 6. Minor — float32 clock precision degrades over multi-day sessions

- File: `libs/world/feature/src/lib/ocean-world.tsx:58-62`, `particle-field.ts:65-90`
- Failure scenario: `time.value` grows unbounded and is uploaded as a float32 uniform.
  Below ~2^16 s (~18 h) the ulp is ≤ 8 ms and motion is smooth; past ~2^17 s (~36 h, a
  kiosk left open) the ulp exceeds 16 ms and the `fract()`-based rise (`particle-field.ts:77`)
  and the `sin` wobble (`particle-field.ts:80-81`) start to step, then freeze at discrete
  positions. The caustics clock stays usable far longer (tiles/speed is small). The
  `MAX_FRAME_SECONDS` clamp at `ocean-world.tsx:22,59` correctly prevents tab-switch jumps —
  this is the only remaining time-domain gap.
- Suggested fix: wrap `time.value` modulo a period chosen so the wobble phase repeats
  (LCM-ish of the wobble frequencies, or simply reset both clocks to 0 when
  `document.hidden` transitions to visible), keeping all motion continuous.

### 7. Minor — degenerate screen-space derivatives can NaN out caustics at grazing angles

- File: `libs/world/feature/src/lib/caustics-material.ts:115`
- Failure scenario: `normalize(cross(dFdx(vCausticsWorld), dFdy(vCausticsWorld)))` is computed
  per fragment. For near-edge-on geometry or extremely distant fragments the derivatives
  underflow toward zero and the cross product degenerates; `normalize` of a zero vector is
  NaN, which propagates through `causticsFacing` into `gl_FragColor` — potential black or
  flickering specks along silhouette edges. Observed risk is low (the fog hides distant
  fragments before precision collapses) but the failure is silent.
- Suggested fix: guard with `length(cross(...)) > 1e-8 ? normalize(...) : vec3(0.0, 1.0, 0.0)`
  or compute `causticsFacing` from the geometry normal where one exists.

### 8. Minor — perf: MSAA at dpr 2 quadruples fragment cost on hi-dpi mid-tier laptops

- File: `apps/web/src/app/app.tsx:23-24`
- Failure scenario: `dpr={[1, 2]}` with `antialias: true` means a 1440p hi-dpi screen renders
  ~4× the fragments of dpr 1 *and* pays MSAA on top, for a scene that is mostly fog and
  soft particles — aliasing is least visible exactly where the canvas runs hardest. The
  scene's own cost profile is good (2 particle draw calls, no shadows, caustics cost is 2
  texture taps + derivatives), so the framebuffer policy is the dominant perf lever. The
  60 FPS-on-mid-tier charter target is plausible but unproven at the dpr-2 + MSAA corner.
- Suggested fix: cap dpr at 1.5 on the top tier or disable `antialias` when `dpr > 1.5`
  (drei's `<AdaptiveDpr pixelated>` is the lazy option); revisit `powerPreference:
  'high-performance'` if battery life on laptops ever becomes a complaint.

---

## Five logic questions

1. **Fails silently?** Defect 4 (NaN speed/riseSpeed silently removes caustics or a whole
   particle field, no console trace) and defect 1 (a rejected GLB leaves an empty scene with
   only a console error). Also `caustics-material.ts:115` (defect 7).
2. **User action with unexpected behaviour?** Mounting/unmounting the scene repeatedly (HMR,
   navigation) leaks the entire GLTF scene (defect 2). Passing a custom `worldScale` then
   computing camera targets with default `sceneToWorld` mis-aims the camera (defect 5).
3. **Input data giving a wrong answer?** Config overrides: unclamped `caustics.speed`,
   sizes and rise speeds, and unparsed colour strings (defect 4) produce a *different-looking
   but non-erroring* scene — the worst failure class for an art-direction config.
4. **Dependency fails?** The GLB fetch/decode failure path is entirely unhandled past
   Suspense (defect 1, serious). `matchMedia` absent → hook returns false, safe
   (`use-prefers-reduced-motion.ts:5-8`); old engines with `matchMedia` but without
   `addEventListener` never get change events, so a preference toggle mid-session is missed
   (minor, line 11).
5. **Missing but never specified?** Session recovery for the loader (clearing the rejected
   cache entry), resource release for the GLB, and a defined behaviour when the app is left
   open for days. None of these are in the charter text; the charter's own "navigable
   underwater scene" is what defect 1 undermines.

## Verified sound (evidence, not praise)

- **Resource lifecycle for feature-owned objects**: particle geometry/material disposed on
  unmount (`ocean-particles.tsx:31-32`), caustics `DataTexture` disposed
  (`ocean-world.tsx:95`), disposal keyed to the object so re-created resources are released
  correctly.
- **`applyCaustics` idempotency**: re-binding the same uniforms is a no-op guarded by
  `userData` (`caustics-material.ts:149`); re-binding *new* uniforms forces one recompile
  (`caustics-material.ts:151-158`); unsupported materials (e.g. `ShaderMaterial`) are left
  untouched. Pinned by `caustics.spec.ts:64-77`, including the `version`-bump assertion.
- **No per-frame allocations**: `WaterClock`'s `useFrame` writes exactly two numbers
  (`ocean-world.tsx:58-62`); particles are GPU-animated via `fract` seeds
  (`particle-field.ts:74-88`) — zero CPU per-frame particle work. The shared-by-reference
  `uTime` uniform is real and tested (`particle-field.spec.ts:24-43`).
- **Frame clamping**: delta capped at 0.1 s (`ocean-world.tsx:22,59`), so tab switches don't
  teleport the water.
- **Reduced motion**: `useSyncExternalStore` with listener cleanup
  (`use-prefers-reduced-motion.ts:10-14`), no-window safety via the `typeof window` guard and
  a `false` server snapshot (line 20); `reducedMotionScale` clamped 0–1
  (`ocean-config.ts:133`).
- **Config clamping (the covered part)**: NaN/negative density, over-range intensity/scale,
  fractional and enormous counts, out-of-range `bubbleShare` all clamped and floored
  (`ocean-config.ts:120-134`), with tests (`ocean-config.spec.ts:25-43`). `splitParticleCount`
  loses no instances (`ocean-config.ts:138-144`, spec at 46-53).
- **Determinism**: mulberry32 seeded PRNG (`seeded-random.ts`) drives both particles and the
  caustics pattern; pattern determinism, edge-fade coverage and seamless tiling are tested
  (`caustics.spec.ts:13-45`); anchor-misalignment fails loudly
  (`caustics-material.ts:80-84`, spec 59-62).
- **Controls bounded to the volume**: at `maxPolarAngle` + `maxDistance` 63
  (`ocean-world.tsx:124-126`) the camera cannot leave `WATER_VOLUME` or dip under the seabed.
- **Caustics before fog and tone mapping** (spec-asserted, `caustics.spec.ts:53-55`),
  skinned/instanced vertices handled in the vertex patch (`caustics-material.ts:92-96`).

## Data flow

`App` (`app.tsx:6`) resolves the GLB URL from the manifest once → `assetUrl`
(`asset-url.ts:7-14`, throws on unknown id — fail-fast, good) → `<Canvas>` →
`OceanWorld` resolves config (`resolveOceanConfig`) → creates caustics texture + uniforms
once per mount → `WaterClock` advances `uTime`/`uCausticsTime` each frame →
`OceanFloor` suspends on `useLoader`, patches every compatible material with the shared
uniforms → `OceanParticles` builds two instanced fields reading the shared clock. Steps OK
except: the load step has no failure exit (defect 1), the GLTF step has no release path
(defect 2), and the config step lets unclamped values reach the shaders (defect 4).

## Requirements fulfilment

| Charter requirement | Status | Gap |
| --- | --- | --- |
| Exponential fog | COMPLETE | `ocean-world.tsx:99-100`; colour unvalidated (defect 4) |
| Caustics on the ocean floor | COMPLETE | Patched into every compatible GLB material; NaN-speed silent-off (defect 4) |
| Instanced bubble/plankton particles | COMPLETE | 2 draw calls, GPU-animated; NaN rise silently empties a field (defect 4) |
| Ambient light rig | COMPLETE | `ocean-lights.tsx:13-25`; no shadows by documented choice |
| `apps/web` navigable scene | PARTIAL | Happy path works and is visually confirmed; a single fetch failure permanently blanks it (defect 1) |
| 60 FPS mid-tier | UNVERIFIED | Logic review cannot benchmark; dpr-2 + MSAA is the main risk (defect 8) |

Implicit requirements not addressed: loader-failure recovery (defect 1), GLTF release on
teardown (defect 2), long-session clock behaviour (defect 6).

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| `particleCount` 0 / negative / fractional / >20k | YES | `resolveOceanConfig` floors and clamps (`ocean-config.ts:129`); `ParticleField` returns null at 0 (`ocean-particles.tsx:34`) | none |
| NaN density / out-of-range intensity & scale | YES | `clamp` maps non-finite to min (`ocean-config.ts:102-103`) | `speed`, sizes, rise speeds, colours not covered (defect 4) |
| GLB 404 / decode failure | NO | Nothing catches the rejection | defect 1 |
| Tab switch / GC pause | YES | `MAX_FRAME_SECONDS` clamp | none |
| Reduced-motion toggled mid-session | YES | Live `useSyncExternalStore` subscription | none |
| No `window` (SSR/test) | YES | Guard + server snapshot (`use-prefers-reduced-motion.ts:20`) | none |
| StrictMode double-mount | PARTIAL | Kept resources disposed; first-invocation duplicates leak (defect 3) | dev-only |
| `count` changed at runtime | YES | Geometry memo keyed on count/seed, material on options; old resources disposed via effects | none |

## Verdict

- Recommendation: **REVISE** — fix defect 1 (error boundary + loader-cache clear) before
  landmark-kernel and dive-camera build on top of `OceanWorld`; defects 2–5 should be
  scheduled with them, 6–8 are polish.
- Confidence: HIGH (all code read in full; tests run uncached; the one unverifiable claim —
  60 FPS — is flagged as such rather than guessed).
- Top risk: one failed network request permanently blanks the site with no user-visible
  fallback and no in-session recovery.
- What a robust implementation would add: an error boundary around the suspending GLB plus
  `useLoader.clear` on retry; GLTF disposal (or a documented decision not to); clamps for
  `caustics.speed`, particle sizes, rise speeds and colour validation in `resolveOceanConfig`;
  a single source of truth for the world scale (drop the `worldScale` prop or context-drive
  `sceneToWorld`); a clock wrap/reset for multi-day sessions.