# Code Logic Review — `qa-smoke`

## Summary

| Metric              | Value          |
| ------------------- | -------------- |
| Overall score       | 7/10           |
| Assessment          | NEEDS_REVISION |
| Blocking issues     | 0              |
| Serious issues      | 2              |
| Moderate issues     | 2              |
| Minor issues        | 2              |
| Failure modes found | 3              |

The `qa-smoke` implementation introduces a comprehensive, well-architected Playwright test suite for critical user journeys (dive, 4 landmarks, overlays, complaints submission, unconfigured pending build, no-WebGL fallback, reduced motion, wall omission, and visual regression testing via canvas screenshots). The infrastructure choices are sound: strict port isolation avoiding 4400, multi-process Vite preview servers, secure GitHub Actions workflow permissions (`contents: read` base with isolated `contents: write` for manual baseline dispatch), and Nx `type:e2e` boundary adherence. 

However, two serious logic issues require revision prior to merge:
1. **Locale Non-Determinism**: The suite fails to configure `locale: 'en-US'` in Playwright's browser context options, making the entire suite vulnerable to failure on non-English environments following the i18n implementation.
2. **Imprecise Provider Interception**: Web3Forms provider mock matches any path prefix without verifying the `/submit` endpoint or asserting the HTTP `POST` method, risking false-positive test passes on malformed requests.

---

## Five logic questions

### 1. How does this fail silently?
- In [apps/web-e2e/src/support/contact.ts:28-46](file:///D:/projects/qa3elhamor/apps/web-e2e/src/support/contact.ts#L28-L46) and [apps/web-e2e/src/bureau.spec.ts:47-54](file:///D:/projects/qa3elhamor/apps/web-e2e/src/bureau.spec.ts#L47-L54), `mockProvider` intercepts any request matching `/^https:\/\/api\.web3forms\.com\//` regardless of HTTP method (e.g., `GET`, `PUT`, `OPTIONS`) or endpoint path (e.g. `/v1/send` instead of `/submit`). If client-side code regressed to send an invalid HTTP verb or target the wrong URL path, `mockProvider` would still intercept it and return HTTP 200 `{ success: true, message: 'ok' }`, causing tests to pass while real submissions fail in production.

### 2. What user action produces unexpected behaviour?
- Running the test suite in a non-English environment or with `LANG=ar*` / Arabic browser preferences produces catastrophic test failures across almost all specs ([apps/web-e2e/playwright.config.ts:61-68](file:///D:/projects/qa3elhamor/apps/web-e2e/playwright.config.ts#L61-L68) and [apps/web-e2e/src/support/site.ts:8](file:///D:/projects/qa3elhamor/apps/web-e2e/src/support/site.ts#L8)). Because `apps/web/src/app/i18n/locale.ts:70-73` evaluates `navigator.languages`, unpinned browser contexts resolve to Arabic, swapping all accessible names and headings to Arabic and failing English locator queries.

### 3. What input data produces a wrong answer?
- In [apps/web-e2e/src/nowebgl.spec.ts:10](file:///D:/projects/qa3elhamor/apps/web-e2e/src/nowebgl.spec.ts#L10) and [apps/web-e2e/src/nowebgl.spec.ts:21](file:///D:/projects/qa3elhamor/apps/web-e2e/src/nowebgl.spec.ts#L21), `diagnostics.allow(/WebGL|GPU|context/i)` treats any error message containing `context` as benign. Any unrelated JavaScript error that mentions `context` (e.g. React context errors, missing execution context, `CanvasRenderingContext2D`) is suppressed rather than flagged.

### 4. What happens when a dependency fails?
- When SwiftShader software rasterization is unusually slow on low-powered CI runners (e.g. during heavy load or background asset decompression), fixed sleeps in [apps/web-e2e/src/smoke.spec.ts:30](file:///D:/projects/qa3elhamor/apps/web-e2e/src/smoke.spec.ts#L30) (5s) and [apps/web-e2e/src/wall.spec.ts:16](file:///D:/projects/qa3elhamor/apps/web-e2e/src/wall.spec.ts#L16) (3s) expire before resources finish parsing, resulting in intermittent timing-dependent flakes.

### 5. What is missing that the requirements never mentioned?
- Coverage for the unconfigured (bare) build is restricted exclusively to dialog mode via `test.use({ reducedMotion: 'reduce' })` in [apps/web-e2e/src/bureau-pending.spec.ts:7](file:///D:/projects/qa3elhamor/apps/web-e2e/src/bureau-pending.spec.ts#L7). The in-world 3D unrolled scroll presentation of the unconfigured state is not asserted.

---

## Failure modes

### 1. Non-English Environment Locator Mismatch
- Trigger: Running the E2E suite on an operating system or container configured with a default non-English locale (e.g., Arabic `ar-EG`).
- Symptom: Every spec asserting English accessible names (`Skip the dive`, `The Hamour`, `Citizenship Card`, `File a complaint`) fails on locator timeouts.
- Evidence: [apps/web-e2e/playwright.config.ts:61-68](file:///D:/projects/qa3elhamor/apps/web-e2e/playwright.config.ts#L61-L68) lacks `locale: 'en-US'`; [apps/web/src/app/i18n/locale.ts:70-73](file:///D:/projects/qa3elhamor/apps/web/src/app/i18n/locale.ts#L70-L73) falls back to `navigator.languages`.
- Current handling: Default Playwright settings without explicit locale pinning.
- Recommendation: Add `locale: 'en-US'` to `use:` in `playwright.config.ts`, or append `&lang=en` to `DIVE_URL`.

### 2. False-Positive API Mocking on Method or Path Mutation
- Trigger: A bug in `web3formsSubmitter` changing the URL from `https://api.web3forms.com/submit` to `https://api.web3forms.com/` or changing the method from `POST` to `GET`.
- Symptom: E2E tests pass green, but actual contact submissions in production fail with 404 or 405 errors.
- Evidence: [apps/web-e2e/src/support/contact.ts:4, 28-33](file:///D:/projects/qa3elhamor/apps/web-e2e/src/support/contact.ts#L4); [apps/web-e2e/src/bureau.spec.ts:48-54](file:///D:/projects/qa3elhamor/apps/web-e2e/src/bureau.spec.ts#L48-L54).
- Current handling: Route matches prefix `/^https:\/\/api\.web3forms\.com\//`, parses JSON payload blindly, and fulfills with 200 without checking URL path or HTTP method.
- Recommendation: Enforce exact route regex `^https:\/\/api\.web3forms\.com\/submit$` and assert `request.method() === 'POST'`.

### 3. Overly Permissive Diagnostic Masking
- Trigger: An uncaught exception or console error in `nowebgl.spec.ts` containing the substring "context" (such as React Context errors).
- Symptom: Real runtime bugs on the fallback page are silently ignored.
- Evidence: [apps/web-e2e/src/nowebgl.spec.ts:10, 21](file:///D:/projects/qa3elhamor/apps/web-e2e/src/nowebgl.spec.ts#L10).
- Current handling: `diagnostics.allow(/WebGL|GPU|context/i)`.
- Recommendation: Restrict allowlist to WebGL context creation patterns: `/Failed to create WebGL|WebGL(2)? (creation|context)|GPU.*disabled/i`.

---

## Blocking issues

*None.* The workspace builds, lints, typechecks cleanly, and does not exhibit security vulnerabilities or destructive side effects.

---

## Serious issues

### Issue 1: Missing Locale Pinning Causes Suite Breakdown on Non-English Runners
- File: [apps/web-e2e/playwright.config.ts:61-68](file:///D:/projects/qa3elhamor/apps/web-e2e/playwright.config.ts#L61-L68) and [apps/web-e2e/src/support/site.ts:8](file:///D:/projects/qa3elhamor/apps/web-e2e/src/support/site.ts#L8)
- Scenario: The application's newly integrated i18n subsystem resolves document locale using `navigator.languages` when `?lang` is absent from the URL. Neither `playwright.config.ts` nor `DIVE_URL` pins the locale to `en` or `en-US`.
- Impact: If a developer or CI runner environment defaults to Arabic or another language, the entire test suite fails due to mismatching Arabic UI labels.
- Fix:
  In `apps/web-e2e/playwright.config.ts`, add `locale: 'en-US'` inside the root `use:` configuration object:
  ```ts
  use: {
    baseURL: wiredUrl,
    locale: 'en-US',
    trace: 'retain-on-failure',
    // ...
  }
  ```

### Issue 2: Contact Provider Interception Does Not Verify Path or HTTP Method
- File: [apps/web-e2e/src/support/contact.ts:4, 28-33](file:///D:/projects/qa3elhamor/apps/web-e2e/src/support/contact.ts#L4) and [apps/web-e2e/src/bureau.spec.ts:47-54](file:///D:/projects/qa3elhamor/apps/web-e2e/src/bureau.spec.ts#L47-L54)
- Scenario: `PROVIDER_URL` is defined as `/^https:\/\/api\.web3forms\.com\//`, intercepting all URLs under the origin and ignoring the request method.
- Impact: Regressions such as incorrect endpoint path (e.g. omitting `/submit`) or changing the HTTP verb (e.g. `GET`) will still be answered with mock 200 OK responses, masking critical production submission failures.
- Fix:
  1. Update `PROVIDER_URL` to match the exact endpoint:
     ```ts
     export const PROVIDER_URL = /^https:\/\/api\.web3forms\.com\/submit$/;
     ```
  2. In `mockProvider`, record `method: request.method()` and verify `request.method() === 'POST'`.
  3. In `bureau.spec.ts`, assert:
     ```ts
     expect(calls[0]?.url).toBe('https://api.web3forms.com/submit');
     expect(calls[0]?.method).toBe('POST');
     ```

---

## Moderate and minor issues

### Issue 3 (Moderate): Arbitrary Fixed Sleeps Instead of State-Based Synchronization
- File: [apps/web-e2e/src/smoke.spec.ts:30](file:///D:/projects/qa3elhamor/apps/web-e2e/src/smoke.spec.ts#L30) (`await page.waitForTimeout(5_000);`) and [apps/web-e2e/src/wall.spec.ts:16](file:///D:/projects/qa3elhamor/apps/web-e2e/src/wall.spec.ts#L16) (`await page.waitForTimeout(3_000);`)
- Scenario: Fixed sleeps are used to wait for scene models/decoders before checking CSP violations, and to wait for potential API calls.
- Impact: Causes unneeded test latency while remaining vulnerable to flakes on slow CPU software rasterization.
- Fix: Replace with deterministic signals, such as checking canvas readiness or state attribute, and awaiting DOM hydration.

### Issue 4 (Moderate): Overly Broad Error Allowlist in No-WebGL Spec
- File: [apps/web-e2e/src/nowebgl.spec.ts:10, 21](file:///D:/projects/qa3elhamor/apps/web-e2e/src/nowebgl.spec.ts#L10)
- Scenario: `diagnostics.allow(/WebGL|GPU|context/i)` matches any error string containing `context`.
- Impact: Unintentionally suppresses unexpected framework or script errors during no-WebGL test execution.
- Fix: Narrow pattern to `/WebGL|GPU|Could not create a WebGL/i`.

### Issue 5 (Minor): Missing Unrolled Scroll Coverage in Pending Bureau Spec
- File: [apps/web-e2e/src/bureau-pending.spec.ts:7-24](file:///D:/projects/qa3elhamor/apps/web-e2e/src/bureau-pending.spec.ts#L7-L24)
- Scenario: The bare build is only verified in reduced-motion modal dialog mode.
- Impact: The in-world 3D unrolled parchment display for an unconfigured provider is left unverified.
- Fix: Add a test case verifying the in-world unrolled scroll state displays the pending message.

### Issue 6 (Minor): Tight Path Couplings in Content Reader
- File: [apps/web-e2e/src/support/content.ts:5-6](file:///D:/projects/qa3elhamor/apps/web-e2e/src/support/content.ts#L5-L6)
- Scenario: `readFileSync(resolve(import.meta.dirname, '../../../../content', name))` relies on deep relative navigation to escape module boundaries.
- Impact: Fragile if directory hierarchy shifts.
- Fix: Resolve relative to workspace root or validate existence.

---

## Data flow

1. **Test Invocation (`nx run web-e2e:e2e`)** -> [OK]
2. **Playwright Config Initialization** -> [GAP: Missing `locale: 'en-US'` in `use:` block]
3. **Local Web Server Startup (`scripts/serve.mjs`)** -> [OK: Spawns isolated `wired` (4510) and `bare` (4511) Vite preview instances without port 4400 conflicts]
4. **Navigation (`dive()` / `page.goto()`)** -> [OK: Applies SwiftShader WebGL flags and custom timeouts]
5. **Interactive Flow (Narration skip, 3D object traversal, full view)** -> [OK: Accessible selectors and `toPass` retry assertions]
6. **Form Submission & Mock Interception** -> [GAP: Route matches wildcard `api.web3forms.com` without endpoint or method check]
7. **Diagnostic Verification (`fixtures.ts`)** -> [OK: Automatic teardown check for CSP violations and uncaught console errors]

---

## Requirements fulfilment

| Requirement | Status | Gap |
| ----------- | ------ | --- |
| Playwright coverage of critical paths (dive, landmarks, overlays) | COMPLETE | Fully covered with thorough keyboard & focus assertions. |
| Private complaint submission (happy & 500 error paths) | COMPLETE | Covered in world and dialog; retains visitor text on 500. |
| Bureau pending / unconfigured build | COMPLETE | Verified in dialog mode; in-world scroll state omitted. |
| Complaints wall absent by default | COMPLETE | Verified: no DOM region, no heading, zero `/api/` network requests. |
| Canvas screenshot visual comparison | COMPLETE | Implemented with settle stabilization, platform-specific snapshots, and safe skips. |
| Runs green against `vite preview` | COMPLETE | Dual-server build and preview script works cleanly. |
| Flake resistance & timeouts | PARTIAL | Timeouts and retries well-tuned; contains 2 fixed sleeps (`waitForTimeout`). |
| Strict CSP validation | COMPLETE | Strictly validates `<meta>` header and browser violation events. |
| CI Workflow safety | COMPLETE | Safe permissions (`contents: read` default; `write` only on explicit dispatch). |
| ESLint / Nx boundary compliance | COMPLETE | Validated with `npx nx run-many -t lint,typecheck -p web-e2e --skipSync`. |

---

## Edge cases

| Case | Handled | How | Concern |
| ---- | ------- | --- | ------- |
| Non-English browser environment | NO | Relies on default context | Will fail English UI assertions when `navigator.languages` defaults to Arabic. |
| Missing WebGL support in browser | YES | `nowebgl.spec.ts` verifies immediate page fallback | Allowlist regex for context error is too broad. |
| Slow SwiftShader rendering on CI | YES | 240s-300s timeouts and `toPass` intervals | Two fixed sleeps in smoke/wall specs. |
| Linux CI runner missing visual baselines | YES | `hasBaselines()` skips visual tests on platform mismatch | None. Documented and explicit. |
| Accidental commit from PR | YES | `commit_snapshots` restricted to manual `workflow_dispatch` | None. |

---

## Verdict

- Recommendation: REVISE
- Confidence: HIGH
- Top risk: Unpinned locale causes test suite to fail under non-English operating systems or CI containers following i18n integration.
- What a robust implementation would add:
  1. Pin `locale: 'en-US'` in `playwright.config.ts` `use:`.
  2. Restrict `PROVIDER_URL` to `https://api.web3forms.com/submit` and assert HTTP `POST` method in `mockProvider`.
  3. Replace `waitForTimeout` calls with deterministic DOM/state assertions.
  4. Narrow `nowebgl.spec.ts` diagnostic allowlist pattern.
