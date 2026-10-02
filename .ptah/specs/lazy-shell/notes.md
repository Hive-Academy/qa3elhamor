# Lazy 3D shell: notes

Follow-up to the perf-budget, a11y-fallback and security-hardening outcomes in `.ptah/roadmap.md`.

## Result

| | Before | After |
| --- | --- | --- |
| Initial JS (gzip, `npm run perf:budget`) | 414.6 KiB, 5 files, 0 lazy | **95.7 KiB**, 3 files, 8 lazy |
| `initialJsGzipBytes` ceiling | 450 KiB | **105 KiB** (95.7 + ~10 %) |
| `main-*.js` | 291.8 kB / 105.6 kB gzip | 111.6 kB / 38.3 kB gzip |
| index.html modulepreloads | polyfill, vendor-three, vendor-r3f, vendor-drei | polyfill, vendor-react |
| moderation.html modulepreloads | polyfill, vendor-three, vendor-r3f, vendor-drei (~1 MB unused) | polyfill, vendor-react |
| Initial CSS (gzip) | 10.9 KiB | 7.0 KiB (dive CSS moved to `dive-shell-*.css`) |

The ceiling is ~150 KiB below the old ~250 KiB target. The complaints-wall work landing at the
same time adds to `main`; it fits inside the headroom as measured.

## Chunk graph

Before: `main` statically imported `vendor-three`, `vendor-r3f`, `vendor-drei`. React and the
scheduler had been pulled into `vendor-r3f`/`vendor-drei`, because a group takes the dependencies
of what it matches. `moderation` imported `vendor-r3f` and `vendor-drei` just to get React.

After:

```
index.html → main ─static→ modulepreload-polyfill, vendor-react
                    └dynamic→ dive-shell ─static→ vendor-three, vendor-r3f, vendor-drei, object-selection
                    └dynamic→ wall-client, wall-submitter, notice-board   (complaints-wall agent)
moderation.html → moderation ─static→ modulepreload-polyfill, vendor-react
```

`dive-shell` is 190 kB / 69.8 kB gzip. With three (204 kB gzip), r3f (50 kB) and drei (7.7 kB), a
diver downloads about the same total as before, but the scene note, skip link and language switch
paint first.

## What moved

- `apps/web/src/app/dive-shell.tsx` (new): QualityProvider, DiveProvider, landmarks, Canvas,
  OceanWorld, depth gauge, credits, landmark nav, scroll track, overlays. This is everything that
  imports three/R3F/drei.
- `apps/web/src/app/dive-shell-loader.tsx` (new): `hasWebgl`, the memoised `loadDiveShell()`,
  `preloadDiveForFirstView()` (called by `main.tsx` before `root.render`), `LazyDiveShell`,
  `DiveLoadBoundary` (a chunk that fails to load goes to the page view, reason `dive-failed`) and
  `DiveLoading` (decorative surface-light gradient, `aria-hidden`, still under reduced motion).
- `app.tsx`: locale provider, presentation decision, page view, and the dive's chrome outside
  `<Suspense>`: the scene note (h1 "قاع الهامور", "Skip the dive" link, meta) and the language
  switch. They paint before three arrives and stay mounted when the dive resolves, so focus
  survives. The scene note now precedes the stage in the DOM, so `.scene-note` got `z-index: 1`
  to stay above the canvas. The first Tab stop on the dive is now the skip link.
- The page view's graph no longer reaches three:
  - `landmark-definitions.ts` (new) holds `LANDMARKS` (data). `landmarks.config.ts` keeps the
    scenes, overlays and registry. `page-content.ts` imports the definitions. The
    complaints-wall agent agreed to this one-line edit.
  - `scene-credits.tsx` (new) holds the R3F `SceneCredits`. `credits.tsx` keeps the DOM credits
    and exports `useCredits`.
  - `libs/world/ui/src/lib/plaque-placement.ts` (new) holds the plaque's default position, facing,
    width and yaw. `credits-plaque.tsx` imports them. `dive.config.ts` reads them through the
    barrel without bundling the plaque.
  - `libs/world/feature` and `libs/world/ui` `package.json`: `"sideEffects": ["**/*.css"]`. Their
    only side-effect imports are CSS, so the bundler can drop unused barrel members, e.g.
    `readDeviceCapabilities` without the rest of world-feature.
- `vite.config.mts`: `advancedChunks` became `codeSplitting` (the former is deprecated in
  rolldown 1.2). A `vendor-react` group (react, react-dom, scheduler; priority 50) was added, and
  scheduler was taken out of `vendor-r3f`.
- `tools/perf-budget`:
  - `dist-graph.ts` now sees Vite's template-literal ``import(`./x.js`)``. Before, it reported
    "0 lazy".
  - `check.ts` adds the "3D up front" check for index.html and moderation.html.
  - `budgets.ts` sets `initialJsGzipBytes` to 105 KiB and adds `FIRST_VIEW_FORBIDDEN_CHUNK`.
- Specs: `app.spec.tsx`, `app-fallback.spec.tsx` and `i18n/locale-switch.spec.tsx` preload the
  chunk in `beforeAll` (60 s hook timeout, because the cold three import under jsdom outlasts
  10 s) and use `findBy*` for elements inside the dive. `landmarks.config.spec.ts` and
  `i18n/content-parity.spec.ts` import `LANDMARKS` from `landmark-definitions`.
  `libs/landmarks/README.md` points there too.

## Network proof

Headless Chromium against `npx vite preview --port 4425`. The JS requests listed are every
request ending in `.js`, after `networkidle`.

| Case | JS requests | three/R3F/drei/dive-shell | Console errors |
| --- | --- | --- | --- |
| (a) dive `/?lang=en&quality=high` (swiftshader) | main, modulepreload-polyfill, vendor-react, dive-shell, vendor-three, vendor-r3f, vendor-drei, object-selection | yes (canvas 1) | none |
| (b) `/?lang=en&view=page` | main, modulepreload-polyfill, vendor-react | **none** | none |
| (c) `--disable-webgl --disable-3d-apis`, `/?lang=en` | main, modulepreload-polyfill, vendor-react | **none** | none |
| (d) `?view=page` then "Back to the dive" | (b), then dive-shell, vendor-three, vendor-r3f, vendor-drei, object-selection | loaded on the switch (canvas 1) | none |
| (e) `/moderation.html` | moderation, modulepreload-polyfill, vendor-react | **none** | none (the CSP error is gone) |

On the dive, `dive-shell` and its three vendor chunks are requested together, right after `main`.
`main.tsx` starts the import before React renders, and Vite's `__vitePreload` fetches the
dependencies in parallel, so there is no waterfall.

First paint with the 3D chunks held back (routes never answered): h1 visible, skip link visible,
language group visible, `.dive-loading` present, first Tab stop "Skip the dive: read it as a page".
Screenshot: `first-paint.jpeg`.

## Verification

- `npx nx run-many -t lint,typecheck,test -p web world-ui world-feature --skipSync --skip-nx-cache`
  passed: web 53 files / 670 tests. The one lint warning (`no-script-url`) is in
  `wall/wall-client.spec.ts`, not from this change.
- `npx nx run web:build --skipSync && npm run perf:budget`: OK. Initial JS is 95.7 of 105 KiB,
  3D up front is "none" for both pages.
- `E2E_BASE_URL=http://localhost:4425 npx playwright test -c apps/web-e2e --grep "smoke|fallback|no WebGL" --project desktop --project nowebgl`:
  7/7 passed (smoke ×2 including CSP, fallback ×3, nowebgl ×2). `locale` and `reduced-motion` on
  desktop: 5/5 passed.
