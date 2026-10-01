# Code Logic Review — batch4-world (`quality-tiers` + `asset-attribution-ui`)

Independent read-only logic review. Evidence: full reads of every listed file (domain quality/credits modules, feature quality wiring, `ocean-world.tsx`, `ocean-floor.tsx`, `caustics-material.ts`, `ocean-particles.tsx`, `app.tsx`, `landmark-ports.ts`, `telemetry.ts`, world-ui credits modules, all listed specs), plus `npx nx run-many -t test -p world-domain,world-feature,world-ui,web` (all 4 projects pass, exit 0) and a scoped TS diagnostic check (0 errors).

---

## 1. `quality-tiers`

**Verdict: REVISE — 7/10**

| Blocking | Serious | Moderate | Minor |
|---|---|---|---|
| 0 | 1 | 2 | 2 (+1 known gap) |

The governor, provider and scene wiring are well-built and well-tested: hysteresis, StrictMode behaviour, per-frame allocation discipline and caustics idempotency all check out (verified-good list below). The one serious defect is a charter promise that the code comments assert but no production path implements — the manifest's `minimumTier` gates nothing.

### Defects

1. **SERIOUS — The manifest's `minimumTier` gates no loader; the claimed wiring does not exist.**
   - Evidence: `libs/world/domain/src/lib/quality-assets.ts:5-11` — "Loaders consult this (or `assetAllowed`) before fetching, so a `minimumTier: 'high'` asset is never downloaded on a low-tier phone." A workspace grep shows `assetsForTier`/`assetAllowed` have **no production call sites** — only specs (`quality-profile.spec.ts:98-114`). The live path is `apps/web/src/app/landmark-ports.ts:36-37` → `libs/world/feature/src/lib/use-compressed-model.ts:27-28`, which fetches by URL with no tier check; `app.tsx:43` resolves `environment` the same way.
   - Failure scenario: the first landmark/scene that mounts a `minimumTier: 'medium'|'high'` asset (e.g. `pineapple-interior`, `spongebob-character`, `patrick-character`) downloads and Meshopt-decodes it on a low-tier phone — exactly the download-budget violation the charter's "wired to the manifest's tier field" forbids. Today the impact is latent only because every *mounted* asset happens to be `minimumTier: 'low'`; the medium/high assets are lazy and referenced by nothing yet. Builds cleanly, fails at runtime the moment content lands.
   - Fix: gate at the join point — `useLandmarkModel` checks `assetAllowed(assetId, useQuality().tier)` and skips loading/mounting when false (returning `null`/a stub the landmark layer already tolerates, the same way it tolerates a failed load), or gate inside `useCompressedModel` via an optional tier argument. Add a spec that a `minimumTier: 'high'` asset id is not fetched at `low`.

2. **MODERATE — Governor stalls forever on persistently >2 s frames; tier never settles and telemetry is silently absent.**
   - Evidence: `libs/world/feature/src/lib/quality-monitor.tsx:68-73` — a frame over `MAX_FRAME_MS` (2000) resets the whole window; `quality-governor.ts:126-130` — `elapsedMs`/`settle` only advance on usable windows (`isUsable`, `:88-93`). `maxDurationMs` is fed exclusively by window durations.
   - Failure scenario: a device rendering persistently below ~0.5 fps (extreme throttle, GPU driver reset loop, pathological GC) produces no usable window ever: no downgrade, no settle, `onSettled` never fires (`quality-context.tsx:175-179`), so `trackQualityTier` (`apps/web/src/app/telemetry.ts:75-77`) is never sent and the analytics picture of exactly these struggling devices is empty — a silent failure that looks like "no data". The `MAX_FRAME_MS` comment frames >2 s frames as pauses; the pause recovery path (`skipNext`) exists, but a sustained >2 s-frame regime has no escape, not even the 30 s hard deadline.
   - Fix: when a window is discarded for a long frame, still advance a wall-clock "settle deadline" (e.g. pass a zero-frames window with the real duration so `elapsedMs` advances toward `maxDurationMs`, or track a `Date`-based deadline in the provider) so the tier settles to *something* and is reported.

3. **MODERATE — GPU probe leaks its WebGL context on the exception path.**
   - Evidence: `libs/world/feature/src/lib/device-capabilities.ts:31-50` — `loseContext()` (`:39`) runs only on the success path. If `getContext` succeeds but `getExtension`/`getParameter` throws (the privacy modes the `catch` at `:45-49` exists for), the catch returns `{ webgl: true }` with the context still alive.
   - Failure scenario: on such a browser the probe context counts against the per-page WebGL context limit (Chromium ≈ 16, shared with the R3F canvas) for as long as GC hasn't collected the detached canvas — under memory pressure that can be long enough to matter on low-end devices.
   - Fix: hoist `gl` above the try and call `WEBGL_lose_context.loseContext()` in a `finally`, or restructure so the catch also releases.

4. **MINOR — A window straddling the warm-up boundary counts fully.**
   - Evidence: `quality-governor.ts:132` — the gate is `sinceChangeMs > warmupMs` on the *window end*, and the full `stats.durationMs` is then added to `slowMs`/`fastMs` (`:137-138`). Up to one window (~1 s) of pre-warm-up frames can count toward `downgradeAfterMs`/`upgradeAfterMs`.
   - Failure scenario: a marginal device can downgrade (or upgrade) one window early. Conservative direction, bounded by one window; the specs (`quality-governor.spec.ts:30-46`) already accept this model. Fix only if tightening: credit only the portion past `warmupMs`.

5. **MINOR — `devicePixelRatio` changes after mount are never re-applied.**
   - Evidence: `quality-monitor.tsx:51-53` — `setDpr` runs only on `state.profile` changes. Browser zoom or dragging the window to a different monitor changes the native ratio mid-visit; the canvas keeps the stale DPR until the next tier change (which, once settled, never comes).
   - Fix: also re-run on a `(resolution)` media-query change or on R3F resize, clamped through `profilePixelRatio` as now.

6. **KNOWN GAP (requirement, record on the roadmap item) — "holds an acceptable frame rate at every tier" is not met at extreme throttle.**
   - The author's own measurements: unthrottled 60 fps; CPU×4 settles on `low` at ~41 fps; CPU×6 stays at ~21 fps (residual ~12 ms main-thread, 140 draw calls). The lowest tier sheds pixels (dpr 1), particles (352/48), caustics, anisotropy and beacon occlusion — and the floor is still ~21 fps under ×6, because the residual cost is the scene itself (draw-call bound), not anything a tier controls. `low` is the floor of `QUALITY_TIERS` (`quality-tier.ts:7`), so the governor has nothing left to shed.
   - This is a genuine, measured acceptance-criterion miss at the extreme end, not a coding defect. Record it as a known gap on the `quality-tiers` item with the numbers, and treat "draw-call reduction below low" (e.g. instancing/merging or a `minimumTier`-style floor for landmark models) as future work. Do not mark the criterion fully met.

### Verified good (with evidence)

- **Governor hysteresis**: warm-up after start and after each change (`quality-governor.ts:132`, `changeTo` resets `sinceChangeMs/slowMs/fastMs` at `:95-103`); downgrade on 3 s consecutive slow (median <45 fps **or** p90 >50 ms, `:133`); one upgrade max, never after a downgrade, never above ceiling (`:143-152`); settle at `warmup+settle` or hard 30 s (`:156-157`); repeated downgrades to `low` allowed; empty/non-finite windows leave state untouched (`:126`, spec `:115-119`). All pinned by `quality-governor.spec.ts:29-129`.
- **`onSettled` exactly once**: `reported` ref guard (`quality-context.tsx:170-179`) survives StrictMode's double effect run on the same fiber; once settled, `adaptTier` returns state unchanged (`quality-governor.ts:126`) so the tier can never change again; the override path is settled at construction (`:83-86`) so the effect fires once on first commit. Specs: `quality-context.spec.tsx:56-83` (call count asserted for both paths). Telemetry's `qualityTierResolved` is additionally once-per-visit in the session (`telemetry-session.spec.ts:99-105`).
- **No per-frame allocations**: `quality-monitor.tsx:64-82` writes one float into a preallocated `Float32Array`; percentiles reuse the caller's scratch (`quality-governor.ts:165-177`, TypedArray sort is numeric); the `FrameStats` object is per-window (~1 Hz), not per frame. `WaterClock` (`ocean-world.tsx:73-85`) writes two numbers per frame.
- **Gap handling**: >2 s frames and the first frame after `visibilitychange` reset the in-progress window (`quality-monitor.tsx:55-73`); hidden time can neither settle nor downgrade (unusable windows ignored). Correct, apart from defect 2's sustained-stall corner.
- **`setDpr` application**: effect on profile change (`quality-monitor.tsx:51-53`) plus the `Canvas dpr` prop (`app.tsx:103`) agree through `profilePixelRatio`; both clamp identically.
- **Antialias honestly fixed at context creation**: `shouldAntialias` uses `quality.initialTier` (`app.tsx:106-111`), which cannot change post-start; the limitation is documented on the profile (`quality-profile.ts:16-19`, `:83-84`).
- **`?quality=` override parsing safety**: `quality-profile.ts:102-105` — `URLSearchParams` never throws on malformed input; `.trim().toLowerCase()`; misspelled/absent falls back to detection; never persisted. Safe.
- **Caustics add/remove idempotency across tier flips**: `applyCaustics` no-ops on the same uniforms (`caustics-material.ts:177`), `removeCaustics` deletes the marker and restores three's prototype hooks (`:194-201`), re-apply after removal works (spec `quality-context.spec.tsx:118-134`). Tier flips medium↔high swap the texture into the live uniform in a layout effect *before* the old texture's dispose runs in the passive cleanup (`ocean-world.tsx:127-134`), so no frame renders a disposed texture; `OceanFloor` re-traverses on `caustics` prop change (`ocean-floor.tsx:115-123`). Particle geometry rebuilds per tier change are one-shot and disposed (`ocean-particles.tsx:25-32`).
- **Throwaway context released on the happy path**: `device-capabilities.ts:39` (`loseContext`), module-level cache prevents repeat probes per page (`:52-78`) — except defect 3's exception path.

---

## 2. `asset-attribution-ui`

**Verdict: APPROVED — 8/10**

| Blocking | Serious | Moderate | Minor |
|---|---|---|---|
| 0 | 0 | 2 | 2 |

The licence-compliance core is airtight: every rendered credit on both surfaces is `creditLine()` output reassembled or wrapped byte-for-byte, with roundtrip specs pinning it; an unattributed asset throws before it can render as if all were well; the DOM list works with zero WebGL. Four smaller defects, none of which break compliance.

### Defects

1. **MODERATE — The "Opens in a new tab" hint is `hidden`, so no real screen reader announces it.**
   - Evidence: `libs/world/ui/src/lib/credits-list.tsx:47` — `<span id={newTabHint} hidden>` is the `aria-describedby` target of every link (`:35`). `hidden` ⇒ `display:none` ⇒ excluded from the accessibility tree, so the description resolves to nothing in real browsers.
   - Failure scenario: a blind visitor tabbing the credit links gets no announcement that they open a new tab (an orientation loss the hint was built to prevent). The spec (`credits-list.spec.tsx:62-64`) reads `textContent` directly, which works on a `hidden` node in jsdom — the test passes while the behaviour it asserts does not exist.
   - Fix: replace `hidden` with a visually-hidden utility (clip/1px pattern, e.g. a class in `credits.css`) so the span stays in the layout tree.

2. **MODERATE — `shippedCredits()` throw sits in a module-evaluation path, so a missing attribution white-screens the whole site.**
   - Evidence: `apps/web/src/app/credits.tsx:9` — `SITE_CREDITS = shippedCredits()` at module top level; `shippedCredits` throws for an asset without attribution (`libs/world/domain/src/lib/credits.ts:36-41`). `credits.tsx` is imported by `app.tsx:26`, so the throw happens during import of the app's module graph, not inside any render or boundary.
   - Failure scenario: shipping an asset whose source model lacks an attribution record (the exact situation the throw exists to catch) prevents the entire page from loading — the site is a blank module error rather than "the credits surface failing loudly while the rest renders". The manifest test and the `Record<SourceModelId, …>` typing make this hard to reach, but the blast radius when reached is the whole site, not the credit surfaces.
   - Fix: compute the credits lazily inside `SiteCredits`/`SceneCredits` (a module-level memo function, not an eager constant) so the throw happens in render, where an error boundary can contain it; or keep the eager throw but move it out of the app's import graph so only the credit surfaces die.

3. **MINOR — Licence link href is `http://`, not `https://`.**
   - Evidence: `libs/world/domain/src/lib/attribution.ts:30` — `licenseUrl: 'http://creativecommons.org/licenses/by/4.0/'`. The credit *text* must quote this verbatim (the licence mandates it), and the DOM links set `href` === the displayed text (`credits-list.tsx:30-38`, asserted in `credits-list.spec.tsx:59`).
   - Failure scenario: the visitor's licence link makes an plaintext-HTTP request that redirects to https; on a https-only site this is a mixed-content/deprecation smell, not a break. Fix: keep the rendered string verbatim but let the DOM link's `href` point at the `https://` equivalent (the visible text and the href may differ; the plaque texture already draws text only). Low priority.

4. **MINOR — The plaque's no-2D-context fallback is silent.**
   - Evidence: `libs/world/ui/src/lib/notice-texture.ts:123-125` returns `null` when `getContext('2d')` is unavailable; `credits-plaque.tsx:90-94` then renders a blank paper board. Correct fallback (the DOM list is unaffected) but nothing is logged.
   - Failure scenario: on a browser with WebGL but no 2D canvas (or a canvas-size cap below 2048 — iOS caps canvas area, though 2048×1366 ≈ 2.8 MP is within its ~16 MP limit), the notice is blank and nobody learns why. Fix: `console.warn` on the null path.

### Charter checks (all verified with evidence)

- **Credit text is exactly `creditLine()` with no hand-copied strings**: DOM list reassembles `credit.line` from segments, roundtrip asserted (`credits-list.spec.tsx:26-29`); the plaque wraps `credit.line` with `lines.join(' ') === credit.line` asserted (`credits-plaque.spec.ts:32-39`) and `drawNotice` paints the wrapped lines verbatim (`credits-plaque.spec.ts:51-75`); the only human-written strings are generic intro/masthead/footer, never a credit. `creditSegments` dedupes URLs, escapes them, sorts longest-first so no URL splits another (`credit-segments.ts:15-33`).
- **`shippedCredits` throws for an asset without attribution**: `credits.ts:36-41` + spec `credits.spec.ts:88-91`. (Blast-radius caveat: defect 2.)
- **Link safety**: `target="_blank"` + `rel="noopener noreferrer"` on every credit link (`credits-list.tsx:30-36`); hrefs are exactly the three attribution URLs, no user-controlled input.
- **Dialog a11y**: native modal `<dialog>` with `showModal` and a non-modal fallback (`credits-dialog.tsx:37-49`); Esc path synced through `onClose` (`:70`, spec `:88-98`); focus returned to the trigger on close (`:44-47`, spec `:83-86`); named via `aria-labelledby`, trigger carries `aria-haspopup`/`aria-expanded`. Focus trap is native to modal dialogs. (Hint-announcement caveat: defect 1.)
- **Canvas texture disposal**: `credits-plaque.tsx:63-64` disposes on unmount and on `credits`/`text` change; a StrictMode-discarded `CanvasTexture` never uploaded, so it holds no GPU memory. The pattern cache (`caustics-material.ts`-style, here `notice-layout` via `drawNotice`) is per-mount; the only lingering allocation is the GC-managed canvas, which is fine.
- **No external font fetch**: `NOTICE_FONT_FAMILY` is a system stack (`notice-layout.ts:20`); nothing in world-ui loads a webfont.
- **The plaque is not the only path**: `SiteCredits` (DOM dialog) is mounted in the page chrome (`app.tsx:152`), outside the `<Canvas>`, and its spec renders it without any WebGL (`apps/web/src/app/credits.spec.tsx:13-25`); `SceneCredits` is inside `OceanWorld` (`app.tsx:133`). If WebGL dies, the dialog still carries every credit with working links.
- **Adding a model adds its credit automatically**: `shippedCredits` derives entries from `WEB_ASSETS` × `ATTRIBUTIONS` (`credits.ts:27-44`); specs pin the automatic add (`credits.spec.ts:57-86`) and that all four bundled models are covered (`:32-36`, `apps/web/src/app/credits.spec.tsx:7-11`).

---

## Test/diagnostic evidence

- `npx nx run-many -t test -p world-domain,world-feature,world-ui,web` — all 4 projects pass (exit 0; `world-ui` 12/12, others cache-hit green).
- Scoped TS diagnostics on `quality-governor.ts`, `quality-context.tsx`, `credits-list.tsx`, `credits.tsx`, `app.tsx` — 0 errors.
- Residual uncertainty: frame-rate behaviour under real throttling is taken from the author's measurements, not re-measured here (no browser drive in this review); the governor's numeric policy was validated against its specs only.