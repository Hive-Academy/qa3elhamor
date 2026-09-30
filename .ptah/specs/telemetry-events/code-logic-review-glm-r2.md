# Code Logic Review — `telemetry-events` (round 2, re-verification of fixes)

Read-only re-review. Nothing outside this file was modified. No binary files opened.
Test evidence, fresh runs: `npx nx run-many -t test -p telemetry-domain,telemetry-data-access`
→ both pass (21 domain + 15 data-access, up from 13 — the new cases are the fix tests);
`npx nx run-many -t test -p web` → 50/50 pass, including `telemetry.spec.ts` (5 tests,
now with a production-port wiring test) and `app.spec.tsx`. `ptah_get_diagnostics` scoped to
the changed telemetry files: **0 errors** (sibling errors are stale `dist/` artifacts and
pre-existing landmark-kernel issues, out of scope per the invocation).

## Summary

| Metric           | Value    |
| ---------------- | -------- |
| Overall score    | 9/10     |
| Assessment       | APPROVED |
| Blocking issues  | 0        |
| Serious issues   | 0        |
| Moderate issues  | 0        |
| Minor issues     | 1        |

## Status of the original findings

| # | Original finding (r1) | Status | Evidence |
| - | --- | --- | --- |
| 1 | **Blocking** — feature dead code, no production caller | FIXED | `app.tsx:66` renders `<SiteTelemetry />` inside `<DiveProvider>` (`app.tsx:65`); `SiteTelemetry` mounts `useSiteTelemetry` (`telemetry.ts:47-50`); `app.tsx:44` wires `onLandmarkEvent={reportLandmarkEvent}`; `landmark-ports.ts:47-55` forwards to `trackLandmarkEvent`, which filters to `landmark_open` and emits both `landmark_clicked` and `overlay_opened` with the landmark id (`telemetry.ts:57-62`). The `landmark_open` arm of the kernel union verified at `landmark-context.tsx:37-41` (hover/close/model_error correctly not collected). Wiring is tested end to end: `telemetry.spec.ts:42-48` imports the real `landmark-ports` and asserts the session receives the open. |
| 2 | **Serious** — bfcache entry consumed the once-per-visit drop-off | FIXED | `telemetry-client.ts:83-88`: every `pagehide` sends drop-off; `pageshow` with `persisted` calls `session.resumeVisit()`; `telemetry-session.ts:89-91` → `deduper.forget('dive_drop_off')` (`dedupe.ts:61-65`), which handles both key forms (bare name for `once`-by-name, `name|…` prefixed keys). Depth milestones stay consumed — correct, they are legitimately once-per-visit. The residual trade-off (leave → back → leave = two drop-offs, the first reflecting depth at bfcache entry) is now **documented** with counting guidance (`docs/analytics.md:125-135`). Tested both directions: double `pagehide` without restore → one drop-off (`telemetry-data-access.spec.ts:261-269`); restore sequence → second drop-off with the deeper bucket, and `pageshow` unpersisted does **not** re-arm (`telemetry-data-access.spec.ts:279-303`). |
| 3 | **Moderate** — first event defeated the documented lazy idle load | FIXED | `script-analytics.ts:83-86`: `track()` only queues (comment states the invariant); `load()` is called solely from the client's idle schedule (`telemetry-client.ts:69-74`). Regression check: a `start()`-less caller now never loads — but the mounted `SiteTelemetry` always calls `start()`, and `pagehide` still flushes the queue via `trackOnExit` (`script-analytics.ts:88-97`), so no silent loss path exists in the app. Tested: an early `quality_tier_resolved` does not inject the script (`telemetry-data-access.spec.ts:255-258`); docs updated (`docs/analytics.md:117`). |
| 4 | **Moderate** — docs under-reported the Umami direct-exit payload | FIXED | `docs/analytics.md:89-93` now names exactly what each provider's direct exit payload contains (Umami: website id, hostname, path, language, screen; Plausible: name, URL sans query/fragment, domain, `referrer: null`, props). Matches `providers.ts:43-56,80-99`. |
| 5 | **Moderate** — `quality_tier_resolved` call-order contract unenforced/undocumented | FIXED (as scoped) | Precondition documented on the export (`telemetry.ts:70-73`: "call only once the tier is FINAL — the first call per visit wins") and the no-caller-yet staging documented in the docs' "Current wiring" paragraph (`docs/analytics.md:85-87`, deferred to the quality-tiers item, which owns tier resolution — there is no tier resolution on the page today, so nothing can call it yet). |
| 6 | **Minor** — uppercase Plausible domain silently discarded server-side | FIXED | `analytics-config.ts:87-88` lowercases before validating and emitting `data-domain`. |
| 7 | **Minor** — no SRI, decision undocumented | FIXED | `docs/analytics.md:138-144`: explicit decision (mutable official `script.js` would break on every provider release), with the self-hosted versioned-script escape hatch. Consistent with the pinned URLs at `analytics-config.ts:11-12`. |
| 8 | **Minor** — `eventKey` stringified values (`25` vs `'25'` collision risk) | FIXED | `dedupe.ts:29-30` uses `JSON.stringify`, so number and string values produce distinct keys. (Latent-only risk before; allow-list still rejects string `milestone` upstream — defence in depth now.) |
| — | **r1 edge note** — transient invalid waypoint id overwrote the last valid one | FIXED | `telemetry-session.ts:49-52` keeps the last valid slug and ignores non-slug ids; documented at `docs/analytics.md:79-80`; tested in `telemetry-session.spec.ts` (the "not a slug → `none`" case now only applies when no valid id was ever seen). |

## Regression hunt (new code paths, examined and cleared)

- **`forget()` key matching** (`dedupe.ts:61-65`): scans for `key === name` (the `once`-by-name
  form) and `name|`-prefixed keys (the `by: 'props'` form). No other event name shares the
  `dive_drop_off` prefix, so nothing unintended is forgotten. Cleared.
- **Queue flushed at bfcache entry, then visit continues**: `trackOnExit` clears the queue
  (`script-analytics.ts:90-92`), so events sent at entry are not re-delivered when the
  script later loads (`load()`'s flush sees an empty queue, `script-analytics.ts:65-67`).
  No double-send. Cleared.
- **`pagehide` at bfcache entry while the script is still queued**: sends queued depth
  events direct to the events API — they would have been sent anyway; restore continues
  with an empty queue. No loss, no duplication. Cleared.
- **StrictMode / double effect**: `start()`'s cleanup removes both `pagehide` and
  `pageshow` listeners and cancels the idle handle (`telemetry-client.ts:90-94`); React
  runs cleanup before re-running the effect, so listeners never overlap, and the singleton
  client (`telemetry.ts:17-23`) means one session regardless. Cleared; spec pins the
  unsubscribe (`telemetry.spec.ts:56-66`) and the client spec pins listener removal
  (`telemetry-data-access.spec.ts:272-275`).
- **`trackLandmarkEvent` signature change** (kind+id → `LandmarkEvent`): both call sites
  updated (`landmark-ports.ts:48`, spec); no other caller existed. The double emit
  (clicked + overlay_opened per open) is per-event-name deduped, so both land; a
  double-click inside the 1 s window suppresses both — intended. Docs table row updated
  accordingly (`docs/analytics.md:75`). Cleared.
- **`resumeVisit` after `stop()`**: if the host unmounted, the `pageshow` listener is gone
  and no re-arm happens — but then no `pagehide` listener exists either, so the session is
  inert by design. Consistent. Cleared.
- **Privacy re-check on the new wiring**: the only new data reaching the allow-list is the
  kernel's `landmarkId` (content-authored, slug-validated at `telemetry-session.ts` via
  `sanitizeEvent`); no new prop, no storage access, no script-attribute change. DNT/GPC
  gating unchanged (`telemetry-client.ts:22-25`). No new privacy surface. Cleared.

## New findings

### 1. `trackOverlayOpened` has no production caller, and the docs don't stage it (unlike the quality tier) — MINOR

- File: `apps/web/src/app/telemetry.ts:65-67`; `docs/analytics.md:75`.
- Scenario: the `overlay_opened` docs row still presents "a fixed key such as
  `complaints-wall`" as a live example, but no code path can send it — the public
  complaints-wall overlay does not exist in `apps/web` yet (repo-wide grep: only
  `telemetry.ts:64` mentions the key), and the docs' "Current wiring" paragraph documents
  the `quality_tier_resolved` no-caller staging but not this one.
- Impact: a reader provisioning goals sees one deferred event documented and may assume the
  other is live. No runtime defect — the event simply cannot fire.
- Fix: add one sentence to `docs/analytics.md`'s "Current wiring" paragraph noting that
  non-landmark overlay keys arrive when their overlays land, or drop the `complaints-wall`
  example from the table until then.

Nothing else new survived verification. The fixes are all real (verified at file:line
above), tested (new cases in both libraries and the app spec), and documented; the two
deliberate trade-offs (double drop-off after bfcache return; quality-tier deferred to the
quality-tiers item) are the right calls and are now written down where the next reader will
look.

## Verdict

- Recommendation: APPROVE
- Confidence: HIGH (every fix verified at file:line, all four suites re-run green:
  36 telemetry tests + 50 web tests, 0 diagnostics in the changed files)
- Top residual risk: the `overlay_opened`/`complaints-wall` docs row promises an event no
  code path can emit yet — a one-sentence docs fix, no code change.
- Nothing blocking acceptance of `telemetry-events`.