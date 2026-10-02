# Performance budgets

`npm run perf:budget` reads `apps/web/dist` after `nx run web:build` and fails when a budget is
broken. CI runs it after the build (`.github/workflows/ci.yml`) and so does the deploy workflow.

Budgets live in one file: `tools/perf-budget/budgets.ts`.

| Check | Measured as | Budget source |
| --- | --- | --- |
| Initial JavaScript | gzipped size of the entry chunk plus everything it imports statically (and `modulepreload` links); dynamic imports excluded | `BUDGETS.initialJsGzipBytes` |
| No 3D up front | `index.html` and `moderation.html` statically import no `vendor-three`, `vendor-r3f` or `vendor-drei` chunk | `FIRST_VIEW_FORBIDDEN_CHUNK` |
| Initial CSS | gzipped size of stylesheets linked from `index.html` | `BUDGETS.initialCssGzipBytes` |
| Largest single chunk | raw size of every `.js` file in `dist` | `BUDGETS.maxChunkBytes` |
| Initial-load models | on-disk size of every non-lazy model in `dist` | the asset manifest's `initialLoadBudgetBytes()` (`libs/world/domain`), not duplicated here |
| Model present | every model the manifest lists exists in `dist` | the manifest |
| Audio file size | on-disk size of every audio file in `dist` (`.opus`, `.m4a`, ...) | `BUDGETS.maxAudioFileBytes` (1.6 MiB) |
| No audio up front | `index.html` and `moderation.html` neither reference nor preload audio, and no page's up-front load contains it | `tools/perf-budget/audio-budget.ts` |

Failure output is one line per violation, naming the file, the measured size and the budget.

```bash
npx nx run web:build
npm run perf:budget                          # default: apps/web/dist, base "/"
npx tsx tools/perf-budget/check.ts --dist some/dir --base /repo/
npx vitest run --config tools/perf-budget/vitest.config.mts   # the gate's own specs
```

Audio is never in the initial load: the music downloads only once the visitor turns sound on, and
the sound code itself (`@qa3elhamor/world-audio`) is small enough to ride in the entry chunk, since it
imports no three.js. See `docs/audio.md`.

## Changing a budget

Edit `tools/perf-budget/budgets.ts` in the same commit as the change that needs it, and say why in
the message. Model budgets are changed per asset in the manifest (and `npm run assets:compress`).

## Code splitting

The entry (`apps/web/src/main.tsx`, `app/app.tsx`) holds only what every visitor needs: the
language bootstrap, the dive-or-page decision, the page view and the dive's chrome (scene note
with the skip link, language switch). The 3D dive (`app/dive-shell.tsx`: canvas, world, landmarks,
narrators, dive provider) is a separate chunk behind `React.lazy`, imported by
`app/dive-shell-loader.tsx`:

- `main.tsx` calls `preloadDiveForFirstView()` before the first render, so a visitor who will dive
  starts fetching it at once. Vite's preload helper fetches the chunk's vendor dependencies in
  parallel with it (no waterfall). No `<link rel="modulepreload">` for them goes into
  `index.html`, because the page view would download them too.
- The page view (no WebGL, `?view=page`) never fetches it. "Back to the dive" imports it then.
- A chunk that fails to load hands the visitor to the page view (`DiveLoadBoundary`).

`apps/web/vite.config.mts` splits React, `three`, the R3F family and `drei` into `vendor-*` chunks
(`build.rolldownOptions.output.codeSplitting`). That keeps them cached across deploys and every chunk
under the single-chunk budget. React has its own group, so pages that only need React (the page
view's graph, `moderation.html`) don't import the 3D groups.

Keep three/R3F/drei out of the entry's graph:

- Import page-view files directly, not through the `./page-view` barrel (it re-exports the canvas
  guard, which imports three).
- `world-feature` and `world-ui` declare `"sideEffects": ["**/*.css"]`, so importing one light
  export from the barrel doesn't pull in the whole library.
- Data the page view shares with the dive lives in light modules (`src/site.config.ts`, which
  imports types only, `credits.tsx`, `world-ui`'s `plaque-placement.ts`). The 3D halves live apart
  (`landmarks.config.ts`, `scene-credits.tsx`, `credits-plaque.tsx`).

The gate checks this. `npm run perf:budget` fails when `index.html` or `moderation.html` loads a
`vendor-three|vendor-r3f|vendor-drei` chunk up front (`FIRST_VIEW_FORBIDDEN_CHUNK` in
`budgets.ts`). See `.ptah/specs/lazy-shell/notes.md`.

## Lighthouse

Deferred until the first publish (there is no preview host). `.github/workflows/lighthouse.yml` is
a manual stub: Actions, "Lighthouse (manual)", enter the live URL, and download the report
artefact. It does not run automatically and publishes nothing.
