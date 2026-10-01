# Performance budgets

`npm run perf:budget` reads `apps/web/dist` after `nx run web:build` and fails when a budget is
broken. CI runs it after the build (`.github/workflows/ci.yml`) and so does the deploy workflow.

Budgets live in one file: `tools/perf-budget/budgets.ts`.

| Check | Measured as | Budget source |
| --- | --- | --- |
| Initial JavaScript | gzipped size of the entry chunk plus everything it imports statically (and `modulepreload` links); dynamic imports excluded | `BUDGETS.initialJsGzipBytes` |
| Initial CSS | gzipped size of stylesheets linked from `index.html` | `BUDGETS.initialCssGzipBytes` |
| Largest single chunk | raw size of every `.js` file in `dist` | `BUDGETS.maxChunkBytes` |
| Initial-load models | on-disk size of every non-lazy model in `dist` | the asset manifest's `initialLoadBudgetBytes()` (`libs/world/domain`), not duplicated here |
| Model present | every model the manifest lists exists in `dist` | the manifest |

Failure output is one line per violation, naming the file, the measured size and the budget.

```bash
npx nx run web:build
npm run perf:budget                          # default: apps/web/dist, base "/"
npx tsx tools/perf-budget/check.ts --dist some/dir --base /repo/
```

## Changing a budget

Edit `tools/perf-budget/budgets.ts` in the same commit as the change that needs it, and say why in
the message. Model budgets are changed per asset in the manifest (and `npm run assets:compress`).

## Code splitting

`apps/web/vite.config.mts` splits `three`, the R3F family and `drei` into `vendor-*` chunks
(`build.rolldownOptions.output.advancedChunks`). That keeps them cached across deploys and keeps
every chunk under the single-chunk budget. It does **not** shrink the first-view download while the
entry statically imports the 3D shell. The remaining step is source-side: lazy-load the 3D scene
(`React.lazy(() => import(...))`) behind the page-view fallback; when that lands, lower
`initialJsGzipBytes` to about 250 KiB. See `.ptah/specs/perf-budget/notes.md`.

## Lighthouse

Deferred until the first publish (there is no preview host). `.github/workflows/lighthouse.yml` is
a manual stub: Actions, "Lighthouse (manual)", enter the live URL, and download the report
artefact. It does not run automatically and publishes nothing.
