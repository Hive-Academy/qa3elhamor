# Code Logic Review — `dive-camera`

## Summary

| Metric              | Value    |
| ------------------- | -------- |
| Overall score       | 8/10     |
| Assessment          | APPROVED |
| Blocking issues     | 0        |
| Serious issues      | 0        |
| Moderate issues     | 2        |
| Minor issues        | 4        |

Scope reviewed in full: `libs/dive/domain/src/lib/{vec3,catmull-rom,dive-path}.ts`, `libs/dive/feature/src/lib/{spring,scroll-source,dive-controller,dive-context,dive-scroll,dive-camera}` (`.ts`/`.tsx`), `apps/web/src/app/{dive.config,depth-gauge,app}` (+ `app.spec.tsx`, `dive.config.spec.ts`), `apps/web/src/styles.css`, `apps/web/public/models/placements.json`, plus `libs/world/feature/src/lib/world-space.tsx` (read for the depth-mapping contract) and `eslint.config.mjs` (boundary enforcement). All 7 spec files read. All three suites pass: `npx nx run-many -t test -p dive-domain,dive-feature,web --skip-nx-cache` → 39 tests, 0 failures.

This is careful code. The spring is the exact closed-form solution (verified algebraically below, not just by test), every allocation-free claim in the render loop was checked, the focus/suspend/release machine holds its invariants under re-entrancy, and the config drift test pins the landmark placements exactly. The findings below are real but none is reachable as a user-visible failure through today's wiring; they are latent-contract gaps and calibration/UX rough edges.

## Verdict

**APPROVED** — score **8/10**. No blocking or serious defects. Fix the two moderates when the surface they guard next changes (the NaN clamp is a one-line contract fix; the stale-mapping issue only bites once in-flow content exists).

---

## Defects

### 1. Moderate — NaN escapes every `clamp01`, producing a silently NaN camera pose

- File: `libs/dive/domain/src/lib/dive-path.ts:58` (and `libs/dive/domain/src/lib/catmull-rom.ts:83`, `libs/dive/feature/src/lib/dive-controller.ts:61`)
- Scenario: `pointInto(NaN, out)` — e.g. a future consumer passes a value derived from unguarded arithmetic. `clamp01(NaN)` is `NaN` (`v <= 0` and `v >= 1` are both false for NaN), so `splineParameter` returns NaN, `CatmullRomSpline.evaluate`'s own `clamp01` also passes NaN through, and `out` becomes `[NaN, NaN, NaN]`. The doc comment at `dive-path.ts:167` promises "clamped to [0, 1]"; NaN violates that contract. Three.js then renders from a NaN matrix (invisible camera, console spam) with no error anywhere.
- Reachability today: none — `progressFromScroll` (`scroll-source.ts:3`) guards non-finite input, waypoint progress is validated at construction, and the spring cannot introduce NaN from finite targets. This is a latent library-contract gap, not a live bug.
- Suggested fix: make one shared, NaN-total `clamp01`: `v !== v || v <= 0 ? 0 : v >= 1 ? 1 : v` (or `Number.isFinite` guard in `splineParameter`), plus one spec case `pointAt(NaN)` → `pointAt(0)`.

### 2. Moderate — document-height changes without a window `resize` leave the scroll mapping stale

- File: `libs/dive/feature/src/lib/scroll-source.ts:35-41`
- Scenario: `subscribe` listens only to `scroll` and `resize`. `maxScroll` is recomputed inside `read()` (line 30), so any change to `document.scrollHeight` that is not a window resize (in-flow overlay mounting, a future `DiveScroll screens` prop change, fonts/images growing content below the fold) silently changes what the *current* scrollTop means while no event fires. The controller's `target` stays at the old progress until the user scrolls again; the camera and the waypoint positions drift out of sync, and `focusWaypoint`/`release` restore to a `heldScroll` whose scrollTop equivalent has shifted.
- Today the page is immune by layout: `styles.css` makes `.stage`, `.scene-note` and `.depth-gauge` all `position: fixed`, so document height comes only from the vh spacer and changes only on resize — which is subscribed. The gap opens the moment landmark-kernel (a listed consumer) mounts anything in flow.
- Suggested fix: in `windowScrollSource.subscribe`, also attach a `ResizeObserver` on `document.documentElement` (or `document.body`) and call `onChange` when `scrollHeight` changes; unsubscribe it alongside the two listeners.

### 3. Minor — `scrollToWaypoint` after focus visibly double-scrolls

- File: `libs/dive/feature/src/lib/dive-controller.ts:207-212`
- Scenario: while focused/suspended the user has scrolled the page (native scroll is not prevented — by design). `scrollToWaypoint` calls `release()`, which instantly restores the page to `heldScroll` (`scroll-source.ts:34`, `behavior: 'instant'`), then immediately smooth-scrolls to the waypoint. In a real browser the user sees the page snap back to the pre-focus position and then animate past it — two competing motions. The end state is correct; only the transient is wrong.
- Suggested fix: give `release()` an optional `skipScrollRestore` (or have `scrollToWaypoint` capture `heldScroll`'s meaning and call `source.scrollTo(waypoint.progress, ...)` directly, setting mode back to `'scroll'` without the intermediate restore).

### 4. Minor — `suspend()` is a no-op while focused, so an overlay cannot stop a camera mid-swim

- File: `libs/dive/feature/src/lib/dive-controller.ts:179-184`
- Scenario: `focusWaypoint` is called, and while the camera is still easing toward the waypoint (responsiveness 3.2 → roughly a second of motion) an overlay opens and calls `suspend()`. The early return leaves `mode === 'focus'`, so the camera keeps swimming to the focus target under the overlay — violating the documented contract of `suspend` ("freezes the camera … until release"). `heldScroll` is still preserved correctly, so `release` behaves; only the freeze is lost.
- Suggested fix: either allow `suspend` from `focus` (remembering that `focusedWaypointId`/`focusBlendTarget` need restoring, or documenting that release exits to scroll either way), or document the no-op explicitly in the JSDoc so landmark-kernel knows to gate overlays on `mode === 'focus' || progress settled`.

### 5. Minor — the dive can never display `floorMeters`: max readable depth is ≈172 m of 180 m

- File: `apps/web/src/app/dive.config.ts:88` vs route data at `dive.config.ts:60`
- Scenario: `floorY` = lowest landmark base × scale = pineapple base `0.069509… × 20 ≈ 1.39`, while the deepest camera control point is `[-22, 2.8, 14]` (y = 2.8, and the spline does not dip to 1.39). `depthRatioOfY` (`dive-path.ts:206`) therefore maxes at `(34 − 2.8) / (34 − 1.39) ≈ 0.957` → the gauge tops out around −172 m and the telemetry `maxDepth` caps with it; the depth gauge's fill never reaches 100%. The narrative "180 m seabed" is off by ~4%. `dive.config.spec.ts:43` only asserts `> 150`, so tests cannot catch it.
- Suggested fix: either set `floorY` from the deepest *route* position (e.g. `min(route camera y, min landmark base y)` — here that would be 2.8, making the end read exactly 180 m), or relax the narrative and assert the calibration in the spec. Decide which number is the story.

### 6. Minor — a config mistake throws at module scope with no error boundary

- File: `apps/web/src/app/app.tsx:12` (`buildDivePath()`), throwing from `dive-path.ts:163`
- Scenario: a future route edit that puts a `pass` on the same spot as a stop (or any `DivePathError`) throws during `import` of `app.tsx` → the entire page is blank with only a console error. Fail-fast for data errors is the right instinct, and the drift spec covers placements; but nothing user-visible catches it.
- Suggested fix: keep the throw, but add a minimal error boundary (or a static fallback in `index.html`) rendering "the dive configuration is invalid" so a fork's data mistake is diagnosable in a browser rather than a white screen. Low priority.

---

## Verification against the requested checks

### (1) Arc-length parameterisation — SOUND

- Exactness: waypoints sit on control points = segment boundaries = table sample points, so `progress` is exact, not interpolated (`dive-path.ts:109`). Verified the binary search (`dive-path.ts:260-273`) handles `target = 0` (lo stays 0), `target = length` (lo = last index, frac = 1), and plateaus (none exist — chord sums are strictly increasing; spec asserts monotonicity at `dive-path.spec.ts:119-130`).
- Duplicate/co-located points: consecutive duplicates are rejected by `validate` (`dive-path.ts:127`); near-co-located (within `MIN_KNOT_SPACING = 1e-4`) knots fall back exactly as three.js does (`catmull-rom.ts:42-44`). 2-point paths work (reflected end tangents, `catmull-rom.ts:36-37`; spec `dive-path.spec.ts:199-209`).
- Progress outside [0,1]: clamped at both layers (`dive-path.ts:58`, `catmull-rom.ts:83`; spec `dive-path.spec.ts:99-102`).
- NaN: **defect 1** — not clamped, silently NaN pose. Unreachable via current wiring.

### (2) Spring / large dt — SOUND, verified independently of the tests

The closed form in `spring.ts:24-25` was checked algebraically: for `x'' = ω²(target − x) − 2ωx'` with `j = v + ω·offset`, `x(dt) = target + (offset + j·dt)e^{−ωdt}` and `v(dt) = (v − ω·j·dt)e^{−ωdt}`. Both match. So the frame-rate-independence claim is mathematical fact, not just the (passing) 30/60/144 Hz spec. A tab switch produces a huge `delta`, clamped to 0.1 s at `dive-controller.ts:218` — and because scroll events still fire while the tab is hidden (only rAF is throttled), the target is already current when the camera resumes; `elapsed` advances by the clamped dt so the sway phase does not jump either. Negative/NaN dt is a no-op in the spring (`spring.ts:20`; spec `spring.spec.ts:38-44`).

### (3) Scroll ↔ progress mapping — SOUND for this layout; latent gap in defect 2

- Resize: subscribed (`scroll-source.ts:37`); iOS URL-bar collapse fires `resize`, and because `maxScroll` is recomputed per `read()`, the mapping re-derives rather than going stale — modulo defect 2 for non-resize height changes (none exist today; everything is `position: fixed`).
- Content height: today only the vh spacer contributes (verified in `styles.css`); defect 2 documents the future risk.
- iOS overscroll/rubber-banding: negative `scrollY` clamps to 0 (`scroll-source.ts:5`); over-scroll past the bottom clamps to 1.
- Scroll restoration on reload: the browser restores `scrollTop` before effects run; `connect` reads the current scroll synchronously at bind time (`dive-controller.ts:147`) and sets `snapNextStep`, so a reload mid-dive snaps instead of replaying the descent. Correct.

### (4) Focus / suspend / release state machine — SOUND

- Re-entrancy: `hold()` only captures `heldScroll` from `scroll` mode (`dive-controller.ts:309`), so focus → focus (same or different waypoint) keeps the original return point — asserted at `dive-controller.spec.ts:182-193`.
- Focusing while focused: target/focus point swap cleanly; the return position survives.
- Scrolling while focused: native scroll still moves the page; `onScroll` ignores it by mode (`dive-controller.ts:144-146`), and `release` restores via `scrollTo(heldScroll, instant)` only when it actually drifted (`dive-controller.ts:196`). Note `heldScroll` is stored as *progress*, not scrollTop, so a resize during focus restores to the proportionally correct place — the right unit choice.
- Resizing while focused: handled as above (progress is unit-free).
- `suspend` while focused: **defect 4** — documented no-op with a real consequence.
- Release restoring scroll: tested against a fake source (`dive-controller.spec.ts:174-178, 195-207`); with the real `windowScrollSource`, `behavior: 'instant'` makes `scrollY` readable immediately, and `release` additionally sets `this.target = heldScroll` so the camera eases to the right place even if the scroll event is late. Double-motion transient: **defect 3**.

### (5) Cleanup, StrictMode, allocations — SOUND

- `DiveScroll`'s effect returns the disconnect (`dive-scroll.tsx:22`); `connect`'s returned closure unsubscribes and nulls `this.source` only if it still owns it (`dive-controller.ts:150-153`), so a stale disconnect after a re-connect is harmless.
- StrictMode double-mount: connect → disconnect → connect on the same controller; the second connect re-reads the scroll and snaps (`snapNextStep`). Verified by reasoning through the effect order; also exercised implicitly by `app.spec.tsx` rendering the full tree in a StrictMode-equivalent double-invoke environment.
- Per-frame allocations: `step → writePose` writes only into `pose`, `scratchTangent` and the path's preallocated `scratch` buffers; `nearestWaypoint` returns existing frozen objects; `publish` touches primitives only. `DiveCamera` calls `camera.position.set` / `camera.lookAt` (three.js module-level temporaries). No allocation found in the frame loop.
- `useDiveState` uses `useSyncExternalStore` with a stable subscribe (`dive-context.tsx:62-66`); the "selector must return a primitive or stable reference" contract is documented at `dive-context.tsx:56-58` — a consumer returning fresh objects would loop, but that is a stated API contract, not a defect.

### (6) Reduced motion — SOUND

Applied via `setReducedMotion` in an effect rather than a memo dep, so toggling the OS setting does not rebuild the controller or lose the visitor's place (`dive-context.tsx:34-40` — correct and deliberate). `step` snaps instead of easing (`dive-controller.ts:221-224`), sway is forced to 0 in `writePose` (`dive-controller.ts:274`), velocity reports 0, and `scrollToWaypoint` jumps the page (`dive-controller.ts:210`). Covered by `dive-controller.spec.ts:130-157`.

### (7) Boundary rules — ENFORCED, not just followed

`eslint.config.mjs:104-105` restricts `scope:dive` sources to libs tagged `scope:dive`/`scope:shared`; `libs/dive/{domain,feature}/package.json` carry the tags, and the actual imports confirm it — domain has zero external imports, feature imports only `@qa3elhamor/dive-domain`, react and `@react-three/fiber`. The world join (`WATER_VOLUME`, `WORLD_SCALE`, `sceneToWorld` in `dive.config.ts:2`) happens in `apps/web` only. `app.tsx` is the single place the built path meets `world-feature`. Clean.

### (8) Config drift test vs `placements.json` — COMPLETE in the direction that matters

`dive.config.spec.ts:14-18` asserts `placements[id].offset` exactly equals each of the 4 `LANDMARK_PLACEMENTS` entries, and I byte-checked them against `apps/web/public/models/placements.json` — identical. If the asset pipeline moves a landmark, the build fails. (The reverse direction — a new landmark in JSON that the route doesn't stop at — is untested, but that is a content decision, not a dive defect.) The route-to-spec build (`buildDiveSpec`) is validated and waypoint-ordered by the same spec.

---

## Five logic questions

1. **Silent failure:** the NaN clamp hole (defect 1) is the only path I found where bad input produces a success-looking result (a "pose" that is NaN) rather than an error. Everything else fails loudly: `DivePathError` lists every issue, `progressOf`/`requireWaypoint` throw on unknown ids, and `useDive` throws outside the provider.
2. **Unexpected user action:** scrolling while focused (handled, restore is correct); calling `scrollToWaypoint` from an overlay while focused (defect 3 transient); toggling reduced-motion mid-dive (snaps — intended).
3. **Wrong-answer input:** non-finite scroll offsets (guarded at `scroll-source.ts:3`), zero/negative maxScroll (guarded, returns surface), duplicate waypoint ids / out-of-order stops / inverted depth (all rejected with named issues, spec-covered).
4. **Dependency failure:** R3F stops calling `step` (hidden tab) → dt clamped, scroll events keep the target current; `connect` with a source that dies → `disconnect` nulls it, `hold` falls back to `target` when source is null (`dive-controller.ts:309`). No unhandled promise/rejection paths exist — the library is synchronous by design.
5. **Unspecified by requirements:** the depth calibration (defect 5 — 172 vs 180 m was never pinned by any requirement), and what `suspend` means during `focus` (defect 4).

## Failure modes

| # | Failure mode | Trigger | Severity |
|---|---|---|---|
| 1 | NaN pose rendered silently | non-finite progress reaching `pointInto` | Moderate (latent) |
| 2 | Stale scroll mapping | scrollHeight change without window resize | Moderate (latent under current layout) |
| 3 | Double scroll motion | `scrollToWaypoint` while focused/suspended | Minor |
| 4 | Overlay cannot freeze mid-swim camera | `suspend()` during `focus` | Minor |
| 5 | Depth gauge caps at ~95.7% | floorY from landmark bases, not route depth | Minor |
| 6 | Blank page on config error | any `DivePathError` at module load | Minor |

## Requirements fulfilment

| Requirement (charter) | Status | Gap |
| --- | --- | --- |
| `DivePath` value object over CatmullRom spline, arc-length parameterised | COMPLETE | NaN clamp contract (defect 1) |
| Waypoints per landmark | COMPLETE | exact progress on control points; order-validated |
| Scroll-bound controller easing along the curve | COMPLETE | — |
| Smooth scroll → camera | COMPLETE | exact critically damped spring, dt clamp |
| Observable depth state | COMPLETE | calibration never reaches floorMeters (defect 5) |
| Data-defined path | COMPLETE | drift test pins placements exactly |
| focusWaypoint / suspend / release | COMPLETE | suspend-in-focus no-op (defect 4), release transient (defect 3) |
| Reduced motion | COMPLETE | — |
| Boundaries (scope:dive, apps/web joins) | COMPLETE | eslint-enforced |

## Edge cases

| Case | Handled | How |
| --- | --- | --- |
| 2-point path | YES | reflected end tangents; spec |
| Consecutive duplicate control points | YES | rejected at validate |
| Nearly co-located knots (<1e-4) | YES | three.js-compatible spacing fallback |
| progress < 0 / > 1 | YES | clamped twice (table + spline) |
| NaN progress | NO | defect 1 |
| maxScroll ≤ 0 | YES | `progressFromScroll` → 0 |
| iOS rubber-band (negative scrollY) | YES | clamped |
| dt = 0 / negative / NaN / tab switch | YES | spring no-op / 0.1 s clamp |
| Reload mid-dive | YES | snap on connect |
| StrictMode double-mount | YES | idempotent connect/disconnect |
| Resize while focused | YES | heldScroll stored as progress |
| scrollHeight change w/o resize | NO | defect 2 |

## Verdict

- Recommendation: **APPROVE**
- Confidence: **HIGH** (every charter file read in full; spring math verified independently; all 39 tests pass)
- Top risk: the NaN clamp hole (defect 1) is one unguarded consumer away from a silent invisible-camera failure, and defect 2 will surface the moment landmark-kernel mounts in-flow content.
- What a robust implementation would add: a NaN-total clamp with a spec case, a ResizeObserver in `windowScrollSource.subscribe`, a scroll-restore skip in `scrollToWaypoint`, defined `suspend`-during-`focus` semantics, `floorY` derived from route depth, and an error boundary for config load.