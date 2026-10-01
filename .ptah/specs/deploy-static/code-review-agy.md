# Code Logic Review — deploy-static & perf-budget

## Summary

| Metric              | Value                                |
| ------------------- | ------------------------------------ |
| Overall score       | 8/10                                 |
| Assessment          | APPROVED                             |
| Blocking issues     | 0                                    |
| Serious issues      | 0                                    |
| Moderate issues     | 2                                    |
| Failure modes found | 4                                    |

---

## Scope Reviewed

1. **GitHub Actions Workflows**:
   - [`.github/workflows/deploy-pages.yml`](file:///D:/projects/qa3elhamor/.github/workflows/deploy-pages.yml)
   - [`.github/workflows/ci.yml`](file:///D:/projects/qa3elhamor/.github/workflows/ci.yml)
   - [`.github/workflows/lighthouse.yml`](file:///D:/projects/qa3elhamor/.github/workflows/lighthouse.yml)
2. **Build, Artefact & Deploy Tooling**:
   - [`apps/web/vite.config.mts`](file:///D:/projects/qa3elhamor/apps/web/vite.config.mts)
   - [`apps/web/index.html`](file:///D:/projects/qa3elhamor/apps/web/index.html)
   - [`apps/web/moderation.html`](file:///D:/projects/qa3elhamor/apps/web/moderation.html)
   - [`tools/deploy/prepare-artefact.ts`](file:///D:/projects/qa3elhamor/tools/deploy/prepare-artefact.ts)
   - [`tools/deploy/check-contact-env.ts`](file:///D:/projects/qa3elhamor/tools/deploy/check-contact-env.ts)
   - [`apps/web/src/app/overlays/complaint-scroll/contact-submitters.ts`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/contact-submitters.ts)
3. **Performance Budget Suite**:
   - [`tools/perf-budget/budgets.ts`](file:///D:/projects/qa3elhamor/tools/perf-budget/budgets.ts)
   - [`tools/perf-budget/check.ts`](file:///D:/projects/qa3elhamor/tools/perf-budget/check.ts)
   - [`tools/perf-budget/dist-graph.ts`](file:///D:/projects/qa3elhamor/tools/perf-budget/dist-graph.ts)
4. **Documentation & Workspace Configuration**:
   - [`docs/deploy.md`](file:///D:/projects/qa3elhamor/docs/deploy.md)
   - [`docs/perf-budget.md`](file:///D:/projects/qa3elhamor/docs/perf-budget.md)
   - [`package.json`](file:///D:/projects/qa3elhamor/package.json)
   - [`netlify.toml`](file:///D:/projects/qa3elhamor/netlify.toml)
   - [`.ptah/specs/deploy-static/notes.md`](file:///D:/projects/qa3elhamor/.ptah/specs/deploy-static/notes.md)
   - [`.ptah/specs/perf-budget/notes.md`](file:///D:/projects/qa3elhamor/.ptah/specs/perf-budget/notes.md)

---

## Five Logic Questions

### 1. How does this fail silently?
- [`apps/web/index.html:11`](file:///D:/projects/qa3elhamor/apps/web/index.html#L11): Favicon path is declared as `<link rel="icon" type="image/x-icon" href="/favicon.ico" />`. When building for a GitHub Pages project site (`SITE_BASE=/<repo>/`), `<base href="%BASE_URL%">` is populated as `/<repo>/`. However, standard RFC 3986 URL resolution dictates that root-slashed paths (`/favicon.ico`) bypass `<base href>` and resolve against domain root (`https://<user>.github.io/favicon.ico`). The build and deployment succeed completely without error, but the favicon silently 404s on project site deployments.
- [`tools/perf-budget/dist-graph.ts:68`](file:///D:/projects/qa3elhamor/tools/perf-budget/dist-graph.ts#L68): `targets()` strictly filters for `.endsWith('.js')`. If lazy-loaded components in moderation or the main app load non-JS assets (such as dynamically loaded stylesheets or SVG sprite sheets), they are absent from `main.lazyJs` and `moderation.lazyJs`. In [`tools/deploy/prepare-artefact.ts:45-47`](file:///D:/projects/qa3elhamor/tools/deploy/prepare-artefact.ts#L45-L47), any non-JS asset exclusive to a dynamically imported moderation chunk would not be recognized and would silently remain in the deployed output.

### 2. What user action produces unexpected behaviour?
- Running `npm run deploy:prepare` locally mutates `apps/web/dist` in place by deleting `moderation.html` and `admin/`. If a developer then attempts to preview the site locally using `npx vite preview` (which serves `apps/web/dist`), navigation to `/admin` or `/moderation.html` unexpectedly 404s until `npx nx run web:build` is manually re-run.
- Passing CLI flags without arguments (e.g. `npx tsx tools/perf-budget/check.ts --dist`) causes `option('--dist')` to return `undefined`, resolving `distDir` to the repository root directory instead of `apps/web/dist`, reporting unexpected missing `index.html` errors.

### 3. What input data produces a wrong answer?
- In [`tools/perf-budget/dist-graph.ts:12,14`](file:///D:/projects/qa3elhamor/tools/perf-budget/dist-graph.ts#L12-L14), static and dynamic imports are extracted via regular expressions (`STATIC_IMPORT` and `DYNAMIC_IMPORT`). If third-party vendor code or string constants contain strings matching `import "something.js"` or `import("something.js")`, the regex matches them as target chunks. Because `sourceOf()` directly invokes `readFileSync` without checking `existsSync()`, a false positive string match throws an unhandled `ENOENT` exception instead of an error reporting that a budget violation occurred.
- In [`apps/web/vite.config.mts:11-14`](file:///D:/projects/qa3elhamor/apps/web/vite.config.mts#L11-L14), if `SITE_BASE` is supplied with a protocol or absolute URL (e.g. `https://domain.com/path`), `siteBase()` normalizes it into `"/https://domain.com/path/"`, corrupting generated asset URLs.

### 4. What happens when a dependency fails?
- When external network requests fail or secrets are misconfigured:
  - If `PAGES_DEPLOY_KEY`, `PAGES_REPOSITORY`, or `PAGES_BRANCH` is missing in `deploy-pages.yml`, step 1 (`Check publish prerequisites`) fails fast with `missing=1` and `exit 1` before checking out or spending runner minutes on a build.
  - If `VITE_CONTACT_PROVIDER` is set to `web3forms` or `formspree` with a missing key or malformed ID, `check-contact-env.ts` fails before `web:build` with `exit 1` and explicit remediation advice without printing secrets.
  - In `peaceiris/actions-gh-pages`, if GitHub SSH authentication fails, the concurrency group `deploy-pages` ensures that no subsequent deploy run is cancelled midway or partially published.

### 5. What is missing that the requirements never mentioned?
- `ci.yml` does not execute `npm run deploy:check-contact`. While the check is executed in `deploy-pages.yml`, running it in CI (which defaults to `none` / unset) would ensure regression coverage for the contact verification script on pull requests.
- `deploy-pages.yml` does not operate on an isolated build copy or custom output directory (e.g. `apps/web/dist-pages`), modifying `apps/web/dist` directly.
- Rolldown `advancedChunks` deprecation in Vite 8: Rolldown prints `WARN advancedChunks option is deprecated, please use codeSplitting instead.`, which will require migration to `build.rolldownOptions.output.codeSplitting`.

---

## Detailed Check Analysis

### 1. Workflow Security & Determinism
- **Action Pinning**: [`peaceiris/actions-gh-pages`](file:///D:/projects/qa3elhamor/.github/workflows/deploy-pages.yml#L103) is pinned to immutable commit SHA `84c30a85c19949d7eee79c4ff27748b70285e453` (v4.1.0 release).
- **Permissions**: Minimal `permissions: contents: read` is declared at the root level of `deploy-pages.yml` and `lighthouse.yml`. `ci.yml` specifies `contents: read` and `actions: read`. SSH deploy key authentication handles write access to the external Pages repository, so `GITHUB_TOKEN` needs no elevated write privileges.
- **Secret Hygiene**: `PAGES_DEPLOY_KEY` and `VITE_WEB3FORMS_ACCESS_KEY` are passed via job-level or step-level `env:` and never echoed. Error messages in `deploy-pages.yml` and `check-contact-env.ts` print only configuration status and instructions.
- **Publish Input Gating**: `inputs.publish` defaults to `false`. Both the prerequisite check and the publish action are strictly gated with `if: ${{ inputs.publish }}`. Dry runs execute the complete test, build, budget, and artefact preparation steps without publishing.
- **Fail-Fast Prerequisite Check**: Step `Check publish prerequisites` runs prior to checkout, dependency installation, and build.
- **Fork & PR Safety**: No `pull_request_target` triggers are used. The workflow is `workflow_dispatch` only. Target repository and branch variables (`PAGES_REPOSITORY`, `PAGES_BRANCH`) default to empty string in unconfigured forks, preventing accidental publishing to the upstream repository.
- **Concurrency & Determinism**: `concurrency: group: deploy-pages, cancel-in-progress: false` prevents parallel deploy collisions and avoids aborting in-flight git pushes. `npm ci` is used across all workflows with no unsynchronized package manifests.

### 2. Artefact Preparation & Chunk Pruning
- **Removal Graph Computation**: [`tools/deploy/prepare-artefact.ts:40-49`](file:///D:/projects/qa3elhamor/tools/deploy/prepare-artefact.ts#L40-L49) computes reachability by comparing the traversal closure of `index.html` against `moderation.html`.
- **Rename Robustness**: Reachability is computed dynamically by following module import specifiers rather than matching static file substrings (such as `"moderation"`). Shared chunks (e.g. `vendor-three`, `vendor-r3f`, React runtime) are included in `publicSet` and preserved. Only exclusive files (`moderation-*.js`, `moderation-*.css`, `moderation.html`) and `/admin` are removed.
- **404 & Jekyll Handling**: `index.html` is duplicated to `404.html` for client-side routing fallback, and `.nojekyll` is generated.
- **In-Place Mutation**: `prepare-artefact.ts` operates directly in-place on `distDir` (`apps/web/dist`).

### 3. Contact Guard Single-Sourcing
- **Single Source of Truth**: [`tools/deploy/check-contact-env.ts:11`](file:///D:/projects/qa3elhamor/tools/deploy/check-contact-env.ts#L11) imports [`contactConfigProblems`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/contact-submitters.ts#L236) directly from the application's domain layer.
- **Node & Browser Interoperability**: `contact-submitters.ts` is pure TypeScript; functions rely on runtime argument objects (`ContactEnv`) rather than top-level `import.meta.env` or browser globals (`window`, `document`). Node 22 native `fetch`, `AbortController`, and `DOMException` are supported.
- **Execution in CI**: The guard is verified via `npm run deploy:check-contact`. It runs in `deploy-pages.yml` before `web:build`. It is currently omitted from `ci.yml`.

### 4. Vite Base & URL Resolution
- **Base Normalization**: [`apps/web/vite.config.mts:11-14`](file:///D:/projects/qa3elhamor/apps/web/vite.config.mts#L11-L14) normalizes `process.env['SITE_BASE']` to ensure a leading and trailing slash (`/` or `/<repo>/`).
- **Base Tag in HTML**: [`apps/web/index.html:8`](file:///D:/projects/qa3elhamor/apps/web/index.html#L8) specifies `<base href="%BASE_URL%" />`, allowing Vite to substitute the configured base path at build time.
- **Asset Relative Links**: Favicon in `index.html:11` remains absolute (`/favicon.ico`).

### 5. Performance Budget Gate
- **Initial JS Calculation**: [`tools/perf-budget/dist-graph.ts:58-102`](file:///D:/projects/qa3elhamor/tools/perf-budget/dist-graph.ts#L58-L102) collects all `<script>` entry points and `<link rel="modulepreload">` tags in `index.html`, transitively following static `import` and `export from` statements. Dynamic `import()` targets are relegated to `lazyJs` and excluded from initial JS metrics.
- **Gzip Measurement**: Initial chunks are gzipped individually using `zlib.gzipSync()`, accurately modeling separate HTTP/2 and HTTP/3 transport streams.
- **Model Budget Source**: Derives directly from [`@qa3elhamor/world-domain`](file:///D:/projects/qa3elhamor/libs/world/domain/src/lib/asset-manifest.ts#L198) (`initialLoadBudgetBytes()`), verifying both presence and combined size of non-lazy 3D GLB assets.
- **Exit Codes**: Returns exit code 0 on pass, 1 on budget violation with granular breakdown, and 2 on missing build output prerequisites.
- **CI Ordering**: `ci.yml` runs `perf:budget` immediately following `npx nx run web:build`.

### 6. Vendor Chunk Splitting Correctness
- **Instance Deduplication**: `three` regex `/node_modules[\\/]three[\\/]/` has priority 40. Inspection of built chunks verifies `vendor-drei` imports `three` symbols from `vendor-three-*.js` rather than duplicating the engine.
- **Chunk DAG**: Import inspection demonstrates an acyclic dependency graph:
  - `main.js` -> `vendor-drei`, `vendor-r3f`, `vendor-three`
  - `vendor-drei` -> `vendor-r3f`, `vendor-three`
  - `vendor-r3f` -> `vendor-three`
  - `vendor-three` -> `modulepreload-polyfill`
  No circular imports exist.

### 7. Documentation & Rollback Safety
- **Backup Instructions**: [`docs/deploy.md:38-51`](file:///D:/projects/qa3elhamor/docs/deploy.md#L38-L51) explicitly guides the repository owner through creating and pushing the `legacy-2019` backup branch on `Abdallah-khalil.github.io` before initiating any publish action.
- **Rollback Feasibility**: Because `peaceiris/actions-gh-pages` is configured with `force_orphan: false`, deployment commits are linear git commits on `master`. A rollback can be achieved either by reverting the commit or force-pushing `legacy-2019:master`.

---

## Numbered Defects & Recommendations

### Defect 1 (Moderate) — Favicon does not honor `SITE_BASE` on project deployments
- **File**: [`apps/web/index.html:11`](file:///D:/projects/qa3elhamor/apps/web/index.html#L11)
- **Scenario**: When deploying to a project site with `SITE_BASE=/<repo>/`, `index.html` contains `<base href="/<repo>/" />`, but the favicon link remains `<link rel="icon" type="image/x-icon" href="/favicon.ico" />`.
- **Impact**: Browsers treat leading-slash URLs as absolute from the domain origin, ignoring the `<base>` tag. The favicon fails to load (404) at `https://<user>.github.io/favicon.ico`.
- **Fix**: Update the link tag in `apps/web/index.html` to `<link rel="icon" type="image/x-icon" href="%BASE_URL%favicon.ico" />` or relative `href="favicon.ico"`.

### Defect 2 (Moderate) — `deploy:prepare` mutates local `apps/web/dist` in place
- **File**: [`tools/deploy/prepare-artefact.ts:21-37`](file:///D:/projects/qa3elhamor/tools/deploy/prepare-artefact.ts#L21-L37)
- **Scenario**: Running `npm run deploy:prepare` locally mutates `apps/web/dist` directly, deleting `moderation.html`, moderation chunks, and `admin/`.
- **Impact**: Subsequent local previews (`vite preview`) or inspections of `apps/web/dist` will find moderation and admin tooling missing.
- **Fix**: Have `deploy:prepare` copy `apps/web/dist` to a dedicated staging directory (e.g. `apps/web/dist-pages` or a temporary directory specified via `--dist`) or add a `--copy-to <dir>` option so the source build remains intact.

### Defect 3 (Minor) — Deprecated `advancedChunks` API in Vite 8 / Rolldown
- **File**: [`apps/web/vite.config.mts:54`](file:///D:/projects/qa3elhamor/apps/web/vite.config.mts#L54)
- **Scenario**: Running `nx run web:build` generates: `WARN advancedChunks option is deprecated, please use codeSplitting instead.`
- **Impact**: While functional today, `advancedChunks` will be removed in a future Rolldown release, which will break or degrade chunk splitting upon upgrading dependencies.
- **Fix**: Migrate `advancedChunks` to `build.rolldownOptions.output.codeSplitting` in accordance with Rolldown specifications.

### Defect 4 (Minor) — Unhandled `ENOENT` on regex false positives in `dist-graph.ts`
- **File**: [`tools/perf-budget/dist-graph.ts:64-68`](file:///D:/projects/qa3elhamor/tools/perf-budget/dist-graph.ts#L64-L68)
- **Scenario**: If bundle code contains a string matching the `STATIC_IMPORT` regex pointing to a non-existent file name, `sourceOf(target)` calls `readFileSync` directly.
- **Impact**: Causes `perf:budget` or `deploy:prepare` to crash with an unhandled Node error instead of diagnosing or skipping the non-file token.
- **Fix**: In `targets()`, verify `existsSync(resolve(distDir, target))` before returning the candidate path.

### Defect 5 (Minor) — `deploy:check-contact` is omitted from `ci.yml`
- **File**: [`.github/workflows/ci.yml:48-50`](file:///D:/projects/qa3elhamor/.github/workflows/ci.yml#L48-L50)
- **Scenario**: Pull request CI runs tests and perf budget checks, but does not invoke `npm run deploy:check-contact`.
- **Impact**: A regression breaking `check-contact-env.ts` (e.g. invalid import or syntax error) is only discovered when `deploy-pages.yml` is run.
- **Fix**: Add `- run: npm run deploy:check-contact` to `ci.yml` jobs.

---

## Verdict

- **Recommendation**: APPROVE
- **Confidence**: HIGH
- **Top Risk**: Upstream Rolldown update deprecating `advancedChunks` configuration, and project-site subpath deployments 404ing on root-slashed `/favicon.ico`.
- **What a robust implementation would add**:
  1. `%BASE_URL%favicon.ico` in `apps/web/index.html`.
  2. Isolated staging output for `deploy:prepare` instead of in-place mutation of `apps/web/dist`.
  3. Migration from `advancedChunks` to Rolldown `codeSplitting`.
  4. File existence verification in `dist-graph.ts` chunk parsing.
  5. Addition of `npm run deploy:check-contact` to `ci.yml`.
