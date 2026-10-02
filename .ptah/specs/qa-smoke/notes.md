# qa-smoke: Playwright critical paths and visual regression

Code: `apps/web-e2e/` (Nx project `web-e2e`). Docs: `docs/testing.md`. CI: `.github/workflows/e2e.yml`.

## How it runs

- `npx nx run web-e2e:e2e` (extra args pass through: `-- --project=desktop dive.spec.ts`).
  `web-e2e:e2e-update-snapshots` refreshes the visual baselines. `lint` and `typecheck` targets pass
  (`typecheck` is an explicit `tsc --noEmit` target: Nx's inferred one is disabled for a `noEmit` tsconfig).
- `playwright.config.ts` starts two servers via `scripts/serve.mjs` (in-process `vite build` then
  `vite preview`, no child processes): **wired** on 4510 (`VITE_CONTACT_PROVIDER=web3forms` + a fake key)
  and **bare** on 4511 (default build, no provider). Two builds, ~10 s each, because the provider is a
  build-time choice. Ports are `E2E_PORT` (+1); never 4400. `E2E_SKIP_BUILD=1` reuses `.dist/<mode>`.
- `E2E_BASE_URL=https://...` skips both servers and the `pending` project and targets that URL. The
  `bureau` spec then needs `E2E_CONTACT_WIRED=1` (provider is still intercepted).
- Projects: `desktop` (1440x900), `mobile` (390x844, touch, DPR 1; smoke, dive, bureau, fallback only),
  `nowebgl` (`--disable-webgl --disable-3d-apis`), `pending` (bare build), `visual`.

## WebGL headless

Launch args `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist` give a real WebGL2
context in headless Chromium on Windows (verified; the screenshots show the full lit scene). It is the same
combination the ad-hoc `capture.mjs` scripts used and the Lighthouse workflow uses on Linux. Software
rendering is slow, so camera flights take 15-25 s each and the global test timeout is 240 s. Not yet
observed on the ubuntu runner (see risks).

## Coverage matrix

| Charter item | Spec | Notes |
| --- | --- | --- |
| Page loads, no console errors, CSP clean, nav present | `smoke` | An auto fixture fails every test on console error, page error or `securitypolicyviolation`; one benign allowlist entry (favicon 404) |
| Dive to each of the 4 landmarks via `LandmarkNav` | `dive` | Per landmark: region + narrator bubble, advance a line, Skip, N objects (6 skill bubbles; tablets and dish count read from `content/*.json`), arrow-key selection, "Back to the tour", full view, Esc returns focus to the open button, "Back to the dive" returns focus to the nav button. Bureau: opens, offers "File a complaint", Esc returns focus |
| Open each overlay | `dive` (full views), `reduced-motion` (dialogs) | Citizenship Card, Experience record, Services menu, complaint form |
| Private complaint, success | `bureau` (in-world scroll and dialog) | Provider request intercepted; payload asserted (`access_key`, subject, message, name, email); key never on the page |
| Failure path | `bureau` | 500 keeps text, shows the alert; dialog test then retries to success |
| Unconfigured build | `bureau-pending` | "post office has not opened yet", zero provider requests, CSP names no provider |
| Fallback | `fallback`, `nowebgl` | `?view=page` all 7 sections, skip-to-content, dive link to page and back with focus return; no-WebGL project loads the page view with the no-WebGL notice and no dive link |
| Reduced motion | `reduced-motion` | 3 visits + bureau open as dialogs, no narrator or objects, Esc returns focus |
| Wall absent by default | `wall` | No wall region/heading/CTA, no `/api/` request, none in the page view. Wall UI does not exist yet, so no mocked-API wall test (bonus skipped) |
| Visual regression | `visual` | `toHaveScreenshot` of the canvas at dive start and the Pineapple stop (progress 0 and 0.2), tiers high and low |

## Baselines strategy

Baseline path: `apps/web-e2e/snapshots/<shot>-<project>-<platform>.jpg` (`snapshotPathTemplate`). I generated
and committed-ready **win32** baselines (4 PNGs). A platform with no baselines **skips** the visual specs
(reason shown) so CI is green; `E2E_REQUIRE_BASELINES=1` makes that a failure. To produce the Linux
baselines, run the **E2E** workflow by hand with `update_snapshots` (artifact `web-e2e-snapshots`) and
optionally `commit_snapshots` (commits to the branch). From then on CI enforces them automatically. The
owner must do that once, then review the PNGs.

Determinism: reduced motion (ocean frozen, ambient life at 0.25), `?quality=` pinned, camera by page
scroll then waiting for the `depth-value` readout to be stable for 3 s, an 8 s settle for late assets, page
chrome hidden through element styles (an injected stylesheet is blocked by the site's own CSP, correctly),
`animations: 'disabled'`, `maxDiffPixelRatio: 0.02`. Repeat runs against the baseline: 8/8 green.

## Flake handling

Role/name selectors; state waits (`.speech-box` opacity, `aria-expanded`, `data-state`) and `toPass` for the
Next button (which completes a half-typed line before advancing); CI `retries: 1`, trace on failure,
`E2E_WORKERS` default 2 (software GL is CPU bound).

## App hooks requested (not done: apps/web is out of scope)

1. A stable ready signal for a visit, e.g. `data-ready` on `.visit-hud`/`.speech-box` or a test id on the
   speech box. Today the only signal is the inline `opacity: 1` style on `.speech-box`, read with CSS.
2. `data-testid` on the Bureau full-view and Services/Experience full-view articles is not needed
   (role + name works) but the names are content-driven (`Citizenship Card — ...`), so editing that copy
   changes `VISITS[].fullArticle` in `src/support/site.ts`.
3. A DEV/test-only switch that freezes ambient life (fish) would let visual tests drop to
   `maxDiffPixelRatio` ~0.005. Not needed for the current stability.
4. Arabic/RTL: the suite is English-only and does not set `?lang=en` (storage-less fresh contexts default to
   English). If the i18n work starts honouring `navigator.language`, pin `locale: 'en-US'` (already the
   Playwright default).

## Results (local, Windows 11, Chromium + SwiftShader, `npx nx run web-e2e:e2e --skipSync`)

- `npx nx run-many -t lint,typecheck -p web-e2e --skipSync`: pass. `npx nx sync:check`: up to date.
- 37 tests (desktop 20, mobile 9, nowebgl 2, visual 4, pending 2).
- Run 2: 36 passed, 1 failed (in-world empty-form stamp click missed an animating button; fixed by
  submitting from the keyboard, `stamp()` in `src/support/contact.ts`). Run 3: **37 passed, 0 failed**
  (12.9 min). The in-world bureau specs then repeated 2x green; visual specs repeated 2x green against the
  baselines. Earlier runs also exposed (and the suite now handles) the app's intentional
  `console.error("Complaint delivery failed...")`, duplicate "Back to the dive" links on the page view,
  and 60 s `goto` timeouts when the machine was saturated by other agents (now 120 s).
- Runtime: 4 min of that is the four landmark flights; mobile skips the long flights (`@desktop-only`).

## Risks and follow-ups

- **Not yet run on ubuntu CI**: SwiftShader flags are the ones the Lighthouse workflow already uses, but the
  first CI run may need `--use-gl=angle` or `--no-sandbox` tweaks, and the 45 min job timeout assumes the
  runner is not slower than this machine.
- **Linux visual baselines do not exist**; CI skips the 4 visual tests until the owner runs the E2E workflow
  with `update_snapshots` (+ `commit_snapshots`) and reviews the PNGs. The committed win32 baselines only
  serve Windows. Other agents are changing scene code in `apps/web` right now (narrators, bureau, i18n); if
  they alter anything visible in the canvas at the two stops, refresh the baselines.
- `E2E_BASE_URL` against the live site has not been exercised (no deployment yet).
- A wall spec against a mocked API is skipped: the wall UI does not exist.
- Page-view heading names, narrator names and button copy are asserted in English; the Arabic work may
  need `lang` pinning if it starts following the browser language.

## Revision 1 (review: code-review-agy.md)

1. Locale pinned: `locale: 'en-US'` in the config `use`, and `lang=en` in `DIVE_URL`, new `PAGE_URL`, the visual and no-WebGL URLs. New `src/locale.spec.ts` (desktop, reduced motion): `?lang=ar` gives `html lang=ar dir=rtl`, the toggle with the Arabic button pressed, the Pineapple opens as a dialog by its Arabic name, and the toggle switches back to LTR.
2. Provider mock: route covers the whole `api.web3forms.com` host, but only `POST https://api.web3forms.com/submit` is answered; anything else is recorded and refused with 404. `expectProviderCalls(calls, n)` asserts every call is `POST /submit` with `access_key`, `subject`, `message` strings, and the exact count; used in every delivered/failed bureau test.
3. Fixed sleeps in smoke and wall replaced by `waitForLoadState('networkidle')` (the only remaining `waitForTimeout` is the visual settle, documented).
4. No-WebGL allowlist removed entirely: with it off the page logs no errors, so any error now fails the test.
5. Pending build: new in-world unrolled-scroll test (pending message, zero provider requests); dialog tests kept.
6. `content.ts` resolves from one `WORKSPACE_ROOT`/`CONTENT_DIR` constant and throws a clear error if `content/` is missing.

Re-run, twice, desktop+nowebgl+pending projects for smoke, bureau, nowebgl, locale, wall, bureau-pending: 15 passed, 0 failed both times. `nx run-many -t lint,typecheck -p web-e2e --skipSync` passes. The full suite and visual/mobile projects were not re-run (the URL changes there are only `lang=en`).
- Revision 1 follow-up (i18n URL rewrite and new toggle names): `locale.spec.ts` selects the toggle buttons by `/^EN/` and `/^عربي/` and now also asserts the switch rewrites the URL to `lang=en` while keeping `quality=high`. Locale spec passed twice, lint and typecheck pass.

## Revision 2 — CI (run 36972981488: 6 desktop in-world failures on ubuntu)

Diagnosis (from the failed-run log, `--log-failed`): every failure was Playwright's actionability check, not the app. `Skip`, `Next`, the other bubble buttons and the `LandmarkNav` buttons were "visible, enabled" but `element is not stable`: the bubble follows a bobbing narrator and the nav buttons pulse, and at a few fps (software GL, 2 cores) two consecutive frames never agree, so click retried until 30 s (or 2 s inside `toPass`). The `Timeout 90000ms ... predicate` was the `Next` loop failing the same way. Dialog-variant and mobile specs passed because they have no moving targets.

Fixes (apps/web-e2e only):
- `press(locator, timeout)`: wait visible, `focus()`, press Enter; used for every bubble control (Skip, Next, Back to the tour/dive, open full view, File a complaint, wall CTAs) and `openLandmark(page, nav)` for nav buttons (waits up to 120 s for the shell). No pointer clicks on moving things; stamp already used the keyboard.
- `canvasReady(page)` (120 s) replaces `canvas toBeVisible` in smoke, wall, visual, fallback, so nothing assumes the canvas at first paint (lazy 3D shell safe).
- `test.slow()` inside `dive()` when `CI` is set (3x timeout for in-world flows only); 120 s timeouts on the stamped heading/message; job timeout 75 min.
- `E2E_CPU_THROTTLE=N` auto-fixture (CDP `Emulation.setCPUThrottlingRate`) to emulate the runner; documented in docs/testing.md ("Slow runners").
- Also hardened the two in-world clicks in the other agent's new `wall.spec.ts` with `press`.

Verification: at 4x throttle with `CI=1`, retries 0, desktop+pending (dive, bureau, reduced-motion, smoke, pending): before the fix 6 of 7 in-world flows passed/failed intermittently on nav-button clicks; after the fix run 1 had one failure (stamped message timeout 30 s, fixed to 120 s), run 2 18/18, and the in-world bureau pair then passed again. Lint and typecheck pass. Not yet confirmed on the real ubuntu runner; if it still flakes, the documented fallback is to move `@desktop-only` flows to a nightly/dispatch job.

## Revision 3 — ready hook

Run 36984383736 left 3 failures on the `.speech-box` inline-opacity wait (placement is an animation-driven signal). Added, additive and minimal, in the narrated-visit kit:
- `visitStateOf(dialogue)` and the `VisitState` type in `apps/web/src/app/narrators/dialogue.ts`: `arriving` (narrator swimming in), `talking` (text typing, including a hint), `ready` (text complete), `leaving` (farewell). Pure, from the dialogue state only.
- `data-visit-state` on the root of `visit-hud.tsx` (Pineapple, Tiki, Krusty) and `bureau/bureau-hud.tsx` (next to the existing `data-stage`). Unit spec: `visitStateOf` cases in `narrators/dialogue.spec.ts`.
- e2e `bubblePlaced` now waits for `[data-visit-state]` to be `talking|ready` (120 s); no CSS opacity assertions remain in the suite.

Verification: dialogue spec 15/15; `npx nx run-many -t lint,typecheck,test -p web web-e2e --skipSync` passes; Pineapple, Krusty Krab and Bureau dive specs at `E2E_CPU_THROTTLE=4 CI=1`, retries 0: 3/3 passed in two consecutive runs. Not touched: i18n tables, configs, content.
