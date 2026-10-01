# perf-budget notes

## Chunk sizes (raw / gzip), `nx run web:build`

| | Before | After |
| --- | --- | --- |
| Entry `main` | 1,192,909 B (one file, ~1.16 MiB) + `jsx-runtime` 190,928 B | 217,225 B / 79.5 KiB gz |
| `vendor-three` | (inside main) | 794,931 B / 204.4 KiB gz |
| `vendor-r3f` | (inside main) | 169,226 B / 54.1 KiB gz |
| `vendor-drei` | (inside main) | 201,602 B / 63.3 KiB gz |
| Initial JS total | ~1.35 MB raw | 1.38 MB raw, **389.3 KiB gz**, 5 files |

Splitting does not shrink the first view: the entry still imports the 3D shell statically. What it
buys: vendor chunks keep their content hash across app-only deploys (return visits re-download
~217 KB instead of ~1.4 MB), and the Vite 500 kB warning is gone for everything except `vendor-three`
(776 KiB, a single package, cannot be split further without hurting caching).

## Files

- `apps/web/vite.config.mts`: `build.rolldownOptions.output.advancedChunks` (Vite 8 / Rolldown; `manualChunks` is the Rollup API).
- `tools/perf-budget/budgets.ts` (the budgets), `check.ts` (the gate), `dist-graph.ts` (initial-load graph, shared with `tools/deploy/prepare-artefact.ts`).
- Root `package.json`: script `perf:budget`.
- `.github/workflows/ci.yml`: `nx run web:build` (cache hit) + `npm run perf:budget` after the affected build. Also in `deploy-pages.yml`.
- `.github/workflows/lighthouse.yml`: manual stub, deferred until a live URL exists.
- `docs/perf-budget.md`.

No new package.json under `tools/`: a new npm workspace would put `package-lock.json` out of sync and
break `npm ci`. The scripts run through the existing `tsx` and resolve workspace libs from root `node_modules`.

## Gate proof (temp copy of dist, since deleted)

Added a 911 KiB random `fake-big-AAAA.js` preloaded from `index.html`, appended 700 KB to
`environment.glb`, deleted `landmark-tiki.glb`:

```
perf-budget FAILED (4):
  - Initial JavaScript is 1075.8 KiB gzipped, over the 450.0 KiB budget (+625.8 KiB). Largest: assets/fake-big-AAAA.js 686.5 KiB, assets/vendor-three-BIW5dWU3.js 198.1 KiB, assets/main-IT9d9Ugo.js 77.1 KiB. Lazy-load code the first view does not need.
  - Chunk assets/fake-big-AAAA.js is 911.5 KiB, over the 850.0 KiB single-chunk budget. Split it (...) or lazy-load it.
  - Model models/landmark-tiki.glb (initial load) is missing from the build output.
  - Initial-load models total 1937.7 KiB, over the manifest's initialLoadBudgetBytes() of 1800.0 KiB. Re-run "npm run assets:compress" or mark rarely-needed models lazy.
exit=1
```

The real build passes: initial JS 389.3/450 KiB, CSS 7.9/20, largest chunk 776.3/850, models 1272.3/1800.

## Recommended source change (not made; `apps/web/src/**` is off-limits for this batch)

Lazy-load the 3D shell so the page-view fallback and first paint do not wait for three:
in `app.tsx` (or `main.tsx`) replace the static import of the R3F scene with
`const Scene = React.lazy(() => import('./scene'))` behind `<Suspense fallback={<PageView/>}>`.
With the vendor chunks already separate, three/r3f/drei (~320 KiB gz) then leave the initial set and
`initialJsGzipBytes` can drop to ~250 KiB. Do not `modulepreload` them for the fallback path.

## Also changed

`apps/web/index.html`: `<base href="/">` became `<base href="%BASE_URL%">` so `SITE_BASE=/repo/` builds work
(Vite substitutes it; verified `/repo/` and `/` builds).

## Verification

`nx run web:build` OK; `npm run perf:budget` OK. `nx run-many -t lint,typecheck,test -p web`: lint and test pass
(cached); `web:typecheck` fails with 68 errors in `src/app/page-view/page-content.ts` and the specs that
import app config (TS6305 cascade), the other agent's in-progress `apps/web/src` work, none in files I touched.
