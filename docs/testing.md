# Testing

Two layers.

| Layer | Where | Runs with | Proves |
| --- | --- | --- | --- |
| Unit and component | `*.spec.ts(x)` beside the code, jsdom | `npx nx run-many -t test` | Logic, copy, layouts, DOM contracts |
| End to end and visual | `apps/web-e2e` (Playwright, real Chromium) | `npx nx run web-e2e:e2e` | The built site works in a browser, and the 3D canvas still looks right |

This page is about the second. Canvas rendering is invisible to DOM assertions, so a broken material or a
missing model would ship silently without the screenshot specs.

## What is covered

| Spec | What it checks | Projects |
| --- | --- | --- |
| `smoke` | Dive loads, canvas, landmark nav, no console errors, strict CSP with no violations | desktop, mobile |
| `dive` | Dive to each landmark: narrator, advance/skip, the 3D objects, keyboard selection, full view, Esc, focus returns | desktop (all four), mobile (Pineapple) |
| `bureau` | File a complaint in the world and as a dialog: validation, delivered, failed (500 keeps the text, retry works) | desktop (both), mobile (dialog) |
| `bureau-pending` | Build with no provider: the honest "post office not open" message, nothing is sent | pending |
| `reduced-motion` | Every landmark opens as a dialog; Esc returns focus | desktop |
| `fallback` | `?view=page`, the skip links, dive to page and back | desktop, mobile |
| `nowebgl` | Chromium with WebGL disabled: the page view is what loads | nowebgl |
| `wall` | The complaints wall is absent by default and the site never calls the wall API | desktop |
| `visual` | `toHaveScreenshot` of the canvas at the dive start and the Pineapple stop, high and low tier | visual |

Specs select by role and accessible name (English copy). Console errors, uncaught page errors and CSP
violations fail every test automatically (`src/support/fixtures.ts`); a test that provokes one on purpose says
so with `diagnostics.allow(...)`.

## Run locally

```bash
npx playwright install chromium         # once
npx nx run web-e2e:e2e                  # everything
npx nx run web-e2e:e2e -- --project=desktop dive.spec.ts
npx nx run web-e2e:e2e -- --project=mobile --grep Pineapple
cd apps/web-e2e && npx playwright show-report   # the HTML report of the last run
```

The run builds the site itself, twice (contact provider wired with a fake key, and not wired; ~10 s each, see
`apps/web-e2e/scripts/serve.mjs`) and serves the builds with `vite preview` on ports 4510 and 4511 (not 4400,
the owner's; `E2E_PORT` moves both). `E2E_SKIP_BUILD=1` reuses the previous builds. The contact provider is
always intercepted by the tests: nothing is sent anywhere.

WebGL in headless Chromium comes from SwiftShader (`--use-angle=swiftshader --enable-unsafe-swiftshader`),
a software rasteriser: slow (a few frames a second), so flights and the narrator take tens of seconds and
timeouts are generous. `E2E_WORKERS` (default 2) sets parallelism.

## Point it at a deployed URL

```bash
E2E_BASE_URL=https://abdallah-khalil.github.io/ npx nx run web-e2e:e2e
```

No build and no servers are started, and the `pending` project is dropped (only the deployment's own build
exists). The `bureau` spec assumes a configured provider, so it is skipped unless you also set
`E2E_CONTACT_WIRED=1` (the provider request is still intercepted, never sent). In CI, run the **E2E**
workflow by hand with the `base_url` input. There is no preview host yet; until there is, every pull request
runs against `vite preview` of its own build.

## Visual regression

Baselines live in `apps/web-e2e/snapshots/<shot>-<project>-<platform>.png`. Pixels differ between a Windows
and a Linux rasteriser, so a platform only compares against baselines it generated: a Windows developer
cannot update the CI baselines, and CI cannot read yours.

- A platform with **no** baselines skips the visual tests (with the reason shown) instead of failing.
  `E2E_REQUIRE_BASELINES=1` makes it fail.
- Compare: `npx nx run web-e2e:e2e -- --project=visual`.
- Create or refresh local baselines: `npx nx run web-e2e:e2e-update-snapshots`.
- **Linux (CI) baselines**: run the **E2E** workflow by hand (Actions tab, Run workflow) with
  `update_snapshots` ticked. It uploads the PNGs as the `web-e2e-snapshots` artifact; tick
  `commit_snapshots` as well to have it commit them to the branch. Review the images, as they are the new
  truth. Redo this whenever the scene intentionally changes (a model, a material, the camera stops).
  Until the first Linux baselines are committed, CI skips the visual tests and runs the rest.

How the shots are made stable: reduced motion freezes the ocean (waves, caustics) and slows ambient life,
`?quality=high|low` pins the tier, the camera is set from the page scroll and the shot waits for the depth
readout to stop changing, and only the stage is captured (page chrome is hidden with element styles). `maxDiffPixelRatio: 0.02` absorbs software-rasteriser noise (and the last few
slow fish); a missing texture or a broken shader moves far more. If a legitimate change trips it, look at the
diff in the report before refreshing the baseline.

## Flake handling

- Selectors are roles and accessible names, never layout positions.
- Waits are on states (bubble placed, objects visible, `data-state` of the scroll), never fixed sleeps,
  except the visual specs' settle time.
- CI retries a failed test once and keeps the trace (`retain-on-failure`): open it with
  `npx playwright show-trace <trace.zip>`.
- Tests tagged `@desktop-only` (the long camera flights) are skipped on the mobile project to keep the run short.
- The global test timeout is 5 minutes; a full local run takes about 13 minutes with 2 workers.

## Slow runners

CI runners have two cores and software GL, so a camera flight is several times slower than on a laptop.
The in-world specs are written for that: controls inside the narrator's bubble and the landmark buttons
pulse and move every frame, so Playwright's "stable" actionability check never settles; they are
activated from the keyboard (`press()` and `openLandmark()` in `src/support/site.ts`), the canvas is
awaited (`canvasReady`, it mounts lazily) and `test.slow()` triples the timeout when `CI` is set.
To reproduce a slow runner locally: `E2E_CPU_THROTTLE=4 CI=1 npx nx run web-e2e:e2e -- --project=desktop`
(Chrome DevTools CPU throttling, 4x).

## Nightly in-world job

The full in-world landmark visits (`dive.spec.ts`: fly in, meet the narrator, objects, full view, leave)
are nightly too: animation time is clamped per frame, so at the ~1 fps of a software-GL runner the
narrator's swim-in alone can exceed the push/PR budget. Push/PR CI keeps the deterministic set (smoke,
dialog visits, in-world Bureau filing, page view, no-WebGL, Arabic, wall).
Objects flying out of a landmark (and the keyboard selection that needs their labels to be visible) are
driven by animation frames. On a CI runner with software GL they can take minutes, so those steps are
tests tagged `@nightly` (`dive.spec.ts`, "objects fly out and can be picked by keyboard"). They are skipped
by default and run by the `e2e-inworld` job in `e2e.yml` (nightly at 03:17 UTC and on manual dispatch), or
locally with `E2E_NIGHTLY=1 npx nx run web-e2e:e2e -- --project=desktop --grep @nightly`. The push/PR run
still checks, for every landmark, that the narrator speaks, the objects exist (counted through the kit's
accessible list, which is rendered from data, not frames), the full view opens and Esc and leaving return focus.

## CI

`.github/workflows/e2e.yml` runs on pushes to `main` and on pull requests: `npm ci`,
`npx playwright install --with-deps chromium`, `npx nx run web-e2e:e2e`, and uploads the HTML report and
traces as the `playwright-report` artifact (also on failure).
