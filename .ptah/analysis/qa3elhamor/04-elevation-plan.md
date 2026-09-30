# Elevation Plan — qa3elhamor

Phase 4. Builds on `01-project-profile.md` (stack, structure), `02-architecture-assessment.md`
(patterns, boundaries, coupling), and `03-quality-audit.md` (defects, anti-patterns, coverage).

Every item below references a file that exists in the working tree, and every before/after
snippet was read from the current source rather than reconstructed. Where this document
supplies a number that differs from Phase 3, it was re-measured for this phase and the
difference is stated inline.

---

## How this plan is ordered

Phases 1–3 converged on a single conclusion: **the code is clean; the gates that keep it clean
are switched off.** At 508 lines of first-party TypeScript across 21 files there is almost no
defect debt to pay down. What there is instead is a closing window — every hardening change
here is a config edit or a four-line test *today* and a multi-file migration once
`world-environment`, `dive-camera`, and `landmark-kernel` land.

So the ordering axis is not severity. It is **(impact × how much cheaper this is now than after
the next roadmap item)**. Tier 1 items are things that are broken or missing today and cost
minutes. Tier 4 items are the genuine engineering the roadmap already owns.

Two hard deadlines drive the sequencing:

| Deadline | Items that must land first | Why |
|---|---|---|
| Before `world-environment` (Phase 3 roadmap) | #6, #7, #8, #12, #13 | `useGLTF` introduces async, suspense, and error paths simultaneously. Type-aware lint, error boundary, and a working test mock have to exist before the code they protect. |
| Before `landmarks/*` and `complaints-*` libraries are generated | #17, #18, #21 | `type:feature-api` boundary coverage and the data-vs-source inversion are cheap before the shape is copied and expensive after. |

---

## Priority Tier 1: Quick Wins (< 1 hour each)

---

### 1. Add `lang="ar" dir="rtl"` to the Arabic heading, and a real document title

**What and why.** `apps/web/src/app/app.tsx:33` renders `<h1>قاع الهامور</h1>` inside a document
that declares `lang="en"` (`apps/web/index.html:2`). A screen reader announces the Arabic with an
English voice — this is a live accessibility defect shipping today, not a future gap. The
`jsx-a11y` ruleset that is installed cannot detect it. The title is still the Nx generator's
`<title>Web</title>`.

Phase 2 raised this as G8; Phase 3 raised it to **High** precisely because it is not deferred
work — it is a defect in code that exists. `i18n-bilingual` is scheduled for Phase 6; the Arabic
is in the DOM now.

**Files.** `apps/web/src/app/app.tsx:33`, `apps/web/index.html:2,5`

**Before**

```tsx
// apps/web/src/app/app.tsx:32-38
<aside className="scaffold-note">
  <h1>قاع الهامور</h1>
  <p>
    Foundation scaffold — {SOURCE_ASSETS.length} models manifested, {budgetMb} MB
    compressed budget. See <code>.ptah/roadmap.md</code> for what comes next.
  </p>
</aside>
```

```html
<!-- apps/web/index.html:5 -->
<title>Web</title>
```

**After**

```tsx
// apps/web/src/app/app.tsx
<aside className="scaffold-note">
  <h1 lang="ar" dir="rtl">قاع الهامور</h1>
  <p>
    Foundation scaffold — {SOURCE_ASSETS.length} models manifested, {budgetMb} MB
    compressed budget. See <code>.ptah/roadmap.md</code> for what comes next.
  </p>
</aside>
```

```html
<!-- apps/web/index.html -->
<title>قاع الهامور — Qaa El-Hamour</title>
<meta name="description" content="A scroll-driven dive through Qaa El-Hamour." />
```

**Expected impact.** Correct pronunciation and bidirectional rendering for the one piece of
Arabic that ships today. Establishes the per-element `lang`/`dir` convention that
`i18n-bilingual` will apply at scale, so that item starts from a pattern rather than a
retrofit. Sets the shared-link and browser-tab identity to the project name rather than `Web`.

> Use the **qaa-elhamour-art-direction** skill before finalising the title string and any
> user-facing Arabic — it owns the naming and bilingual copy decisions for this project.

---

### 2. Add the licence-guard negative test

**What and why.** `assetsMissingAttribution` is the mechanism the README advertises as the
CC-BY-4.0 safety net, and its failure path has **never executed**. `asset-manifest.spec.ts:31-33`
asserts only the happy path (`toEqual([])`), so the `.map()` callback inside the function body is
dead in the current suite. Phase 3 verified that adding one negative test moves `world-domain`
function coverage from 88.88% (8/9) to 100% (9/9).

The consequence is concrete: a refactor that made `assetsMissingAttribution` unconditionally
return `[]` would pass all 20 existing tests while silently disabling the project's stated
hardest constraint — a legal shipping requirement.

This is the single highest value-per-line change in the plan.

**Files.** `libs/world/domain/src/lib/asset-manifest.spec.ts:28-41`

**Before**

```ts
// libs/world/domain/src/lib/asset-manifest.spec.ts:28-33
describe('attribution', () => {
  // CC-BY-4.0 requires visible credit for every bundled model. If this fails, the site
  // cannot ship: an asset was added without its licence obligation.
  it('has a credit for every bundled asset', () => {
    expect(assetsMissingAttribution()).toEqual([]);
  });
```

**After**

```ts
describe('attribution', () => {
  // CC-BY-4.0 requires visible credit for every bundled model. If this fails, the site
  // cannot ship: an asset was added without its licence obligation.
  it('has a credit for every bundled asset', () => {
    expect(assetsMissingAttribution()).toEqual([]);
  });

  // Guards the guard: without this, a refactor that always returned [] would pass the
  // test above and silently disable the licence check.
  it('reports an asset that has no credit', () => {
    const rogue = [...SOURCE_ASSETS, { ...SOURCE_ASSETS[0], id: 'no-credit' }];
    expect(assetsMissingAttribution(rogue)).toEqual(['no-credit']);
  });
```

**Expected impact.** `world-domain` function coverage 88.88% → 100%. The project's only
legal-obligation gate becomes refactor-proof. Four lines.

---

### 3. Fix the `lib` clobber in the web app's tsconfig

**What and why.** `apps/web/tsconfig.app.json:7` sets `"lib": ["dom"]`. TypeScript's `lib`
**replaces** rather than merges, so the base `["es2022"]` from `tsconfig.base.json:8` is dropped
and the web app compiles against pre-ES2022 lib types. Verified independently in both Phase 2
(G1) and Phase 3 (TS-4): `[1,2].at(0)` and `Object.hasOwn({a:1},'a')` both fail with `TS2550`
in `apps/web`, while `target` stays `es2022` so both would emit and run fine in every browser
the project targets.

No current code uses an ES2022 built-in, which is why CI is green. The first developer who
reaches for `.at()`, `Object.hasOwn`, or `Array.prototype.findLast` gets an error message
suggesting they *downgrade* their code.

**Files.** `apps/web/tsconfig.app.json:7`

**Before**

```jsonc
// apps/web/tsconfig.app.json:3-13
"compilerOptions": {
  "outDir": "dist",
  "tsBuildInfoFile": "dist/tsconfig.app.tsbuildinfo",
  "jsx": "react-jsx",
  "lib": ["dom"],
  "types": ["node", "@nx/react/typings/cssmodule.d.ts", "@nx/react/typings/image.d.ts", "vite/client"],
  ...
```

**After**

```jsonc
"compilerOptions": {
  "outDir": "dist",
  "tsBuildInfoFile": "dist/tsconfig.app.tsbuildinfo",
  "jsx": "react-jsx",
  // `lib` replaces rather than merges, so the base ["es2022"] must be repeated here.
  "lib": ["es2022", "dom", "dom.iterable"],
  "types": ["node", "@nx/react/typings/cssmodule.d.ts", "@nx/react/typings/image.d.ts", "vite/client"],
  ...
```

**Expected impact.** Modern built-ins become usable in the app that most needs them (the R3F
scene code is the ES2022-heaviest code the project will write). `dom.iterable` additionally
unlocks `for…of` over `NodeList`/`FormData`, which `complaints-wall` will want. Zero risk — no
existing code changes behaviour.

---

### 4. Run Prettier once and add the check to CI

**What and why.** `.prettierrc` and `.prettierignore` exist; nothing consumes them. There is no
`format` target, no npm script, and no CI step. Re-measured for this phase:
**`prettier --check .` fails on 27 files**, up from the 11 Phase 3 recorded — the difference is
that the count now includes `assets/**/scene.gltf` (four large machine-generated model files
that should never be formatted) and several markdown documents.

That is the second finding: `.prettierignore` does not exclude `assets/`. Formatting a 495 KB
generated glTF is both pointless and destructive to the diff.

Nine of 21 first-party source files are already drifted **in a repository with zero commits**.
This is the cheapest this fix will ever be.

**Files.** `.prettierignore`, `package.json:5` (empty `scripts`), `.github/workflows/ci.yml`

**Before**

```
# .prettierignore
# Add files here to ignore them from prettier formatting
/dist
/coverage
/.nx/cache
/.nx/workspace-data
.nx/self-healing
```

```jsonc
// package.json:5
"scripts": {},
```

**After**

```
# .prettierignore
# Add files here to ignore them from prettier formatting
/dist
/coverage
/.nx/cache
/.nx/workspace-data
.nx/self-healing

# Machine-generated model data — formatting these produces enormous meaningless diffs.
/assets/**/*.gltf
/assets/**/*.bin
package-lock.json
```

```jsonc
// package.json
"scripts": {
  "format": "prettier --write .",
  "format:check": "prettier --check ."
},
```

```yaml
# .github/workflows/ci.yml — after the `npx nx sync:check` step
      - run: npm run format:check
```

Then run `npm run format` once and commit the result as a standalone formatting commit.

**Expected impact.** Formatting stops being a review topic permanently. Because this lands
before the first commit, there is no blame-history cost — the alternative is a repo-wide
reformat later that pollutes `git blame` for every file.

**Related cleanup, same sitting:** `eslint-config-prettier` is a declared devDependency
(`package.json:30`) imported by **none** of the seven ESLint configs (AP-6). Either wire it into
the root flat config as the last entry, or remove the dependency. Given #6 adds a real config
block anyway, wire it in there.

---

### 5. Delete `.mcp.json.bak` and ignore `*.bak`

**What and why.** `.mcp.json.bak` (145 B) exists on disk, is **not** matched by any `.gitignore`
rule — confirmed by grep for this phase — and will therefore be swept into the first commit.
It contains no literal secret (`FIRECRAWL_API_KEY` is a `${VAR}` reference, which is the correct
pattern), so this is hygiene rather than exposure. But a `.bak` copy of a config that holds an
env-var slot is exactly the file most likely to acquire a pasted key during a debugging session,
and once it is tracked that paste is permanent history.

**Files.** `.mcp.json.bak`, `.gitignore`

**Before** — no `*.bak` entry anywhere in `.gitignore`.

**After**

```gitignore
# .gitignore — alongside the existing editor/OS entries
*.bak
*.orig
*.rej
```

and `rm .mcp.json.bak`.

**Expected impact.** Removes the highest-probability future secret-leak vector from a repository
that currently has none. Closes S-7 and AP-15.

---

### 6. Enable type-aware linting with `no-floating-promises` as an error

**What and why.** This is the **highest-leverage change in the entire plan**, and it belongs in
Tier 1 only because the edit itself is ten lines.

`typescript-eslint@^8.58.0` is installed (`package.json:41`) and the `@nx` TypeScript preset is
applied, but **no config in the workspace sets `parserOptions.project` or `projectService`** —
verified across all seven ESLint configs. Without it the entire type-checked rule set is
unavailable: `no-floating-promises`, `no-misused-promises`, `await-thenable`, `require-await`,
`no-unsafe-assignment`, `no-unsafe-argument`, `no-unsafe-return`, `no-unnecessary-condition`.

Phase 3 verified by probe: a file containing a floating promise, an empty `catch`, an unused
local, and a `useEffect` with a missing dependency produced **two warnings and zero errors**,
and `nx run web:lint` printed *"Successfully ran target lint"*.

Why now specifically: the next four roadmap items are `useGLTF` async loading
(`world-environment`), scroll-driven async camera work (`dive-camera`), and a `fetch`-based
submission flow (`complaints-api`, `complaints-wall`). Floating and misused promises are the
dominant defect class in exactly that code. **Adoption cost today is zero because there is no
async code to retrofit.** After `world-environment` there will be.

**Files.** `eslint.config.mjs:136-149` (the dead placeholder block)

**Before**

```js
// eslint.config.mjs:136-149 — an empty rules object over eight globs, adding nothing
  {
    files: [
      '**/*.ts', '**/*.tsx', '**/*.cts', '**/*.mts',
      '**/*.js', '**/*.jsx', '**/*.cjs', '**/*.mjs',
    ],
    // Override or add rules here
    rules: {},
  },
];
```

**After**

```js
import nx from '@nx/eslint-plugin';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  // ... ignores block and the enforce-module-boundaries block are unchanged ...

  // Type-aware linting. `projectService` resolves each file to its owning tsconfig, which is
  // what makes the rules below able to see types at all. Without this block the entire
  // type-checked rule set silently does not run.
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
  })),
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // The two rules this whole block exists for. `useGLTF`, the dive camera, and the
      // complaints fetch all land in the next four roadmap items; a dropped promise in
      // any of them fails silently at runtime with no stack trace back to the call site.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
    },
  },

  // Must be last: turns off every stylistic rule Prettier already owns.
  prettierConfig,
];
```

**Expected impact.** Eight type-checked rule families become available across the workspace, two
of them as build-failing errors. Lint runtime increases (type information must be built) but at
21 files that is negligible, and Nx caches lint results per project. Closes AP-1 (Critical) and
the "unhandled promise rejections" High finding, and consumes the dead `eslint-config-prettier`
dependency from #4 in the same edit.

---

### 7. Make warnings fail, and enable `react/jsx-key`

**What and why.** Two separate half-armed gates, one fix sitting.

**(a)** `.github/workflows/ci.yml:39` runs lint without `--max-warnings=0`. `eslint .` exits 0 on
warnings, so every `jsx-a11y` and `react-hooks/exhaustive-deps` finding is advisory. Verified by
two independent probes in Phase 3. The project has an `a11y-fallback` roadmap item and an
accessibility ruleset that **cannot fail a build**.

**(b)** `react/jsx-key` is not enabled — verified by probe, `items.map((i) => <span>{i}</span>)`
with no key produces **no diagnostic at all**; the Nx React preset does not ship it.

(b) matters more here than in an ordinary React app. `landmark-kernel` and `complaints-wall` are
both list renderers over an R3F tree. A missing key does not merely warn in the console — React
reconciles the **wrong three.js object**, so landmarks swap geometry or materials on state
change. That presents as a rendering glitch and is extremely hard to trace back to a missing
prop.

There is also an ordering bug in the same file: `apps/web/eslint.config.mjs:5-6` spreads
`nx.configs['flat/react']` **before** `baseConfig`. In flat config later blocks win, so any rule
the base presets set silently overrides the React preset's version of it — the reverse of the
intent.

**Files.** `apps/web/eslint.config.mjs`, `.github/workflows/ci.yml:39`

**Before**

```js
// apps/web/eslint.config.mjs
export default [
  ...nx.configs['flat/react'],
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    // Override or add rules here
    rules: {},
  },
];
```

**After**

```js
export default [
  // Base first, React second: in flat config later blocks win, and the React preset's
  // versions of shared rules are the ones this app wants.
  ...baseConfig,
  ...nx.configs['flat/react'],
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      // A missing key in an R3F list makes React reconcile the wrong three.js object —
      // landmarks swap geometry on state change. `landmark-kernel` and `complaints-wall`
      // are both list renderers.
      'react/jsx-key': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'jsx-a11y/alt-text': 'error',
    },
  },
];
```

```yaml
# .github/workflows/ci.yml:39
      - run: npx nx affected -t lint typecheck test --parallel=3 -- --max-warnings=0
```

**Expected impact.** Accessibility and hooks findings become build failures instead of console
noise. The `react/jsx-key` rule lands *before* any list-rendering code exists, which is the only
time it costs nothing. Closes AP-2 and AP-3 (both High).

---

### 8. Enable `noUncheckedIndexedAccess`

**What and why.** Off today, with a **demonstrated runtime crash path** — verified in Phase 3:

```ts
creditLine(ATTRIBUTIONS['does-not-exist']);   // tsc exit 0 → TypeError at runtime
SOURCE_ASSETS[99].budgetBytes;                // tsc exit 0 → TypeError at runtime
```

`ATTRIBUTIONS` is typed `Readonly<Record<string, Attribution>>` (`attribution.ts:40`), so **any**
string indexes it as a guaranteed-present `Attribution`. The pattern already appears in test code
at `asset-manifest.spec.ts:36` (`creditLine(ATTRIBUTIONS['pineapple-house'])`), and it is exactly
the code `asset-attribution-ui` will write when it renders credits by asset id.

At 508 lines the flag produces a handful of errors. At 5,000 it will produce hundreds, and by
then the unchecked-index idiom will be established.

**Files.** `tsconfig.base.json`, plus the two call sites the flag surfaces.

**Before**

```jsonc
// tsconfig.base.json:11-18
"noEmitOnError": true,
"noFallthroughCasesInSwitch": true,
"noImplicitOverride": true,
"noImplicitReturns": true,
"noUnusedLocals": true,
"skipLibCheck": true,
"strict": true,
```

**After**

```jsonc
"noEmitOnError": true,
"noFallthroughCasesInSwitch": true,
"noImplicitOverride": true,
"noImplicitReturns": true,
"noUncheckedIndexedAccess": true,
"noUnusedLocals": true,
"skipLibCheck": true,
"strict": true,
```

The one production call site that needs adjusting is the spec at `asset-manifest.spec.ts:36`,
which becomes:

```ts
it('renders the credit string the licence mandates', () => {
  const attribution = ATTRIBUTIONS['pineapple-house'];
  expect(attribution).toBeDefined();
  const line = creditLine(attribution!);
  // ...
});
```

— or, better, is superseded entirely by item #21, which types `ATTRIBUTIONS` over a literal id
union and makes the lookup total.

**Expected impact.** Two verified crash paths become compile errors. Every future
`assets[i]` / `record[key]` access in scene and content code is forced to acknowledge the
undefined case. Closes TS-1 (High).

---

### 9. `licenseUrl` to HTTPS, `cache-control` on the health handler

**What and why.** Two unrelated one-line security/correctness fixes, grouped because together
they are under ten minutes.

**(a) S-5.** `attribution.ts:32` hardcodes `http://creativecommons.org/licenses/by/4.0/`. When
`asset-attribution-ui` renders that as an `href` on an HTTPS site it is mixed content — browsers
upgrade or block it. Creative Commons serves both schemes.

**(b) S-2.** `apps/api/src/lib/health.ts:15-18` returns a body containing
`new Date().toISOString()` with only a `content-type` header. Behind any CDN — which is exactly
where a static-hosted serverless function sits — a heuristic-cached response reports a frozen
`checkedAt` indefinitely, making the endpoint useless for its one purpose.

**Files.** `libs/world/domain/src/lib/attribution.ts:32`, `apps/api/src/lib/health.ts:9-19`

**Before**

```ts
// libs/world/domain/src/lib/attribution.ts:30-33
const CC_BY_4 = {
  license: 'CC-BY-4.0',
  licenseUrl: 'http://creativecommons.org/licenses/by/4.0/',
} as const;
```

```ts
// apps/api/src/lib/health.ts:9-19
export const health = (): Response => {
  const body: HealthResponse = {
    status: 'ok',
    checkedAt: new Date().toISOString(),
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
```

**After**

```ts
const CC_BY_4 = {
  license: 'CC-BY-4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
} as const;
```

```ts
// `_request` is accepted but unused: several hosts require the (req) => Response shape, and
// adding the parameter now costs nothing while changing it later touches every call site.
export const health = (_request?: Request): Response => {
  const body: HealthResponse = {
    status: 'ok',
    checkedAt: new Date().toISOString(),
  };

  // The body embeds a timestamp. Without no-store a CDN heuristic-caches it and the endpoint
  // reports a frozen checkedAt forever.
  return Response.json(body, {
    status: 200,
    headers: { 'cache-control': 'no-store' },
  });
};
```

**Expected impact.** Removes a mixed-content warning before the UI that would trigger it is
written. Makes the health endpoint actually report health. `Response.json()` is available in all
four runtimes named in the file's own comment (`health.ts:3-8`) and removes the manual
`JSON.stringify` + header pairing as handlers multiply.

Note: `health.spec.ts` asserts status, content type, and timestamp parseability — `Response.json()`
sets `content-type: application/json` automatically, so that assertion continues to pass.

---

### 10. Cover `smoothstep`'s zero-width guard and `lerp`'s documented extrapolation

**What and why.** `math.ts:24` is the **only uncovered line in the workspace** and the sole cause
of `shared-util`'s 50% branch coverage (3/6). The structurally identical guard in `remap:17` *is*
tested (`math.spec.ts:21-23`) — the pair was clearly written together and only one got a test.

Separately, `lerp` is documented at `math.ts:5` as *"where `t` is unclamped"* — the one behaviour
its own doc comment flags as surprising — and `math.spec.ts:11-14` covers only `t = 0` and
`t = 0.5`. The documented surprise is unasserted.

These functions run 60×/second inside `useFrame` once `dive-camera` lands, and `smoothstep` is
described in its own comment as *"the standard easing curve for scroll-driven motion"* — it is
the single most load-bearing function in `shared-util` for the next roadmap phase.

**Files.** `libs/shared/util/src/lib/math.spec.ts`

**After** (additions)

```ts
it('returns a step at a zero-width edge rather than dividing by zero', () => {
  expect(smoothstep(5, 5, 4)).toBe(0);
  expect(smoothstep(5, 5, 5)).toBe(1);
  expect(smoothstep(5, 5, 6)).toBe(1);
});

// lerp is documented as unclamped — this is the behaviour dive-camera relies on for
// overshoot easing, so it is asserted rather than assumed.
it('extrapolates outside [0, 1]', () => {
  expect(lerp(0, 10, 2)).toBe(20);
  expect(lerp(0, 10, -1)).toBe(-10);
});
```

**Expected impact.** `shared-util` branch coverage 50% → 100%, statements 92.85% → 100%. Removes
the workspace's only uncovered line. Six lines of test.

---

### 11. Delete dead Nx and Vite config

**What and why.** Three small pieces of misleading configuration.

**(a)** `nx.json:59-62` sets `targetDefaults.test.dependsOn: ["^build"]`. Verified in both Phase
2 (D5) and Phase 3: **no dependency of any project has a `build` target** — `nx build api` fails
with *"Cannot find configuration for task api:build"*, and the four libraries are source-consumed
by design. It is a harmless no-op today and a misleading one tomorrow, because it implies a
build-before-test contract that does not exist.

**(b)** `apps/web/vite.config.mts:17-20` carries a commented-out `worker` block left over from
the Nx generator.

**(c)** `vitest.config.ts` at the root triggers a Vite 8 warning on every test run:
*"ESM syntax in a file loaded as CommonJS"*. Renaming to `.mts` fixes it — and the file's own
`projects` globs at `:6-9` already list `.mts` as a valid extension, so the rename needs no
other change.

**Files.** `nx.json:59-62`, `apps/web/vite.config.mts:17-20`, `vitest.config.ts`

**Before**

```jsonc
// nx.json:58-63
"analytics": false,
"targetDefaults": {
  "test": {
    "dependsOn": ["^build"]
  }
},
```

**After**

```jsonc
"analytics": false,
```

Plus: delete the commented `worker` block, and `git mv vitest.config.ts vitest.config.mts`.

**Expected impact.** Removes one silently-inapplicable config contract and one recurring build
warning. If a real build target lands for `apps/api` (item #24), the `dependsOn` can be
reintroduced then — scoped to where it actually applies.

**Related, same sitting:** five of the six Vite/Vitest configs still use `__dirname`, producing a
Vite 8 deprecation warning each — **five warnings on every test run**. `apps/web/vite.config.mts:6`
already uses `import.meta.dirname` correctly. Bring the other five into line.

---

## Priority Tier 2: Small Improvements (1–4 hours each)

---

### 12. Root error boundary + `<Suspense>`, before `useGLTF` arrives

**What and why.** There is no `ErrorBoundary` anywhere in the workspace and no `<Suspense>`.
`main.tsx:9-13` renders `<App />` bare. In an R3F application this matters more than in ordinary
React, for three distinct reasons Phase 3 enumerated:

1. A WebGL context-creation failure throws during `<Canvas>` mount and takes down the whole tree
   — **including the HTML overlay that could have explained why**. The user gets a white page.
2. `useGLTF` throws for **both** states: a promise while loading (needs `<Suspense>`) and an
   error on failure (needs a boundary). `world-environment` — the very next roadmap item —
   introduces both simultaneously, and neither handler exists.
3. There is no `<noscript>` and no WebGL capability check. A device without WebGL gets a blank
   page. `a11y-fallback` is scheduled for **Phase 8**, the last phase — which is very late for
   the property that decides whether the site renders at all.

The cost is roughly 40 lines now versus a debugging session per incident later, and the whole
point is that it must exist *before* the async code, not after.

**Files.** new `apps/web/src/app/scene-boundary.tsx`, `apps/web/src/main.tsx`,
`apps/web/src/app/app.tsx:19-30`

**Before**

```tsx
// apps/web/src/main.tsx:9-13
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

```tsx
// apps/web/src/app/app.tsx:19-30
return (
  <div className="shell">
    <Canvas camera={{ position: [0, 1.5, 6], fov: 55 }}>
      <color attach="background" args={['#0a1e3f']} />
      ...
    </Canvas>
```

**After**

```tsx
// apps/web/src/app/scene-boundary.tsx  (new)
import { Component, type ReactNode } from 'react';

/**
 * Catches WebGL context-creation failures and glTF load errors so the HTML overlay survives
 * a scene failure. Without this a throw inside <Canvas> unmounts the whole tree, including
 * the copy that would have explained what went wrong.
 *
 * `a11y-fallback` extends the fallback below into the full reduced-motion / non-WebGL
 * experience; this is the minimum that keeps a failure legible.
 */
export class SceneBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
```

```tsx
// apps/web/src/app/app.tsx
import { Suspense } from 'react';
import { SceneBoundary } from './scene-boundary.js';

return (
  <div className="shell">
    <SceneBoundary fallback={<div className="scene-fallback" />}>
      {/* Suspense is required before useGLTF lands in `world-environment`: the loader
          throws a promise while fetching and an error on failure. */}
      <Suspense fallback={null}>
        <Canvas camera={{ position: [0, 1.5, 6], fov: 55 }}>
          <color attach="background" args={[OCEAN_DEEP]} />
          ...
        </Canvas>
      </Suspense>
    </SceneBoundary>

    <aside className="scaffold-note">…</aside>
  </div>
);
```

Note the structural decision: the boundary wraps **only** the `<Canvas>`, not the `<aside>`. That
is what makes a WebGL failure degrade to "overlay without scene" rather than "blank page".

Add to `index.html` in the same sitting:

```html
<noscript>
  <p>This site renders a 3D dive and requires JavaScript.</p>
</noscript>
```

**Expected impact.** Converts the two most likely production failure modes (no WebGL, failed
asset fetch) from a white screen into a degraded-but-legible page. Pulls the load-bearing half
of `a11y-fallback` from Phase 8 to now, where it costs 40 lines instead of a retrofit through
every landmark component.

> Use the **r3f-scene-patterns** skill for the Suspense/preload wiring `world-environment` will
> layer on top of this.

---

### 13. Fix the R3F module mock before `useFrame` breaks it

**What and why.** `apps/web/src/app/app.spec.tsx:10-12` replaces `@react-three/fiber` wholesale
with a factory containing **only** `Canvas`. Every other export — `useFrame`, `useThree`,
`useLoader`, `extend` — becomes `undefined`. The moment any component in the tree imports one,
this suite fails with an unhelpful *"not a function"* rather than a missing-mock error.

`dive-camera` and `world-environment` are both `useFrame`-based. This breaks at the **next
roadmap item**, and it breaks in a way that looks like a bug in the new code rather than a stale
mock.

There is a second, subtler problem Phase 3 verified: `web`'s reported **100% coverage is an
artefact**. `app.tsx` measures `{"statements": 2, "covered": 2}` — the whole 43-line component is
2 measurable statements because the JSX children never evaluate behind the stubbed `Canvas`.
Camera, fog, lights, and geometry are at genuinely 0% coverage while the report says 100%.

**Files.** `apps/web/src/app/app.spec.tsx:5-12`

**Before**

```tsx
// apps/web/src/app/app.spec.tsx:10-12
vi.mock('@react-three/fiber', () => ({
  Canvas: () => <div data-testid="canvas" />,
}));
```

**After**

```tsx
// jsdom has no WebGL context, so the R3F canvas cannot mount here. Stub *only* Canvas and
// keep every other export real, so that useFrame/useThree/useLoader still resolve when
// `world-environment` and `dive-camera` introduce them. Children are deliberately not
// rendered — three.js primitives are not DOM elements and React warns on every one.
//
// Consequence to keep in mind: the scene subtree is unmeasured here. `web`'s coverage
// number reflects the DOM overlay only; real scene coverage lives in `qa-smoke`.
vi.mock('@react-three/fiber', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@react-three/fiber')>()),
  Canvas: () => <div data-testid="canvas" />,
}));
```

**Expected impact.** The suite survives the next two roadmap items instead of failing on the
first `useFrame` import with a misleading error. The updated comment prevents the next reader
from misreading `web`'s 100% as scene coverage. Closes AP-14.

---

### 14. Coverage thresholds and `all: true` in every Vitest config

**What and why.** v8 coverage is configured in all six project configs with **no `thresholds`
block anywhere**, and CI never requests coverage at all. Coverage can go to zero without any
signal.

Worse, `coverage.all` is unset, so a new untested file simply **does not appear in the report**
rather than dragging the number down. At the current size that is the difference between a real
signal and a vanity metric — `value-object.ts` and `branded-id.ts` have zero tests and are
currently invisible in the aggregate.

The thresholds below are set from **measured current values** so they ratchet rather than block:
`shared-domain` 100/100/100, `shared-util` 92.85/50/100 (100/100/100 after item #10),
`world-domain` 95/100/88.88 (→ ~100 after item #2), `api` 100.

**Files.** all six `vite.config.mts` / `vitest.config.mts` files, `.github/workflows/ci.yml`

**Before**

```ts
// apps/web/vite.config.mts:36-39
coverage: {
  reportsDirectory: './test-output/vitest/coverage',
  provider: 'v8' as const,
},
```

**After**

```ts
coverage: {
  reportsDirectory: './test-output/vitest/coverage',
  provider: 'v8' as const,
  // `all` makes an untested file report 0% instead of vanishing from the report.
  all: true,
  include: ['src/**/*.{ts,tsx}'],
  thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
},
```

For the library configs, set the thresholds at their measured values (100/100/100 for
`shared-domain` and `shared-util`-after-#10) so a regression is a build failure rather than a
slow slide.

`apps/web` is the exception: leave it at the 80 default and **document why** — its number is
structurally capped by the stubbed `Canvas` (#13), and raising it would only pressure the team
into writing meaningless overlay tests. Real scene coverage is `qa-smoke`'s job.

```yaml
# .github/workflows/ci.yml — replace the test invocation
      - run: npx nx affected -t lint typecheck test-ci --parallel=3 -- --max-warnings=0
```

Note this also switches from `-t test` to the purpose-built `test-ci` target, which exists
(`nx.json:53`) and is currently unused.

**Expected impact.** Coverage becomes a ratchet instead of a report. Untested new files
immediately drag the number down rather than hiding. Closes AP-10.

---

### 15. Test `ValueObject` and fix its structural comparison

**What and why.** `libs/shared/domain/src/lib/value-object.ts` is 17 lines, has **zero tests**,
and its `equals` is demonstrably wrong in four ways — all traced to the `JSON.stringify`
comparison at `:15`:

| Bug | Example | Result |
|---|---|---|
| Key-order sensitive | `{a:1,b:2}` vs `{b:2,a:1}` | unequal — but they are structurally identical |
| `undefined` dropped | `{a:1,b:undefined}` vs `{a:1}` | equal — but they are not |
| `NaN` → `null` | `{x:NaN}` vs `{x:NaN}` | equal — arguably right, but by accident |
| `Date`/`Map`/`Set` props | any | serialises to a string or `{}` |

`Object.freeze(this.props)` at `:9` is also **shallow** — the class advertises immutability but
`vo.props.nested.field = 1` succeeds. For a `DivePath` holding an array of control points, the
array contents remain mutable.

The forcing point is explicit: `dive-camera` plans *"a `DivePath` value object over a CatmullRom
spline"*. Spline control points are `{x,y,z}` objects, possibly carrying `NaN` from a degenerate
curve — **the exact shape where all four bugs bite**, in the first subclass this base class will
ever have.

Also `:13` — `if (other === undefined || other === null)` — the `=== null` half is unreachable
under the declared signature `other?: ValueObject<TProps>` with `strict` on. Defensive code for a
case the compiler already excludes.

**Files.** `libs/shared/domain/src/lib/value-object.ts`, new
`libs/shared/domain/src/lib/value-object.spec.ts`

**Before**

```ts
// libs/shared/domain/src/lib/value-object.ts:7-17
export abstract class ValueObject<TProps extends object> {
  protected constructor(protected readonly props: Readonly<TProps>) {
    Object.freeze(this.props);
  }

  equals(other?: ValueObject<TProps>): boolean {
    if (other === undefined || other === null) return false;
    if (other.constructor !== this.constructor) return false;
    return JSON.stringify(this.props) === JSON.stringify(other.props);
  }
}
```

**After**

```ts
/**
 * Structural deep equality. Replaces a JSON.stringify comparison, which was key-order
 * sensitive, dropped undefined-valued keys, and could not see through Date/Map/Set —
 * all four of which appear in spline control points, the first planned subclass.
 */
const structurallyEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const aKeys = Object.keys(a as object);
  const bKeys = Object.keys(b as object);
  if (aKeys.length !== bKeys.length) return false;

  return aKeys.every(
    (key) =>
      Object.hasOwn(b as object, key) &&
      structurallyEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key]
      )
  );
};

/** Deep-freezes so a nested array or object in props cannot be mutated after construction. */
const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
};

export abstract class ValueObject<TProps extends object> {
  protected constructor(protected readonly props: Readonly<TProps>) {
    deepFreeze(this.props);
  }

  equals(other?: ValueObject<TProps>): boolean {
    if (other === undefined) return false;
    if (other.constructor !== this.constructor) return false;
    return structurallyEqual(this.props, other.props);
  }
}
```

```ts
// libs/shared/domain/src/lib/value-object.spec.ts  (new)
import { describe, expect, it } from 'vitest';
import { ValueObject } from './value-object.js';

class Point extends ValueObject<{ x: number; y: number }> {
  static of(x: number, y: number) { return new Point({ x, y }); }
}
class Other extends ValueObject<{ x: number; y: number }> {
  static of(x: number, y: number) { return new Other({ x, y }); }
}

describe('ValueObject', () => {
  it('is insensitive to property insertion order', () => {
    expect(new (Point as never)({ x: 1, y: 2 })).toBeDefined();
    expect(Point.of(1, 2).equals(new (Point as never)({ y: 2, x: 1 }))).toBe(true);
  });

  it('distinguishes an undefined-valued key from a missing one', () => {
    // The JSON.stringify comparison this replaced reported these equal.
    expect(Point.of(1, Number.NaN).equals(Point.of(1, Number.NaN))).toBe(true);
  });

  it('is unequal across classes with identical props', () => {
    expect(Point.of(1, 2).equals(Other.of(1, 2) as never)).toBe(false);
  });

  it('is unequal to undefined', () => {
    expect(Point.of(1, 2).equals(undefined)).toBe(false);
  });

  it('deep-freezes nested props', () => {
    const p = Point.of(1, 2);
    expect(Object.isFrozen(p['props'])).toBe(true);
  });
});
```

**Expected impact.** The base class `dive-camera` is about to subclass acquires a correct
comparison and a test suite, before rather than after. `shared-domain` gains coverage of the one
file that had none. Closes the Critical "ValueObject has zero tests" gap and Phase 2's B3.

---

### 16. Move the byte formatter into `shared-util` and close the phantom dependency

**What and why.** Two findings that fix each other.

`apps/web/package.json:7` declares `"@qa3elhamor/shared-util": "workspace:*"`, and
`apps/web/tsconfig.app.json:40` carries a TS project reference to it. **Zero files under `apps/`
import it** — verified in both Phase 2 (D2) and Phase 3. The Nx graph reports the edge as
`static` because it is derived from `package.json`, so `nx affected` rebuilds and retests `web`
on any `shared-util` change that cannot possibly affect it.

Meanwhile `app.tsx:17` does `(totalBudgetBytes() / (1024 * 1024)).toFixed(1)` inline — a
byte-formatting helper in the composition root, in a project where `shared-util` exists precisely
for pure numeric helpers and is already a declared dependency with nothing behind it.

Fixing the second closes the first as a side effect, and the helper is needed anyway:
`asset-attribution-ui`, `perf-budget`, and any asset-loading progress UI all format bytes.

**Files.** `libs/shared/util/src/lib/format.ts` (new), `libs/shared/util/src/index.ts`,
`apps/web/src/app/app.tsx:17`

**Before**

```tsx
// apps/web/src/app/app.tsx:16-17
export function App() {
  const budgetMb = (totalBudgetBytes() / (1024 * 1024)).toFixed(1);
```

**After**

```ts
// libs/shared/util/src/lib/format.ts  (new)
const MB = 1024 * 1024;

/**
 * Bytes as megabytes to one decimal place, without a unit suffix.
 *
 * Kept here rather than at a call site because `asset-attribution-ui`, `perf-budget`, and
 * the loader progress UI all render byte counts, and a divergent rounding rule between them
 * reads as a bug in the budget numbers.
 */
export const bytesToMb = (bytes: number, precision = 1): string =>
  (bytes / MB).toFixed(precision);
```

```ts
// libs/shared/util/src/index.ts
export * from './lib/math.js';
export * from './lib/format.js';
```

```tsx
// apps/web/src/app/app.tsx
import { bytesToMb } from '@qa3elhamor/shared-util';

export function App() {
  const budgetMb = bytesToMb(totalBudgetBytes());
```

Add a spec alongside covering rounding and the zero case.

**Expected impact.** The declared `web → shared-util` edge becomes real, so `nx affected` stops
overstating coupling. A formatting rule that three future roadmap items need gets one home.
Closes D2 and the corresponding `app.tsx` Low finding.

---

### 17. Add the missing `type:feature-api` boundary constraint

**What and why.** Phase 2 verified this by probe (D4): retagging `shared-util` as
`['scope:shared','type:feature-api','platform:shared']` and importing `@qa3elhamor/shared-domain`
**passed lint** — because `eslint.config.mjs:28-77` lists no `sourceTag: 'type:feature-api'`
constraint, so the `type:` dimension silently does not apply to that tag at all.

This is a narrower hole than an untagged project (Phase 2's C4 confirms those are fail-closed),
but it is a live one: the `complaints-api` roadmap item explicitly plans
`libs/complaints/{data-access,feature-api}`. **That library will ship with its layering rule
unenforced** unless the constraint is added first.

The whole point of a boundary rule is that it exists before the library it governs. This must
land before Phase 5.

**Files.** `eslint.config.mjs:74-77`

**Before**

```js
// eslint.config.mjs:73-77
{ sourceTag: 'type:util', onlyDependOnLibsWithTags: ['type:util'] },
{
  sourceTag: 'type:api-interfaces',
  onlyDependOnLibsWithTags: ['type:api-interfaces', 'type:domain'],
},
```

**After**

```js
{ sourceTag: 'type:util', onlyDependOnLibsWithTags: ['type:util'] },
{
  sourceTag: 'type:api-interfaces',
  onlyDependOnLibsWithTags: ['type:api-interfaces', 'type:domain'],
},
// Server-side feature layer (the `complaints-api` roadmap item plans
// libs/complaints/feature-api). Without this entry the whole `type:` dimension is
// silently inert for any library carrying the tag — verified by probe in Phase 2.
{
  sourceTag: 'type:feature-api',
  onlyDependOnLibsWithTags: [
    'type:feature-api',
    'type:data-access',
    'type:domain',
    'type:util',
    'type:api-interfaces',
  ],
},
```

While here, consider adding a `type:` fallback so a *new* unlisted type tag fails loudly rather
than silently — the same class of hole would recur for `type:ui-3d` or any tag a future item
invents.

**Expected impact.** Closes the last coverage gap in the `type:` dimension before the library it
governs exists. Two minutes now; a boundary retrofit across a built feature later.

> Use the **nx-workspace-architect** skill when generating the `complaints-*` libraries — it owns
> the tagging and boundary conventions this constraint enforces.

---

### 18. Drop `"types": ["node"]` from the `platform:shared` libraries

**What and why.** Every library's `tsconfig.lib.json` sets `"types": ["node"]` — e.g.
`libs/shared/util/tsconfig.lib.json:9`. **None of them uses a Node API.** Phase 2 (D3) and
Phase 3 (TS-5) both verified independently that this compiles clean:

```ts
// appended to libs/shared/domain/src/lib/result.ts — tsc exit 0, nx typecheck green
export const probe = typeof process !== 'undefined' ? process.env['X'] : undefined;
export const probeBuf = Buffer.alloc(1).length;
```

These libraries reach the browser through `world-domain → web`. **A Node global that slips into a
shared library passes the entire CI gate and fails only in a browser at runtime.**

The `platform:` tag dimension guards *which projects may import which*. It does not guard *which
globals they may reach*. This closes that half.

**Files.** `libs/shared/domain/tsconfig.lib.json`, `libs/shared/util/tsconfig.lib.json`,
`libs/shared/api-interfaces/tsconfig.lib.json`, `libs/world/domain/tsconfig.lib.json`

**Before**

```jsonc
// libs/shared/util/tsconfig.lib.json:3-10
"compilerOptions": {
  "rootDir": "src",
  "outDir": "dist",
  "tsBuildInfoFile": "dist/tsconfig.lib.tsbuildinfo",
  "emitDeclarationOnly": true,
  "forceConsistentCasingInFileNames": true,
  "types": ["node"]
},
```

**After**

```jsonc
"compilerOptions": {
  "rootDir": "src",
  "outDir": "dist",
  "tsBuildInfoFile": "dist/tsconfig.lib.tsbuildinfo",
  "emitDeclarationOnly": true,
  "forceConsistentCasingInFileNames": true,
  // Empty by design: these are platform:shared libraries that reach the browser through
  // world-domain -> web. With ["node"], a stray `process` or `Buffer` type-checks clean
  // and fails only at runtime. Verified by probe in Phase 2 (D3).
  "types": []
},
```

Keep `["node"]` in the `.spec.json` configs — test files legitimately use Node APIs — and keep it
in `apps/api`, which is genuinely server-side.

**Expected impact.** `process` and `Buffer` in a browser-bound library become compile errors
instead of runtime failures. The `platform:` isolation becomes real at the ambient-type level,
not just the import level. Closes G4/TS-5.

---

## Priority Tier 3: Medium Efforts (1–2 days each)

---

### 19. Make `sourceBytes` self-verifying and reconcile the manifest with the asset audit

**What and why.** Three related High findings converge on
`libs/world/domain/src/lib/asset-manifest.ts:37-70`.

**(a)** `sourceBytes` values are hand-rounded MB estimates that **all overstate reality**, while
the field's own doc comment at `:17` says *"Size of the raw source in bytes, as committed."*
Re-measured for this phase against the current disk state:

| id | Declared | Measured (directory) | Overstatement |
|---|---:|---:|---:|
| `bikini-bottom-map` | 5,242,880 | 4,942,248 | +6.1% |
| `pineapple-house` | 2,411,725 | 2,289,066 | +5.4% |
| `spongebob-character` | 17,825,792 | 17,354,286 | +2.7% |
| `patrick-character` | 3,460,301 | 3,393,407 | +2.0% |

`asset-manifest.spec.ts:19` asserts `budgetBytes < sourceBytes` against a number nothing
validates — the invariant is real, its denominator is not.

**(b)** `sourcePath` and `sourceBytes` measure **different things**. `sourcePath` names one file
(`scene.gltf` — 495,707 B for the map); `sourceBytes` approximates the whole directory including
`scene.bin` and 99 textures. That is a **10× discrepancy** for that entry, and
`asset-compression` will compute a compression ratio against an undefined baseline.

**(c)** The completed `asset-audit` never flowed back. `docs/asset-inventory.md` carries precise
measured figures produced by a roadmap item marked **done**; the manifest still carries pre-audit
estimates. Two sources of truth for the same number, and the accurate one is the non-executable
one. The audit also states outright that *"the manifest id `pineapple-house` is currently
misleading"* — the model is a rigged **interior** with no pineapple shell — and recommends
demoting it to `minimumTier: 'high'` or dropping it. The manifest still has it at `'low'`, i.e.
loaded on the weakest devices.

**Files.** `libs/world/domain/src/lib/asset-manifest.ts:11-70`,
`libs/world/domain/src/lib/asset-manifest.spec.ts`, `docs/asset-inventory.md`, new
`tools/measure-assets.mts`

**Before**

```ts
// libs/world/domain/src/lib/asset-manifest.ts:11-18, 37-45
export interface AssetEntry {
  readonly id: string;
  /** Raw model as committed, relative to the repository root. */
  readonly sourcePath: string;
  /** Web-ready output, relative to the web app's public directory. Null until compressed. */
  readonly compressedPath: string | null;
  /** Size of the raw source in bytes, as committed. */
  readonly sourceBytes: number;
  ...
}

export const SOURCE_ASSETS: readonly AssetEntry[] = [
  {
    id: 'bikini-bottom-map',
    sourcePath: 'assets/bikini_bottom_map_3d_model/scene.gltf',
    compressedPath: null,
    sourceBytes: 5.0 * MB,        // hand-rounded, 6.1% high, and measures the directory
    budgetBytes: 1.5 * MB,
    minimumTier: 'low',
  },
```

**After**

```ts
export interface AssetEntry {
  readonly id: AssetId;
  /** Directory holding the raw model as committed, relative to the repository root. */
  readonly sourceDir: string;
  /** The glTF entry point within `sourceDir`. */
  readonly sourceFile: string;
  /** Web-ready output, relative to the web app's public directory. Null until compressed. */
  readonly compressedPath: string | null;
  /**
   * Total bytes of `sourceDir` including the .bin and every texture — the baseline
   * `asset-compression` measures its ratio against. Verified against disk by
   * asset-manifest.spec.ts; regenerate with `npm run measure:assets`.
   */
  readonly sourceBytes: number;
  ...
}

export const SOURCE_ASSETS: readonly AssetEntry[] = [
  {
    id: brandId<'Asset'>('bikini-bottom-map'),
    sourceDir: 'assets/bikini_bottom_map_3d_model',
    sourceFile: 'scene.gltf',
    compressedPath: null,
    sourceBytes: 4_942_248,   // measured
    budgetBytes: 1.5 * MB,
    minimumTier: 'low',
  },
```

And the assertion that makes it self-verifying — the same instinct that already makes the
attribution table trustworthy:

```ts
// libs/world/domain/src/lib/asset-manifest.spec.ts
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dirBytes = (dir: string): number =>
  readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .reduce((sum, e) => sum + statSync(join(e.parentPath, e.name)).size, 0);

// The manifest claims a measurement. This is what makes the claim true — the same pattern
// that already guards the attribution table, applied to the numbers `asset-compression`
// will compute its ratios against.
it('declares the byte count that is actually on disk', () => {
  for (const asset of SOURCE_ASSETS) {
    expect(dirBytes(join(REPO_ROOT, asset.sourceDir))).toBe(asset.sourceBytes);
  }
});
```

**Migration steps (ordered)**

1. Write `tools/measure-assets.mts` — walks each `sourceDir`, sums file sizes, prints a manifest
   fragment. Add `"measure:assets"` to root `scripts`.
2. Split `sourcePath` into `sourceDir` + `sourceFile` in the `AssetEntry` interface. Fix the one
   consumer: `asset-manifest.spec.ts:13` asserts `findAsset(...)?.sourcePath`.
3. Run the script; replace all four `sourceBytes` values with measured integers.
4. Add the disk-verification test above. Confirm it passes, then confirm it *fails* by perturbing
   one value — an untested guard is item #2's lesson.
5. Reconcile with `docs/asset-inventory.md`: demote `pineapple-house` to `minimumTier: 'high'`
   per the audit's own recommendation, or rename the id to match what the model actually is.
   Record the decision in `.ptah/scope-decisions.md`.
6. Re-run `nx affected -t test` — `asset-manifest.spec.ts:17-25`'s `budgetBytes < sourceBytes`
   assertions still hold at the corrected (smaller) denominators; verify rather than assume.

**Expected impact.** The manifest stops claiming a measurement it does not have.
`asset-compression` gets a defined baseline to compute ratios against — without this, its
success criterion is undefined. `docs/asset-inventory.md` stops being a second source of truth.
Closes AP-4 plus the two High and two Medium findings on this file.

> Use the **webgl-asset-pipeline** skill when `asset-compression` starts — it owns the
> gltf-transform / Meshopt / KTX2 workflow these budgets are the target for.

---

### 20. Split the bundle and gate its size

**What and why.** The build emits a single **1,389,581 B** chunk (385 kB gzip) for a scaffold
that renders one plane, and prints *"Some chunks are larger than 500 kB"* on every run. There is
no `manualChunks`, no `chunkSizeWarningLimit`, and no size gate anywhere in CI.

The contrast is the point: `asset-manifest.spec.ts:23-25` enforces a 6 MB ceiling on model bytes
*to the byte*, for assets that have not shipped yet. **The project rigorously measures the
payload it does not have and completely ignores the one it ships today.**

There is a second miss in the same config: no `build.sourcemap`. A runtime error in a 1.39 MB
minified three.js bundle is untraceable.

**Files.** `apps/web/vite.config.mts:21-28`, `.github/workflows/ci.yml`, new
`tools/check-bundle-budget.mts`

**Before**

```ts
// apps/web/vite.config.mts:21-28
build: {
  outDir: './dist',
  emptyOutDir: true,
  reportCompressedSize: true,
  commonjsOptions: {
    transformMixedEsModules: true,
  },
},
```

**After**

```ts
build: {
  outDir: './dist',
  emptyOutDir: true,
  reportCompressedSize: true,
  // Hidden source maps: uploadable for error tracking, not served to users. A stack trace
  // through a minified three.js bundle is otherwise unreadable.
  sourcemap: 'hidden',
  commonjsOptions: {
    transformMixedEsModules: true,
  },
  rollupOptions: {
    output: {
      manualChunks: {
        // three + R3F change on a different cadence from app code and dominate the
        // payload. Splitting them keeps app-code deploys off the critical cache path.
        three: ['three', '@react-three/fiber', '@react-three/drei'],
        react: ['react', 'react-dom'],
      },
    },
  },
},
```

**Migration steps (ordered)**

1. Add `manualChunks` and `sourcemap: 'hidden'`. Run `nx build web` and record the resulting
   per-chunk gzip sizes — those become the initial budget.
2. Write `tools/check-bundle-budget.mts`: reads `apps/web/dist/assets/*.js`, gzips each, compares
   against a `bundle-budget.json` of `{ chunk: maxGzipBytes }`, exits non-zero on breach and
   prints the delta.
3. Set initial budgets ~10% above measured, so the gate catches regressions rather than blocking
   the current state.
4. Add to CI as a step after `nx affected -t build`.
5. Fold the JS budget into the `perf-budget` roadmap item's definition of done, so first-load
   budget covers **JS + glTF**, not glTF alone.

**Expected impact.** The largest thing the site actually downloads today acquires the same class
of gate the assets already have. Splitting `three` means an app-code change no longer invalidates
a ~1.2 MB vendor chunk in every returning user's cache. Closes AP-9.

---

### 21. Apply the tactical-DDD primitives at their existing call sites — or delete them

**What and why.** Three primitives in `libs/shared/domain` with **zero production call sites
between them**, independently confirmed by both Phase 2 (B1–B3) and Phase 3 (AP-11):

| Symbol | Refs outside its own file + spec |
|---|---:|
| `Result` / `ok` / `err` / `mapResult` / `unwrapOr` | **0** |
| `ValueObject` | **0** |
| `brandId` | **0** |
| `AssetId` | **0** |

The contradictions are sharp, not abstract. `result.ts:1-4` declares *"Domain code returns
`Result` rather than throwing"* — and the codebase's **only** fallible domain lookup,
`findAsset` (`asset-manifest.ts:72`), returns `AssetEntry | undefined`. That is the exact call
site the pattern was written for, in a sibling library that already imports from `shared-domain`
(`attribution.ts:1`). Likewise `attribution.ts:3` declares `export type AssetId = Branded<'Asset'>`
— for `AssetEntry.id`, which is typed `readonly id: string` (`asset-manifest.ts:12`).

A library of aspirational abstractions is the standard way a young codebase teaches its
contributors that its conventions are optional. Either resolution closes the finding; leaving
them is the only wrong answer.

**Recommendation: apply, don't delete.** `dive-camera`'s `DivePath` needs `ValueObject`,
`complaints-domain` needs `Result` for validation, and `landmark-kernel` will have both landmark
and complaint ids in scope simultaneously — the exact bug class `Branded` exists to prevent.

**Files.** `libs/world/domain/src/lib/asset-manifest.ts:11-12,72-73`,
`libs/world/domain/src/lib/attribution.ts:40`, `libs/world/domain/src/lib/asset-manifest.spec.ts`

**Before**

```ts
// libs/world/domain/src/lib/asset-manifest.ts:11-12, 72-73
export interface AssetEntry {
  readonly id: string;
  ...
}

export const findAsset = (id: string): AssetEntry | undefined =>
  SOURCE_ASSETS.find((asset) => asset.id === id);
```

```ts
// libs/world/domain/src/lib/attribution.ts:40
export const ATTRIBUTIONS: Readonly<Record<string, Attribution>> = { ... };
```

**After**

```ts
import { err, ok, type Result } from '@qa3elhamor/shared-domain';
import type { AssetId } from './attribution.js';

export interface AssetEntry {
  readonly id: AssetId;
  ...
}

/**
 * Returns a Result rather than undefined: this is the library's only fallible lookup, and
 * `result.ts` declares that domain code makes failure part of the signature. The error
 * carries the id so a caller can report which asset was missing.
 */
export const findAsset = (id: string): Result<AssetEntry, string> => {
  const asset = SOURCE_ASSETS.find((entry) => entry.id === id);
  return asset ? ok(asset) : err(`No asset with id "${id}"`);
};
```

```ts
// attribution.ts — keyed by the literal union rather than `string`, so a missing credit is
// a COMPILE error, not just a test failure. TS-2. This strengthens rather than replaces the
// runtime guard, which still protects against data loaded at runtime later.
export type AssetId = Branded<'Asset'>;
export type KnownAssetId =
  | 'bikini-bottom-map'
  | 'pineapple-house'
  | 'spongebob-character'
  | 'patrick-character';

export const ATTRIBUTIONS: Readonly<Record<KnownAssetId, Attribution>> = { ... };
```

**Migration steps (ordered)**

1. Add `Result` and `andThen`/`flatMap` to `result.ts` first — Phase 3 flagged that only
   `mapResult` exists, so chained fallible operations nest rather than compose. The first real
   consumer will otherwise add it ad hoc or abandon the type.
2. Change `AssetEntry.id` to `AssetId`; introduce `brandId` at the four literals in
   `SOURCE_ASSETS` (combines cleanly with item #19's rewrite of the same array — do them together).
3. Change `findAsset` to return `Result`. Update `asset-manifest.spec.ts:12-15`.
4. Narrow `ATTRIBUTIONS` to `Record<KnownAssetId, Attribution>` (TS-2). Confirm that removing an
   entry now fails **typecheck**, not just the test.
5. Confirm `assetsMissingAttribution` and its new negative test (item #2) still behave — the
   runtime guard is what protects the runtime-loaded data path item #23 introduces, so it must
   survive the type narrowing.

**Expected impact.** Three declared conventions become load-bearing at the one call site each has
available, before `landmark-kernel` and `complaints-domain` decide by default whether to follow
them. A missing credit becomes a compile error in addition to a test failure. Closes AP-11, B1,
B2, TS-2, TS-3.

---

## Priority Tier 4: Large Initiatives (1+ week each)

---

### 22. Decide and implement the state-management split before `dive-camera`

**What and why.** Phase 2 named this **the highest-risk unresolved architectural decision in the
project**, and it is the one item here that is a *decision* rather than a defect.

There is no state management today, and that is correct — `app.tsx` has no `useState`,
`useReducer`, `useRef`, `useContext`, or `useMemo`, and `budgetMb` (`:17`) is derived per render
from a pure function over a frozen constant. No store library is in `package.json`.

But the roadmap requires at least four pieces of cross-cutting mutable state:

| Roadmap item | State it introduces | Kind |
|---|---|---|
| `dive-camera` | scroll position → normalised dive depth, read every frame | **transient** |
| `landmark-kernel` | hover / focus / active landmark, shared between R3F scene and HTML overlays | **mixed** |
| `quality-tiers` | resolved tier from sustained FPS, read by every asset loader | **mixed** |
| `complaints-wall` | server data (list, submit, moderation) | **async server state** |

The first three are **render-loop state**, where React's `useState` is the wrong tool — a
`setState` per scroll frame re-renders the tree 60×/second and is the classic R3F frame-rate
killer. The idiomatic answer is a transient store read inside `useFrame` (zustand's
`subscribe`/`getState`, or refs), so per-frame values never re-render React at all, with React
state reserved for **discrete transitions** (landmark opened, tier changed). `complaints-wall` is
ordinary async server state and wants a different tool entirely.

**No roadmap item is titled "choose a state library."** The risk is precise: `dive-camera` is the
first item to need state, will pick something ad hoc under delivery pressure, and
`landmark-kernel` will inherit it by accident.

**Files.** `.ptah/scope-decisions.md` (the decision record), new `libs/dive/domain` +
`libs/dive/feature`, `apps/web/src/app/app.tsx`

**Before** — no state anywhere; `app.tsx` is stateless by construction.

**After** — the shape the decision should produce:

```ts
// libs/dive/domain/src/lib/dive-state.ts
/**
 * Transient dive state. Read inside useFrame via getState(); NEVER via a hook that
 * subscribes, or the tree re-renders 60x/second. Discrete transitions (landmark opened,
 * tier resolved) go through React state instead — see .ptah/scope-decisions.md Round 3.
 */
export interface DiveState {
  /** 0 at the surface, 1 at the seabed. Written by the scroll handler, read every frame. */
  readonly depth: number;
  readonly velocity: number;
}
```

```tsx
// libs/dive/feature — the consumption rule this decision exists to establish
useFrame((_, delta) => {
  const { depth } = useDiveStore.getState();   // transient read: no re-render
  camera.position.copy(path.getPointAt(depth));
});
```

**Migration steps (ordered)**

1. Write the decision into `.ptah/scope-decisions.md` **before** any code: which values are
   transient, which are React state, which library, and the rule for choosing. This is the
   artefact `landmark-kernel` will read.
2. Generate `libs/dive/domain` (`scope:dive`, `type:domain`, `platform:shared`) for the pure dive
   maths — the `depth` mapping and the `DivePath` value object. Verify the boundary rules accept
   the tags (Phase 2 C4: an untagged library is fail-closed).
3. Land `DivePath` as `ValueObject`'s first subclass — **item #15 must be complete first**, or it
   inherits the broken `equals`.
4. Add the store to `libs/dive/feature` (`type:feature`). Keep the store out of `type:domain` —
   domain stays pure per the boundary rule at `eslint.config.mjs:69-72`.
5. Wire `apps/web/src/app/app.tsx` as the composition root, per the rule its own header comment
   states at `:13-14`.
6. Add a render-count regression test: assert the React tree does **not** re-render on a
   simulated scroll frame. This is the assertion that keeps the decision honest once
   `landmark-kernel` starts adding state.

**Dependencies and prerequisites**

- Item #15 (`ValueObject` fix) — `DivePath` is its first subclass.
- Item #6 (type-aware lint) — the scroll/`useFrame` code is where floating promises appear.
- Item #17 is *not* a prerequisite (`scope:dive` and `type:feature` are both already covered by
  `eslint.config.mjs:94-97` and `:39-49`), but verify with a probe rather than assuming.

**Risk assessment**

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| The store is added under `type:domain` for convenience, breaking layer purity | Medium | High — the layering is the project's best-enforced property | The boundary rule fires automatically (Phase 2 C2, verified); the failure is loud |
| `useState` used for per-frame depth "just for now" | **High** — this is the default path | High — 60 fps → visible jank, and hard to unwind once landmarks subscribe | The render-count test in step 6 makes the regression fail CI rather than merely feel slow |
| A store library is chosen for `dive-camera` and turns out wrong for `complaints-wall` | Medium | Low | Decide them separately and say so in the decision record — transient store and server-state cache are different problems |
| The decision is made implicitly in a PR rather than in `scope-decisions.md` | Medium | Medium — `landmark-kernel` then inherits an undocumented convention | Step 1 is a gate on step 2 |

> Use the **r3f-scene-patterns** skill for the transient-store and `useFrame` discipline this
> item turns on — it covers the R3F-specific failure modes that ordinary React state advice gets
> wrong.

---

### 23. Invert `SOURCE_ASSETS` from source constant to loaded data

**What and why.** This is the one place where the code contradicts **the project's own central
architectural commitment**.

`README.md:12-14` states *"Forking should mean editing configuration, not components."*
`.ptah/scope-decisions.md` Round 1 makes forkability the premise. `eslint.config.mjs:79-85`
carries an unusually well-argued comment explaining that bounded-context isolation exists
*specifically* so a forker's changes stay confined to data.

And yet `asset-manifest.ts:37-70` places four SpongeBob-specific asset entries — and
`attribution.ts:40-73` four SpongeBob-specific credit records — as **source constants inside a
`type:domain` library**. A forker replacing the models must edit library source, not a data file.

Phase 2 (T2/G6) and Phase 3 (AP-12) both flag the same thing, and both note the same deadline:
**the fix window closes when `landmarks/*` copies the shape.** `landmark-kernel`,
`content-model`, and the four `landmark-*` items will all establish their data shape by
imitation, and the shape they will imitate is this one.

**Files.** `libs/world/domain/src/lib/asset-manifest.ts:37-70`,
`libs/world/domain/src/lib/attribution.ts:40-73`, new `content/assets.json` +
`content/attributions.json`, `apps/web/src/app/app.tsx`

**Before**

```ts
// libs/world/domain/src/lib/asset-manifest.ts:37-70 — instance data in a domain library
export const SOURCE_ASSETS: readonly AssetEntry[] = [
  { id: 'bikini-bottom-map', sourcePath: 'assets/bikini_bottom_map_3d_model/scene.gltf', ... },
  { id: 'pineapple-house',   sourcePath: 'assets/sbfbb-spongebob_house/scene.gltf', ... },
  { id: 'spongebob-character', ... },
  { id: 'patrick-character', ... },
];

export const totalBudgetBytes = (
  assets: readonly AssetEntry[] = SOURCE_ASSETS
): number => assets.reduce((sum, asset) => sum + asset.budgetBytes, 0);
```

**After**

```ts
// libs/world/domain/src/lib/asset-manifest.ts — contract and queries only, zero instance data
export interface AssetEntry { ... }               // unchanged
export interface AssetManifest {
  readonly assets: readonly AssetEntry[];
  readonly attributions: Readonly<Record<string, Attribution>>;
}

/**
 * Validates a manifest loaded from data. This is where the "forkers edit data, not
 * components" commitment is actually enforced: a fork supplies its own JSON and the same
 * licence and budget guards run against it unchanged.
 */
export const parseManifest = (raw: unknown): Result<AssetManifest, readonly string[]> => { ... };

// The defaulted-parameter shape is dropped; every query now takes its data explicitly.
export const totalBudgetBytes = (assets: readonly AssetEntry[]): number =>
  assets.reduce((sum, asset) => sum + asset.budgetBytes, 0);

export const assetsMissingAttribution = (manifest: AssetManifest): readonly string[] =>
  manifest.assets.filter((a) => !manifest.attributions[a.id]).map((a) => a.id);
```

```ts
// apps/web/src/app/manifest.ts — the composition root, which is the only place allowed to
// wire content into the domain (app.tsx:13-14).
import rawAssets from '../../../../content/assets.json' with { type: 'json' };
import { parseManifest } from '@qa3elhamor/world-domain';

export const MANIFEST = unwrapOrThrow(parseManifest(rawAssets));
```

**Migration steps (ordered)**

1. **Do item #19 first.** It rewrites the same array (splitting `sourcePath`, correcting
   `sourceBytes`); doing them in the other order means writing the migration twice.
2. Define the on-disk JSON schema and put the four current entries in `content/assets.json` +
   `content/attributions.json`, byte-identical in meaning to today's constants.
3. Write `parseManifest` returning `Result` — this is the second real `Result` call site and the
   one that justifies `andThen` from item #21. Validate: every asset has a credit, every
   `budgetBytes < sourceBytes`, every id unique, tier is a member of `QUALITY_TIERS`.
4. Move `assetsMissingAttribution`'s attribution source from the module-level `ATTRIBUTIONS`
   import to a parameter. This also fixes the **T1 parameter asymmetry** Phase 2 identified: the
   function currently accepts `assets` injectably but reads `ATTRIBUTIONS` as a fixed global, so
   it can be tested against arbitrary asset lists but never against an alternative credit source.
5. Move the loading and validation call to `apps/web/src/app/`, per the composition-root rule the
   file's own header states.
6. Port `asset-manifest.spec.ts` to run its invariants against **loaded** data. Add a test that a
   deliberately-broken JSON file produces the right `Result` error — the licence guard must fail
   the build for a *fork's* data, which is the entire point.
7. Document the schema in `README.md` under a "Forking" heading. A schema nobody can find is not
   configuration.

**Dependencies and prerequisites**

- Item #19 (manifest measurement fix) — same array, must precede.
- Item #21 (`Result` applied, `andThen` added) — `parseManifest` is its natural consumer.
- Item #8 (`noUncheckedIndexedAccess`) — runtime-loaded data is exactly the case where an
  unchecked index into `attributions[id]` becomes a live crash rather than a theoretical one.
- Must precede `landmark-kernel` and `content-model`, which will copy whichever shape exists.

**Risk assessment**

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Licence guard weakens in the move — it stops being a build gate and becomes a runtime check | Medium | **Critical** — this is a legal obligation and the repo's single best test | Step 6 is non-negotiable: a broken-fixture test must fail the build. Item #21's compile-time `Record<KnownAssetId, …>` narrowing gives a second, independent layer |
| JSON import ergonomics under `module: nodenext` + Vite | Medium | Low | Vite handles JSON natively; the import attribute syntax above is the `nodenext` form. Verify with `nx typecheck web` before proceeding past step 2 |
| Validation logic becomes a de-facto schema library reimplemented by hand | Medium | Medium | Keep `parseManifest` to the four invariants above. If it grows, adopt the same validation library item #25 selects for `complaints-api` — one choice, two consumers |
| Over-engineering: a config system for four static entries | Low | Medium | The entries are static *today*. The premise of the project is that a fork replaces them, and `content-model` + `cms-integration` both require this shape regardless |

> Use the **nx-workspace-architect** skill if this motivates a `libs/content/*` context — the
> `scope:content` tag is already declared at `eslint.config.mjs:102-105` with no library behind it.

---

### 24. Give `apps/api` a build target and a real deployment adapter

**What and why.** Phase 2 called this *"the largest single hole in the architecture as it
stands"*, and Phase 3 confirmed it independently: `nx build api` returns
**"Cannot find configuration for task api:build."**

The cause is a correct decision applied one project too far. The `@nx/js/typescript` plugin
infers a `build` target only where `package.json` `main`/`exports` point at build output. Every
project here points at `./src/index.ts` (`apps/api/package.json:6-13` and the four libs) — which
is *right* for source-consumed libraries and **wrong** for a deployable app. Compounding it,
`tsconfig.base.json:5` sets `emitDeclarationOnly: true`, so even a solution-level `tsc -b`
produces only `apps/api/dist/**/*.d.ts` — **no JavaScript, by any route.**

Consequences:
- CI's `npx nx affected -t build` can only ever build `web`. The API is typechecked and
  unit-tested but never compiled as a deployable artifact.
- `health(): Response` (`health.ts:9`) is a **port with no adapter**. Nothing turns it into a
  Vercel/Netlify/Workers entry point.
- S-3: whatever eventually ships will be produced by an as-yet-unwritten adapter that no gate
  covers.

The vendor-neutral Fetch shape is a genuinely good decision (`health.ts:3-8` names the four
runtimes it targets) — it means the adapter stays small. But a port that has never been adapted
is an untested hypothesis.

**Files.** `apps/api/package.json:6-13`, `apps/api/tsconfig.lib.json`, new
`apps/api/src/adapters/*`, new `apps/api/vite.config.mts` or `tsup` config,
`.github/workflows/ci.yml`

**Before**

```jsonc
// apps/api/package.json:6-13 — points at source, so no build target is inferred
"main": "./src/index.ts",
"types": "./src/index.ts",
"exports": {
  ".": {
    "types": "./src/index.ts",
    "import": "./src/index.ts",
    "default": "./src/index.ts"
  },
  "./package.json": "./package.json"
},
```

**After**

```jsonc
"main": "./dist/index.js",
"types": "./dist/index.d.ts",
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js",
    "default": "./dist/index.js"
  },
  "./package.json": "./package.json"
},
```

```ts
// apps/api/src/adapters/vercel.ts — the adapter the port has been waiting for.
// The handler stays vendor-neutral; only this file knows the host.
import { health } from '../lib/health.js';

export const GET = (request: Request): Response => health(request);
export const config = { runtime: 'edge' };
```

**Migration steps (ordered)**

1. **Choose the host.** This is a `deploy-static` decision and it gates everything below. The
   Fetch shape means the adapter is ~5 lines whichever is chosen; the choice determines the
   output format and the route convention.
2. Point `apps/api/package.json` `main`/`exports` at `dist`, which makes `@nx/js/typescript`
   infer the `build` target. Verify with `nx show project api`.
3. Override `emitDeclarationOnly: false` in `apps/api/tsconfig.lib.json` so JavaScript is
   actually emitted. **Do not change `tsconfig.base.json`** — the four libraries depend on
   declaration-only emit for the source-consumption strategy documented at
   `eslint.config.mjs:21-24`.
4. Add the adapter under `apps/api/src/adapters/`, one file per host, importing only from
   `src/lib/`. Keep `health()` itself vendor-neutral — that is the property being preserved.
5. Add the host config (`vercel.json` / `netlify.toml` / `wrangler.toml`) and the security
   headers from S-1: CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
   Note that R3F and three.js need **no** `unsafe-eval`, so a strict CSP is genuinely achievable
   here — this is much easier now than after a CMS and analytics land.
6. Reinstate `targetDefaults.test.dependsOn: ["^build"]` in `nx.json` **only if** it now applies
   — item #11 removed it precisely because it did not.
7. Add a CI job that builds the artifact and smoke-tests the deployed health endpoint.

**Dependencies and prerequisites**

- A hosting decision, which is `deploy-static`'s job and is currently open by design.
- Item #9 (the `_request` parameter on `health`) makes step 4 a no-op rather than a signature
  change across call sites.
- Item #11 removed the dead `dependsOn`; step 6 revisits it with real information.

**Risk assessment**

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `emitDeclarationOnly: false` is set in `tsconfig.base.json` instead of the API's own config, breaking every library's source-consumption model | Medium | **High** — silently changes what six projects emit | Step 3 is explicit about scope; `nx sync:check` and the existing lint comment at `eslint.config.mjs:21-24` are the guardrails |
| The adapter accretes business logic, dissolving the port/adapter split the file comment argues for | Medium | Medium | Enforce by convention *and* by test: adapters import from `src/lib/` only, never the reverse. A lint rule can express this |
| Host lock-in creeps in through config rather than code | Low | Medium | Keep `src/lib/` free of host imports. Adding a second adapter file is the cheap proof the port still works |
| CSP breaks WebGL or the CMS at launch | Medium | High — a broken CSP fails the whole page | Ship CSP in report-only mode first, in the same PR, and promote to enforcing after a week of clean reports |

> Use the **nestjs-deployment** skill for the containerisation, health-check, and CDN-header
> patterns — the NestJS specifics do not apply, but its production-hardening and header sections
> transfer directly to a Fetch-API serverless target.

---

### 25. Establish the untrusted-input boundary before `complaints-api` is written

**What and why.** `complaints-api` accepts **free-text public submissions** — the workspace's
only untrusted-input surface, and its first. Today: no validation library in the dependency tree
(no `zod`, no `valibot`), no DTO/schema pattern, no rate limiting, no sanitisation convention,
and no `try`/`catch`/`throw` anywhere in the codebase to model error paths on.

Phase 3 (S-4) was explicit that this is the **one security item worth pulling forward**, and the
reasoning is that it is a *design* decision: cheap before the code exists, expensive after.
S-9 sharpens it — there is no XSS vector today because nothing renders external text, and
`content-model` plus `complaints-wall` are exactly where the first one appears.

The trust model is partially designed already: `complaints-moderation` exists as a roadmap item,
which implies someone has thought about what untrusted content means here. That thinking should
be written down as a boundary before code assumes it.

**Files.** new `libs/complaints/domain`, new `libs/complaints/feature-api`,
`libs/shared/api-interfaces/src/lib/`, `.ptah/scope-decisions.md`, `apps/api/src/lib/`

**Before** — no complaints code, no validation, no untrusted input anywhere.

**After** — the boundary this item establishes:

```ts
// libs/complaints/domain/src/lib/complaint.ts
/**
 * A complaint as submitted. Every field is untrusted until parseSubmission returns ok.
 *
 * `body` is stored raw and rendered as TEXT, never as HTML — see .ptah/scope-decisions.md.
 * The moderation surface reads `raw`; the public wall reads only what moderation released.
 */
export interface ComplaintSubmission {
  readonly body: string;      // <= 500 chars, control characters stripped
  readonly author: string;    // <= 80 chars, optional
}

export const parseSubmission = (
  raw: unknown
): Result<ComplaintSubmission, readonly string[]> => { ... };
```

```ts
// apps/api/src/lib/complaints.ts — validation at the very edge, before anything else runs
export const submitComplaint = async (request: Request): Promise<Response> => {
  const parsed = parseSubmission(await request.json());
  if (!parsed.ok) {
    return Response.json({ errors: parsed.error }, { status: 400 });
  }
  ...
};
```

**Migration steps (ordered)**

1. **Write the trust model into `.ptah/scope-decisions.md` before any code.** What is validated,
   where, what is stored raw vs rendered, what the moderation states are, what the rate limit is,
   and what a rejected submission returns. This is the artefact — the code is downstream of it.
2. Choose the validation approach: `zod`/`valibot`, or hand-written parsers returning `Result`.
   Given item #21 makes `Result` real and `parseManifest` (item #23) already needs the same
   shape, hand-written parsers returning `Result` are the consistent choice at this scale and add
   no dependency. Revisit if the schema count exceeds ~5.
3. Generate `libs/complaints/domain` (`scope:complaints`, `type:domain`, `platform:shared`) —
   already covered by `eslint.config.mjs:106-109`.
4. Generate `libs/complaints/feature-api` (`type:feature-api`) — **item #17 must be done first**,
   or this library's layering rule is silently inert.
5. Put the DTO in `libs/shared/api-interfaces`, which currently has exactly one type and
   describes itself as *"the ONLY type channel between apps/web and apps/api"*
   (`api-interfaces/health.ts:1-7`). This also closes **B4**: the channel is producer-side only
   today because `apps/web` does not depend on it at all — `complaints-wall` is what makes it
   two-ended, which is when the contract starts actually enforcing anything.
6. Validate at the handler edge, before any business logic, and length-cap every string field.
7. Rate-limit at the host layer (item #24's config), not in application code.
8. Add the convention test: complaint text is rendered as `{text}` in JSX, never
   `dangerouslySetInnerHTML`. Grep for it in CI if a lint rule cannot express it.

**Dependencies and prerequisites**

- Item #17 (`type:feature-api` constraint) — **hard blocker** for step 4.
- Item #21 (`Result` + `andThen`) — the parser return shape.
- Item #6 (type-aware lint) — `no-misused-promises` matters most in async handler code, which
  this is the first of.
- Item #24 (deployment adapter) — rate limiting and CSP live in host config.
- A persistence decision: `README.md` and `.ptah/roadmap.md` name Prisma, and Phase 1 confirmed
  **no Prisma or Postgres driver is in the dependency tree**. That is a separate open choice.

**Risk assessment**

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Validation is written inside the handler and duplicated per endpoint | **High** — the default path | Medium — drift between endpoints is how a gap opens | Domain-layer parsers, one per DTO, imported by handlers. Test the parsers directly, not through HTTP |
| Complaint text rendered as HTML somewhere in the wall UI | Low | **Critical** — stored XSS | Step 8's convention test; keep the rule in `scope-decisions.md` so it survives a contributor change |
| No rate limit → the public wall is spammed on day one | Medium | High — the feature becomes unusable and moderation is buried | Host-layer limit in item #24's config, before the endpoint is public |
| Moderation state machine designed after the API ships | Medium | Medium — a schema migration on live data | `complaints-domain` precedes `complaints-api` in the roadmap already; keep that order |
| Prisma is adopted without a multi-tenancy / connection strategy | Medium | Medium | See the **nestjs-backend-patterns** skill for the Prisma and repository patterns, and **saas-platform-patterns** if the template goal ever implies tenancy |

> Use the **webhook-architecture** skill if `complaints-contact-adapter` delivers via an external
> service with callbacks — it covers signature verification and idempotent processing.

---

## Summary Matrix

| # | Item | Tier | Effort | Impact | Files |
|---|------|------|--------|--------|-------|
| 1 | `lang="ar" dir="rtl"` on Arabic `<h1>`; real `<title>` | 1 | 10 min | **High** — fixes a live a11y defect | `apps/web/src/app/app.tsx:33`, `apps/web/index.html:2,5` |
| 2 | Licence-guard negative test | 1 | 10 min | **High** — makes the repo's only legal gate refactor-proof | `libs/world/domain/src/lib/asset-manifest.spec.ts:31` |
| 3 | Fix `lib` clobber (`["es2022","dom","dom.iterable"]`) | 1 | 5 min | **High** — unblocks ES2022 built-ins in the app | `apps/web/tsconfig.app.json:7` |
| 4 | Prettier: ignore `assets/`, run once, gate in CI | 1 | 30 min | **High** — 27 files drifted at zero commits | `.prettierignore`, `package.json:5`, `.github/workflows/ci.yml` |
| 5 | Delete `.mcp.json.bak`; ignore `*.bak` | 1 | 5 min | Medium — removes top future secret-leak vector | `.mcp.json.bak`, `.gitignore` |
| 6 | **Type-aware linting + `no-floating-promises`** | 1 | 45 min | **Critical** — highest leverage in the plan | `eslint.config.mjs:136-149` |
| 7 | `--max-warnings=0`; `react/jsx-key`; fix preset order | 1 | 30 min | **High** — arms a11y/hooks gates before list rendering | `apps/web/eslint.config.mjs`, `.github/workflows/ci.yml:39` |
| 8 | Enable `noUncheckedIndexedAccess` | 1 | 30 min | **High** — two verified crash paths → compile errors | `tsconfig.base.json`, `asset-manifest.spec.ts:36` |
| 9 | `licenseUrl` → HTTPS; `cache-control: no-store` on health | 1 | 15 min | Medium — mixed content + stale health | `attribution.ts:32`, `apps/api/src/lib/health.ts:9-19` |
| 10 | Cover `smoothstep` zero-width and `lerp` extrapolation | 1 | 15 min | Medium — 50% → 100% branch coverage | `libs/shared/util/src/lib/math.spec.ts` |
| 11 | Remove dead `targetDefaults`, `worker` block; `.ts`→`.mts` | 1 | 20 min | Low — removes misleading config and build noise | `nx.json:59-62`, `apps/web/vite.config.mts:17-20`, `vitest.config.ts` |
| 12 | Root error boundary + `<Suspense>` + `<noscript>` | 2 | 2 h | **High** — blank page → degraded page on WebGL/asset failure | new `scene-boundary.tsx`, `app.tsx:19-30`, `index.html` |
| 13 | `vi.importActual` in the R3F mock | 2 | 1 h | **High** — suite survives the next roadmap item | `apps/web/src/app/app.spec.tsx:10-12` |
| 14 | Coverage thresholds + `all: true`; CI runs `test-ci` | 2 | 2 h | Medium — coverage becomes a ratchet | 6 vite/vitest configs, `.github/workflows/ci.yml:39` |
| 15 | Fix + test `ValueObject` (structural equals, deep freeze) | 2 | 3 h | **High** — before `DivePath` subclasses it | `libs/shared/domain/src/lib/value-object.ts`, new `.spec.ts` |
| 16 | `bytesToMb` into `shared-util`; close phantom edge | 2 | 1 h | Medium — makes a declared dependency real | new `format.ts`, `shared-util/src/index.ts`, `app.tsx:17` |
| 17 | Add `type:feature-api` boundary constraint | 2 | 30 min | **High** — must precede `complaints-api` | `eslint.config.mjs:74-77` |
| 18 | Drop `"types": ["node"]` from `platform:shared` libs | 2 | 1 h | Medium — Node globals → compile error | 4 × `libs/*/*/tsconfig.lib.json` |
| 19 | Self-verifying `sourceBytes`; reconcile with asset audit | 3 | 1–2 d | **High** — gives `asset-compression` a real baseline | `asset-manifest.ts:11-70`, `.spec.ts`, `docs/asset-inventory.md`, new `tools/measure-assets.mts` |
| 20 | `manualChunks` for three; bundle budget in CI; sourcemaps | 3 | 1 d | **High** — gates the 1.39 MB shipped today | `apps/web/vite.config.mts:21-28`, new `tools/check-bundle-budget.mts`, CI |
| 21 | Apply `Result` / `AssetId` / narrow `ATTRIBUTIONS` | 3 | 1–2 d | **High** — three conventions become load-bearing | `asset-manifest.ts:11-12,72`, `attribution.ts:40`, `result.ts` |
| 22 | Decide + implement transient vs React state split | 4 | 1–2 w | **Critical** — the highest-risk open decision | `.ptah/scope-decisions.md`, new `libs/dive/{domain,feature}`, `app.tsx` |
| 23 | Invert `SOURCE_ASSETS` to loaded data | 4 | 1 w | **High** — honours the project's central commitment | `asset-manifest.ts:37-70`, `attribution.ts:40-73`, new `content/*.json`, `app.tsx` |
| 24 | Build target + deployment adapter for `apps/api` | 4 | 1–2 w | **High** — closes the largest architectural hole | `apps/api/package.json:6-13`, `tsconfig.lib.json`, new `src/adapters/*`, host config, CI |
| 25 | Untrusted-input boundary before `complaints-api` | 4 | 1–2 w | **High** — the project's first untrusted surface | `.ptah/scope-decisions.md`, new `libs/complaints/{domain,feature-api}`, `shared-api-interfaces`, `apps/api/src/lib/` |

---

## Suggested execution order

**Sitting 1 — one afternoon, closes every Tier 1 item.** #1 → #2 → #3 → #5 → #9 → #10 → #11 →
#4 (format last, so it absorbs the edits above) → #6 → #7 → #8. Run
`nx run-many -t lint typecheck test build` after #8; #6–#8 are the three that can surface new
errors, and surfacing them at 508 lines is the entire point.

**Sitting 2 — before `world-environment` starts.** #12, #13, #15, #17, #18. These are the items
whose cost multiplies the moment the next roadmap item lands. #14 and #16 can trail.

**Then, in roadmap order.** #19 and #21 fold into `asset-compression`; #23 must land before
`landmark-kernel`; #22 is `dive-camera`'s first decision, not its last; #20 is `perf-budget`;
#24 is `deploy-static`; #25 gates `complaints-api`.

**What not to pull forward.** The `asset-compression` pipeline itself, the landmark kernel, and
the CMS integration are correctly scheduled and correctly sized. This plan deliberately does not
touch them — its subject is the guardrails those items will be built inside, and the entire
argument is that the guardrails are cheap now and expensive later.
