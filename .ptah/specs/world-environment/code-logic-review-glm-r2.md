# Code Logic Review R2 — `world-environment` fix verification (independent, read-only)

**Verdict: APPROVED — 9/10** · 4 new defects, all minor · 8/8 original defects fixed

Scope re-read in full: the seven changed sources (`ocean-config.ts`, `world-space.tsx`,
`ocean-floor.tsx`, `ocean-world.tsx`, `caustics-material.ts`, `particle-field.ts`,
`app.tsx`), the unchanged-but-affected `ocean-particles.tsx`, all six spec files including
the new `ocean-floor.spec.tsx`, and the installed `@react-three/fiber` `useLoader`
implementation (`node_modules/@react-three/fiber/dist/events-156d8d12.esm.js:1277-1302`) to
verify the cache-clearing claim against R3F 9's real cache keys. Tests run uncached via
`npx nx run-many -t test -p world-feature,web --skip-nx-cache`: both projects pass.

---

## Original defects — status

| # | Original defect (R1) | Status | Evidence |
| --- | --- | --- | --- |
| 1 | GLB load failure blanks the site; rejected promise pinned in loader cache | **FIXED** | `ModelErrorBoundary` (`ocean-floor.tsx:119-142`) wraps the suspending model inside `OceanFloor` (`ocean-floor.tsx:161-168`), renders null + `onError` on failure, and clears the cache in `componentDidCatch` (`ocean-floor.tsx:126-131`). Verified against installed R3F 9: `useLoader` caches via `suspend(loadingFn, [loader, ...keys])` and `useLoader.clear(loader, input)` deletes the same `[GLTFLoader, url]` key — the extensions fn is *not* part of the key, so `clearOceanModel` (`ocean-floor.tsx:22`) evicts exactly the entry the hook wrote. Boundary resets on url change (`ocean-floor.tsx:133-137`). Tested: `ocean-floor.spec.tsx:13-30, 32-54` |
| 2 | GLTF geographies/materials/textures never disposed | **FIXED** | `disposeObjectTree` (`ocean-floor.tsx:33-46`) releases geometries, materials and their texture properties; `retainModel` (`ocean-floor.tsx:62-72`) refcounts per `gltf.scene` object (correct: same URL → same cached object → same refcount bucket) and the last release disposes + evicts (`ocean-floor.tsx:89-96`). Disposal-once and shared-texture dedupe tested (`ocean-floor.spec.tsx:60-75`) |
| 3 | StrictMode double-invoked initializers leak GPU objects | **FIXED** | Caustics pattern (the expensive CPU part) cached per size at module level (`caustics-material.ts:47-61`, spec `caustics.spec.ts:66`); texture/uniforms/particle resources created in `useMemo` and released by effects keyed to the object (`ocean-world.tsx:108-118`, `ocean-particles.tsx:25-32`). The claim that a discarded instance holds no GPU memory is correct for three.js (textures/geometries/programs upload at first render). Refcount deferral makes the model StrictMode-safe (`ocean-floor.tsx:55-61`), tested at `ocean-floor.spec.tsx:77-91` |
| 4 | Unclamped `caustics.speed`, sizes, rise speeds; unvalidated colours fail silently | **FIXED** | `OCEAN_CONFIG_RANGES` covers every numeric field (`ocean-config.ts:111-130`), with a spec asserting range-vs-default completeness so a future config field cannot silently escape (`ocean-config.spec.ts:66-74`); non-finite/non-number falls back to the default (`ocean-config.ts:153-154`); colours validated as `#rgb`/`#rrggbb` with a warn-and-default (`ocean-config.ts:144-177`). Tested incl. the old NaN cases (`ocean-config.spec.ts:27-64, 82-110`) |
| 5 | `sceneToWorld` default scale can drift from `OceanWorld`'s `worldScale` | **FIXED** | Scale is single-sourced through context: `WorldScaleProvider` (`world-space.tsx:37-42`), `WorldSpace` reads it (`world-space.tsx:78-81`), `sceneToWorld` now *requires* an explicit scale (`world-space.tsx:51-55`), and `useSceneToWorld` binds conversion to the same context (`world-space.tsx:58-61`). `OceanWorld` mounts the provider (`ocean-world.tsx:121`), so transform and conversion cannot disagree. No stale callers remain (grep: only updated specs). Tested (`world-space.spec.tsx:20-39`) |
| 6 | float32 clock precision over long sessions | **FIXED** | Both clocks wrap at shader-visible periods: particles quantise every per-instance frequency (rise cycles `floor(PERIOD*uRise*speed/uVolumeSize.y+0.5)`, sway cycles likewise) to whole cycles per 3600 s and advance them by `cycle = uTime/PERIOD` (`particle-field.ts:47, 84-94`) — at `cycle=1` every term is bit-identical to `cycle=0`, so the wrap is genuinely seamless; `PI2` comes from three's `<common>`, present in both shaders. Caustics wraps at 100 tiles (`caustics-material.ts:45`) and all four drift components are integer tile shifts at 100 (83/47/52/79) over a repeating texture (`caustics-material.ts:136-137`). Quantisation changes per-instance speeds by ≤0.4% (bubbles) / ≤4% (already-slow plankton drift) — imperceptible. Clock writes at `ocean-world.tsx:75-76`. Spec asserts the define and shader form (`particle-field.spec.ts:45-46`) |
| 7 | NaN from degenerate screen-space derivatives at grazing angles | **FIXED** | Length guard with 1e-10 threshold, degenerate fragments treated as not up-facing (`caustics-material.ts:138-144`), tested (`caustics.spec.ts:59`) |
| 8 | MSAA at dpr 2 quadruples fragment cost | **FIXED** | `antialias: window.devicePixelRatio < 1.5` (`app.tsx:27`) with the policy documented in-line; `quality-tiers` named as the future owner |

---

## New defects (all minor — nothing blocking or serious found)

### 1. Minor — the release timer can beat a remount's passive effect, disposing a scene the remount is about to retain

- File: `libs/world/feature/src/lib/ocean-floor.tsx:66-70` (the `setTimeout` deferral) vs
  `ocean-floor.tsx:89-96` (retention in a *passive* `useEffect`)
- Scenario: component A unmounts → count 0 → a `setTimeout(..., 0)` is scheduled. Component
  B (same URL) commits in a later macrotask; its `<primitive>` is attached but its passive
  effect — the `retainModel` call — has not run yet when the timer fires. The timer sees
  count 0, disposes the scene and clears the cache. B then retains a *disposed* scene: three
  re-uploads the still-intact CPU-side data on the next render (self-healing, no crash), and
  because the cache was also cleared, the next mount refetches a second copy of the 1.1 MB
  model while B still holds its revived one — a transient duplicate in memory. The
  StrictMode path the design targets is safe precisely because it is *synchronous*
  (spec `ocean-floor.spec.tsx:77-91` covers only that); this window exists because passive
  effects and timers are both macrotask-scheduled with no ordering guarantee.
- Fix: acquire in `useLayoutEffect` instead of `useEffect` (layout effects flush
  synchronously within the commit, before any timer can fire) and keep the deferred release.
  One-word change; the release side is untouched.

### 2. Minor — `componentDidCatch` clears the loader cache for *any* descendant error, not only load failures, and there is no same-URL retry

- File: `libs/world/feature/src/lib/ocean-floor.tsx:126-131, 133-137`
- Scenario: the boundary's `catch` cannot distinguish a `useLoader` rejection from any other
  render error inside `OceanFloorModel`'s subtree. A non-load error (say a future child of
  the model throws) both suppresses the model permanently *and* evicts a perfectly good
  cached entry for that URL; the only reset is a url-prop change
  (`componentDidUpdate` at 133-137), so "network came back, try again" is impossible without
  changing the URL or remounting with a cache that has been poisoned... which
  `clearCache` does handle, so the retry story is sound — it just has to be driven by the
  app via `onEnvironmentError` + remount, which the API permits but nothing exercises.
- Fix: tag loader errors (R3F wraps them as `Could not load ${url}` —
  `events-156d8d12.esm.js:1269`) and gate `clearCache` on that tag; optionally expose a
  `retryKey`/`onRetry` affordance. Low priority: the current behaviour is fail-safe, just
  broader than intended.

### 3. Minor — residual crash path from R1 defect 1: errors thrown in *effects* bypass the boundary

- File: `libs/world/feature/src/lib/ocean-floor.tsx:82-87` (`useLayoutEffect` calling
  `applyCaustics`, which throws via `requireAnchor` at `caustics-material.ts:103-107`)
- Scenario: React error boundaries catch render-phase errors, not effect errors. If a three
  upgrade moves `#include <project_vertex>` or `<tonemapping_fragment>`, the loud failure
  `injectCausticsVertex/Fragment` is designed to produce instead unmounts the whole React
  tree — the exact class of failure the boundary was added for, one phase later. The trigger
  is a dependency upgrade, not user input, so this stays minor.
- Fix: wrap the traversal in a try/catch that reports via the same `onError` channel (the
  anchor check is a static predicate; there is no recovery to do beyond not crashing the
  tree), or move the compatibility probe to a render-phase guard.

### 4. Minor — `window.devicePixelRatio` read directly in render: no no-window guard, and never re-evaluated

- File: `apps/web/src/app/app.tsx:27`
- Scenario: unlike the carefully guarded `use-prefers-reduced-motion.ts:5-8`, this is a bare
  `window` reference — fine for this client-only Vite app (jsdom satisfies it in tests), but
  the first person to server-render or storybook-mount `App` outside a browser crashes here.
  Also, `devicePixelRatio` changes when the window is dragged to another monitor; the canvas
  is constructed once, so a laptop that starts on a hi-dpi screen and lands on a 1x external
  keeps `antialias: false` for the session. Both are cosmetic-to-minor for a marketing site.
- Fix: hoist to a module-level `const AA = typeof window !== 'undefined' && window.devicePixelRatio < 1.5`
  — or leave it, since `quality-tiers` is documented as taking over this policy.

---

## Regression hunt — checked and clean

- **Refcount races (rapid remount / url swap)**: url A→B→A — cleanup closures capture the
  *old* url (effect deps `[gltf, url]`, `ocean-floor.tsx:95`), so the right cache entry is
  cleared; a remount that lands before the timer re-acquires the same cached `gltf.scene`
  and aborts the release; a remount after the timer refetches a fresh scene — all coherent
  (the one incoherent window is defect 1 above, and it self-heals). Two simultaneous floors
  on one URL refcount correctly (Map keyed by the shared `Object3D`).
- **Loader-cache clearing vs R3F 9**: cache key is `[loader, ...keys]` with the loader
  *constructor* (`events-156d8d12.esm.js:1285-1287`); `clear` deletes the same key shape
  (1298-1302); the `withMeshopt` extension fn is not part of the key — `clearOceanModel`
  cannot miss. In-flight suspended reads survive a concurrent `clear` (they hold the
  promise directly) at worst producing one duplicate fetch — bounded, not a leak.
- **Shared-texture over-disposal**: `disposeObjectTree` de-dupes materials via a Set and
  disposes each texture once (`ocean-floor.spec.tsx:74`); the caustics texture is *not* a
  material property (it lives in the shared uniforms), so floor disposal cannot kill it —
  `OceanWorld` owns its lifecycle (`ocean-world.tsx:118`).
- **StrictMode**: the double-invoked `useMemo` twins are never rendered (no GPU memory), the
  pattern cache removes the CPU cost (`caustics-material.ts:47-61`), and the model
  refcount's deferral is exactly the synchronous-remount case the spec pins
  (`ocean-floor.spec.tsx:77-91`).
- **Config semantics**: `resolveOceanConfig()` still equals the defaults (spec line 13);
  the NaN→min-clamp behaviour change (NaN density now → 0.028, not 0) is deliberate,
  documented (`ocean-config.ts:106-110`) and re-tested. Warnings fire per resolve, but
  resolve runs behind a `useMemo` (`ocean-world.tsx:101-104`), not per frame.
- **Clock wrap arithmetic**: verified per-instance above; also `speed` changes at runtime
  re-quantise `riseCycles` continuously (a ≤1-instant vertical re-phase of one particle
  field on a config hot-swap — acceptable). Reduced-motion scale 0 freezes both clocks with
  no drift.
- **API narrowing to note, not a defect**: `OceanWorld` children (future landmarks) are no
  longer inside any `<Suspense>` — the floor's Suspense moved inward
  (`ocean-world.tsx:131-138` vs R1). `landmark-kernel` must wrap its own suspending loaders;
  worth one line in its handoff doc. Likewise `WATER_VOLUME`, camera bounds and particle
  spread remain tuned for scale 20 with a non-default `worldScale` left as a documented
  revisit (`world-space.tsx:64-67`) — acceptable, now that the scale is at least single-sourced.

## Verdict

- Recommendation: **APPROVE**. All eight findings from R1 are genuinely fixed — each with
  the right mechanism, not a band-aid — and each is pinned by a targeted test. The four new
  findings are minor: one narrow timer-vs-passive-effect race, one over-broad cache clear,
  one residual effect-phase crash path, one unguarded `window` read. None blocks
  landmark-kernel or dive-camera building on this.
- Score: 9/10. The gap to 10 is defect 1's race (a one-word `useLayoutEffect` change would
  close it) and the absence of any in-repo exercise of the retry path the boundary's cache
  clearing exists to enable.
- Confidence: HIGH — every changed file read in full, the R3F cache-key claim verified
  against the installed library source, and both test suites re-run uncached and passing.