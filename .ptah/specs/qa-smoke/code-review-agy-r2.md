# Code Logic Review (Revision 2) — `qa-smoke`

## Summary

| Metric              | Value    |
| ------------------- | -------- |
| Overall score       | 9/10     |
| Assessment          | APPROVED |
| Blocking issues     | 0        |
| Serious issues      | 0        |
| Moderate issues     | 0        |
| Minor issues        | 1        |
| Failure modes found | 0        |

Revision 1 addressed all six defects identified during the initial review pass. The test suite now enforces deterministic locale pinning (`en-US` and `?lang=en` across all specs) while adding dedicated verification for Arabic RTL switching (`src/locale.spec.ts`). Web3Forms interception now strictly validates `POST https://api.web3forms.com/submit` and rejects any malformed or unexpected requests with HTTP 404 while recording them. Fixed sleeps have been replaced with `waitForLoadState('networkidle')`, the overly permissive no-WebGL diagnostic allowlist has been eliminated, unconfigured in-world scroll state is tested, and content path resolution is anchored to workspace constants.

All lint and typecheck targets pass cleanly (`npx nx run-many -t lint,typecheck -p web-e2e --skipSync` exited code 0). The roadmap item `qa-smoke` is approved for merge.

---

## Revision 1 Resolution Matrix

| # | Finding in R1 | Severity | Status | Verification & Evidence |
| - | ------------- | -------- | ------ | ----------------------- |
| 1 | Unpinned locale leading to failure on non-English runners | Serious | **FIXED** | [apps/web-e2e/playwright.config.ts:65](file:///D:/projects/qa3elhamor/apps/web-e2e/playwright.config.ts#L65) pins `locale: 'en-US'`. [apps/web-e2e/src/support/site.ts:8,11](file:///D:/projects/qa3elhamor/apps/web-e2e/src/support/site.ts#L8) set `DIVE_URL = '/?quality=high&lang=en'` and `PAGE_URL = '/?view=page&lang=en'`. [apps/web-e2e/src/visual.spec.ts:76](file:///D:/projects/qa3elhamor/apps/web-e2e/src/visual.spec.ts#L76), [apps/web-e2e/src/nowebgl.spec.ts:11,20](file:///D:/projects/qa3elhamor/apps/web-e2e/src/nowebgl.spec.ts#L11), and [apps/web-e2e/src/fallback.spec.ts:9,19](file:///D:/projects/qa3elhamor/apps/web-e2e/src/fallback.spec.ts#L9) pin `lang=en`. New test [apps/web-e2e/src/locale.spec.ts:1-33](file:///D:/projects/qa3elhamor/apps/web-e2e/src/locale.spec.ts#L1-L33) explicitly exercises `?lang=ar`, RTL layout (`dir="rtl"`), Arabic language toggle state, and landmark navigation. |
| 2 | Overly broad provider interception missing path and HTTP method | Serious | **FIXED** | [apps/web-e2e/src/support/contact.ts:7-8,33-40](file:///D:/projects/qa3elhamor/apps/web-e2e/src/support/contact.ts#L7) restricts route handling: only `POST https://api.web3forms.com/submit` is accepted; non-POST methods or other URL paths return HTTP 404 and record the call. [apps/web-e2e/src/support/contact.ts:65-78](file:///D:/projects/qa3elhamor/apps/web-e2e/src/support/contact.ts#L65) implements `expectProviderCalls(calls, count)` to assert exact method, URL, and body schema (`access_key`, `subject`, `message`). Integrated into all delivered and failed tests in [apps/web-e2e/src/bureau.spec.ts:48,78,98,122](file:///D:/projects/qa3elhamor/apps/web-e2e/src/bureau.spec.ts#L48). |
| 3 | Fixed sleeps (`waitForTimeout`) in smoke and wall specs | Moderate | **FIXED** | [apps/web-e2e/src/smoke.spec.ts:30](file:///D:/projects/qa3elhamor/apps/web-e2e/src/smoke.spec.ts#L30) and [apps/web-e2e/src/wall.spec.ts:17](file:///D:/projects/qa3elhamor/apps/web-e2e/src/wall.spec.ts#L17) replaced fixed sleeps with `await page.waitForLoadState('networkidle')`. The only remaining sleep is the documented 8 s settle in [apps/web-e2e/src/visual.spec.ts:87](file:///D:/projects/qa3elhamor/apps/web-e2e/src/visual.spec.ts#L87) for software GL asset streaming. |
| 4 | Overly broad error allowlist `/WebGL\|GPU\|context/i` | Moderate | **FIXED** | [apps/web-e2e/src/nowebgl.spec.ts:8-10](file:///D:/projects/qa3elhamor/apps/web-e2e/src/nowebgl.spec.ts#L8) removed `diagnostics.allow` entirely; any uncaught console error or page error on the fallback page now fails the test. |
| 5 | Missing unrolled scroll coverage in pending Bureau spec | Minor | **FIXED** | [apps/web-e2e/src/bureau-pending.spec.ts:37-51](file:///D:/projects/qa3elhamor/apps/web-e2e/src/bureau-pending.spec.ts#L37-L51) added an in-world test confirming the 3D unrolled scroll displays the unconfigured post-office notice and sends zero outbound network requests. |
| 6 | Fragile relative path resolution in content reader | Minor | **FIXED** | [apps/web-e2e/src/support/content.ts:5-8](file:///D:/projects/qa3elhamor/apps/web-e2e/src/support/content.ts#L5-L8) defines `WORKSPACE_ROOT` and `CONTENT_DIR` constants with explicit existence assertion. |

---

## Analysis of New Logic & Robustness

### Network Idle Synchronization (`page.waitForLoadState('networkidle')`)
- **Context**: Used in `smoke.spec.ts:30` (to ensure 3D scene models, decoders, and workers are fully loaded before reading the build CSP and verifying no CSP violation events fired) and in `wall.spec.ts:17` (to verify that no wall `/api/` network requests were dispatched during page load).
- **Robustness Check**:
  - The application is a static site without continuous WebSocket connections, Server-Sent Events, or long-polling background timers.
  - Analytics (`VITE_ANALYTICS_PROVIDER`) is disabled by default in the workspace.
  - If executed against `E2E_BASE_URL` with analytics enabled, tracking scripts (Plausible / Umami) fire one-off pageview beacons rather than persistent streaming connections, allowing `networkidle` (500 ms quiet window) to settle promptly.
  - Therefore, `networkidle` is robust and will not hang or deadlock test execution.

---

## Remaining Minor Observations

### Issue 1 (Minor): Caller Environment Scrubbing in `serve.mjs`
- File: [apps/web-e2e/scripts/serve.mjs:24-26](file:///D:/projects/qa3elhamor/apps/web-e2e/scripts/serve.mjs#L24-L26)
- Observation: `serve.mjs` deletes `VITE_(CONTACT|WEB3FORMS|FORMSPREE|WALL)` from `process.env`, but does not delete `VITE_ANALYTICS_*`. If a developer happens to export `VITE_ANALYTICS_PROVIDER` in their local shell environment, the preview servers could build with telemetry active.
- Recommendation: Add `ANALYTICS` to the regex filter: `/^VITE_(CONTACT|WEB3FORMS|FORMSPREE|WALL|ANALYTICS)/`.

---

## Five Logic Questions (Re-evaluated)

### 1. How does this fail silently?
No silent failure paths remain. Intercepted contact requests now validate method and URL, throwing 404 on divergence, and `expectProviderCalls` strictly verifies payload contents. CSP violation listeners fail any test that encounters a CSP rejection.

### 2. What user action produces unexpected behaviour?
None identified. Both Arabic and English user paths, dialog presentations, and full 3D interactive flights have explicit test coverage and locale isolation.

### 3. What input data produces a wrong answer?
None identified. Form submissions, empty validation, 500 error recoveries, and unconfigured states are verified against exact status messages.

### 4. What happens when a dependency fails?
- When the contact provider returns HTTP 500, the visitor's entered text is preserved, an alert banner is displayed, and subsequent retry succeeds ([bureau.spec.ts:60-79](file:///D:/projects/qa3elhamor/apps/web-e2e/src/bureau.spec.ts#L60-L79)).
- When WebGL is unavailable or fails context creation, the browser gracefully defaults to the readable page view without logging uncaught errors ([nowebgl.spec.ts:8-27](file:///D:/projects/qa3elhamor/apps/web-e2e/src/nowebgl.spec.ts#L8-L27)).

### 5. What is missing that the requirements never mentioned?
All requirements from the charter and roadmap specification are accounted for.

---

## Verdict

- Recommendation: **APPROVE**
- Confidence: **HIGH**
- Top risk: None remaining in the E2E architecture.
- Conclusion: The test suite is deterministic, resilient to locale divergence, exact in mock interception, and safe for continuous integration.
