# Code Logic Review — `telemetry-events` (code-logic + privacy, independent GLM pass)

Read-only review. Nothing outside this file was modified. Binary files were not opened.
Test evidence: `npx nx run-many -t test -p telemetry-domain,telemetry-data-access` — 34/34 pass
(21 domain, 13 data-access; Nx reported 2/2 cache hits with passing output).

## Summary

| Metric              | Value           |
| ------------------- | --------------- |
| Overall score       | 5/10            |
| Assessment          | NEEDS_REVISION  |
| Blocking issues     | 1               |
| Serious issues      | 1               |
| Moderate issues     | 3               |
| Minor issues        | 3               |
| Failure modes found | 8               |

The two telemetry libraries are genuinely well engineered: the allow-list is sound (exact
key-set match, slug regex rejects email/URL/free-text shapes, tested), the milestone tracker
and dedupe are correct under monotonicity/jitter/jump cases, the provider API shapes match
current Plausible/Umami, the queue is bounded, no storage primitive is touched anywhere
(verified by grep — the only `document.cookie` occurrence in `libs/telemetry` is a spec
assertion), and DNT/GPC gate before any adapter or script exists. But the roadmap item as
shipped cannot meet its stated success criterion ("events land in the provider dashboard"):
the app wiring is exported and tested yet **never called from any production code path**, so
no event, no pagehide listener and no script injection ever happens. One bfcache defect in
the exit path and a lazy-load promise the code does not keep round it out.

## Five logic questions

### 1. How does this fail silently?

The dominant one: the whole feature is dead code in the running app (Defect 1). There is no
error, no warning, no empty dashboard to notice — `siteTelemetry()` is only ever reached
from `apps/web/src/app/telemetry.spec.ts`. The libraries pass 34 tests while the product
collects exactly nothing.

Second: `ScriptAnalytics.track` when `state === 'idle'` calls `void this.load()`
(script-analytics.ts:84), so the very first tracked event — `quality_tier_resolved`, which
fires at start-up — injects the provider script immediately instead of on the first idle
period (Defect 3). The docs' lazy-load promise (docs/analytics.md:99-100) silently does not
hold.

Third: `sanitizeEvent` returning `null` is dropped silently by design
(telemetry-session.ts:82). That is the documented trade-off and acceptable, but it means a
content-author renaming a landmark to a non-slug id loses its click events with no signal
anywhere.

### 2. What user action produces unexpected behaviour?

A visitor navigating away and returning via back/forward (bfcache, common on iOS Safari):
`pagehide` with `persisted: true` fires `session.dropOff()` (telemetry-client.ts:78-79),
which the `once`-by-name dedupe rule consumes (dedupe.ts:17, allow-list… dedupe.ts:46-51).
On `pageshow` the visit continues, but on the *real* exit no second drop-off is sent — and
the one already sent carries the depth bucket as of bfcache *entry*, not as of where the
visitor actually left (Defect 2). No double-fire occurs (the dedupe holds), so the failure
is a missing/stale record, not a duplicate.

Also: a visitor whose first tab action closes the page before the idle callback fires still
gets a drop-off — `trackOnExit` handles `state === 'idle'` correctly by going straight to
`sendDirect` (script-analytics.ts:87-96). Good; not a defect.

### 3. What input data produces a wrong answer?

- An uppercase `VITE_ANALYTICS_DOMAIN` (e.g. `Example.org`) passes `DOMAIN_PATTERN` (the
  `/i` flag, analytics-config.ts:49) and is forwarded verbatim as `data-domain`
  (providers.ts:35). Plausible matches the site domain exactly, so every event is silently
  discarded by the server while the client reports success (Defect 6, minor).
- A `VITE_ANALYTICS_SCRIPT_SRC` pointing at a path-rewriting proxy (e.g. a CDN serving
  `/u.js`) yields `eventEndpoint = <origin>/api/event` (analytics-config.ts:95,107), which
  is a guess about the host's `/api` layout; a 404 there is swallowed by
  `fetch().catch(() => undefined)` (script-analytics.ts:139). Inherent to the design and
  documented; noted as residual uncertainty, not a defect.
- Milestone tolerance: `p >= milestone/100 - tolerance` with the default 0.005 fires the
  25% milestone at 24.5% progress (milestone-tracker.ts:68). This matches the documented
  "within 0.5%" (docs/analytics.md:73); buckets are consistent between `depthBucketFor` and
  the tracker. Not a defect.

### 4. What happens when a dependency fails?

Verified end to end and mostly good:

- Script fails to load (content blocker): state → `'failed'`, queue dropped, adapter silent
  including the exit path (script-analytics.ts:69-72,78,88) — deliberate, documented
  (docs/analytics.md:94-95), and tested (telemetry-data-access.spec.ts:184-193).
- `plausible`/`umami` global missing after load: `deliver` falls back to `sendDirect`
  (script-analytics.ts:100-102). Good.
- Provider global throws: caught and swallowed (script-analytics.ts:107-113). Good — the
  app never breaks.
- `sendBeacon` returns false (queue full): falls through to `fetch` keepalive
  (script-analytics.ts:126-140). Good.
- Neither `load` nor `error` ever fires on the injected script: the `load()` promise never
  settles, state stays `'loading'`, queue is capped at 50 (script-analytics.ts:29,83).
  Bounded, no leak. Acceptable.
- No double delivery: `trackOnExit` clears the queue before the eventual `load()` resolution
  can replay it (script-analytics.ts:90-91 vs 65-67). Verified the ordering — correct.

One gap: on the Umami exit path with the script loaded, `exitViaGlobal: true` routes through
`umami.track` (providers.ts:71, script-analytics.ts:93). If Umami's own unload transport
fails, nothing observes it — fire-and-forget by design. Same class as the swallowed errors
above; acceptable for analytics.

### 5. What is missing that the requirements never mentioned?

- A producer. The charter lists five events; the code implements all five and then wires
  none of them (Defect 1). `reportLandmarkEvent` even documents the gap in a comment:
  "Telemetry subscribes here when it lands; until then only failures are reported"
  (landmark-ports.ts:42).
- SRI: the injected script carries no `integrity` attribute (script-loader.ts:12-21).
  Hosted provider scripts update in place, so SRI against `script.js` would break tracking
  on every provider release; pinning a versioned URL would enable SRI but the pinned
  defaults (`plausible.io/js/script.js`, `cloud.umami.is/script.js`, analytics-config.ts:11-12)
  are mutable. A documented decision is missing rather than code (Defect 7, minor). CSP is
  the intended mitigation and the repo has no CSP today (grepped — only docs mention it).
- bfcache re-entry handling: no `persisted` check on `pagehide`, no `pageshow` re-arm
  (Defect 2).

## Failure modes

### FM1 — Feature completely unwired (no event can ever be sent)

- Trigger: deploying the site as-is.
- Symptom: no analytics script, no `pagehide` listener, no events; dashboard stays empty
  while all tests are green.
- Evidence: `apps/web/src/app/telemetry.ts:30-66` exports `useSiteTelemetry`,
  `trackLandmarkEvent`, `trackOverlayOpened`, `trackQualityTier`; repo-wide grep shows the
  only importer of `./telemetry` is `apps/web/src/app/telemetry.spec.ts:8`; no other
  occurrence of "telemetry" in `apps/web/src` outside those two files;
  `apps/web/src/app/landmark-ports.ts:42-52` reports only `landmark_model_error` and its
  comment says telemetry subscribes "when it lands" — it has landed and does not.
- Current handling: none — the charter's success criterion ("events land in the provider
  dashboard") is unreachable.
- Recommendation: mount `useSiteTelemetry()` inside the dive host (after `<DiveProvider>`),
  call `trackQualityTier` from the quality-resolution path, call
  `trackLandmarkEvent`/`trackOverlayOpened` from the landmark kernel's event port, and add
  an app-level test asserting at least one production code path reaches the session.

### FM2 — bfcache entry consumes the once-per-visit drop-off

- Trigger: navigate away (bfcache-eligible), return via back, continue the dive, leave for
  real.
- Symptom: the recorded `dive_drop_off` reflects the moment of bfcache *entry* (shallower
  bucket, possibly stale `lastWaypointId`), and the true exit is never recorded. No duplicate
  is sent — the dedupe holds — so the loss is invisible.
- Evidence: telemetry-client.ts:76-79 (`pagehide` → `dropOff()` unconditionally, no
  `event.persisted` check, no `pageshow` listener); dedupe.ts:17 (`dive_drop_off`:
  `once` by name); dedupe.ts:46-51 (second admit returns false); session state
  (tracker `fired` set, `lastWaypointId`, dedupe map) survives bfcache in the same JS realm.
- Current handling: drop-off fires exactly once per *pagehide-observed* visit, which on
  bfcache is the wrong boundary.
- Recommendation: skip when `event.persisted` is true, or on `pageshow` with
  `event.persisted`, re-arm the drop-off by evicting only the `dive_drop_off` key from the
  dedupe map (the depth milestones should stay consumed — they are legitimately
  once-per-visit). Unit-test the pagehide(persisted) → pageshow → pagehide sequence.

### FM3 — First event defeats the documented lazy idle load

- Trigger: any event tracked before the idle callback fires — in practice
  `quality_tier_resolved` at start-up.
- Symptom: provider script injected immediately during first render, contradicting
  docs/analytics.md:99-100 ("injected lazily on the first idle period after start-up").
- Evidence: script-analytics.ts:77-85 — `track()` in state `'idle'` pushes to the queue and
  calls `void this.load()`; `load()` injects synchronously (script-analytics.ts:55-75 →
  script-loader.ts:11).
- Current handling: queue-until-load is intact; only the timing promise is broken.
- Recommendation: have `track()` never start the load itself while `start()` is pending —
  e.g. let the client own scheduling and pass a `loadGate` promise to the adapter, or gate
  `track`-triggered `load()` behind the same idle callback. Alternatively amend the docs.
  (FM1 currently masks this — fix FM1 first and this becomes live.)

## Blocking issues

### 1. Telemetry is dead code: no production caller of any wiring export

- File: apps/web/src/app/telemetry.ts:30 (and 52-66); corroborating:
  apps/web/src/app/landmark-ports.ts:42.
- Scenario: any deployment, any visitor. `useSiteTelemetry` is never mounted;
  `trackLandmarkEvent`, `trackOverlayOpened`, `trackQualityTier` have zero non-spec callers.
- Impact: the item's acceptance criterion cannot hold; reviewers see green tests and an
  empty dashboard and have nothing to debug. All downstream behaviour (queue, dedupe,
  bfcache) is unobservable in production.
- Fix: the wiring step in FM1 above.

## Serious issues

### 2. Drop-off consumed by bfcache entry and never re-armed (FM2)

- File: libs/telemetry/data-access/src/lib/telemetry-client.ts:76-79; root rule at
  libs/telemetry/domain/src/lib/dedupe.ts:17.
- Scenario: mobile Safari back-forward navigation (bfcache is the default there for
  same-origin returns), then a real exit after diving deeper.
- Impact: systematically wrong `maxDepthBucket`/`lastWaypointId` for a common navigation
  pattern — the exact metric the feature exists to measure ("drop-off point").
- Fix: `persisted`-aware pagehide / pageshow re-arm as in FM2.

## Moderate issues

### 3. Lazy idle script load defeated by the first event (FM3)

- File: libs/telemetry/data-access/src/lib/script-analytics.ts:84; docs claim at
  docs/analytics.md:99-100.
- Scenario: `quality_tier_resolved` fires at start-up → script injected during first paint
  instead of on idle.
- Impact: third-party script competes with first render; documented behaviour does not match
  shipped behaviour.
- Fix: gate `track`-initiated loads behind the idle schedule, or correct the doc.

### 4. Docs under-report what the exit path collects (Umami)

- File: libs/telemetry/data-access/src/lib/providers.ts:80-99.
- Scenario: Umami drop-off or pre-load exit sends `hostname`, `language`, `screen` in the
  direct `/api/send` payload — collected by *this code*, not only by the provider's own
  pageview as docs/analytics.md:79-81 implies ("What is collected" lists only event props;
  the "provider script also records" paragraph attributes path/referrer/etc. to the script).
- Impact: the privacy documentation is the deliverable's contract; it currently attributes
  hostname/language/screen to the provider when the exit path sends them itself.
- Fix: one sentence in docs/analytics.md naming the direct-exit payload fields. (Note: these
  are Umami's own standard event fields, so no new data class is introduced.)

### 5. `quality_tier_resolved` contract relies on an unenforced call order

- File: libs/telemetry/domain/src/lib/dedupe.ts:18-19 and
  apps/web/src/app/telemetry.ts:63-66.
- Scenario: the "once per visit, later adaptive changes are not reported" semantics are
  implemented purely as first-call-wins. If the tier resolution fires early with a
  provisional value before settling, the provisional tier is reported and the settled one
  is silently dropped.
- Impact: wrong tier attribution with no signal; correctness depends entirely on the caller
  resolving before reporting, which is asserted nowhere (and the intended caller does not
  exist yet — see Defect 1).
- Fix: document the precondition on `trackQualityTier` ("call only once the tier is final"),
  or key the dedupe by tier value if early-and-final reporting is desired.

## Minor issues

### 6. Uppercase Plausible domain accepted, silently discarded server-side

- File: libs/telemetry/data-access/src/lib/analytics-config.ts:49,87-96;
  providers.ts:35.
- Scenario: `VITE_ANALYTICS_DOMAIN=Example.org` passes the case-insensitive pattern;
  Plausible matches `data-domain` exactly.
- Impact: all events silently rejected by the provider. Fix: `toLowerCase()` the domain.

### 7. No SRI on the injected script, and the decision is undocumented

- File: libs/telemetry/data-access/src/lib/script-loader.ts:12-21.
- Scenario: a compromised or tampered provider origin serves modified script. SRI against
  the mutable `script.js` URL would break on every provider release, so omitting it is
  defensible — but the pin (analytics-config.ts:11-12) is to a mutable URL and
  docs/analytics.md never mentions integrity. Fix: document the decision; optionally
  support `VITE_ANALYTICS_INTEGRITY` for self-hosted pins, where the operator controls
  versions.

### 8. `eventKey` stringifies values (`String(props[key])`)

- File: libs/telemetry/domain/src/lib/dedupe.ts:29.
- Scenario: `milestone: 25` (number) and a hypothetical `'25'` produce the same key. The
  allow-list already rejects non-enum values before dedupe runs, so this is latent, not
  live. No fix required; noted for auditability.

## Privacy review (charter item 1)

| Check | Result | Evidence |
| --- | --- | --- |
| PII / free text cannot reach a provider | PASS | allow-list.ts:58-80: exact key-count match (line 68) rejects extra props; `hasOwn` rejects prototype pollution; slug rule allow-list.ts:15,36-40 rejects spaces, capitals, `@`, `/`, `?`, leading separators, length > 64; tested against email/URL/free-text/oversized (allow-list.spec.ts:40-52) |
| No cookies / localStorage by any path | PASS | grep over `libs/telemetry`: zero `localStorage`/`sessionStorage`/`document.cookie`/`indexedDB` in source (only a spec assertion, telemetry-data-access.spec.ts:257); `credentials: 'omit'` on fetch (script-analytics.ts:137); both provider scripts cookieless in default config |
| DNT / GPC honoured before any script loads | PASS | privacy.ts:13-20 (GPC true, DNT `'1'`, legacy `window.doNotTrack`); telemetry-client.ts:22-25 returns `NoopAnalytics` before a `ScriptAnalytics` exists, so no script element is ever created; `start()` no-ops for provider `none` (telemetry-client.ts:64); tested (telemetry-data-access.spec.ts:105-127). Umami additionally gets `data-do-not-track` (providers.ts:70) |
| Script URLs pinned / validated | PASS | analytics-config.ts:11-12 pins official https URLs; `parseScriptUrl` (60-71) rejects non-URLs, embedded credentials, non-https except `localhost`/`127.0.0.1`/`[::1]`; event endpoint derived from the same origin, so no second host to validate |
| URL hygiene on direct sends | PASS | `pageUrl` strips query and fragment (script-analytics.ts:143-147); referrer sent as `null` (providers.ts:51) |
| SRI feasibility | SEE Defect 7 | feasible only for self-hosted versioned pins; decision undocumented |

Residual privacy uncertainty: the provider's own script records its standard pageview under
its own data policy — docs/analytics.md:79-81 discloses this, but the exact URL/query-string
handling of each provider's pageview is the provider's behaviour, not this code's, and was
not verifiable from the repository.

## Provider API shapes (charter item 3)

- Plausible: `window.plausible(name, { props })` (providers.ts:11-14,40) — matches the
  current documented custom-events API. Exit path posts `{ name, url, domain, referrer,
  props }` as `text/plain` to `<origin>/api/event` (providers.ts:43-56,
  analytics-config.ts:95) — matches the current Events API (CORS-safelisted type, no
  preflight; the code even routes JSON-content-type cases away from `sendBeacon`,
  script-analytics.ts:126). `data-domain` attribute correct, comma-separated roll-up domains
  supported by `DOMAIN_PATTERN`.
- Umami: `window.umami.track(name, data)` (providers.ts:17-19,77) and `data-website-id`
  (providers.ts:70) — correct. Direct exit payload `{ type: 'event', payload: { website,
  hostname, url, name, data, language, screen } }` (providers.ts:80-99) — matches the
  current Umami v2 `/api/send` schema. `data-do-not-track="true"` is the current attribute
  name.
- Docs CSP table (docs/analytics.md:50-59) is accurate for the pinned endpoints, and its
  Umami gateway caveat is a fair hedge; no CSP exists in the repo yet, so nothing conflicts.

## Wiring hook (charter item 4)

`useSiteTelemetry` (apps/web/src/app/telemetry.ts:30-43) subscribes via `dive.subscribe`,
returns a cleanup that unsubscribes then `stop()`s; `start()`'s cleanup cancels the idle
handle and removes the `pagehide` listener (telemetry-client.ts:63-85). StrictMode's
mount → cleanup → mount sequence therefore leaves no duplicate listener or idle callback,
and the module-level client singleton (telemetry.ts:16-22) means one session, not two; the
spec pins the unsubscribe (telemetry.spec.ts:46-56). Correct as written — the defect is that
it is never mounted (Defect 1). The session's dedupe would also absorb a hypothetical
double-subscribe for the `once`-policy events.

## Data flow (one dive event, entry to exit)

1. Dive controller publishes `{ maxProgress, nearestWaypointId }` in [0, 1]
   (dive-controller.ts:20-36,301-322) — units verified against the tracker's contract. OK.
2. `observeDive` maps the nearest waypoint (slug-checked, else `none`,
   telemetry-session.ts:48-51) and feeds `maxProgress` to the tracker. OK.
3. Tracker returns newly reached milestones once, ascending, monotonic, jitter-safe
   (milestone-tracker.ts:60-74; tested incl. NaN/clamp/jump). OK.
4. `sanitizeEvent` allow-lists a fresh copy (allow-list.ts:58-80). OK.
5. `EventDeduper.admit` applies once/window policy (dedupe.ts:43-57). OK.
6. `ScriptAnalytics.track` queues (≤ 50) until ready, else delivers via provider global with
   `sendDirect` fallback (script-analytics.ts:77-104). OK — except load timing (FM3).
7. `pagehide` → `dropOff` → once per visit → unload-safe transport (beacon or keepalive
   fetch, `credentials: 'omit'`) (telemetry-client.ts:78, script-analytics.ts:117-141). OK
   — except bfcache (FM2).
8. **Entry point missing**: nothing in the production app performs step 1→2 wiring (FM1).
   BROKEN.

## Requirements fulfilment

| Requirement (charter) | Status | Gap |
| --- | --- | --- |
| Dive depth reached event, once per bucket | COMPLETE (library) / MISSING (wiring) | tracker + dedupe correct; never invoked from the app |
| Landmark clicks, overlay opens | COMPLETE (library) / MISSING (wiring) | kernel port not forwarding (`landmark-ports.ts:42`) |
| Drop-off point on exit | PARTIAL | sent once per visit, but bfcache entry consumes it (Defect 2) |
| Resolved quality tier | COMPLETE (library) / MISSING (wiring) | no caller; call-order precondition unenforced (Defect 5) |
| Cookieless | COMPLETE | no storage path; providers cookieless by default |
| Default provider `none` | COMPLETE | resolveAnalyticsConfig + NoopAnalytics, tested |
| DNT and GPC → no-op | COMPLETE | checked before adapter creation; no script ever injected |
| Events land in the provider dashboard | MISSING | Defect 1 — no production caller |
| No analytics cookie set | COMPLETE (code) | unverifiable end-to-end until wired |

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| Non-finite / out-of-range progress | YES | tracker ignores NaN, clamps to [0,1] (milestone-tracker.ts:61-62) | none |
| Jump past several milestones | YES | returns all ascending (milestone-tracker.ts:66-73) | none |
| Invalid waypoint id | YES | falls back to `none` (telemetry-session.ts:51) | a transient invalid reading overwrites a valid last waypoint — cosmetic |
| Extra/missing event props, prototype keys | YES | exact key-count + `hasOwn` (allow-list.ts:66-77) | none |
| Queue overflow before load | YES | capped at 50, silent drop (script-analytics.ts:83) | documented |
| Script blocked mid-visit | YES | silent for rest of visit incl. exit, tested | documented trade-off |
| SSR / no window | YES | `browserRuntime()` null → Noop (telemetry-client.ts:9-12,22) | none |
| StrictMode double effect | YES | idempotent singleton + cleanup (telemetry.ts:16-22) | moot until mounted |
| pagehide (persisted) → pageshow → exit | NO | drop-off consumed at bfcache entry (Defect 2) | Serious |
| Tab closed before idle load | YES | exit path sends via `sendDirect` from state `idle` | none |

## Verdict

- Recommendation: REVISE
- Confidence: HIGH (the blocking defect is established by exhaustive grep over `apps/web/src`
  plus the self-documenting comment at landmark-ports.ts:42; library-level findings verified
  by reading every reviewed file in full and by the passing 34-test suite)
- Top risk: the feature ships green and collects nothing — wire it into the app, then fix
  the bfcache drop-off before trusting the "drop-off point" metric.
- What a robust implementation would add:
  1. Mount `useSiteTelemetry` and forward kernel/quality-tier events (unblocks the item).
  2. `persisted`-aware pagehide with a `pageshow` re-arm for the drop-off.
  3. Idle-gated script load so the first event doesn't inject during first paint.
  4. Lowercase the Plausible domain; document (or support) SRI for self-hosted pins.
  5. One app-level integration test asserting a production code path emits an event.
  6. Docs: name the direct-exit Umami fields in "What is collected".