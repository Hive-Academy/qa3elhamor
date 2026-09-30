# Code Quality Audit — qa3elhamor

Phase 3. Builds on `01-project-profile.md` (stack, structure) and `02-architecture-assessment.md`
(patterns, coupling). Where this document repeats a Phase 2 finding it re-verified it
independently; where it disagrees or extends, that is stated inline.

Every claim below was produced by running the toolchain against the working tree. All probe
files were deleted; `git status --porcelain` returns the same 21 untracked entries it did at
the start of the session, and `nx run-many -t lint typecheck test build` is green.

**Scope note.** This is 508 lines of first-party TypeScript across 21 files. A quality audit at
this size cannot be about defect density — there are almost no defects. It is about whether the
**guardrails** the project installed will hold when the other 95% of the code arrives. That is
where the findings are: the codebase is clean, and several of its quality gates are configured
but switched off.

---

## Overall Quality Score

### **78 / 100**

| Dimension | Weight | Score | Rationale |
|---|---:|---:|---|
| Type safety (written code) | 15% | 95 | Zero `any`, one unavoidable cast, `strict` on, `import type` used correctly |
| Type safety (compiler config) | 10% | 55 | `noUncheckedIndexedAccess` off with a demonstrated crash path; `lib` clobbered to pre-ES2022; Node globals reachable from browser libraries |
| Lint enforcement | 15% | 50 | Module boundaries verified firing; but no type-aware rules at all, and every a11y/hooks warning is non-blocking |
| Test coverage & quality | 15% | 70 | 20 tests, all meaningful, real invariants asserted — but the licence guard's failure path is untested and the scene is entirely unmeasured |
| Error handling | 10% | 75 | Nothing to swallow yet (no I/O, no async, no catch blocks) — but no error boundary, and the lint rules that would catch async mistakes are absent |
| Security | 10% | 85 | 0 npm vulnerabilities, no secrets, no injection surface; gaps are all deferred-by-design |
| Documentation & intent | 15% | 98 | The best thing in this repository. Every non-obvious decision carries a *why* comment |
| Build & delivery hygiene | 10% | 55 | 1.39 MB unsplit bundle with no budget; formatter configured, unenforced, and already drifted; two unused/undeclared dependencies |

### Key factors that raised the score

- **Zero suppressions of any kind.** No `@ts-ignore`, no `@ts-expect-error`, no
  `eslint-disable`, no `any`, no non-null assertion (`!`). Across 21 files that is unusual and
  is the strongest single signal in the audit.
- **Constraints modelled as executable tests, not prose.** `assetsMissingAttribution` +
  `asset-manifest.spec.ts:31-33` make CC-BY-4.0 compliance a build gate. Budget ceilings are
  asserted (`:17-25`). This is the correct instinct and it is rare.
- **Comment quality is genuinely exceptional.** `apps/api/src/lib/health.ts:3-8`,
  `apps/web/src/app/app.spec.tsx:5-9`, `eslint.config.mjs:21-24` and `:79-85` all explain
  *why* rather than *what*, and each one answers the exact question a reviewer would ask.
- Lint, typecheck, test, and build all pass clean; `nx sync:check` reports the workspace up to
  date; `npm audit` reports **0 vulnerabilities across 1,162 resolved packages**.

### Key factors that lowered the score

- **Type-aware linting is entirely absent.** No `parserOptions.project` or `projectService`
  exists in any of the seven ESLint configs. Verified by probe: a file containing a floating
  promise, an empty `catch`, an unused local, and a missing hook dependency produced **two
  warnings and zero errors**, and `nx run web:lint` reported *"Successfully ran target lint"*.
- **Warnings never fail anything.** `eslint .` runs without `--max-warnings=0`, so every
  `jsx-a11y` and `react-hooks/exhaustive-deps` finding is advisory. The project has an
  `a11y-fallback` roadmap item and an accessibility ruleset that cannot fail a build.
- **`noUncheckedIndexedAccess` is off, and there is a live crash path behind it.** Verified:
  `creditLine(ATTRIBUTIONS['does-not-exist'])` type-checks clean (`tsc` exit 0) and throws
  `TypeError: Cannot read properties of undefined` at runtime.
- **The formatter is configured, unenforced, and already violated.** `prettier --check` fails
  on **11 files**, 9 of them first-party source. There is no `format` target, no npm script,
  and no CI step. `eslint-config-prettier` is installed but imported nowhere — a dead
  dependency.
- **The 1.39 MB bundle is ungated.** Asset bytes are budgeted and tested; JavaScript bytes are
  not measured at all.

**In one line:** the code that exists is close to exemplary; the machinery that is supposed to
keep it that way is about half-armed.

---

## File-Level Findings

### `libs/world/domain/src/lib/asset-manifest.ts` (84 lines)

**Why examined.** The only library with real data, the only one with a non-trivial test suite,
the enforcement point for both licence compliance and payload budget, and the file Phase 2
flagged as contradicting the project's own "forkers edit data, not components" commitment.

| Sev | Finding |
|---|---|
| **High** | `sourceBytes` values are hand-rounded decimals, not measured bytes, and they are all wrong in the same direction. Measured against disk: `bikini-bottom-map` declares 5,242,880 B vs 4,941,480 B actual (**+6.1%**); `pineapple-house` 2,411,725 vs 2,288,282 (**+5.4%**); `spongebob-character` 17,825,792 vs 17,353,516 (**+2.7%**); `patrick-character` 3,460,301 vs 3,392,605 (**+2.0%**). Total declared 28.94 MB vs 27.98 MB actual. The field's own doc comment says *"Size of the raw source in bytes, as committed"* (`:17`) — it is not. `asset-manifest.spec.ts:19` asserts `budgetBytes < sourceBytes` against a number nothing validates. |
| **High** | `sourcePath` and `sourceBytes` measure different things. `sourcePath` names one file (`scene.gltf`, 495,707 B for the map); `sourceBytes` approximates the whole directory including `scene.bin` and 99 textures — a 10× difference for that entry. `asset-compression` will compute a compression ratio against an undefined baseline. |
| **Medium** | The completed `asset-audit` never flowed back. `docs/asset-inventory.md` has precise measured figures (4.71 / 2.18 / 16.55 / 3.24 MiB, total 26.68 MiB) produced by a roadmap item marked done; the manifest still carries the pre-audit estimates. Two sources of truth for the same number, and the accurate one is the non-executable one. |
| **Medium** | The audit document states outright: *"The manifest id `pineapple-house` is currently misleading"* — the model is a rigged **interior** with no pineapple shell, and it recommends demoting it to `minimumTier: 'high'` or dropping it. The manifest still has it at `minimumTier: 'low'`, i.e. loaded on the weakest devices. |
| **Low** | `findAsset` (`:72`) returns `AssetEntry \| undefined` in a library whose sibling `result.ts:1-4` declares *"Domain code returns `Result` rather than throwing"*. Phase 2 finding B1, confirmed — this is the pattern's own canonical call site. |
| **Low** | `AssetEntry.id: string` (`:12`) while `attribution.ts:3` defines `AssetId` for exactly this. Phase 2 finding B2, confirmed. |

**Positive observations.** `totalBudgetBytes` and `assetsMissingAttribution` both take
`assets` as a defaulted parameter (`:76-78`, `:81-83`), which is what makes them testable
without globals. `MB` is factored out (`:28`). The doc comment at `:30-36` explicitly frames the
budgets as *"the number to argue with during that roadmap item, not a prediction"* — a rare and
useful piece of honesty about the confidence level of a constant.

---

### `libs/world/domain/src/lib/asset-manifest.spec.ts` (53 lines)

**Why examined.** It is the workspace's only test of a real invariant, and it is the mechanism
the README advertises (`README.md:107-108`) as the licence safety net.

| Sev | Finding |
|---|---|
| **High** | **The licence guard's failure path has never executed.** `assetsMissingAttribution()` is only asserted on the happy path (`:32`, expecting `[]`), so its `.map()` callback never runs. Verified by probe: adding a single negative-path test moved `world-domain` function coverage from **88.88% (8/9) to 100% (9/9)**. The guard *does* work — the probe correctly returned `['no-credit']` — but nothing proves it. A refactor that made the function unconditionally return `[]` would pass all 20 existing tests while silently disabling the project's stated hardest constraint. This is the highest-value single test in the repository and it is only half-written. |
| **Low** | `creditLine(ATTRIBUTIONS['pineapple-house'])` at `:36` is an unchecked index access into a `Record<string, _>` (see Type Safety). Safe today; the pattern is the one that crashes. |

**Positive observations.** The comment at `:29-30` — *"CC-BY-4.0 requires visible credit… If
this fails, the site cannot ship"* — states the business consequence of a test failure. Most
suites never do this. The budget assertions (`:17-25`) test a *property* over the whole
collection rather than four hardcoded numbers, so they survive adding a fifth asset.

---

### `libs/shared/domain/src/lib/value-object.ts` (17 lines)

**Why examined.** Phase 2 (B3) flagged it as an untested base class about to acquire its first
subclass in `dive-camera`. Confirmed and extended.

| Sev | Finding |
|---|---|
| **High** | `equals` compares via `JSON.stringify(this.props)` (`:15`), which is **key-order sensitive**. `new P({a:1,b:2})` and `new P({b:2,a:1})` are structurally identical and compare **unequal**. It is also wrong for `undefined`-valued keys (dropped by `JSON.stringify`, so `{a:1,b:undefined}` equals `{a:1}`), for `NaN` (serialises to `null`, so `NaN === NaN` returns true here), and for `Date`/`Map`/`Set` props. |
| **High** | **No `value-object.spec.ts` exists.** Zero tests. The roadmap's `dive-camera` item plans a `DivePath` value object over a CatmullRom spline — spline control points are the exact shape (`{x,y,z}` objects, possibly with `NaN` from a degenerate curve) where all three bugs above bite. |
| **Medium** | `Object.freeze(this.props)` (`:9`) is **shallow**. The class advertises immutability; `vo.props.nested.field = 1` succeeds. For a `DivePath` holding an array of points, the array contents remain mutable. |
| **Low** | `if (other === undefined \|\| other === null)` (`:13`) — the `=== null` half is unreachable under the declared signature `other?: ValueObject<TProps>`. Harmless, but it is defensive code for a case `strict` already excludes. |

**Recommended fix.** Replace `JSON.stringify` with a small recursive structural compare, or
sort keys before serialising; add `value-object.spec.ts` covering key order, `undefined`,
`NaN`, and cross-class inequality — **before** `dive-camera` starts.

---

### `libs/shared/util/src/lib/math.ts` (27 lines)

**Why examined.** The most-depended-on-in-theory library, and the one whose functions will run
60×/second inside `useFrame` once `dive-camera` lands.

| Sev | Finding |
|---|---|
| **Medium** | **The zero-width guard in `smoothstep` (`:24`) is untested.** Coverage confirms it: `math.ts` is the only file below 100% statements in the workspace (92.85%), with **50% branch coverage (3/6)** and line 24 explicitly reported uncovered. The structurally identical guard in `remap` (`:17`) *is* tested (`math.spec.ts:21-23`) — the pair was written together and only one got a test. |
| **Low** | `lerp` is documented as unclamped (`:5`) but has no test for `t` outside `[0,1]`; `math.spec.ts:11-14` only covers `t = 0` and `t = 0.5`. The one behaviour the doc comment calls out as surprising is the one not asserted. |
| **Low** | No `NaN` / `Infinity` guards anywhere. `clamp(NaN, 0, 1)` returns `NaN`, which will propagate silently into a camera position and render a black screen rather than throw. Acceptable for a pure math lib; worth a decision when it feeds the render loop. |
| **Info** | Phase 2 finding D2 confirmed: `apps/web` declares `@qa3elhamor/shared-util` as a dependency and has a TS project reference to it, but **zero files under `apps/` import it**. `app.tsx:17` does `(totalBudgetBytes() / (1024 * 1024)).toFixed(1)` inline instead. |

**Positive observations.** Genuinely pure — zero imports, zero branches beyond the two
degenerate-input guards, every function a one-liner. `remap` correctly clamps to
`Math.min/max(outMin, outMax)` (`:19`) rather than assuming `outMin < outMax`, so inverted
output ranges work. That is a real edge case handled deliberately, and it is tested.

---

### `apps/web/src/app/app.tsx` (43 lines)

**Why examined.** The composition root, the only React component, and the file every Stage B
scene item will grow out of.

| Sev | Finding |
|---|---|
| **High** | **Arabic content with no `lang` or `dir`.** `<h1>قاع الهامور</h1>` (`:33`) sits inside a document declaring `lang="en"` (`index.html:2`). Screen readers will pronounce it with an English voice, and the document has no RTL strategy. Confirms Phase 2 G8; raised to High here because this is a **shipped accessibility defect today**, not a future gap, and the `jsx-a11y` ruleset that exists cannot catch it. Fix is one attribute: `<h1 lang="ar" dir="rtl">`. |
| **Medium** | **No `<Suspense>` and no error boundary around `<Canvas>`** (`:21`). Nothing is lazy yet so nothing suspends — but the very next roadmap item (`world-environment`) introduces `useGLTF`, which *throws a promise*. Adding an async loader to this tree without first adding the boundary produces a blank page on any WebGL-context or asset-load failure, with no fallback. |
| **Medium** | **No WebGL capability fallback.** `<Canvas>` mounts unconditionally. A device without WebGL gets an empty page plus the overlay. `a11y-fallback` is scheduled for Phase 8 — that is very late for the property that decides whether the site renders at all. |
| **Low** | Magic numbers throughout: camera `[0, 1.5, 6]` / `fov: 55` (`:21`), fog density `0.06` (`:23`), light intensities `0.6` / `1.2` (`:24-25`), plane `[60, 60]` (`:27`), and `#0a1e3f` duplicated across `:22`, `:23`, and `styles.css:10`. The background colour is now a three-way manual sync between two files. |
| **Low** | `(totalBudgetBytes() / (1024 * 1024)).toFixed(1)` (`:17`) — a byte-formatting helper belongs in `shared-util`, which is already a declared dependency with nothing behind it. Fixing this closes finding D2 as a side effect. |
| **Info** | Both a named export and a default export (`:16`, `:43`). Nx generator default; harmless but it gives every future importer two spellings. |

**Positive observations.** The 12-line header comment (`:4-15`) is a model of its kind — it
states what the file *is not*, names the two roadmap items that will replace it wholesale, and
restates the composition-root rule. Someone opening this file in three months cannot mistake
scaffold for design. A single `<Canvas>` at the root is also the correct R3F structure.

---

### `apps/web/src/app/app.spec.tsx` (24 lines)

**Why examined.** It is the only test touching React, and its mocking strategy determines what
the scene tests can ever assert.

| Sev | Finding |
|---|---|
| **High** | **`vi.mock('@react-three/fiber')` (`:10-12`) replaces the module with a factory containing only `Canvas`.** Every other export — `useFrame`, `useThree`, `useLoader`, `extend` — becomes `undefined`. The moment any component in the tree imports one, this suite fails with an unhelpful "not a function" error rather than a missing-mock error. Since `dive-camera` and `world-environment` are both `useFrame`-based, this breaks at the next roadmap item. Use `vi.importActual` spread with `Canvas` overridden, so unmocked exports keep working. |
| **Medium** | **The 100% coverage figure for `web` is an artefact.** Verified against the JSON summary: `app.tsx` reports `{"statements": 2, "covered": 2}` — the whole 43-line component is 2 measurable statements because the JSX children are never evaluated behind the stubbed `Canvas`. Every scene decision — camera, fog, lights, geometry — is at genuinely 0% coverage while the report says 100%. |
| **Low** | `expect(...).toBeTruthy()` (`:17`, `:22`) instead of `toBeInTheDocument()`. `@testing-library/jest-dom` is not installed, so the DOM matchers are unavailable and the weaker assertion is the only option — but `getByText` already throws when absent, so the assertion adds nothing. |

**Positive observations.** The comment at `:5-9` explains *why* the mock exists (no WebGL in
jsdom), *why* children are not rendered (three.js primitives are not DOM elements), *why*
`vi.mock` placement matters (hoisting), and *where* the real coverage lives (`qa-smoke`). This
is the right way to document a test compromise. The second test (`:20-23`) asserts data
actually crossed the library boundary rather than just that the component rendered.

---

### `apps/api/src/lib/health.ts` (19 lines)

**Why examined.** The only backend code and the template every future handler will copy.

| Sev | Finding |
|---|---|
| **Medium** | **No `cache-control` header.** The response embeds `new Date().toISOString()` (`:12`) but ships only `content-type` (`:17`). Behind any CDN or shared cache — which is exactly where a static-hosted serverless function sits — a heuristic-cached health response will report a stale `checkedAt` indefinitely, making the endpoint useless for its one purpose. Add `'cache-control': 'no-store'`. |
| **Low** | Ignores the incoming `Request`. The signature is `health(): Response`, so the handler cannot be adapted to a platform that requires `(req) => Response` without changing every call site. `health(_request?: Request): Response` costs nothing now. |
| **Low** | No `Response.json()` — `JSON.stringify` plus a manual header (`:15-17`). `Response.json()` is available in every runtime named in the file's own comment and is less error-prone as handlers multiply. |
| **Info** | Phase 2 finding D1 confirmed independently: `nx build api` fails with *"Cannot find configuration for task api:build"*. `apps/api` has `typecheck`, `lint`, `test`, `test-ci` and no `build`. Combined with `emitDeclarationOnly: true` in `tsconfig.base.json`, this project cannot emit JavaScript by any route. |

**Positive observations.** The doc comment (`:3-8`) names the four runtimes the Fetch shape
targets and states why the decision is deferred. `HealthResponse` is imported as `import type`,
so the handler bundles with zero workspace runtime code. The body is typed against the shared
contract (`:10`) rather than an inline literal, which means a contract change breaks the
producer at compile time.

---

### `apps/web/src/main.tsx` (13 lines)

**Why examined.** The only unsafe cast in the workspace lives here.

| Sev | Finding |
|---|---|
| **Low** | `document.getElementById('root') as HTMLElement` (`:6`) — the workspace's sole type assertion. Nx generator default, and `index.html:13` does contain `<div id="root">`, so it is correct today. It is also the one line that would produce a silent `null` deref if the mount point were ever renamed. |
| **Low** | No error boundary at the root. A throw during `App` render unmounts the whole tree to a blank page. |
| **Info** | `import * as ReactDOM from 'react-dom/client'` — namespace import where `import { createRoot }` is the React 19 idiom and is tree-shakeable. Cosmetic. |

---

### `libs/shared/domain/src/lib/result.ts` + `result.spec.ts`

**Why examined.** The project's declared error-handling strategy.

| Sev | Finding |
|---|---|
| **Medium** | Zero production call sites. Verified against Phase 2's count: 11 references total, **0 outside `result.ts` and `result.spec.ts`**. A declared convention with no usage is how a codebase accumulates rules nobody follows. |
| **Low** | No `andThen` / `flatMap`. Only `mapResult` exists, so chained fallible operations nest rather than compose — the first real `Result` user will either add it or abandon the type. |
| **Low** | `mapResult` returns `result` unchanged on the error branch (`:25`). Correct, and TypeScript narrows it — but the return is typed `Result<U, E>` while the value is the original `Result<T, E>` object. Sound here; fragile if `Result` ever gains a third variant. |

**Positive observations.** The discriminated union is correctly `readonly` on both branches. The
type guards return proper `result is …` predicates rather than `boolean`, so narrowing works at
call sites. `result.spec.ts` is small but tests the right things — narrowing on both branches,
that `mapResult` does **not** touch the error branch, and the fallback.

---

### `eslint.config.mjs` (150 lines)

**Why examined.** It is the workspace's primary quality gate and by far its largest config.

| Sev | Finding |
|---|---|
| **Critical** | No type-aware linting. See Anti-Pattern AP-1. |
| **High** | The final config block (`:136-149`) is an empty `rules: {}` over eight file globs — a placeholder that adds nothing beyond `flat/base`. The entire non-boundary rule surface is whatever the `@nx` presets happen to ship. |
| **Medium** | `eslint-config-prettier` is a declared devDependency (`package.json:30`) and is **imported by none of the seven ESLint configs**. Verified by grep. Dead dependency, and the formatting-vs-lint conflicts it exists to disable are not disabled. |
| **Medium** | `apps/web/eslint.config.mjs` spreads `nx.configs['flat/react']` **before** `baseConfig`. Later blocks win in flat config, so any rule the base presets set is silently overriding the React preset's version of it. Reversing the order (base first, React second) matches the intent. |
| **Low** | Phase 2 finding D4 stands: no `sourceTag: 'type:feature-api'` constraint exists, so a library carrying that tag has the entire `type:` dimension silently disabled. The roadmap's `complaints-api` item plans exactly that tag. |

**Positive observations.** The boundary rules are the best-documented configuration in the
repository. `:21-24` explains why `enforceBuildableLibDependency` is off; `:79-85` explains why
bounded-context isolation is the rule that makes the project forkable; `:68` and `:117-118`
explain the layer and platform intent. Phase 2 verified by four probes that these rules
genuinely fire on cross-scope imports, cross-layer imports, relative-path escapes, and untagged
projects. **The one gate that is fully armed is the one that matters most architecturally.**

---

### `tsconfig.base.json` + `apps/web/tsconfig.app.json`

**Why examined.** Compiler configuration is the cheapest quality gate available and this
project already opted into most of it.

| Sev | Finding |
|---|---|
| **High** | `noUncheckedIndexedAccess` absent. Demonstrated crash path — see Type Safety. |
| **High** | `apps/web/tsconfig.app.json:6` sets `"lib": ["dom"]`, which **replaces** rather than merges the base `["es2022"]`. Re-verified independently: `[1,2].at(0)` and `Object.hasOwn(...)` both fail with `TS2550` in the web app, while `target` stays `es2022` so both would emit and run fine. Fix: `"lib": ["es2022", "dom", "dom.iterable"]`. |
| **Medium** | Every `platform:shared` library sets `"types": ["node"]`. Re-verified: `process.platform` and `Buffer.alloc(1)` in `libs/shared/util` type-check clean (exit 0). These libraries ship to a browser through `world-domain` → `web`. A Node global that leaks in passes the entire CI gate and fails only at runtime. |
| **Low** | `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, and `useUnknownInCatchVariables` (implied by `strict`, but worth being explicit) are all absent. |

**Positive observations.** `strict`, `noUnusedLocals`, `noImplicitReturns`,
`noImplicitOverride`, `noFallthroughCasesInSwitch`, `isolatedModules`, and `noEmitOnError` are
all on. `composite` + project references are wired correctly and `nx sync:check` reports the
workspace up to date, so references cannot drift.

---

### `.github/workflows/ci.yml` (41 lines)

**Why examined.** It defines what "quality" actually means for anything merged.

| Sev | Finding |
|---|---|
| **High** | No format check. `prettier --check` currently fails on **11 files**. CI would not notice. |
| **High** | Lint runs without `--max-warnings=0`, so all a11y and hooks findings pass. |
| **Medium** | No coverage collection and no thresholds anywhere. Coverage can go to zero without a signal. |
| **Medium** | No bundle-size gate. The build emits *"Some chunks are larger than 500 kB"* on every run and CI treats it as success. |
| **Low** | Runs `-t test` rather than the purpose-built `test-ci` target. Harmless (each project sets `watch: false`) but the CI target exists and is unused. |
| **Low** | No `dependabot.yml`, no `CODEOWNERS`, no dependency-review or CodeQL step. |

**Positive observations.** `fetch-depth: 0` + `nrwl/nx-set-shas@v4` is the correct `nx affected`
setup and is commented as such (`:23`, `:33`). `nx sync:check` guards project-reference drift.
Least-privilege permissions (`contents: read`, `actions: read`) and `cancel-in-progress`
concurrency are both right. For a foundation this is a well-built pipeline — the gaps are
missing gates, not broken ones.

---

## Anti-Pattern Inventory

### AP-1 — Configured-but-disarmed quality gate (type-aware linting)

- **Location:** `eslint.config.mjs` (all seven configs); `package.json:41` declares
  `typescript-eslint@^8.58.0`
- **Severity:** **Critical**
- **Description:** `typescript-eslint` is installed and the `@nx` TypeScript preset is applied,
  but no config sets `parserOptions.project` or `languageOptions.parserOptions.projectService`.
  Without it the entire type-checked rule set is unavailable: `no-floating-promises`,
  `no-misused-promises`, `await-thenable`, `require-await`, `no-unsafe-assignment`,
  `no-unsafe-argument`, `no-unsafe-return`, `no-unnecessary-condition`.
- **Verified:** a probe file containing a floating `work()` promise, an empty `catch`, an unused
  local, and a `useEffect` missing `dep` produced **two warnings, zero errors**, and
  `nx run web:lint` printed *"Successfully ran target lint"*.
- **Why it matters here specifically:** the next four roadmap items are `useGLTF` async loading,
  scroll-driven async camera work, and a `fetch`-based complaints submission. Floating promises
  and misused promises are the dominant defect class in exactly that code, and nothing will
  catch them.
- **Fix:** add to the root config —
  ```js
  languageOptions: {
    parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
  },
  ```
  and extend `...tseslint.configs.recommendedTypeChecked`. Enable
  `@typescript-eslint/no-floating-promises` and `no-misused-promises` as **errors**.

---

### AP-2 — Advisory-only accessibility and hooks rules

- **Location:** `.github/workflows/ci.yml:39`; `apps/web/eslint.config.mjs`
- **Severity:** **High**
- **Description:** `jsx-a11y/alt-text` and `react-hooks/exhaustive-deps` both fire as
  **warnings**. `eslint .` exits 0 on warnings, so CI is green. Verified by two separate probes.
- **Fix:** run `eslint . --max-warnings=0`, or promote the `jsx-a11y` and `exhaustive-deps`
  rules to `error` in `apps/web/eslint.config.mjs`.

---

### AP-3 — `react/jsx-key` not enabled

- **Location:** `apps/web/eslint.config.mjs` (rule absent from the applied preset)
- **Severity:** **High**
- **Description:** Verified — a probe containing `items.map((i) => <span>{i}</span>)` with no
  `key` produced **no diagnostic at all**. The nx React preset does not enable `react/jsx-key`.
- **Why it matters here specifically:** `landmark-kernel` and `complaints-wall` are both list
  renderers, and missing keys in an R3F tree do not merely warn in the console — they cause
  React to reconcile the *wrong* three.js object, producing landmarks that swap geometry or
  materials on state change. That is a bug class that presents as a rendering glitch and is
  extremely hard to trace back to a missing prop.
- **Fix:** add `'react/jsx-key': 'error'` before any list rendering is written.

---

### AP-4 — Constant that claims to be a measurement

- **Location:** `libs/world/domain/src/lib/asset-manifest.ts:42,50,58,66` (`sourceBytes`)
- **Severity:** **High**
- **Description:** Six fields documented as *"Size of the raw source in bytes, as committed"*
  hold hand-rounded MB estimates that overstate reality by 2.0–6.1%, and measure a different
  unit (directory vs. the single file named in `sourcePath`) from what the sibling field
  describes. The measured figures already exist in `docs/asset-inventory.md`.
- **Fix:** derive `sourceBytes` from disk in a script, or add a test that `statSync`s each
  `sourcePath` and asserts the declared value — making the manifest self-verifying the way the
  attribution table already is.

---

### AP-5 — Untested failure path on the codebase's most important assertion

- **Location:** `libs/world/domain/src/lib/asset-manifest.spec.ts:31-33`
- **Severity:** **High**
- **Description:** The CC-BY guard is asserted only where it returns `[]`. Verified: one
  negative-path test raises `world-domain` function coverage 88.88% → 100%, i.e. the reporting
  branch is dead in the current suite.
- **Fix:**
  ```ts
  it('reports an asset with no credit', () => {
    const rogue = [...SOURCE_ASSETS, { ...SOURCE_ASSETS[0], id: 'no-credit' }];
    expect(assetsMissingAttribution(rogue)).toEqual(['no-credit']);
  });
  ```
  (Verified passing.)

---

### AP-6 — Formatter configured, never enforced, already drifted

- **Location:** `.prettierrc`, `.prettierignore`, `package.json:38`; no consumer
- **Severity:** **Medium**
- **Description:** `prettier --check` fails on 11 files — `app.tsx`, `styles.css`,
  `branded-id.ts`, `result.ts`, `result.spec.ts`, `math.ts`, `asset-manifest.ts`,
  `asset-manifest.spec.ts`, `quality-tier.ts`, `.mcp.json`, `eslint.config.mjs`. That is 9 of 21
  first-party source files, in a workspace with **no commits yet**. There is no `format` target,
  no npm script, no CI step, and `eslint-config-prettier` is imported nowhere.
- **Fix:** `npx prettier --write .` once, then add `npx prettier --check .` to CI. Either wire
  `eslint-config-prettier` into the flat config or remove the dependency.

---

### AP-7 — Undeclared framework dependencies in the consuming app

- **Location:** `apps/web/package.json:5-8`
- **Severity:** **Medium**
- **Description:** `apps/web` imports `react`, `react-dom`, and `@react-three/fiber` but
  declares only the two workspace links. The real dependencies sit in the **root**
  `package.json`. This works via npm-workspaces hoisting and will silently break any per-app
  install — a Docker build, a platform that installs from `apps/web/package.json`, or extraction
  of the template into a standalone repo, which is the project's stated goal.
- **Fix:** declare `react`, `react-dom`, `three`, and `@react-three/fiber` in
  `apps/web/package.json`.

---

### AP-8 — Unused production dependency

- **Location:** `package.json:53` — `@react-three/drei@^10.7.8`
- **Severity:** **Medium**
- **Description:** Verified — zero imports of `drei` anywhere in `apps/` or `libs/`. It is a
  *production* dependency and one of the larger packages in the tree. `README.md:54` names it as
  an architectural choice, so this is intent-ahead-of-code rather than an accident, but it is
  currently install weight and audit surface for nothing.
- **Fix:** keep it (it will be used by `world-environment`) but note it; or move to
  devDependencies until first import.

---

### AP-9 — Unbudgeted JavaScript alongside rigorously budgeted assets

- **Location:** `apps/web/vite.config.mts:21-28`
- **Severity:** **Medium**
- **Description:** The build emits a single **1,389,581 B** chunk (385 kB gzip) for a scaffold
  that renders one plane, and prints *"Some chunks are larger than 500 kB"* on every run. No
  `manualChunks`, no `chunkSizeWarningLimit`, no size gate. Meanwhile `asset-manifest.spec.ts`
  enforces a 6 MB ceiling on model bytes to the byte. The project measures the payload it has
  not shipped yet and ignores the one it ships today.
- **Fix:** split `three` into its own chunk, and add a bundle-size assertion to the
  `perf-budget` roadmap item covering **JS as well as glTF**.

---

### AP-10 — Coverage measured, never enforced, and structurally misleading

- **Location:** all six vitest configs; `.github/workflows/ci.yml`
- **Severity:** **Medium**
- **Description:** v8 coverage is configured in every project with **no `thresholds` block
  anywhere**, and CI never requests coverage. Worse, the numbers are not comparable: `web`
  reports 100% off 2 measurable statements for a 43-line component whose JSX never evaluates
  behind the stubbed `Canvas`. A future reader will read "100%" as "the scene is tested."
- **Fix:** add `thresholds: { lines: 80, functions: 80, branches: 70 }` per project, set
  `all: true` so untested files count as 0 rather than vanishing, and run coverage in CI.

---

### AP-11 — Documented-but-unapplied primitive library

- **Location:** `libs/shared/domain/src/lib/{result,branded-id,value-object}.ts`
- **Severity:** **Medium**
- **Description:** Three tactical-DDD primitives with 0 production call sites between them
  (Phase 2 B1–B3, independently reconfirmed). `AssetId` is declared for `AssetEntry.id` and
  `AssetEntry.id` is `string`. `brandId` is never called. `ValueObject` has no subclass and no
  test.
- **Fix:** apply them at the one available call site — `findAsset` → `Result`,
  `AssetEntry.id` → `AssetId` — or delete them. Either resolves it; leaving them is how a
  young codebase learns that its conventions are optional.

---

### AP-12 — Instance data hardcoded inside a domain library

- **Location:** `libs/world/domain/src/lib/asset-manifest.ts:37-70`, `attribution.ts:40-73`
- **Severity:** **Medium**
- **Description:** Four SpongeBob-specific assets and their credit records live as source
  constants in a `type:domain` library, in a project whose README states *"Forking should mean
  editing configuration, not components"* (`README.md:12-14`). A forker must edit library source
  to swap models. Phase 2 T2/G6; repeated here because the fix window closes when `landmarks/*`
  copies the shape.
- **Fix:** move the four entries to a data file loaded at the composition root, keeping
  `AssetEntry`, `findAsset`, and the guards in the domain library.

---

### AP-13 — Duplicated design constant across language boundaries

- **Location:** `apps/web/src/app/app.tsx:22,23`; `apps/web/src/styles.css:10`
- **Severity:** **Low**
- **Description:** `#0a1e3f` appears three times in two files — twice in the R3F scene
  (background and fog) and once as the CSS page background. Changing the water colour requires
  finding all three. `.ptah/scope-decisions.md` and the art-direction skill treat fog colour as
  a governed decision, which makes it exactly the kind of value that should have one home.
- **Fix:** a CSS custom property consumed by the stylesheet plus a single exported constant for
  the scene.

---

### AP-14 — Over-broad module mock

- **Location:** `apps/web/src/app/app.spec.tsx:10-12`
- **Severity:** **Medium** — see file-level findings. Fix: `vi.importActual` spread.

---

### AP-15 — Stale backup file committed to the working tree

- **Location:** `.mcp.json.bak` (145 B, not in `.gitignore`)
- **Severity:** **Low**
- **Description:** A `.bak` sibling of an active config, untracked-but-unignored, so it will be
  swept into the first commit. It contains no secret (the Firecrawl key is a `${VAR}`
  reference), so this is hygiene rather than exposure.
- **Fix:** delete it, or add `*.bak` to `.gitignore`.

---

## Framework Best Practices Compliance

Detected stack (Phase 1): **React 19.2.8**, **@react-three/fiber 9.7.0**, **three 0.185.1**,
**@react-three/drei 10.7.8**, **Vite 8.2.2**, **Vitest 4.1.11**, **Nx 23.1.1**,
**TypeScript 6.0.3**. No Angular, Next.js, NestJS, Vue, Express, or Fastify is present — those
sections are omitted as not applicable.

### React 19

| Practice | Status | Evidence |
|---|---|---|
| `createRoot` from `react-dom/client` (not legacy `ReactDOM.render`) | ✅ **Followed** | `main.tsx:2,5` |
| `<StrictMode>` in development | ✅ **Followed** | `main.tsx:10-12`. Non-trivial for R3F — StrictMode double-invocation exposes effect-cleanup bugs in scene setup, which is exactly where they hide |
| No `forwardRef` (React 19 passes `ref` as a prop) | ✅ **Followed** | no `forwardRef` anywhere |
| State colocation / no premature global state | ✅ **Followed** | zero `useState`/`useReducer`/`useContext`; `budgetMb` (`app.tsx:17`) is derived per render from a pure function |
| No premature `memo`/`useMemo`/`useCallback` | ✅ **Followed** | zero memoisation hooks — correct at this size |
| Stable `key` on list children | ⚠️ **Unenforced** | no lists yet, and `react/jsx-key` is **not enabled** (AP-3) |
| Error boundary at the root | ❌ **Violated** | none in `main.tsx` or `app.tsx`. A render throw yields a blank page |
| `<Suspense>` around anything that can suspend | ❌ **Not yet present** | required before `useGLTF` lands (`world-environment`) |
| Server Components / RSC | **N/A** | pure client SPA on Vite; no RSC-capable framework |
| `use()` / Actions / `useOptimistic` | **N/A** | no async data flow yet; relevant at `complaints-wall` |
| `react-hooks/exhaustive-deps` enforced | ⚠️ **Warning only** | verified — fires as a warning, CI passes (AP-2) |

**Outdated-pattern check:** none found. There is no legacy `ReactDOM.render`, no class
component, no `defaultProps`, no `propTypes`, no string ref. This is idiomatic React 19.

### React Three Fiber 9 / three.js 0.185

Assessed against the project's own `r3f-scene-patterns` skill, which is the standard this
codebase committed to.

| Practice | Status | Evidence |
|---|---|---|
| Exactly one `<Canvas>`, never remounted | ✅ **Followed** | `app.tsx:21`; remounting destroys the WebGL context and re-uploads every GPU buffer |
| Declarative scene graph, no imperative `scene.add` | ✅ **Followed** | `app.tsx:21-30` is pure JSX |
| No `three` import outside the app boundary | ✅ **Followed** | verified — no library imports `three`, `react`, or `@react-three/fiber` |
| `attach` used for non-object properties | ✅ **Followed** | `attach="background"` (`:22`), `attach="fog"` (`:23`) — correct, and a common R3F mistake avoided |
| No per-frame `setState` (transient state in `useFrame`) | ⚠️ **Undecided** | no `useFrame` yet. Phase 2 G7 flags this as the highest-risk open decision; `dive-camera` must resolve it before `landmark-kernel` inherits whatever it picks |
| glTF via `useGLTF` + `<Suspense>` + `preload` | ❌ **Absent** | no loader code; all four `compressedPath` are `null` |
| Draco / Meshopt / KTX2 loader wiring | ❌ **Absent** | no compression tooling in the dependency tree (Phase 1) |
| Geometry/material sharing and instancing | ❌ **Not yet** | no repeated meshes yet; required for bubbles/plankton |
| Adaptive quality driven by measured FPS | ⚠️ **Contract only** | `QUALITY_TIERS` + `tierAllows` + `AssetEntry.minimumTier` model it correctly; no resolver exists (deliberately deferred, `quality-tier.ts:1-5`) |
| Dispose on unmount | **N/A** | R3F auto-disposes; becomes relevant when `useLoader` caching enters |
| Code-splitting the three.js payload | ❌ **Violated** | single 1.39 MB chunk (AP-9) |

**Assessment:** every R3F practice that *applies to 40 lines of scene code* is followed
correctly, including two (`attach`, single `<Canvas>`) that are commonly got wrong. Everything
marked absent is genuinely not-yet-written rather than written badly — with the single
exception of bundle splitting, which is a real miss today.

### Vite 8

| Practice | Status | Evidence |
|---|---|---|
| ESM config, `defineConfig` | ✅ **Followed** | `apps/web/vite.config.mts:2,5` |
| `import.meta.dirname` over `__dirname` | ⚠️ **Mixed** | `apps/web/vite.config.mts:6` uses `import.meta.dirname` correctly; all five other configs use `__dirname` and Vite 8 emits a deprecation warning for each — **five warnings on every test run** |
| Root `vitest.config.ts` loadable natively | ⚠️ **Violated** | Vite 8 warns: *"ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1)"*. Rename to `.mts` or set `"type": "module"` |
| `manualChunks` for large vendor libs | ❌ **Absent** | AP-9 |
| Source maps for production debugging | ❌ **Absent** | no `build.sourcemap`; a runtime error in the 1.39 MB minified bundle will be untraceable |
| Dead scaffold removed | ⚠️ **Minor** | commented-out `worker` block left at `:17-20` |

### Vitest 4

| Practice | Status | Evidence |
|---|---|---|
| Projects-based workspace aggregation | ✅ **Followed** | `vitest.config.ts:5-10` — the modern replacement for the deprecated `vitest.workspace.ts` |
| Explicit environment per project | ✅ **Followed** | `jsdom` for `web`, `node` elsewhere |
| `watch: false` in every project config | ✅ **Followed** | CI-safe despite the plugin's `testMode: "watch"` |
| Coverage thresholds | ❌ **Absent** | AP-10 |
| `coverage.all` so untested files count | ❌ **Absent** | untested files are invisible rather than 0% |
| Explicit imports over `globals: true` | ⚠️ **Inconsistent** | `globals: true` everywhere, yet all five spec files import `describe`/`it`/`expect` explicitly. The looser setting is enabled and then not used — pick one |

### Nx 23

| Practice | Status | Evidence |
|---|---|---|
| Inferred targets, no `project.json` | ✅ **Followed** | four plugins in `nx.json:12-48`; zero `project.json` |
| TS-solution setup with project references | ✅ **Followed** | `nx sync:check` reports up to date |
| Tag-based module boundaries | ✅ **Followed & verified enforcing** | four probes in Phase 2 |
| `nx affected` correctly configured in CI | ✅ **Followed** | `fetch-depth: 0` + `nx-set-shas@v4` |
| `sharedGlobals` populated | ⚠️ **Empty** | `nx.json:9` — `sharedGlobals: []`, so root-level inputs are not declared as global cache busters |
| No dead `targetDefaults` | ❌ **Violated** | `nx.json:51-53` `test.dependsOn: ["^build"]` — no dependency of any project has a `build` target (Phase 2 D5, confirmed) |
| Every app produces a deployable artifact | ❌ **Violated** | `nx build api` → *"Cannot find configuration for task api:build"* (Phase 2 D1, confirmed) |

---

## Type Safety Assessment

### `any` usage

**Zero.** Verified by regex across all `.ts`/`.tsx` under `apps/` and `libs/` — every match for
`\bany\b` is the English word inside a doc comment (`health.ts:4`,
`api-interfaces/health.ts:6`). There is no implicit `any` either: `strict` is on and `typecheck`
passes for all six projects.

This is the audit's strongest single result and it should be protected — the way `any` normally
enters a codebase like this is through untyped glTF loader results and `event.target` handlers,
both arriving in the next two roadmap items.

### Unsafe casts and assertions

| Location | Cast | Assessment |
|---|---|---|
| `apps/web/src/main.tsx:6` | `document.getElementById('root') as HTMLElement` | **Low.** The only true type assertion in the workspace. Correct against `index.html:13`; Nx generator default |
| `libs/shared/domain/src/lib/branded-id.ts:13` | `value as Branded<TBrand>` | **Acceptable.** The cast *is* the branding mechanism — unavoidable and correctly isolated to one line |
| `attribution.ts:33`, `quality-tier.ts:7` | `as const` | **Good.** Const assertions, not type assertions — they narrow rather than widen |

**Non-null assertions (`!`): zero.** **`@ts-ignore` / `@ts-expect-error`: zero.**
**`eslint-disable`: zero.**

### Missing types and compiler gaps

**Finding TS-1 — `noUncheckedIndexedAccess` is off, with a demonstrated runtime crash.**
**Severity: High.**

```ts
// probe — tsc -p libs/world/domain/tsconfig.lib.json --noEmit  →  exit 0, no errors
export const a = creditLine(ATTRIBUTIONS['does-not-exist']);  // TypeError at runtime
export const b = SOURCE_ASSETS[99].budgetBytes;               // TypeError at runtime
```

Both compile clean. The first was confirmed to throw
`TypeError: Cannot read properties of undefined (reading 'title')`. `ATTRIBUTIONS` is typed
`Readonly<Record<string, Attribution>>` (`attribution.ts:40`), so **any** string indexes it as a
guaranteed-present `Attribution`.

The pattern already appears in test code (`asset-manifest.spec.ts:36`) and is exactly what
`asset-attribution-ui` will write when it renders credits by asset id. Enabling
`noUncheckedIndexedAccess` in `tsconfig.base.json` turns both of these into compile errors and
costs almost nothing to adopt at 508 lines — it will be expensive at 5,000.

**Finding TS-2 — `ATTRIBUTIONS` is keyed by `string` where a union would enforce completeness.**
**Severity: Medium.** Typing it `Record<AssetEntry['id'], Attribution>` over a literal-union id
type would make a missing credit a **compile** error rather than a test failure, and would make
lookups total. Note this deliberately *strengthens* rather than replaces the existing runtime
test, which is what protects against a data file loaded at runtime later.

**Finding TS-3 — `AssetId` is declared and unused.** **Severity: Medium.** `attribution.ts:3`
defines `export type AssetId = Branded<'Asset'>` with exactly one reference in the workspace —
its own declaration. `AssetEntry.id` and `findAsset(id)` are both plain `string`. The nominal
typing the library advertises is not in force for the only entity that has an id type.

**Finding TS-4 — `apps/web` compiles against pre-ES2022 lib types.** **Severity: High.**
Re-verified: `"lib": ["dom"]` (`tsconfig.app.json:6`) replaces the base `["es2022"]`, so `.at()`
and `Object.hasOwn` fail with `TS2550` in the browser app while `target` remains `es2022`. Any
developer reaching for a modern built-in gets a confusing error suggesting they downgrade.
Fix: `"lib": ["es2022", "dom", "dom.iterable"]`.

**Finding TS-5 — Node globals are reachable from browser-bound libraries.** **Severity: Medium.**
Re-verified: `process.platform` and `Buffer.alloc(1)` type-check clean in `libs/shared/util`
(`tsc` exit 0), which reaches the browser via `world-domain` → `web`. `"types": ["node"]` is set
in every `platform:shared` library's `tsconfig.lib.json` and none of them uses a Node API.

### Generic usage quality

**Good, and appropriately restrained.** Five generic functions exist, all in `shared/domain`:

- `Result<T, E = string>` — a discriminated union with a sensible default error type, correctly
  `readonly` on both branches.
- `ok<T>` returns `Result<T, never>` and `err<E>` returns `Result<never, E>` — the `never`
  placement is precise and lets both compose into any `Result<T, E>` without a cast.
- `isOk` / `isErr` return `result is …` type predicates rather than `boolean`, so narrowing
  works at call sites. `result.spec.ts:8,14` exercises exactly this.
- `mapResult<T, U, E>` — three parameters, all load-bearing.
- `Branded<TBrand extends string>` — correctly constrained.

No unconstrained type parameters, no `extends any`, no generic that exists only to be inferred
away. Nothing is over-abstracted. The one criticism is usage, not design: none of it is called
from production code (AP-11).

---

## Error Handling Evaluation

### Empty catch blocks

**Zero.** Verified by regex — there is not a single `catch` clause anywhere in `apps/` or
`libs/`. There is also no `try`, no `throw`, no `.catch()`, and no `process.on('unhandledRejection')`.

### Swallowed errors

**None, because there is nothing to swallow.** No I/O, no `fetch`, no filesystem access, no
`async` function outside the two test files. Every production function is synchronous and total
except `findAsset`, which returns `undefined` rather than throwing.

**This section is a placeholder for a risk, not a report of a defect** — and the risk is
concrete:

| Roadmap item | Failure mode it introduces | Current defence |
|---|---|---|
| `world-environment` | `useGLTF` throws a promise; a 404 or corrupt glTF rejects it | none — no `<Suspense>`, no error boundary |
| `asset-compression` | build-time pipeline failure | none |
| `complaints-api` | network failure, 4xx/5xx, malformed JSON | none — no HTTP client |
| `complaints-wall` | submission failure, optimistic-update rollback | none |
| `quality-tiers` | WebGL context loss (`webglcontextlost`) | none |

### Missing error boundaries — **Severity: High**

There is no `ErrorBoundary` component anywhere. `main.tsx:9-13` renders `<App />` bare. In an
R3F application this matters more than in ordinary React:

1. A WebGL context-creation failure throws during `<Canvas>` mount and takes down the whole
   tree — including the HTML overlay that could have explained why.
2. `useGLTF` throws for **both** loading (a promise, needing `<Suspense>`) and failure (an
   error, needing a boundary). The next roadmap item introduces both, and neither handler
   exists.
3. There is no `<noscript>` and no WebGL capability check, so a device without WebGL gets a
   blank page. `a11y-fallback` is scheduled for **Phase 8** — the last phase.

**Recommendation:** add a root error boundary plus a `<Suspense>` wrapper **as part of
`world-environment`**, not as a Phase 8 item. The cost is ~30 lines now and a debugging session
per incident later.

### Unhandled promise rejections — **Severity: High (as a latent gap)**

Zero exist today. But the lint rule that would catch them, `@typescript-eslint/no-floating-promises`,
**cannot run** because no type-aware linting is configured (AP-1). Verified: a probe containing
a bare `work();` call to an `async` function produced **no diagnostic**. Combined with the
absence of any `unhandledrejection` handler in `main.tsx`, the first async code written into
this repository will have no static and no runtime net beneath it.

### Positive observations

- `Result<T, E>` exists and is well-built, so the *strategy* is chosen even though it is unused.
  `result.ts:1-3` states it clearly: *"failures are part of a function's signature and callers
  cannot ignore them by accident."*
- `remap` (`math.ts:17`) and `smoothstep` (`:24`) both guard division by zero explicitly rather
  than returning `NaN` — the correct instinct for values feeding a render loop.
- `assetsMissingAttribution` returns a list of offenders rather than a boolean, so a failure
  message can name what is wrong. That is a deliberately debuggable error contract.

---

## Security Concerns

`npm audit`: **0 vulnerabilities** across 1,162 resolved packages (0 critical, 0 high, 0
moderate, 0 low). No secret, token, key, or credential appears anywhere in the repository.

| # | Severity | Concern | Location | Mitigation |
|---|---|---|---|---|
| S-1 | **Medium** | **No Content-Security-Policy and no security headers.** `apps/web/index.html` carries no CSP `<meta>`, and there is no hosting config (`vercel.json`, `netlify.toml`, `_headers`) to supply `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy`. A WebGL site is a script-heavy target and CSP is the main defence against injected script. | `apps/web/index.html:1-16`; no host config exists | Define headers as part of `deploy-static`, before `security-hardening` in Phase 7. Note that R3F/three needs no `unsafe-eval` — a strict CSP is achievable here |
| S-2 | **Medium** | **No `cache-control` on the health endpoint.** `health()` returns a timestamped body with only `content-type`. A CDN heuristic-caches it, so the endpoint reports a frozen `checkedAt`. | `apps/api/src/lib/health.ts:15-18` | Add `'cache-control': 'no-store'` |
| S-3 | **Medium** | **`apps/api` has no build target, so no deployment artifact can be reviewed.** Whatever ships will be produced by an as-yet-unwritten adapter that no gate covers. | Phase 2 D1, reconfirmed via `nx build api` | Establish the build and adapter in `deploy-static`; add the artifact to CI |
| S-4 | **Medium** | **No input-validation strategy for the complaints flow.** `complaints-api` accepts free-text public submissions — the workspace's only untrusted-input surface. No validation library (`zod`, `valibot`) is in the dependency tree and no DTO/schema pattern is established. | `.ptah/roadmap.md` Phase 5 | Decide the validation boundary **before** `complaints-api`: schema-validate at the handler edge, length-cap, rate-limit, and store raw + rendered separately. `complaints-moderation` implies the trust model is already understood |
| S-5 | **Low** | **`licenseUrl` is `http://`, not `https://`.** Hardcoded as `http://creativecommons.org/licenses/by/4.0/`. When `asset-attribution-ui` renders it as an `href` on an HTTPS site it becomes mixed content — browsers upgrade or block it. | `libs/world/domain/src/lib/attribution.ts:32` | Change to `https://`. CC serves both |
| S-6 | **Low** | **No `rel="noopener noreferrer"` convention.** All four attribution records carry external `authorUrl`/`sourceUrl` values destined for `<a target="_blank">` in `asset-attribution-ui`. React 19 and modern browsers imply `noopener` for `target="_blank"`, so this is a convention gap rather than a live hole. | `attribution.ts:40-73` | Set the convention when the UI is written |
| S-7 | **Low** | **`.mcp.json` and `.mcp.json.bak` are not gitignored.** Both will enter the first commit. Neither contains a literal secret — `FIRECRAWL_API_KEY` is a `${VAR}` reference, which is the correct pattern — but a `.bak` of a config that holds an env-var slot is the file most likely to acquire a pasted key during debugging. | `.mcp.json:14`, `.mcp.json.bak` | Delete the `.bak`; add `*.bak` to `.gitignore` |
| S-8 | **Low** | **No dependency-review, CodeQL, or Dependabot.** The tree is clean today; nothing watches it. `assets/` also contains 28 MB of binary glTF from an external source with no integrity check. | `.github/workflows/ci.yml`; no `dependabot.yml` | Add `dependabot.yml` and `actions/dependency-review-action` on PRs |
| S-9 | **Info** | **No XSS vector exists today, and the design keeps it that way.** No `dangerouslySetInnerHTML`, no `innerHTML`, no `eval`, no `new Function`. `creditLine` (`attribution.ts:25-28`) builds a plain string from hardcoded constants for React to escape. Worth stating explicitly because `content-model` and `complaints-wall` both introduce rendered external text — that is where the first real vector will appear | — | Keep credits as text; never render user complaint text as HTML |

**Security posture summary.** Nothing is currently exploitable. Every finding is either a
hardening step deferred by an explicit roadmap item (S-1, S-3, S-4) or hygiene (S-5 – S-8). The
one thing worth pulling forward is **S-4**: deciding the validation boundary is a design
decision, and design decisions are cheap before the code exists and expensive after.

---

## Test Coverage Analysis

**Totals:** 5 test files, **20 tests, all passing** in 1.15 s. Aggregate v8 coverage across the
workspace: **96.07% statements (49/51), 75% branches (9/12), 95.23% functions (20/21), 100%
lines (43/43)**.

**Read those percentages with care.** The denominators are tiny and, for `web`, structurally
misleading (AP-10).

| Project | Tests | Stmts | Branch | Funcs | What it really measures |
|---|---:|---:|---:|---:|---|
| `shared-domain` | 4 | 100% (12/12) | 100% (4/4) | 100% (6/6) | `result.ts` only — `value-object.ts` and `branded-id.ts` have **no tests at all** |
| `shared-util` | 5 | 92.85% (13/14) | **50% (3/6)** | 100% (4/4) | `math.ts`; line 24 uncovered |
| `world-domain` | 7 | 95% (19/20) | 100% (2/2) | **88.88% (8/9)** | manifest + attribution + tiers; the missing function is the licence guard's failure path |
| `api` | 2 | 100% (3/3) | — | 100% (1/1) | `health()` end to end |
| `web` | 2 | 100% (2/2) | — | 100% (1/1) | **2 statements of a 43-line component** |

### What is tested — and tested well

- **Licence compliance as a build gate.** `asset-manifest.spec.ts:31-33` fails the build if a
  model lacks a credit. This is the single best test in the repository.
- **Budget invariants as properties, not fixtures.** `:17-25` iterates `SOURCE_ASSETS` asserting
  `budgetBytes < sourceBytes` for every entry plus a 6 MB total ceiling. Adding a fifth asset
  cannot slip past.
- **The credit string's exact required content.** `:35-40` asserts title, licence, and author
  URL all appear — testing the licence obligation, not the implementation.
- **Type-guard narrowing.** `result.spec.ts:8,14` asserts inside the narrowed branch, which is
  what actually validates a `result is …` predicate.
- **Negative-branch discipline where it exists.** `mapResult(err(...))` is asserted to leave the
  error untouched (`:19-21`); `findAsset('nope')` is asserted `undefined` (`asset-manifest.spec.ts:14`).
- **Cross-boundary data flow.** `app.spec.tsx:20-23` asserts the manifest count rendered through
  two library boundaries into the DOM — a real integration assertion, not a smoke test.
- **The API handler's full contract:** status, content type, and timestamp parseability
  (`health.spec.ts:5-16`).

### What is critically untested

| Sev | Gap |
|---|---|
| **Critical** | **`ValueObject` has zero tests** and its `equals` is demonstrably wrong for key order, `undefined` values, and `NaN`. `dive-camera`'s planned `DivePath` will be its first subclass |
| **Critical** | **The licence guard's violation path.** Verified: one negative test moves `world-domain` functions 88.88% → 100%. Today, a refactor that made `assetsMissingAttribution` always return `[]` passes every test |
| **High** | **The entire R3F scene.** Camera, fog, lights, geometry, materials — 0% real coverage behind a stubbed `Canvas`, reported as 100%. `qa-smoke` (Phase 8) is the only planned coverage |
| **High** | **`branded-id.ts` has zero tests.** `brandId` is never called or asserted anywhere |
| **Medium** | **`smoothstep`'s zero-width guard** (`math.ts:24`) — the one uncovered line in the workspace, and the direct cause of the 50% branch figure. Its twin in `remap` is tested |
| **Medium** | **No visual-regression, no browser-based, no a11y-automated tests** exist. No Playwright, no axe, no jest-axe in the tree |
| **Medium** | **The module-boundary rules have no regression test.** They are the architecture's load-bearing guarantee, verified only by manual probes in Phase 2. A `depConstraints` edit that broke them would pass CI silently |
| **Low** | `lerp` outside `[0,1]` — the documented surprising behaviour, unasserted |
| **Low** | `shared-api-interfaces` has no spec and therefore no `test-ci` target. Acceptable for a pure-type library |

### Test quality assessment

**Quality: high. Coverage: thin and unevenly distributed.**

The 20 tests that exist are well-chosen. They assert *behaviour and invariants* rather than
implementation, use property-style iteration where appropriate, cover negative branches in three
of five files, and — unusually — carry comments explaining the business consequence of a failure
(`asset-manifest.spec.ts:29-30`) and the reason for a testing compromise (`app.spec.tsx:5-9`).
There are no snapshot tests, no mock-heavy unit tests asserting call counts, and no tautologies.

The problems are structural rather than qualitative:

1. **Coverage is measured but never enforced** — no thresholds anywhere, and CI does not collect
   it (AP-10).
2. **`coverage.all` is unset**, so a new untested file simply does not appear in the report
   rather than dragging the number down. At the current size this is the difference between a
   real signal and a vanity metric.
3. **The single most important test is half-written** (AP-5).
4. **The mock strategy will break at the next roadmap item** (AP-14).

**Highest-value additions, in order:** (1) the licence-guard negative test — 4 lines, verified
working; (2) `value-object.spec.ts` covering key order / `undefined` / `NaN` — before
`dive-camera`; (3) `smoothstep`'s zero-width case — 1 line; (4) coverage thresholds in every
vitest config; (5) `vi.importActual` in `app.spec.tsx`.

---

## Strengths

### 1. Zero technical-debt markers, zero suppressions, zero `any`

Across 21 source files there is not one `any`, `@ts-ignore`, `@ts-expect-error`,
`eslint-disable`, `TODO`, `FIXME`, `HACK`, or `XXX`. Not one non-null assertion. One type
assertion total, and it is the Nx generator's root-element cast. This is the cleanest signal in
the audit, and at 508 lines it is a *choice* — the shortcuts were available and were not taken.

### 2. Constraints expressed as executable tests rather than documentation

`assetsMissingAttribution` + `asset-manifest.spec.ts:31-33` turn a legal obligation into a build
failure. `asset-manifest.spec.ts:17-25` turns a performance budget into an assertion over the
whole collection. Most projects write these in a README and discover the violation in
production. That this instinct appeared in the *foundation* commit is the strongest predictor in
the audit that quality will hold as the codebase grows.

### 3. Comment quality that answers the reviewer's actual question

This is not "well-commented code" in the usual sense — the density is low and no comment
restates what the code does. Every one answers a *why*:

- `apps/api/src/lib/health.ts:3-8` — why the Fetch shape, and which four runtimes it targets.
- `apps/web/src/app/app.spec.tsx:5-9` — why the mock, why children are excluded, why hoisting
  matters, and where the real coverage will live.
- `eslint.config.mjs:21-24` — why `enforceBuildableLibDependency` is off, pre-empting the
  reviewer who assumes it was forgotten.
- `eslint.config.mjs:79-85` — why bounded-context isolation is *the* rule the forkability goal
  rests on.
- `apps/web/src/app/app.tsx:4-15` — what the file is **not**, and which two roadmap items delete
  it.
- `asset-manifest.ts:30-36` — that the budgets are targets to argue with, not predictions.

### 4. Architecture that is enforced rather than described

Phase 2 verified with four probes that the boundary rules genuinely fire on cross-scope imports,
cross-layer imports, relative-path escapes, and untagged projects — and that untagged projects
are **fail-closed**. Re-running `nx run-many -t lint` for this audit confirms all six projects
pass clean. Whatever else is half-armed, the gate protecting the architecture is fully armed.

### 5. Strict TypeScript adopted deliberately, not by default

`strict`, `noUnusedLocals`, `noImplicitReturns`, `noImplicitOverride`,
`noFallthroughCasesInSwitch`, `isolatedModules`, and `noEmitOnError` are all on. `composite` +
project references are wired correctly and guarded by `nx sync:check` in CI. Cross-library
imports use `import type` (`attribution.ts:1`, `apps/api/src/lib/health.ts:1`), so those edges
erase entirely at build time.

### 6. Genuinely pure inner layers

`math.ts` and `result.ts` have zero imports. No library imports `react`, `three`, or
`@react-three/fiber` — verified. Every module-level constant is deeply `readonly`, nothing is
mutated anywhere in the workspace, and `ValueObject` freezes its props. The domain is testable
without a single mock, which is why the 20 tests run in 1.15 seconds with no setup file.

### 7. Documentation that changes decisions

`docs/asset-inventory.md` is exceptional technical work: measured triangle counts from accessor
data, bounding boxes from `POSITION` min/max, a per-landmark node allowlist, and four findings
that materially rewrite the plan — including that `sbfbb-spongebob_house` is an *interior* with
no pineapple shell, and that name-based node matching selects six wrong buildings sharing a
texture atlas. It states its own methodology and its own second-pass corrections. Most
"documentation" restates the code; this document is a research artefact that the next roadmap
item cannot be executed correctly without.

*(The one criticism — that its measurements never flowed back into `asset-manifest.ts` — is
AP-4, and it is a criticism of the manifest, not of the document.)*

### 8. Dependency discipline

**5** production dependencies, **36** dev, **0** vulnerabilities across 1,162 resolved packages.
Every production dependency is a deliberate stack choice documented in `README.md:52-59`. No
lodash, no moment, no utility grab-bag, no duplicated functionality. The single unused
dependency (`@react-three/drei`, AP-8) is named in the architecture table as a forward choice
rather than left over from a scaffold.

### 9. CI built correctly for the tool in use

`fetch-depth: 0` + `nrwl/nx-set-shas@v4` is the right `nx affected` setup and is commented as
such. `nx sync:check` prevents project-reference drift. Least-privilege permissions and
`cancel-in-progress` concurrency are both correct. The gaps identified above are *missing gates*
on a well-built pipeline — a much better starting position than a wrong one.

---

## Priority Recommendations

Ordered by (impact × how much cheaper it is now than later).

### Do now — one-line or one-config fixes, closing today's real defects

1. **AP-5** — add the licence-guard negative test (4 lines, verified working).
2. **`app.tsx:33`** — add `lang="ar" dir="rtl"` to the Arabic `<h1>`; give `index.html` a real
   `<title>`. Shipped a11y defect, one-line fix.
3. **TS-4** — `"lib": ["es2022", "dom", "dom.iterable"]` in `apps/web/tsconfig.app.json`.
4. **AP-6** — run `prettier --write .`, add `prettier --check .` to CI. 11 files, zero commits;
   the cheapest this will ever be.
5. **S-5** — `licenseUrl` to `https://`. **S-2** — `cache-control: no-store` on `health()`.
   **AP-15** — delete `.mcp.json.bak`.

### Do before the next roadmap item (`world-environment` / `dive-camera`)

6. **AP-1** — enable type-aware linting with `no-floating-promises` and `no-misused-promises` as
   errors. This is the highest-leverage change in the document: the async code it protects
   against does not exist yet, so adoption cost is zero and there is nothing to retrofit.
7. **AP-2 + AP-3** — `--max-warnings=0`, and enable `react/jsx-key` as an error.
8. **TS-1** — enable `noUncheckedIndexedAccess`. Two probe lines fail today; at 5,000 lines it
   will be hundreds.
9. **Error boundary + `<Suspense>`** at the root, as part of `world-environment` rather than
   Phase 8.
10. **`value-object.spec.ts`** covering key order, `undefined`, and `NaN` — before `DivePath`
    subclasses it. Fix the `JSON.stringify` comparison at the same time.
11. **AP-14** — `vi.importActual` in `app.spec.tsx`, before `useFrame` breaks it.
12. **AP-10** — coverage thresholds plus `all: true` in every vitest config; collect coverage in
    CI.

### Do before the libraries they protect are generated

13. **Phase 2 G2** — add the `type:feature-api` constraint before `complaints-api` creates that
    library.
14. **TS-5** — drop `"types": ["node"]` from the three `platform:shared` libraries.
15. **S-4** — decide the input-validation boundary before `complaints-api` is written.
16. **AP-12** — invert `SOURCE_ASSETS` to loaded data before `landmarks/*` copies the shape.

### Schedule into the roadmap items that own them

17. **AP-4** — make `sourceBytes` self-verifying, and reconcile the manifest with
    `docs/asset-inventory.md` (including the `pineapple-house` tier). Belongs to
    `asset-compression`.
18. **AP-9** — bundle-size budget covering JS as well as glTF; `manualChunks` for `three`.
    Belongs to `perf-budget`.
19. **AP-11** — apply `Result` / `AssetId` at their existing call sites, or delete them.
20. **Phase 2 D1/S-3** — a real build target and adapter for `apps/api`. Belongs to
    `deploy-static`.
21. **Phase 2 G7** — commit to the transient-vs-React state split in `dive-camera`, before
    `landmark-kernel` inherits it by accident.

---

## Verdict

| Dimension | Rating |
|---|---|
| Written code quality | **Excellent** — zero suppressions, zero `any`, strict TS, pure inner layers |
| Documentation & intent | **Exceptional** — the strongest dimension by a wide margin |
| Test quality | **High** — every test asserts something real |
| Test coverage | **Thin, unevenly distributed, and mis-reported** by the `web` figure |
| Type-safety configuration | **Incomplete** — three verified gaps with demonstrated consequences |
| Lint enforcement | **Half-armed** — architecture gate on, correctness and a11y gates off |
| Error handling | **Untested, because there is nothing to test yet** — and no net is in place for what arrives next |
| Security | **Clean** — 0 vulnerabilities, no secrets, no injection surface; gaps are deferred by design |
| Build & delivery hygiene | **Weakest area** — unformatted, unsplit, unbudgeted, one app unbuildable |

**Bottom line.** The 508 lines that exist are among the cleanest a foundation commit is likely
to be: no shortcuts taken, no debt markers, no suppressions, and comments that reliably answer
the question a reviewer would ask. The failure mode for this project is not bad code — it is
**good code protected by gates that were installed and left switched off**. Type-aware linting
is unavailable, a11y and hooks findings cannot fail a build, `react/jsx-key` is absent ahead of
list-rendering work, coverage has no threshold, the formatter has already been violated in nine
of twenty-one source files before the first commit, and the one test that enforces the project's
hardest constraint has never executed its failure branch.

Every one of those is a config edit or a four-line test **today**, and a migration **later**.
The window is the next roadmap item.
