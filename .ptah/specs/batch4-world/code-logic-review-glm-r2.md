# Code Logic Review R2 — batch4-world (`quality-tiers` + `asset-attribution-ui`)

Second-pass verification of the fixes for the R1 findings, plus a regression hunt. Read-only: every touched file re-read in full (`use-compressed-model.ts`, `landmark-ports.ts` + new spec, `quality-monitor.tsx`, `quality-context.tsx`, `quality-governor.ts` + spec, `device-capabilities.ts`, `quality-assets.ts`, `credits.tsx` + spec, `credits-list.tsx` + spec, `credits-unavailable.tsx`, `credits.css`, `notice-texture.ts`, `landmark-layer.tsx` model-consumption path); `npx nx run-many -t test -p world-domain,world-feature,world-ui` — all 3 projects pass, exit 0. `apps/web/src/app/overlays/**` ignored as instructed. No binaries opened.

---

## 1. `quality-tiers`

**Verdict: APPROVED — 8/10** (R1: REVISE 7/10)

### Original findings status

| # | Sev (R1) | Finding | Status | Evidence |
|---|---|---|---|---|
| S1 | Serious | Manifest `minimumTier` gates no loader; comment asserted wiring that didn't exist | **FIXED** | `landmark-ports.ts:44-49` — `useLandmarkModel` now checks `assetAllowed(assetId, tier)` and passes `null` when disallowed or unknown, following the live tier; `use-compressed-model.ts:31-43` — `null` fetches nothing (`useLoader(…, [])`), returns an empty `Group`, and a url↔null switch loads/releases the model; `quality-assets.ts:4-12` — comment now names the real call site instead of a fictional one. Pinned by `landmark-ports.spec.tsx:27-49` (above-tier → `null`, allowed → URL, low-tier landmarks at every tier, unknown id → `null`) and `use-compressed-model.spec.tsx:71-83`. |
| M1 | Moderate | Persistent >2 s frames stalled the governor forever; `onSettled` never fired | **FIXED** (two mechanisms) | (a) `quality-monitor.tsx:87-92` — a frame ≥ `STALL_FRAME_MS` is reported as its own one-frame slow window instead of being discarded; (b) wall-clock backstop `quality-context.tsx:177-192` — after `maxDurationMs + 5 s` of *visible* time (`:182` skips hidden ticks) with no settle, `settleGovernor` ends adaptation at the current tier. Pinned by `quality-governor.spec.ts:73-77` (persistent stall steps down and settles) and `quality-context.spec.tsx:73-89` (no frames → settles by wall clock, `onSettled` once). The residual trade-off this introduces is new defect N1 below. |
| M2 | Moderate | GPU probe leaked its context on the exception path | **FIXED** | `device-capabilities.ts:48-55` — `finally` releases the context on every path, including a throw after creation; the release itself is try-caught so a context that cannot even be released falls back to GC. |
| m1 | Minor | A window straddling warm-up counted fully | **FIXED** | `quality-governor.ts:137-138` — `counted = Math.min(stats.durationMs, sinceChangeMs − warmupMs)` credits only the post-warm-up part; spec `:68-71` (window 3 → `slowMs` 500) and `:38-44` (first downgrade at window 6, `slowMs` 2500 after 5 windows). Arithmetic re-derived independently: 500 + 3×1000 ≥ 3000 at window 6. Correct. |
| m2 | Minor | Native `devicePixelRatio` changes never re-applied | **FIXED** | `quality-monitor.tsx:52-66` — a `(resolution: Ndppx)` media query is re-armed after every change and removed on the next re-arm and on unmount (`:57`, `:65`); still clamps through `profilePixelRatio`. |
| Gap | Known gap | CPU×6 ≈ 21 fps at `low` (draw-call bound) | **RECORDED** | Per the item notes; nothing below `low` to shed. Acceptable as a recorded gap. |

### Regression checks (all clean)

- **Governor/backstop double-settle**: `settleGovernor` is identity on settled states (`quality-governor.ts:168-169`), and the backstop guards `next === governor.current` before `setState` (`quality-context.tsx:186-189`); `onSettled` still fires exactly once via the `reported` ref (`:194-203`). If the governor settles first, the effect cleanup (`:191`) clears the interval on the `state.settled` dep change; a same-tick race is harmless because `adaptTier`/`settleGovernor` both no-op on settled states. Verified no path calls `onSettled` twice.
- **Listener/timer cleanup**: visibilitychange removed (`quality-monitor.tsx:74`); the DPR media-query listener removed on re-arm and unmount (`:57`, `:65`); backstop interval cleared on unmount and on settle (`:191`).
- **Model unload on downgrade while a landmark is focused**: the mechanism is safe. `LandmarkLayer` already tolerates a missing model (`libs/landmarks/feature/src/lib/landmark-layer.tsx:194` — `model: Object3D | null`, `:269` — `{model && <primitive object={model} />}`) and each landmark sits behind its own Suspense (`:169`), so a url→null tier flip swaps in an empty group without suspending neighbours, and a null→url flip suspends only that landmark's boundary; the camera focus is on the waypoint, not the model, so focus survives. The release path goes through the StrictMode-safe `retainModel` refcount (`use-compressed-model.ts:35-41`). No *live* path exercises it today — every mounted landmark asset is `minimumTier: 'low'` (`asset-manifest.ts:82-123`) — but the mechanism is verified end to end.
- **Override path**: settled at construction → the backstop effect returns early (`quality-context.tsx:178`), no interval is ever created, `onSettled` fires once on first commit (spec `quality-context.spec.tsx:91-101`).
- Backstop counts visible time only (`:182`); a mostly-hidden page takes proportionally longer, matching the governor's rendered-time accounting.

### NEW defects

1. **MODERATE — one multi-second stall frame is now enough for an immediate, permanent downgrade; a ~30 s stall force-settles the tier.**
   - Evidence: `quality-monitor.tsx:87-92` reports *any* single frame ≥ 2000 ms as a slow one-frame window with `durationMs = frameMs`; `quality-governor.ts:138` counts up to that full duration into `slowMs`, `:147-148` downgrades as soon as `slowMs ≥ 3000` — so a single 3 s frame alone satisfies `downgradeAfterMs`; and `:161` settles once `elapsedMs ≥ maxDurationMs`, so one 30 s stall settles the visit. The post-downgrade upgrade block (`:152-154`) makes it irreversible.
   - Failure scenario: a healthy desktop hits one multi-second hiccup (GPU driver reset, OS stall, a debugger pause in dev) → drops high→medium for the *entire visit* with no recovery, and `trackQualityTier` reports the reduced tier. R1's design deliberately ignored such frames ("a debugger pause … not rendering cost"); the new doc comment's stated intent is a *persistent* stall ("a device stalling for seconds per frame"), but the implementation takes one-off evidence. The R1 concern (never settles) was real, but the cure over-triggers at the other end.
   - Fix: require persistence — e.g. only count a stall window as slow evidence when it is followed by another stall window (or clamp a stall window's counted contribution to one normal window's duration, so ~1 s per stall, forcing repeats to accumulate like ordinary slow windows). The backstop already guarantees that a genuinely stalled device settles by wall clock, so the governor does not need single-frame downgrades to close the R1 hole.

2. **MINOR — the backstop interval keeps firing every second while the page is hidden.**
   - Evidence: `quality-context.tsx:181-190` — hidden ticks return early but the interval is never torn down until settle/unmount. Negligible cost (a 1 Hz no-op); noted only for completeness. No fix needed.

### Residual (unchanged from R1, accepted)

- Known gap: ~21 fps at `low` under CPU×6, draw-call bound. Recorded.

---

## 2. `asset-attribution-ui`

**Verdict: APPROVED — 8/10** (unchanged from R1; both moderates fixed, the two minors remain by design)

### Original findings status

| # | Sev (R1) | Finding | Status | Evidence |
|---|---|---|---|---|
| M1 | Moderate | "Opens in a new tab" hint was `hidden` → never in the a11y tree | **FIXED** | `credits-list.tsx:47-50` — now `<span className="world-credits__visually-hidden">`, and `credits.css:84-95` is the standard clip pattern (1px, `clip-path: inset(50%)`) that stays in the layout and accessibility tree. The spec now asserts exactly what R1 flagged: not `hidden`, no `aria-hidden`, `display` not `none`, class present (`credits-list.spec.tsx:64-68`). |
| M2 | Moderate | `shippedCredits()` throw was module-level → whole-app white screen | **FIXED** | `apps/web/src/app/credits.tsx:23-37` — `useCredits` catches inside a memo and logs (`:32-34`); `SiteCredits` renders `<CreditsUnavailable>` (`:50`, an accessible `role="alert"` at `credits-unavailable.tsx:15`, placed where the Credits button was, styled in `credits.css:97-109`); `SceneCredits` renders nothing on the error branch (`:62-65`); `SITE_CREDITS` export removed; `source` prop added for injection. Spec `credits.spec.tsx:29-47` proves the rest of the site renders, the alert shows, the Credits button is gone, and the error is logged. The domain spec still fails loudly in CI (`credits.spec.ts:88-91`), so containment did not become silence. |
| m1 | Minor | Licence link is `http://`, not `https` | **NOT FIXED** (accepted) | `attribution.ts:30` unchanged. Defensible: the credit text must quote the licence URL verbatim. Could still point the DOM `href` at the `https` equivalent while keeping the text; low priority. |
| m2 | Minor | Silent null fallback when no 2D canvas | **NOT FIXED** (accepted) | `notice-texture.ts:124` still returns `null` with no log; the plaque shows blank paper, the DOM list is unaffected. Minor observability gap only. |

### Regression checks (all clean)

- `CreditsUnavailable` is exported from the world-ui index (`src/index.ts:7`), so the app import compiles; `settleGovernor` is exported from the domain index (`src/index.ts:7` → `quality-governor.js` wildcard). (Web-app tests were outside the permitted project set this round; the import graph was verified by reading.)
- Containment is per-surface and consistent: `SiteCredits` and `SceneCredits` each call `useCredits` (`credits.tsx:48-65`), so a failing source yields the DOM alert *and* no plaque together — the two surfaces cannot disagree. (`console.error` fires once per surface; harmless noise.)
- The unchanged surfaces were spot-checked for drift: `credit-segments.ts`, `credits-dialog.tsx`, `notice-layout.ts`, `credits-plaque.tsx` are untouched from R1 — the dialog a11y, verbatim credit lines, texture disposal and system-font guarantees still hold as reviewed there.
- New observation, not a defect: with containment, an unattributed model that somehow shipped would now present as an amber alert with *no* credit visible anywhere, where R1's white screen guaranteed detection. The type-level `Record<SourceModelId, Attribution>` and the world-domain spec make that path unreachable in CI; acceptable.

### NEW defects

None found.

---

## Verdict summary

| Item | R1 | R2 | Blocking | Serious | Moderate | Minor |
|---|---|---|---|---|---|---|
| quality-tiers | REVISE 7/10 | **APPROVED 8/10** | 0 | 0 | 1 (new: single-stall downgrade) | 1 (new: idle backstop ticks) + recorded gap |
| asset-attribution-ui | APPROVED 8/10 | **APPROVED 8/10** | 0 | 0 | 0 | 2 (both accepted by design) |

Both items are in better shape than R1. The one new moderate (`quality-tiers` N1) is a tuning question — how much single-frame evidence a downgrade requires — not a structural flaw; the backstop already covers the failure it was added for, so capping or repeating-stall-gating the stall windows can be done without re-opening the design.

Evidence basis: full file re-reads as listed above; all 3 world-project test suites pass (exit 0). Residual uncertainty: browser-level behaviour (real throttling, real screen readers, real `matchMedia` dppx changes) was verified from code and specs only, as before.