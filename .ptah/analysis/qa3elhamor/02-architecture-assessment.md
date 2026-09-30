# Architecture Assessment — qa3elhamor

Phase 2. Builds on `01-project-profile.md`. Every claim below is traced to a file path, and
the enforcement claims were verified by running the toolchain (probes described inline, all
reverted; `nx run-many -t lint typecheck test build` is green and the working tree is
unchanged).

**Headline.** This is a small, deliberately-designed workspace — 508 lines of first-party
TypeScript across 6 projects — whose *architecture is far larger than its code*. The tag
taxonomy, boundary rules, and layering are complete and correct for a system that does not
exist yet. The assessment therefore splits into two verdicts: the **skeleton is sound and
enforced**, and the **flesh is absent**, with a handful of real gaps where the skeleton's
promises are not actually load-bearing.

---

## Folder Structure Assessment

### Nx monorepo layout

| Nx convention | Expected | Actual | Verdict |
|---|---|---|---|
| Apps under `apps/<name>` | `apps/web`, `apps/api` | matches | ✅ |
| Libs under `libs/<scope>/<type>` | `libs/shared/domain`, `libs/world/domain` | matches exactly | ✅ |
| One `package.json` per project with `nx.name` + `nx.tags` | required for the TS-solution / npm-workspaces setup | all 6 present | ✅ |
| Solution-style root `tsconfig.json` (`files: []` + references) | required | `tsconfig.json:1-30`, all 6 referenced | ✅ |
| Per-project `tsconfig.json` / `.lib.json` / `.spec.json` split | Nx 23 default | present for all 6 | ✅ |
| Barrel `src/index.ts` per library, source under `src/lib/` | required | all 6 (`libs/*/*/src/index.ts`, `apps/api/src/index.ts`) | ✅ |
| Flat ESLint config per project extending root | Nx 23 default | 6 configs, all extend `../../eslint.config.mjs` | ✅ |
| `project.json` absent (inferred targets) | modern Nx | none exist; all targets from 4 plugins in `nx.json:12-48` | ✅ |

**Adherence: follows conventions.** This is a textbook Nx 23 TS-solution workspace. There is
no structural drift from the canonical layout — no stray `project.json`, no library outside
`libs/<scope>/<type>`, no source outside `src/`.

### React / Vite app layout (`apps/web`)

| Convention | Actual | Verdict |
|---|---|---|
| `index.html` at app root, `src/main.tsx` entry | `apps/web/index.html`, `apps/web/src/main.tsx` | ✅ |
| Root component under `src/app/` | `apps/web/src/app/app.tsx` | ✅ |
| `vite.config.mts` with inline Vitest block | `apps/web/vite.config.mts:29-40` | ✅ |
| `public/` for static assets | `apps/web/public/favicon.ico` | ✅ |
| Component-colocated styles (the configured default is `style: "css"` and CSS-module typings are wired via `apps/web/tsconfig.app.json:11-12`) | single global `apps/web/src/styles.css` with hand-written `.shell` / `.scaffold-note` classes | ⚠️ partial |

### Misplaced files

Three, all minor and two of them self-documented:

1. **Scene implementation lives in the composition root.**
   `apps/web/src/app/app.tsx:21-30` contains the `<Canvas>`, `<fogExp2>`, the light rig, and
   a 60×60 `planeGeometry` floor mesh. Per the project's own stated architecture
   (`README.md` "Workspace layout", and the comment at `apps/web/src/app/app.tsx:4-15`),
   environment geometry belongs in `libs/world/feature` — a library that does not exist yet.
   The code acknowledges this and says both `world-environment` and `dive-camera` "replace
   this component wholesale". **Known, temporary, documented — not drift.**

2. **Presentation formatting bypasses the util library.**
   `apps/web/src/app/app.tsx:17` does `(totalBudgetBytes() / (1024 * 1024)).toFixed(1)`
   inline. `libs/shared/util` exists precisely for pure numeric helpers and is *declared as a
   dependency of `apps/web`* — yet nothing in `apps/web` imports it (see Coupling Analysis).

3. **`assets/` at the repo root, not under any project.**
   28 MB of raw glTF sits at `assets/`, referenced by string path from
   `libs/world/domain/src/lib/asset-manifest.ts:40,48,56,64`. This is correct — they are
   *source* inputs to a compression step, not app assets — and `.gitignore` reserves
   `apps/web/public/models/` for the compressed outputs. Well-placed.

**Overall adherence rating: follows conventions.** The one genuine deviation (global CSS
where CSS-module typings are configured) is cosmetic at 48 lines of stylesheet.

---

## Detected Patterns

### 1. Layered Architecture (type: dimension) — confidence: **high**

Four layers are declared as tags and enforced as ESLint constraints
(`eslint.config.mjs:28-77`): `app` → `feature` → `ui` / `data-access` → `domain` → `util`,
with `api-interfaces` as a side channel.

Evidence beyond folder names — the innermost layer is genuinely pure:

- `libs/shared/util/src/lib/math.ts` — 27 lines, **zero imports**, four total functions.
- `libs/shared/domain/src/lib/result.ts`, `branded-id.ts` — **zero imports**.
- `libs/world/domain/src/lib/asset-manifest.ts:1-2` — imports only sibling domain modules.
- `libs/world/domain/src/lib/attribution.ts:1` — imports `type { Branded }` from
  `@qa3elhamor/shared-domain`, i.e. domain → domain, the only allowed outward edge.
- No library imports `react`, `three`, or `@react-three/fiber`. Framework code is confined to
  `apps/web/src/main.tsx` and `apps/web/src/app/app.tsx`.

### 2. Bounded Contexts / strategic-DDD scoping (scope: dimension) — confidence: **high (as design), low (as realised)**

Seven contexts are declared (`eslint.config.mjs:86-113`): `shared`, `world`, `dive`,
`landmarks`, `content`, `complaints`, `telemetry`. Each may reach only itself and
`scope:shared`. Apps deliberately carry **no** `scope:` tag
(`apps/web/package.json:8-13`, `apps/api/package.json:14-20`), which is what licenses them to
compose across contexts.

The design intent is stated at `eslint.config.mjs:79-85` and in `README.md`: content must
never be imported by scene libraries; landmarks receive copy as props; `apps/web` is the sole
wiring point. This is the mechanism the "forkable template" goal rests on.

**Two of seven contexts exist** (`shared`, `world`). `dive`, `landmarks`, `content`,
`complaints`, `telemetry` are forward declarations with no library behind them. The pattern
is therefore fully specified and almost entirely unexercised.

### 3. Tactical DDD primitives — confidence: **medium (declared), very low (applied)**

`libs/shared/domain` ships three classic tactical building blocks:

- `Result<T,E>` (`result.ts:5-29`) — railway-oriented error handling, with the doc comment
  "Domain code returns `Result` rather than throwing".
- `Branded<TBrand>` (`branded-id.ts:8-13`) — nominal typing for ids.
- `abstract class ValueObject<TProps>` (`value-object.ts:7-17`) — frozen props, structural
  `equals`, with a documented static-factory-returns-`Result` contract.

Usage counts across all non-`dist` first-party source:

| Symbol | Total refs | Refs outside its own file + spec |
|---|---:|---:|
| `Result` / `ok` / `err` / `mapResult` / `unwrapOr` | 11 | **0** |
| `ValueObject` | 2 (both its own declaration) | **0** |
| `brandId` | 1 (its own declaration) | **0** |
| `Branded` | 6 | 1 (`attribution.ts:1`) |
| `AssetId` | 1 (its own declaration) | **0** |

So the tactical layer is a **library of unused primitives**. See Pattern Consistency for the
two places this actively contradicts itself.

### 4. Component-Based / declarative scene graph (R3F) — confidence: **high, trivially exercised**

`apps/web/src/app/app.tsx:19-39` is a single function component composing R3F elements
declaratively. `apps/web/src/main.tsx:9-13` mounts under `<StrictMode>`. This is idiomatic
R3F, but it is 40 lines — there is no scene architecture yet to assess.

### 5. Platform Isolation (platform: dimension) — confidence: **high as a design, partial in effect**

`eslint.config.mjs:119-130`: `platform:serverless` and `platform:web` are mutually
unreachable; only `platform:shared` bridges them. Reinforced by
`libs/shared/api-interfaces/src/lib/health.ts:1-7` declaring itself "the ONLY type channel
between `apps/web` and `apps/api`".

Partial because the isolation is enforced at the *project-import* level but not at the
*ambient-types* level — see Dependency Flow, finding D3.

### 6. Hexagonal / Ports-and-Adapters — confidence: **low; intent only**

`apps/api/src/lib/health.ts:3-8` writes handlers against the Fetch API rather than a vendor
signature, explicitly to keep the deployment target an open decision. That is a port with no
adapter: nothing in the repository turns `health(): Response` into a Vercel/Netlify/Workers
entry point, and `apps/api` has **no build target at all** (see Dependency Flow, D1).

### Patterns explicitly NOT present

No MVC, no service/repository layer, no dependency-injection container, no event bus, no CQRS.
None are warranted at 508 lines, and the roadmap does not introduce a DI container.

---

## Pattern Consistency

### Applied correctly

**C1 — Layer purity holds without exception.** Verified by import inspection of all 21
first-party `.ts`/`.tsx` files: no library imports a framework, no domain module imports
anything outside `domain` or `util`, and no relative import crosses a project boundary.

**C2 — The boundary rules actually fire.** Not assumed — probed. Appending
`import { SOURCE_ASSETS } from '@qa3elhamor/world-domain'` to
`libs/shared/util/src/lib/math.ts` and running `nx run shared-util:lint --skip-nx-cache`
produced:

```
error  A project tagged with "type:util" can only depend on libs tagged with "type:util"
       @nx/enforce-module-boundaries
```

**C3 — Relative-path escape hatches are closed.** Probing
`import { SOURCE_ASSETS } from '../../../../world/domain/src/lib/asset-manifest.js'`
from the same file produced:

```
error  Projects cannot be imported by a relative or absolute path, and must begin with a npm scope
```

The taxonomy cannot be bypassed by reaching around it.

**C4 — Untagged projects are fail-closed.** Probing an empty `nx.tags` array on `shared-util`
produced `A project without tags matching at least one constraint cannot depend on any
libraries`. A new library that forgets its tags cannot import anything, which is the correct
default.

**C5 — Licence obligations are modelled as code, not documentation.**
`libs/world/domain/src/lib/asset-manifest.ts:81-84` (`assetsMissingAttribution`) plus the test
at `libs/world/domain/src/lib/asset-manifest.spec.ts:31-33` fail the build if a model enters
`SOURCE_ASSETS` without a credit in `ATTRIBUTIONS`. CC-BY-4.0 compliance is enforced by CI
rather than trusted to a reviewer. This is the single best architectural decision in the
repository.

**C6 — Budgets are data, and the data is asserted.**
`asset-manifest.spec.ts:17-25` asserts every `budgetBytes < sourceBytes` and a 6 MB total
ceiling, so the manifest cannot silently absorb an unbudgeted asset.

### Where patterns break down

**B1 — The `Result` pattern is declared and then not used, including inside its own library's
sibling.** `result.ts:1-4` states domain code returns `Result` rather than throwing. The only
fallible domain lookup in the codebase, `findAsset`
(`libs/world/domain/src/lib/asset-manifest.ts:72-73`), returns `AssetEntry | undefined`. This
is the exact call site the pattern was written for, in a sibling library that already imports
from `shared-domain` (`attribution.ts:1`). No `Result` is constructed anywhere outside
`result.spec.ts`.

**B2 — The branded-id pattern is declared, aliased for this very entity, and then not
applied.** `libs/world/domain/src/lib/attribution.ts:3` declares
`export type AssetId = Branded<'Asset'>`. The interface it exists for,
`AssetEntry.id` (`asset-manifest.ts:12`), is typed `readonly id: string`. `findAsset(id:
string)` (`:72`) likewise. `AssetId` has exactly one reference in the workspace — its own
declaration. `brandId` (`branded-id.ts:12`) is never called. The nominal-typing guarantee the
library advertises is not in force for the only entity that has an id type defined for it.

**B3 — `ValueObject` has no subclasses and its contract is untested.**
`value-object.ts:12-16` compares via `JSON.stringify(this.props)`, which is key-order
sensitive: two structurally equal value objects constructed with different property insertion
order compare unequal. There is no `value-object.spec.ts`. The roadmap's `dive-camera` item
plans "a `DivePath` value object over a CatmullRom spline" — the first real subclass will
inherit this behaviour untested.

**B4 — `shared-api-interfaces` is a one-ended channel.** It documents itself as the type
channel between `apps/web` and `apps/api` (`health.ts:1-7`), and `apps/api` does import it
(`apps/api/src/lib/health.ts:1`). `apps/web` does not depend on it at all — it is absent from
`apps/web/package.json:5-8`. There is no HTTP client in `apps/web`, so the contract is
currently enforced on the producer side only. Expected at this stage; worth naming so it is
closed when `complaints-api` lands.

**B5 — The one existing composition root already mixes composition with implementation.**
`app.tsx` both wires domain data into the view (`:2`, `:17`, `:35`) and *is* the scene
(`:21-30`). Self-documented as temporary at `:4-15`.

---

## Dependency Flow

### The graph

`nx graph` output (project-level, all edges `static`):

```
shared-domain          -> (none)
shared-util            -> (none)
shared-api-interfaces  -> (none)
world-domain           -> shared-domain
api                    -> shared-api-interfaces
web                    -> world-domain, shared-util
```

Every edge points **inward** — apps to libraries, feature-scoped domain to shared domain,
leaves with no dependencies. There are zero cycles, zero outward edges, and zero
lateral edges between bounded contexts. Depth is 3 (`web → world-domain → shared-domain`).
For the layering that is declared, the direction is **correct without exception**.

TypeScript project references mirror the package graph exactly
(`apps/web/tsconfig.app.json:34-41`, `apps/api/tsconfig.lib.json:12-16`,
`libs/world/domain/tsconfig.lib.json:12-16`), and CI runs `npx nx sync:check`
(`.github/workflows/ci.yml`) so the two cannot drift.

### Violations and gaps

**D1 — `apps/api` has no build target; there is no path from its source to a deployable
artifact.** *Verified:* `nx build api` returns `Cannot find configuration for task
api:build`. `nx show project` confirms only `web` has a `build` target:

| Project | Inferred targets |
|---|---|
| `web` | typecheck, lint, **build**, serve, dev, preview, serve-static, build-deps, watch-deps, test, test-ci |
| `api` | typecheck, lint, test, test-ci |
| `shared-domain` / `shared-util` / `world-domain` | typecheck, lint, test, test-ci |
| `shared-api-interfaces` | typecheck, lint, test |

The `@nx/js/typescript` plugin infers `build` only where `package.json` `main`/`exports` point
at build output; here every project points at `./src/index.ts`
(`apps/api/package.json:5-13` and the four libs), so no build target is created. That is the
*correct* consequence of the source-consumption strategy for the libraries — but `apps/api`
inherited it too. Compounding it, `tsconfig.base.json` sets `emitDeclarationOnly: true`, so
even the solution-level `tsc -b` produces only `apps/api/dist/**/*.d.ts` — no JavaScript.
`apps/api` is currently typechecked and unit-tested but **not buildable**.
Consequence: CI's `npx nx affected -t build` can only ever build `web`. Deferred to the
`deploy-static` roadmap item, but it is the largest single hole in the architecture as it
stands.

**D2 — `web → shared-util` is a declared edge with no import behind it.**
`apps/web/package.json:6` declares `"@qa3elhamor/shared-util": "workspace:*"`, and
`apps/web/tsconfig.app.json:35-37` references `libs/shared/util/tsconfig.lib.json`. A grep of
every `.ts`/`.tsx` under `apps/` for `@qa3elhamor/shared-util` returns **zero** hits. Nx
reports the edge as `static` because it is derived from `package.json`. The graph therefore
overstates real coupling, and `nx affected` will rebuild/retest `web` on any `shared-util`
change that cannot possibly affect it.

**D3 — The `platform:` boundary is not enforced for ambient types.** *Verified:* every
library's `tsconfig.lib.json` sets `"types": ["node"]` (e.g.
`libs/shared/domain/tsconfig.lib.json:8`, `libs/world/domain/tsconfig.lib.json:8`). Appending

```ts
export const probe = typeof process !== 'undefined' ? process.env['X'] : undefined;
export const probeBuf = Buffer.alloc(1).length;
```

to `libs/shared/domain/src/lib/result.ts` type-checked **clean** (`tsc -p
libs/shared/domain/tsconfig.lib.json`, exit 0), and `nx run-many -t typecheck` stayed green.
`shared-domain` is `platform:shared` and is consumed by `apps/web` transitively through
`world-domain`. A Node global that slips into a shared library therefore passes the whole CI
gate and fails only in a browser at runtime. The tag dimension guards *which projects* may
import which; it does not guard *which globals* they may reach.

**D4 — The `type:` dimension does not cover a tag the roadmap plans to use.** *Verified:*
retagging `shared-util` as `['scope:shared','type:feature-api','platform:shared']` and
importing `@qa3elhamor/shared-domain` **passed lint** — because `eslint.config.mjs:28-77`
lists no `sourceTag: 'type:feature-api'` constraint, so the type dimension silently does not
apply to it. (`scope:` and `platform:` still apply, since those tags do match constraints;
this is a narrower hole than an untagged project, which C4 shows is fail-closed.) The roadmap
`complaints-api` item explicitly plans `libs/complaints/{data-access,feature-api}`. That
library will ship with its layering rule unenforced unless a `type:feature-api` constraint is
added first.

**D5 — Dead `targetDefaults` entry.** `nx.json:51-53` sets
`targetDefaults.test.dependsOn: ["^build"]`, but per D1 no dependency of any project has a
`build` target. It is a harmless no-op today and misleading tomorrow.

**D6 — `apps/api` is shaped as a library; `apps/web` is not.**
`apps/api/package.json:5-13` declares `main`, `types`, and an `exports` map pointing at
`./src/index.ts`, making `@qa3elhamor/api` importable by any project in the workspace.
`apps/web/package.json` declares none of these. The boundary rules do catch the resulting
misuse (`type:app` may not depend on `type:app`; `api` carries no `scope:` tag, so any scoped
library importing it fails the scope constraint), so this is defensible — the export shape is
what a serverless adapter will eventually need. It is still an asymmetry between two projects
that share a tag.

### Layer boundary assessment

**Sound.** No inward-pointing dependency is violated, no cycle exists, and the two escape
hatches an engineer would reach for — relative paths and untagged libraries — are both closed
and were both tested. The weaknesses (D1–D5) are gaps in *coverage*, not inversions of
direction.

---

## Coupling Analysis

### Afferent / efferent coupling

| Project | Depends on (Ce) | Depended on by (Ca) | Assessment |
|---|---:|---:|---|
| `shared-domain` | 0 | 1 (`world-domain`) | stable leaf, correctly positioned |
| `shared-util` | 0 | 1 declared / **0 real** | stable leaf, **phantom consumer** |
| `shared-api-interfaces` | 0 | 1 (`api`) | stable leaf, one-ended (B4) |
| `world-domain` | 1 | 1 (`web`) | correct |
| `api` | 1 | 0 | correct |
| `web` | 2 | 0 | composition root, correct |

Ce is 0, 1, or 2 everywhere. No project is a hub; no project is depended on by more than one
other. At this size that is unremarkable, but nothing is trending wrong.

### Tight-coupling hotspots

**T1 — `asset-manifest.ts` hard-binds to the `ATTRIBUTIONS` module constant.**
`libs/world/domain/src/lib/asset-manifest.ts:2` imports the concrete data table, and
`assetsMissingAttribution` (`:81-84`) reads it as a fixed module-level global while accepting
`assets` as an injectable parameter. The asymmetry means the licence check can be run against
arbitrary asset lists but never against an alternative credit source, so the function is not
independently testable in isolation. Coupling is *within* one library and is arguably correct
(the doc at `attribution.ts:35-39` argues the pairing must be inseparable), but the parameter
asymmetry is unintentional rather than reasoned.

**T2 — `SOURCE_ASSETS` is both the contract and the instance data.**
`asset-manifest.ts:37-70` places the project's four concrete models inside the same module as
the `AssetEntry` interface and the query functions. For a template whose entire premise is
"forkers change data, not components" (`README.md`, `.ptah/scope-decisions.md` Round 1), the
four SpongeBob-specific entries are hardcoded in a `type:domain` library. A forker replacing
the models must edit library source, not a data file. This is the one place where the code
does not yet honour the project's own central architectural commitment. It is small and easy
to invert later (the `content-model` roadmap item establishes the JSON-loading pattern), but
it should be inverted before `landmarks/*` copies the shape.

**T3 — Test suite coupled to the R3F module boundary.**
`apps/web/src/app/app.spec.tsx:10-12` `vi.mock`s `@react-three/fiber` wholesale because jsdom
has no WebGL context. This is the standard and correct workaround (documented at `:5-9`, with
real-browser coverage deferred to `qa-smoke`), but it means the component test asserts only
the DOM overlay — every scene decision is currently unverified by any automated check.

### Loose-coupling examples

- **Type-only cross-library edge.** `libs/world/domain/src/lib/attribution.ts:1` uses
  `import type`, so the `world-domain → shared-domain` edge carries **zero runtime coupling**
  — it fully erases at build time.
- **Same at the app boundary.** `apps/api/src/lib/health.ts:1` imports `HealthResponse` as
  `import type`. `apps/api`'s only cross-project dependency is compile-time only; the
  serverless handler bundles with no workspace runtime code at all.
- **Vendor-neutral handler signature.** `health(): Response` (`health.ts:9`) depends on the
  Fetch API rather than any platform SDK, deliberately (`:3-8`).
- **Default-parameter injection.** `totalBudgetBytes(assets = SOURCE_ASSETS)`
  (`asset-manifest.ts:76-78`) is callable against any asset list, which is what lets
  `asset-manifest.spec.ts` assert budget invariants without touching globals.
- **`tierAllows` is a pure comparison** over a module-private `TIER_ORDER` map
  (`quality-tier.ts:11-17`) — no I/O, no device detection, trivially testable, and the
  runtime detection it will eventually pair with is correctly kept outside the domain.

---

## State Management

### What exists

**There is none, and that is currently correct.** Verified by inspection of all three `.tsx`
files:

- `apps/web/src/main.tsx` — `createRoot(...).render(<StrictMode><App /></StrictMode>)`. No
  provider, no store, no context.
- `apps/web/src/app/app.tsx` — no `useState`, no `useReducer`, no `useRef`, no `useContext`,
  no `useMemo`. `budgetMb` (`:17`) is derived on every render from a pure function over a
  frozen constant.
- No `zustand`, `jotai`, `valtio`, `redux`, or `@tanstack/query` in `package.json`.

The only "state" in the workspace is **immutable module-level data**:
`SOURCE_ASSETS` (`readonly AssetEntry[]`, `asset-manifest.ts:37`), `ATTRIBUTIONS`
(`Readonly<Record<...>>`, `attribution.ts:40`), `QUALITY_TIERS` (`as const`,
`quality-tier.ts:7`). All deeply readonly; nothing is mutated anywhere.

### Consistency

Uniform — a single approach (frozen module constants + derived pure functions) applied
everywhere, with zero exceptions. `ValueObject` (`value-object.ts:8-10`) reinforces it by
`Object.freeze`-ing props in its constructor.

### Assessment against what is coming

This is the highest-risk *unresolved* architectural decision in the project. The roadmap
requires at least four pieces of cross-cutting mutable state:

| Roadmap item | State it introduces |
|---|---|
| `dive-camera` | scroll position → normalised dive depth, read every frame |
| `landmark-kernel` | hover / focus / active-landmark, shared between R3F scene and HTML overlays |
| `quality-tiers` | resolved tier from sustained FPS, read by every asset loader |
| `complaints-wall` | server data (list, submit, moderation) |

The first three are **render-loop state**, where React's `useState` is the wrong tool — a
`setState` per scroll frame re-renders the tree 60×/second. The idiomatic R3F answer is a
transient store read inside `useFrame` (zustand's `subscribe`/`getState`, or refs) so that
per-frame values never re-render React at all, with React state reserved for discrete
transitions (landmark opened, tier changed). `complaints-wall` is ordinary async server state
and wants a different tool entirely.

Nothing in the workspace commits to an answer yet, and no roadmap item is titled "choose a
state library". The risk is that `dive-camera` — the first item to need it — picks something
ad hoc and `landmark-kernel` inherits it. **Recommendation: make the transient-vs-React-state
split an explicit decision in `dive-camera`, before `landmark-kernel` starts.**

---

## Pattern Comparison

### Patterns this project USES

| Pattern | Where | Maturity |
|---|---|---|
| Nx TS-solution monorepo (project references, source-consumed libs) | `tsconfig.json`, all `package.json` `exports` | ✅ complete |
| Three-dimensional tag taxonomy (`scope`/`type`/`platform`) | `eslint.config.mjs:18-131` | ✅ complete & verified enforcing |
| Layered architecture (app → feature → domain → util) | tag constraints + import graph | ✅ correct, thinly populated |
| Bounded contexts with strict isolation | `eslint.config.mjs:86-113` | ⚠️ 2 of 7 contexts exist |
| Tactical DDD (`Result`, `Branded`, `ValueObject`) | `libs/shared/domain/src/lib/*` | ❌ declared, not applied (B1–B3) |
| Component-based declarative scene graph (R3F) | `apps/web/src/app/app.tsx` | ⚠️ 40 lines |
| Vendor-neutral handler port (Fetch API) | `apps/api/src/lib/health.ts:3-8` | ⚠️ port without adapter (D1) |
| Contract-first app-to-app typing | `libs/shared/api-interfaces` | ⚠️ one-ended (B4) |
| Data-as-code licence compliance | `attribution.ts` + `asset-manifest.spec.ts:31-33` | ✅ exemplary |
| Budget-as-data with test enforcement | `asset-manifest.ts:19-23`, spec `:17-25` | ✅ complete |
| Strict TS everywhere (`strict`, `noUnusedLocals`, `noImplicitReturns`, `isolatedModules`) | `tsconfig.base.json` | ✅ complete |

### Patterns RECOMMENDED for this stack (React 19 + R3F 9 + Three 0.185 + Nx 23 + Vite 8)

| Recommended | Why it matters here | Present? |
|---|---|---|
| Transient state for per-frame values (store subscription / refs inside `useFrame`, never `setState`) | `dive-camera` is scroll-bound at 60 fps; `setState` per frame is the classic R3F frame-rate killer | ❌ not yet decided |
| Single `<Canvas>`, never remounted; scene composed by children | remount destroys the WebGL context and re-uploads every GPU buffer | ✅ (single Canvas at `app.tsx:21`) |
| glTF loading via `useGLTF` + `<Suspense>` + preload, with Draco/Meshopt/KTX2 loader wiring | 28 MB of raw glTF, one 17 MB model; `asset-compression` is a prerequisite per `README.md` | ❌ no loader code, `compressedPath` is `null` for all 4 assets |
| Geometry/material sharing and instancing for repeated meshes | bubbles/plankton in `world-environment`; per-mesh materials are the usual draw-call blowup | ❌ not yet |
| Adaptive quality tiers driven by measured frame rate | already modelled: `QUALITY_TIERS`, `tierAllows`, `AssetEntry.minimumTier` | ⚠️ **contract exists, resolver does not** — `quality-tier.ts:3-5` defers it to the `quality-tiers` item. Good split. |
| `libs/<context>/{domain,feature,ui,data-access}` quadrant per bounded context | Nx's canonical library taxonomy; the roadmap plans exactly this | ⚠️ planned, only `domain` built |
| Buildable-or-source decision made once and applied uniformly | mixing the two produces confusing `nx affected` behaviour | ✅ uniform (source-consumed, `enforceBuildableLibDependency: false` with a written rationale at `eslint.config.mjs:21-24`) |
| A deployable artifact per app | | ❌ **`apps/api` has no build target** (D1) |
| Explicit `lib` for browser code covering both DOM and the ES target | | ❌ **broken** — see gap G1 |
| Route-level / asset-level code splitting for the 3D payload | first-load budget is dominated by binaries | ❌ not yet (single `index-*.js` chunk in `apps/web/dist`) |

### Gap analysis

**G1 — `apps/web` silently compiles against ES5 lib types.** *Verified.*
`tsconfig.base.json:9` sets `"lib": ["es2022"]`. `apps/web/tsconfig.app.json:6` overrides with
`"lib": ["dom"]` — and `lib` **replaces** rather than merges, so the ES2022 lib is dropped and
only the implicit default remains. Probe: adding

```ts
export const p = [1, 2].at(0);
export const q = Object.hasOwn({ a: 1 }, 'a');
```

to `apps/web/src/` produced

```
TS2550: Property 'at' does not exist on type 'number[]'. Try changing the 'lib' compiler option to 'es2022' or later.
TS2550: Property 'hasOwn' does not exist on type 'ObjectConstructor'. ...
```

while `target` remains `es2022`, so those calls would emit and run fine in the browser. No
current code uses an ES2022 built-in, which is why CI is green. Latent, cheap to fix:
`"lib": ["es2022", "dom", "dom.iterable"]` in `apps/web/tsconfig.app.json`.

**G2 — Layering rules do not cover `type:feature-api`.** (D4, verified.) Add the constraint
before `complaints-api` creates the library.

**G3 — No adapter for the serverless port.** (D1, verified.) `apps/api` cannot produce
JavaScript. Whichever host is chosen in `deploy-static`, a thin adapter layer and a real build
target are required; the Fetch-API port shape means that adapter stays small.

**G4 — `platform:` isolation stops at project imports.** (D3, verified.) Consider dropping
`"types": ["node"]` from the three `platform:shared` libraries' `tsconfig.lib.json` (none of
them use a Node API), so a `Buffer`/`process` reference fails typecheck instead of shipping to
a browser.

**G5 — The tactical-DDD primitives should be applied or removed.** (B1–B3.) Either make
`findAsset` return `Result`, type `AssetEntry.id` as `AssetId`, and subclass `ValueObject` —
or delete the unused primitives. A library of aspirational abstractions is the standard way a
young codebase accumulates conventions nobody follows. `dive-camera`'s `DivePath` value object
is the natural forcing point; note that `ValueObject.equals`'s `JSON.stringify` comparison
(B3) needs a test before it acquires its first subclass.

**G6 — Instance data lives in a domain library.** (T2.) `SOURCE_ASSETS` should become loaded
data, not a source constant, before the landmark libraries copy the shape.

**G7 — State-management strategy undecided.** See State Management. Decide in `dive-camera`.

**G8 — No i18n/RTL handling despite already shipping Arabic.**
`apps/web/index.html:2` sets `lang="en"` (and `<title>Web</title>`, still the Nx generator
default), while `apps/web/src/app/app.tsx:33` renders `<h1>قاع الهامور</h1>` with no `lang` or
`dir` attribute. Bilingual support is scheduled as `i18n-bilingual` in phase 6, but the
Arabic content is in the DOM *today* — screen readers will read it with an English voice, and
the document has no RTL direction strategy. Cheap to fix now (`lang`/`dir` on the element, a
real `<title>`); expensive to retrofit once every landmark overlay carries bilingual copy.

**G9 — `shared-api-interfaces` has no tests.** It is the only project without a `test-ci`
target (`nx show project` output above) because it has no spec file. Acceptable for a
pure-type library — noted for completeness rather than as a defect.

---

## Verdict

| Dimension | Rating | Note |
|---|---|---|
| Folder structure | **Follows conventions** | canonical Nx 23 TS-solution layout, no drift |
| Dependency direction | **Correct** | zero cycles, zero outward edges, escape hatches verified closed |
| Boundary enforcement | **Strong, with two coverage gaps** | rules verified firing; `type:feature-api` (D4) and ambient types (D3) uncovered |
| Pattern consistency | **Mixed** | layering is exemplary; tactical DDD is declared but unapplied |
| Coupling | **Loose** | Ce ≤ 2 everywhere, cross-library edges are `import type` only |
| State management | **N/A today, undecided for tomorrow** | highest-risk open decision |
| Deployability | **Incomplete** | `apps/api` has no build target and emits no JavaScript |

**Bottom line.** The architecture is unusually well-specified for a project of this size, and
— importantly — the specification is *enforced*, not merely documented: four separate probes
confirmed the boundary rules fire on cross-scope imports, cross-layer imports, relative-path
escapes, and untagged projects. That is a real, working foundation.

The risk is not drift; it is **atrophy**. Three patterns (`Result`, `Branded`,
`ValueObject`) are declared and unused, one bounded-context rule protects five contexts that
do not exist, and the project's own central commitment — "forkers edit data, not components" —
is contradicted by its only real dataset living as a source constant in a domain library. The
next few roadmap items (`world-environment`, `dive-camera`, `landmark-kernel`) are where these
either become real or become dead weight.

**Ordered by cost-to-fix-now vs cost-to-fix-later:** G1 and G8 are one-line fixes today. G2
and G4 are config edits that must land *before* the libraries they protect are generated. G7
must be decided in `dive-camera` or it will be decided by accident. G3, G5, and G6 are genuine
work, correctly scheduled, and should not be pulled forward.
