# Code Logic Review — `lazy-shell`

## Summary

| Metric              | Value      |
| ------------------- | ---------- |
| Overall score       | 9/10       |
| Assessment          | APPROVED   |
| Blocking issues     | 0          |
| Serious issues      | 0          |
| Moderate issues     | 2          |
| Minor issues        | 2          |
| Failure modes found | 3          |

---

## Five logic questions

### 1. How does this fail silently?
- **Omission of `dive-shell` from `FIRST_VIEW_FORBIDDEN_CHUNK`** ([`tools/perf-budget/budgets.ts:34`](file:///D:/projects/qa3elhamor/tools/perf-budget/budgets.ts#L34)): `FIRST_VIEW_FORBIDDEN_CHUNK` checks `/(?:^|\/)vendor-(?:three|r3f|drei)-[^/]*\.js$/`. If `dive-shell.tsx` is directly imported in `app.tsx` or `main.tsx` during an architectural regression, the "3D up front" gate does not report `dive-shell` itself as a forbidden chunk; it only catches the downstream `vendor-three/r3f/drei` chunks transitively pulled by `dive-shell`. If a mocked or stripped 3D shell were imported that did not pull those specific three vendor chunk names, the "3D up front" assertion would report `none`.
- **Query strings on dynamic imports break lazy chunk discovery** ([`tools/perf-budget/dist-graph.ts:15`](file:///D:/projects/qa3elhamor/tools/perf-budget/dist-graph.ts#L15)): `DYNAMIC_IMPORT` regex `\bimport\s*\(\s*["'`]([^"'`]+\.js)["'`]\s*\)` requires `.js` immediately before the closing quote or backtick. While `toDistPath` ([`dist-graph.ts:37`](file:///D:/projects/qa3elhamor/tools/perf-budget/dist-graph.ts#L37)) explicitly strips `[?#]`, any dynamic import bearing a query string (e.g. `import('./chunk.js?v=1')`) is silently ignored by `DYNAMIC_IMPORT`, failing to register in `lazyJs`.

### 2. What user action produces unexpected behaviour?
- **Browser Back button after a dive failure is an intentional no-op** ([`apps/web/src/app/page-view/presentation.ts:94`](file:///D:/projects/qa3elhamor/apps/web/src/app/page-view/presentation.ts#L94)): When a dive fails (either chunk download error or WebGL context creation failure), the user is transitioned to `PageView` with `reason: 'dive-failed'`. In `usePresentation`, `if (before.kind === 'page' && before.reason === 'dive-failed') return;` permanently locks `popstate` from remounting the dive in that session to prevent crash loops. If the user presses the browser Back button expecting to retry the dive, nothing happens. The user must activate "Try the dive again" (which performs a hard document reload via `<a href>`).
- **Initial keyboard Tab navigation order shifts when the 3D chunk mounts** ([`apps/web/src/app/app.tsx:66-75`](file:///D:/projects/qa3elhamor/apps/web/src/app/app.tsx#L66-L75)): While the dive is preloading, only `SceneNote` (`<ReadAsPageLink>`) and `LanguageToggle` exist in the DOM. Once `DiveShell` resolves and mounts, `<SiteCredits>` and `<LandmarkNav>` enter the DOM. A keyboard user who has navigated past the language switch into browser chrome may encounter newly inserted focusable targets upon returning focus to the page.

### 3. What input data produces a wrong answer?
- **Case-sensitive `?view=page` query parsing** ([`apps/web/src/app/page-view/presentation.ts:44`](file:///D:/projects/qa3elhamor/apps/web/src/app/page-view/presentation.ts#L44)): `new URLSearchParams(search).get(VIEW_PARAM) === PAGE_VIEW_VALUE` strictly checks `'page'`. If a user enters or follows a link with `?view=Page` or `?VIEW=page`, `choosePresentation` evaluates to `{ kind: 'dive' }` and `preloadDiveForFirstView()` initiates the 3D chunk download instead of honoring the page view request.

### 4. What happens when a dependency fails?
- **Dive chunk load failure (offline, HTTP 404, deploy file hash replacement)**: Handled cleanly. `preloadDiveForFirstView()` catches and swallows the initial prefetch rejection ([`dive-shell-loader.tsx:33`](file:///D:/projects/qa3elhamor/apps/web/src/app/dive-shell-loader.tsx#L33)). When `LazyDiveShell` renders inside `<Suspense>`, `DiveLoadBoundary` ([`dive-shell-loader.tsx:46-68`](file:///D:/projects/qa3elhamor/apps/web/src/app/dive-shell-loader.tsx#L46-L68)) catches the error via `componentDidCatch`, logs `The dive could not be loaded:`, and triggers `onFailure()`. This invokes `view.diveFailed`, switching presentation state to `{ kind: 'page', reason: 'dive-failed' }` and seamlessly rendering `PageView`.
- **Canvas / WebGL context failure at runtime**: Handled by `DiveFailureBoundary` and `useCanvasGuard` inside [`apps/web/src/app/dive-shell.tsx:120,141`](file:///D:/projects/qa3elhamor/apps/web/src/app/dive-shell.tsx#L120-L141). If the GPU rejects the context, throws during scene construction, or loses context permanently, `onDiveFailure` invokes `view.diveFailed` to drop back to `PageView`.

### 5. What is missing that the requirements never mentioned?
- **Rejected `pending` promise memoization in `dive-shell-loader.tsx`** ([`dive-shell-loader.tsx:20-21`](file:///D:/projects/qa3elhamor/apps/web/src/app/dive-shell-loader.tsx#L20-L21)): `pending ??= import('./dive-shell')` retains the rejected promise on error. In the current implementation, "Try the dive again" performs a full page reload (`<a href={href}>` without `preventDefault`), creating a fresh JS module scope so retry works. However, any future in-memory retry mechanism would remain permanently rejected unless `pending` is cleared on rejection.
- **Vitest `vi.mock` creates duplicate Three.js instances under jsdom**: In unit tests, `app.spec.tsx` and `app-fallback.spec.tsx` emit `THREE.WARNING: Multiple instances of Three.js being imported` because Vitest transforms mocked imports across CJS/ESM boundaries. In production builds (`apps/web/dist`), the `codeSplitting` configuration ensures strictly one instance of `vendor-three`.

---

## Failure modes

### 1. Stale rejected promise cache on dynamic chunk failure
- **Trigger**: Network disruption or server 500 when `import('./dive-shell')` is executed.
- **Symptom**: `pending` in `dive-shell-loader.tsx` permanently stores the rejected Promise.
- **Evidence**: [`apps/web/src/app/dive-shell-loader.tsx:20-21`](file:///D:/projects/qa3elhamor/apps/web/src/app/dive-shell-loader.tsx#L20-L21) (`export const loadDiveShell = (): Promise<typeof import('./dive-shell')> => (pending ??= import('./dive-shell'));`).
- **Current handling**: `DiveLoadBoundary` catches the rejection and navigates the user to `PageView`. In `PageView`, `retryDive` is rendered as an unintercepted `<a href={href}>` link ([`page-view.tsx:71-73`](file:///D:/projects/qa3elhamor/apps/web/src/app/page-view/page-view.tsx#L71-L73)), forcing a full page reload which resets the module scope and clears `pending`.
- **Recommendation**: Attach a rejection cleanup handler to reset `pending` on error: `pending.catch(() => { pending = undefined; })`.

### 2. Forbidden 3D chunk check bypass for non-vendor 3D chunks
- **Trigger**: Developer creates an app chunk (e.g. `dive-shell`) or adds a vendor group not prefixed with `vendor-(three|r3f|drei)`.
- **Symptom**: If statically imported into `index.html` or `moderation.html`, the chunk passes the `FIRST_VIEW_FORBIDDEN_CHUNK` test.
- **Evidence**: [`tools/perf-budget/budgets.ts:34`](file:///D:/projects/qa3elhamor/tools/perf-budget/budgets.ts#L34) (`export const FIRST_VIEW_FORBIDDEN_CHUNK = /(?:^|\/)vendor-(?:three|r3f|drei)-[^/]*\.js$/;`).
- **Current handling**: Trapped only indirectly by `initialJsGzipBytes` budget (105 KiB) or transitive imports into `vendor-three`.
- **Recommendation**: Broaden regex to include `dive-shell` and general 3D module naming: `/(?:^|\/)(?:vendor-(?:three|r3f|drei)|dive-shell)-[^/]*\.js$/`.

### 3. Dynamic import parser ignores URLs with query or fragment strings
- **Trigger**: A dynamic import specifier includes cache-busting queries or asset hashes (e.g. `import("./dive-shell.js?v=2")`).
- **Symptom**: `DYNAMIC_IMPORT` regex fails to match; the chunk is omitted from `lazyJs` count and its subtree is not traversed.
- **Evidence**: [`tools/perf-budget/dist-graph.ts:15`](file:///D:/projects/qa3elhamor/tools/perf-budget/dist-graph.ts#L15) (`const DYNAMIC_IMPORT = /\bimport\s*\(\s*["'`]([^"'`]+\.js)["'`]\s*\)/g;`).
- **Current handling**: Works only for bare `.js` paths without query parameters.
- **Recommendation**: Update regex to allow optional query/hash before the closing quote: `/\bimport\s*\(\s*["'`]([^"'`]+\.js)(?:[?#][^"'`]*)?["'`]\s*\)/g`.

---

## Blocking issues

*None found.*

---

## Serious issues

*None found.*

---

## Moderate and minor issues

### 1. `FIRST_VIEW_FORBIDDEN_CHUNK` does not explicitly match `dive-shell` (Moderate)
- **File**: [`tools/perf-budget/budgets.ts:34`](file:///D:/projects/qa3elhamor/tools/perf-budget/budgets.ts#L34)
- **Scenario**: An accidental static import of `dive-shell` in `main.tsx` would only fail `FIRST_VIEW_FORBIDDEN_CHUNK` through its downstream vendor imports, or through the total size budget, rather than directly asserting that `dive-shell` itself cannot be in `initial.js`.
- **Fix**: Update `FIRST_VIEW_FORBIDDEN_CHUNK` to:
  ```ts
  export const FIRST_VIEW_FORBIDDEN_CHUNK = /(?:^|\/)(?:vendor-(?:three|r3f|drei)|dive-shell)-[^/]*\.js$/;
  ```

### 2. Unhandled cache cleanup on rejected `loadDiveShell()` promise (Moderate)
- **File**: [`apps/web/src/app/dive-shell-loader.tsx:20-21`](file:///D:/projects/qa3elhamor/apps/web/src/app/dive-shell-loader.tsx#L20-L21)
- **Scenario**: If `import('./dive-shell')` fails due to network glitch, `pending` retains the rejected promise. While current retry uses full document reload, any client-side retry in future will remain rejected.
- **Fix**: Reset `pending` to `undefined` when the promise rejects:
  ```ts
  export const loadDiveShell = (): Promise<typeof import('./dive-shell')> =>
    (pending ??= import('./dive-shell').catch((err) => {
      pending = undefined;
      throw err;
    }));
  ```

### 3. Dynamic import regex in `dist-graph.ts` requires strict `.js` ending (Minor)
- **File**: [`tools/perf-budget/dist-graph.ts:15`](file:///D:/projects/qa3elhamor/tools/perf-budget/dist-graph.ts#L15)
- **Scenario**: Vite/Rollup chunks loaded with query strings (e.g. for worker scripts or cache invalidation) fail regex matching.
- **Fix**: Allow optional query/hash before quote termination.

### 4. Case-sensitivity in `choosePresentation` query string parsing (Minor)
- **File**: [`apps/web/src/app/page-view/presentation.ts:44`](file:///D:/projects/qa3elhamor/apps/web/src/app/page-view/presentation.ts#L44)
- **Scenario**: Visiting `/?view=PAGE` or `/?view=Page` ignores the page request and boots the 3D dive.
- **Fix**: Normalize query value with `.toLowerCase() === PAGE_VIEW_VALUE`.

---

## Verification of Checklist Items

### 1. `sideEffects: ["**/*.css"]` Correctness
- **Verification**: Audited all 56 source files in `libs/world/feature/src` and 11 files in `libs/world/ui/src`.
- **Result**: Neither library has top-level execution side effects (no `extend()`, no `THREE.ShaderChunk` registration, no top-level `addEventListener`, no global prototype patching). `readDeviceCapabilities()` is strictly on-demand. `caustics-material.ts` dynamically patches materials on `onBeforeCompile` per instance without global shader modifications. The only side effects are CSS imports in `credits-dialog.tsx`, `credits-list.tsx`, and `credits-unavailable.tsx`, which match `"**/*.css"`. Tree-shaking is 100% safe.

### 2. Lazy Loading Architecture & Accessibility
- **Verification**: Traced lifecycle from `main.tsx` through `dive-shell-loader.tsx` to `dive-shell.tsx`.
- **Preload**: `preloadDiveForFirstView()` runs once before `root.render()`.
- **Deduplication**: `loadDiveShell()` memoizes `pending` promise; no duplicate requests.
- **Error Boundary**: `DiveLoadBoundary` wraps `<Suspense>` and transitions to `PageView` on chunk loading errors; `DiveFailureBoundary` handles canvas/WebGL failures.
- **Accessibility & Focus**: `SceneNote` (h1, lead, skip link, meta) and `LanguageToggle` render in the DOM outside `<Suspense>` before the 3D chunk arrives. `<ReadAsPageLink>` is the first Tab stop. `<DiveLoading>` has `aria-hidden="true"` and reduced-motion animation override.

### 3. Code Splitting Configuration
- **Verification**: Examined `apps/web/vite.config.mts` `codeSplitting.groups`.
- **Vendor Separation**:
  - `vendor-react` (priority 50) isolates `react`, `react-dom`, and `scheduler`.
  - `vendor-three` (priority 40) isolates all `three` modules into a single chunk.
  - `vendor-r3f` (priority 30) and `vendor-drei` (priority 20) isolate Three.js bindings.
- **Chunk Integrity**: Production build analysis of `apps/web/dist` confirms exactly one `vendor-three` chunk (`assets/vendor-three-BCApexAk.js`) and one `vendor-react` chunk (`assets/vendor-react-C5T_XRzh.js`). `moderation.html` imports zero 3D chunks and complies with strict CSP Trusted Types.

### 4. Perf Gate Logic
- **Verification**: Audited `tools/perf-budget/dist-graph.ts`, `check.ts`, and `budgets.ts`.
- **Dynamic Imports**: Template literal dynamic imports ``import(`./${file}`)`` are parsed accurately, identifying 8 lazy chunks.
- **3D Up Front Check**: Statically traces entry points for `index.html` and `moderation.html` and asserts zero matches for `FIRST_VIEW_FORBIDDEN_CHUNK`.
- **Budgets**: Initial JS gzip is 95.3 KiB against 105.0 KiB budget; initial CSS is 7.0 KiB against 20.0 KiB budget.

### 5. Architectural Splits & Circular Imports
- **`landmark-definitions.ts` split from `landmarks.config.ts`**: Pure data split for `LANDMARKS`. `page-content.ts` imports definitions without bundling 3D scenes.
- **`scene-credits.tsx` split from `credits.tsx`**: R3F plaque isolated to lazy chunk; DOM credits available to initial view.
- **`plaque-placement.ts` split from `credits-plaque.tsx`**: Plaque coordinates accessible by `dive.config.ts` without bundling plaque meshes.
- **Public Exports & Cycles**: All public symbols preserved; zero circular dependencies detected across Nx projects.

### 6. Command Execution Evidence
- `npx nx run-many -t typecheck -p web world-ui world-feature --skipSync`:
  ```text
  NX Successfully ran target typecheck for 3 projects and 14 tasks they depend on (0 errors)
  ```
- `npx nx run web:build --skipSync && npm run perf:budget`:
  ```text
  dist/index.html                                   1.20 kB │ gzip:   0.60 kB
  dist/moderation.html                              1.68 kB │ gzip:   0.82 kB
  dist/assets/vendor-drei-VFPeEWcS.js              23.21 kB │ gzip:   7.63 kB
  dist/assets/main-BN7QE_s7.js                    111.20 kB │ gzip:  38.08 kB
  dist/assets/vendor-r3f-DVnNl4PF.js              157.87 kB │ gzip:  50.28 kB
  dist/assets/vendor-react-C5T_XRzh.js            189.61 kB │ gzip:  59.61 kB
  dist/assets/dive-shell-JyKeMEys.js              190.35 kB │ gzip:  69.71 kB
  dist/assets/vendor-three-BCApexAk.js            795.00 kB │ gzip: 204.40 kB

  perf-budget: D:\projects\qa3elhamor\apps\web\dist
    initial JS     95.3 KiB gzip of 105.0 KiB  (3 files, 8 lazy)
    initial CSS    7.0 KiB gzip of 20.0 KiB  (1 files)
    3D up front    index.html: none
    3D up front    moderation.html: none
    largest chunk  assets/vendor-three-BCApexAk.js 776.4 KiB of 850.0 KiB
    initial models 1272.3 KiB of 1800.0 KiB  (5 files)
  perf-budget OK
  ```

---

## Data flow

1. **Document Navigation (`index.html`)** [OK]
   - Browser requests `/`. `index.html` loads `main-*.js`, `modulepreload-polyfill-*.js`, `vendor-react-*.js`, and `main-*.css` (total: 95.3 KiB gzip). Zero 3D bytes downloaded.
2. **Pre-render Bootstrap (`main.tsx`)** [OK]
   - `applyDocumentLocale()` syncs document language and direction.
   - `preloadDiveForFirstView()` evaluates `choosePresentation()`. If WebGL is present and `?view=page` is not requested, calls `loadDiveShell()`.
   - Browser begins fetching `dive-shell-*.js` and its vendor dependencies in parallel.
3. **First Paint (`app.tsx`)** [OK]
   - React mounts `<App>`.
   - `Views` renders `<SceneNote>` ("Skip the dive", Arabic title, meta budget) and `<LanguageToggle>`.
   - `<Suspense>` mounts `<DiveLoading aria-hidden="true">` with subtle surface-water gradient.
4. **Resolution of Lazy Dive Shell (`dive-shell-loader.tsx`)** [OK]
   - `LazyDiveShell` resolves `loadDiveShell()`.
   - `<DiveShell>` mounts inside `<QualityProvider>`.
   - `<SiteTelemetry>` and `<QualityMonitor>` initialize.
   - `<DiveScroll>` injects the scroll track.
5. **Fallback Flow on Chunk Error** [OK]
   - If chunk download fails, `DiveLoadBoundary` catches error and triggers `view.diveFailed()`.
   - State switches to `PageView` with reason `'dive-failed'` and displays "Try the dive again" full-page reload link.

---

## Requirements fulfilment

| Requirement | Status | Gap |
| ----------- | ------ | --- |
| Entry chunk holds only locale, presentation decision, page view, scene note, skip link, toggle | COMPLETE | None. All 3D libraries isolated to lazy chunk. |
| Dive chunk preloaded from `main.tsx` when presentation is dive | COMPLETE | Memoized in `loadDiveShell()` and executed before `root.render()`. |
| Page view / no-WebGL / moderation download zero 3D bytes | COMPLETE | Verified by `dist-graph.ts` and headless network audit in notes. |
| Perf budget initial JS <= 105 KiB gzip | COMPLETE | Measured at 95.3 KiB gzip. |
| No 3D chunk in initial page-view / moderation graphs | COMPLETE | Verified by `FIRST_VIEW_FORBIDDEN_CHUNK` checks. |
| `sideEffects: ["**/*.css"]` correctness in world-feature / world-ui | COMPLETE | Verified across all 67 files; no hidden top-level side effects. |
| CodeSplitting config prevents duplicate Three.js instances | COMPLETE | Verified in dist; single `vendor-three` chunk produced. |
| Splits preserve public exports without circular imports | COMPLETE | All exports intact and typecheck passes cleanly. |

---

## Edge cases

| Case | Handled | How | Concern |
| ---- | ------- | --- | ------- |
| No WebGL supported | YES | `hasWebgl()` gates presentation to `page` with `reason: 'no-webgl'`. | None. Zero 3D bytes downloaded. |
| `?view=page` requested | YES | `choosePresentation` selects `page`. Preload skipped. | None. |
| Offline / Network failure during chunk download | YES | `DiveLoadBoundary` catches rejection and drops to `PageView`. | `pending` promise stays rejected until page reload. |
| Reduced motion preference | YES | `DiveLoading` disables light pulse animation; `DiveShell` activates reduced motion pacing. | None. |
| History navigation (Back/Forward) | YES | `popstate` listener syncs view state and scrolls to `(0, 0)`. | Failed dive locked against Back remount. |
| Language toggle before 3D loads | YES | `LocaleProvider` context updates immediately; `DiveShell` reads current locale on mount. | None. |

---

## Verdict

- Recommendation: **APPROVE**
- Confidence: **HIGH**
- Top risk: `FIRST_VIEW_FORBIDDEN_CHUNK` check in `budgets.ts` does not explicitly match `dive-shell`, allowing a renamed or custom 3D chunk to bypass the specific "3D up front" regex if not caught by overall size.
- What a robust implementation would add:
  1. Add `dive-shell` to `FIRST_VIEW_FORBIDDEN_CHUNK` regex in `budgets.ts`.
  2. Clear cached `pending` on dynamic import rejection in `dive-shell-loader.tsx`.
  3. Permit query strings in `dist-graph.ts` `DYNAMIC_IMPORT` regex.
