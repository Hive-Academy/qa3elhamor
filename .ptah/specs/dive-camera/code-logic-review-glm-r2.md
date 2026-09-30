# Code Logic Review r2 — `dive-camera` (fix verification)

## Summary

| Metric          | Value    |
| --------------- | -------- |
| Overall score   | 9/10     |
| Assessment      | APPROVED |
| New defects     | 0        |
| Regressions     | 0        |
| Tests           | all pass (`npx nx run-many -t test -p dive-domain,dive-feature,web --skip-nx-cache`) |

Scope of this pass: only the changed code was re-read in full — `dive-path.ts` (clamp), `catmull-rom.ts` (clamp), `scroll-source.ts` (NaN + ResizeObserver), the new `scroll-source.spec.ts`, `dive-controller.ts` (clamp, `step` dt, `suspend`, `scrollToWaypoint`, extracted `returnToScroll`), `dive.config.ts` (floorY), and the added spec cases in `dive-path.spec.ts`, `dive-controller.spec.ts`, `dive.config.spec.ts`.

## Status of original findings

| # | Original finding | Status | Verification |
| --- | --- | --- | --- |
| M1 | NaN escapes `clamp01` → silent NaN pose | **FIXED** | `Number.isNaN` guard-first clamps at `libs/dive/domain/src/lib/dive-path.ts:59`, `libs/dive/domain/src/lib/catmull-rom.ts:84`, `libs/dive/feature/src/lib/dive-controller.ts:62`, `scrollTopForProgress` at `scroll-source.ts:10`; `step` dt at `dive-controller.ts:235`. Specs: `dive-path.spec.ts:106-111` (pointAt/tangentAt/depthAt/raw spline), `dive-controller.spec.ts:242-248` (NaN step → finite pose), `scroll-source.spec.ts:67-69`. ±Infinity still passes the comparisons and clamps to 1/0 — correct. |
| M2 | Stale mapping on document-height change without resize | **FIXED** | `scroll-source.ts:42-49`: `ResizeObserver` on `document.documentElement` (auto-height root tracks document height), guarded by `typeof win.ResizeObserver === 'function'` for jsdom/old browsers, `observer?.disconnect()` in the unsubscribe. Pinned by `scroll-source.spec.ts:32-65` (fires on height change with no resize event; disconnect verified; RO-less fallback still delivers scroll events). RO's initial observe notification just triggers one idempotent re-read — harmless. |
| m3 | `scrollToWaypoint` double scroll motion | **FIXED** | `dive-controller.ts:213-222`: from `focus`/`suspended` it calls `returnToScroll()` (mode/focus cleanup only, no scroll restore) and issues a single `source.scrollTo(waypoint.progress, ...)`. Spec: `dive-controller.spec.ts:227-240` asserts `scrollTo` called exactly once with the waypoint progress. |
| m4 | `suspend()` no-op while focused | **FIXED** | `dive-controller.ts:184-190`: now proceeds from `focus`, keeps `heldScroll` (hold is a no-op outside scroll mode), sets `target = clamp01(progress.value)` so the camera eases to a halt in place while still facing the focus; `release()` still restores the pre-focus scroll. Specs: `dive-controller.spec.ts:209-225` (stops short, release returns) and the original suspend test at 195-207 still passes. |
| m5 | Gauge never reaches 180 m | **FIXED** | `dive.config.ts:89`: `floorY = Math.min(...controlPoints.map(p => p[1]))` — the deepest route position (2.8), not the landmark bases. `dive.config.spec.ts:44` now asserts `depthAt(1) === floorMeters` to 9 digits. End-segment geometry approaches y = 2.8 from above with a downward end tangent, so the path does not dip below floorY mid-dive; even a future route that dipped stays bounded by the existing ratio clamp. Empty-route edge is unreachable (validation requires ≥2 points first). |
| m6 | No error boundary for invalid config | **DEFERRED** | As agreed; unchanged, not re-flagged. |

## Regression sweep (changed code only)

- `step` dt rework (`dive-controller.ts:235`) is an improvement beyond the letter of M1: the old `Math.min(Math.max(delta, 0), MAX)` turned a NaN delta into NaN `elapsed`, which poisoned the sway `sin(NaN)` into a NaN position — an unreported sub-bug of the original implementation that this fix eliminates (dt is now exactly 0 for NaN/negative; +Infinity clamps to 0.1). The dt = 0 frame is a clean no-op in the springs, settle and publish still run.
- The stale `heldScroll` left behind by `scrollToWaypoint`'s new no-restore path (`dive-controller.ts:216-218`) is never read: `release()` early-returns in scroll mode and `hold()` overwrites it from scroll mode on the next hold. No dead-state hazard.
- `scrollToWaypoint` sets `target = source.read()` before the (possibly smooth) scroll fires — a one-frame-stale target at worst; the scroll events then drive it. Negligible.
- `returnToScroll()` extraction (`dive-controller.ts:225-229`) is behaviour-identical to the previous inline code in `release()`; `release()` ordering (mode → read → scrollTo → target → notify) is unchanged.
- `suspend()` from `focus` followed by another `focusWaypoint` keeps `heldScroll` at the pre-first-focus position, matching the documented "return position stays the one from before the first focus" contract.
- RO callback only reads; no layout writes → no observer-loop risk. Double notification (resize + RO) is idempotent.
- `windowScrollSource` signature change (`Window & typeof globalThis`, `scroll-source.ts:29`) is compatible with `DiveScroll`'s call site.

## New defects

None. Nothing in the changed code introduced a failure mode: all five reachable-input paths that previously leaked NaN now resolve it at the boundary, the observer has a cleanup path and a fallback, and the state-machine changes preserve every invariant I traced in r1 (re-entrancy, heldScroll preservation, restore-on-release, StrictMode idempotence).

## Verdict

- Recommendation: **APPROVE**
- Confidence: **HIGH** — every fix verified at file:line, each pinned by a new spec case, all suites green.
- Score: 9/10, up from 8/10. The only remaining item is the deferred minor (error boundary for invalid config, r1 finding 6).
- Top residual risk: none in the changed code; the deferred blank-page-on-config-error remains the one known rough edge.