# Project Profile — qa3elhamor

Phase 1 factual profile. Generated from workspace files on 2026-09-04.

- **Workspace root:** `D:\projects\qa3elhamor`
- **Root package name:** `@qa3elhamor/source` (version `0.0.0`, `private: true`, license `MIT`)
- **Git:** repository present, branch `main`, no commits in history; all tracked paths currently untracked (`??`)
- **README title:** قاع الهامور — Qaa El-Hamour

---

## Tech Stack

### Languages

| Language | Version constraint | Source |
|---|---|---|
| TypeScript | `~6.0.3` declared; `6.0.3` installed | root `package.json` devDependencies |
| JavaScript (ESM `.mjs`) | n/a | ESLint flat configs |
| CSS | n/a | `apps/web/src/styles.css` |
| HTML | n/a | `apps/web/index.html` |

TypeScript compiler options (`tsconfig.base.json`): `strict: true`, `composite: true`, `emitDeclarationOnly: true`, `declarationMap: true`, `isolatedModules: true`, `importHelpers: true`, `module`/`moduleResolution`: `nodenext`, `target`/`lib`: `es2022`, `noEmitOnError`, `noFallthroughCasesInSwitch`, `noImplicitOverride`, `noImplicitReturns`, `noUnusedLocals`, `skipLibCheck`, `customConditions: ["@qa3elhamor/source"]`, `types: ["*"]`.

`apps/web/tsconfig.app.json` overrides: `jsx: react-jsx`, `lib: ["dom"]`, `module: esnext`, `moduleResolution: bundler`, `rootDir: src`, `outDir: dist`.

### Frameworks & libraries

| Framework | Declared | Installed |
|---|---|---|
| React | `^19.0.0` | 19.2.8 |
| React DOM | `^19.0.0` | 19.2.8 |
| Three.js | `^0.185.1` | 0.185.1 |
| @react-three/fiber | `^9.7.0` | 9.7.0 |
| @react-three/drei | `^10.7.8` | 10.7.8 |

### Build / tooling

| Tool | Declared | Installed |
|---|---|---|
| Nx | `23.1.1` | 23.1.1 |
| Vite | `^8.0.0` | 8.2.2 |
| Vitest | `~4.1.0` | 4.1.11 |
| ESLint | `^9.8.0` | — |
| Prettier | `^3.8.1` | — |
| SWC core | `1.15.8` | — |

### Runtime environment

- Package manager: npm (`package-lock.json`, `lockfileVersion: 3`, 1163 package entries). No `pnpm-lock.yaml` or `yarn.lock`.
- No `engines` field in any `package.json`; no `.nvmrc`.
- CI pins Node **22** (`actions/setup-node@v4`, `node-version: 22`) on `ubuntu-latest`.
- Browser target: `apps/web` (Vite dev/preview on `localhost:4200`).
- Serverless target: `apps/api` handlers written to the Fetch API (`Request` → `Response`); no vendor runtime selected. `apps/api/package.json` declares `"type": "module"`.

---

## Dependencies

### Production dependencies (root, 5 total)

| Package | Range |
|---|---|
| `react` | `^19.0.0` |
| `react-dom` | `^19.0.0` |
| `three` | `^0.185.1` |
| `@react-three/fiber` | `^9.7.0` |
| `@react-three/drei` | `^10.7.8` |

### Dev dependencies (root, 36 total)

- **Nx plugins:** `@nx/eslint` `^23.1.1`, `@nx/eslint-plugin` `^23.1.1`, `@nx/js` `23.1.1`, `@nx/react` `^23.1.1`, `@nx/vite` `^23.1.1`, `@nx/vitest` `^23.1.1`, `@nx/web` `^23.1.1`, `nx` `23.1.1`
- **Build/transpile:** `vite` `^8.0.0`, `@vitejs/plugin-react` `^6.0.0`, `@swc/core` `1.15.8`, `@swc/cli` `~0.8.1`, `@swc/helpers` `0.5.18`, `@swc-node/register` `1.11.1`, `typescript` `~6.0.3`, `tslib` `^2.3.0`, `jiti` `2.4.2`
- **Testing:** `vitest` `~4.1.0`, `@vitest/coverage-v8` `~4.1.0`, `@vitest/ui` `~4.1.0`, `jsdom` `^27.1.0`, `@testing-library/react` `16.3.0`, `@testing-library/dom` `10.4.0`
- **Linting/formatting:** `eslint` `^9.8.0`, `typescript-eslint` `^8.58.0`, `eslint-config-prettier` `^10.0.0`, `eslint-plugin-import` `2.31.0`, `eslint-plugin-jsx-a11y` `6.10.1`, `eslint-plugin-react` `^7.35.0`, `eslint-plugin-react-hooks` `5.0.0`, `prettier` `^3.8.1`, `@eslint/js` `^9.8.0`
- **Types:** `@types/node` `^24.0.0`, `@types/react` `^19.0.0`, `@types/react-dom` `^19.0.0`, `@types/three` `^0.185.4`

### Workspace-internal dependencies

Declared as `workspace:*` in the per-project `package.json` files:

| Consumer | Depends on |
|---|---|
| `@qa3elhamor/web` | `@qa3elhamor/world-domain`, `@qa3elhamor/shared-util` |
| `@qa3elhamor/api` | `@qa3elhamor/shared-api-interfaces` |
| `@qa3elhamor/world-domain` | `@qa3elhamor/shared-domain` |
| `@qa3elhamor/shared-domain` | none |
| `@qa3elhamor/shared-util` | none |
| `@qa3elhamor/shared-api-interfaces` | none |

### Dependency count summary

- Root production: **5**
- Root dev: **36**
- Root total declared: **41**
- Resolved packages in `package-lock.json`: **1163**
- No runtime dependencies are declared outside the root `package.json` other than the workspace links above.
- Named in `README.md` / `.ptah/roadmap.md` as future choices but **not present** in the dependency tree: Prisma, any Postgres driver, any CMS package, any glTF compression tool (`gltf-transform`, Draco, Meshopt, KTX2/Basis).

---

## File Structure

### Directory tree (depth 2–3, build output and `node_modules` omitted)

```
.
├── .agents/skills/            # 12 vendored skill dirs (gitignored, Ptah-managed copies)
├── .claude/
│   ├── commands/
│   └── skills/                # same 12 skills (gitignored)
├── .github/
│   ├── skills/                # same 12 skills (gitignored)
│   └── workflows/ci.yml
├── .ptah/
│   ├── analysis/qa3elhamor/   # manifest.json (+ this document)
│   ├── harness/               # antigravity|claude|codex|copilot|vscode manifest.json, state.json
│   ├── ai-team.md
│   ├── ptah-tooling-issues.md
│   ├── roadmap.md
│   └── scope-decisions.md
├── .vscode/
│   ├── extensions.json
│   └── mcp.json
├── apps/
│   ├── api/                   # src/index.ts, src/lib/health.ts + health.spec.ts
│   └── web/                   # index.html, src/main.tsx, src/app/app.tsx + app.spec.tsx,
│                              # src/styles.css, src/assets/.gitkeep, public/favicon.ico
├── assets/                    # 4 CC-BY-4.0 glTF models + concept doc
│   ├── bikini_bottom_map_3d_model/                    (scene.gltf, scene.bin, license.txt, textures/)
│   ├── sbfbb-spongebob_house/                         (same layout)
│   ├── sponge_on_the_run_patrick_base_model_textured/ (same layout)
│   ├── sponge_on_the_run_spongebob_base_model/        (same layout)
│   └── qaa-elhamour-threejs-concept.md
├── docs/
│   └── asset-inventory.md
├── libs/
│   ├── shared/
│   │   ├── api-interfaces/    # src/lib/health.ts
│   │   ├── domain/            # result.ts (+spec), branded-id.ts, value-object.ts
│   │   └── util/              # math.ts (+spec)
│   └── world/
│       └── domain/            # asset-manifest.ts (+spec), attribution.ts, quality-tier.ts
├── eslint.config.mjs
├── nx.json
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsconfig.base.json
├── vitest.config.ts
├── .prettierrc / .prettierignore / .gitignore
├── .mcp.json / .mcp.json.bak
└── README.md
```

Build-output directories present on disk but gitignored: `apps/api/dist`, `apps/api/out-tsc`, `apps/web/dist`, `apps/web/out-tsc`, and `dist/` + `out-tsc/` under each of the four libraries. An `.nx/` cache directory is also present.

### Total file count by type

All files excluding `node_modules/`, `.git/`, `.nx/`: **449**.

Excluding also `dist/` and `out-tsc/`:

| Extension | Count |
|---|---:|
| `.png` | 159 |
| `.md` | 128 |
| `.json` | 40 |
| `.ts` | 19 |
| `.mjs` | 7 |
| `.mts` | 6 |
| `.txt` | 4 |
| `.gltf` | 4 |
| `.bin` | 4 |
| `.tsx` | 3 |
| `.bak` | 2 |
| `.yml` | 1 |
| `.html` | 1 |
| `.ico` | 1 |
| `.css` | 1 |
| `.gitkeep` | 1 |
| dotfiles (`.prettierrc`, `.prettierignore`, `.gitignore`) | 3 |

Distribution notes:

- All 159 `.png` files are 3D model textures under `assets/*/textures/` (99 map, 55 house, 4 SpongeBob, 1 Patrick). None are application images.
- Of 128 `.md` files, **121** are vendored agent-skill documents triplicated across `.claude/` (45), `.github/` (38), and `.agents/` (38) — all covered by the Ptah-managed `.gitignore` block. Only **7** are project documents: `README.md`, `docs/asset-inventory.md`, `assets/qaa-elhamour-threejs-concept.md`, and four under `.ptah/` (`roadmap.md`, `scope-decisions.md`, `ai-team.md`, `ptah-tooling-issues.md`).

### First-party source (under `apps/` + `libs/`, excluding `dist/`, `out-tsc/`)

| Extension | Count |
|---|---:|
| `.json` (tsconfigs, package.json) | 24 |
| `.ts` | 18 |
| `.mts` (Vite/Vitest configs) | 6 |
| `.mjs` (ESLint configs) | 6 |
| `.tsx` | 3 |
| `.html` | 1 |
| `.css` | 1 |

Total lines across all `.ts` + `.tsx` in `apps/` and `libs/`: **508**.

Test files (5): `apps/api/src/lib/health.spec.ts`, `apps/web/src/app/app.spec.tsx`, `libs/shared/domain/src/lib/result.spec.ts`, `libs/shared/util/src/lib/math.spec.ts`, `libs/world/domain/src/lib/asset-manifest.spec.ts`.

### Asset payload sizes (on disk)

| Directory | Dir size | `scene.bin` | `scene.gltf` | Textures |
|---|---:|---:|---:|---:|
| `sponge_on_the_run_spongebob_base_model` | 17 MB | 16,059,344 B | 28,294 B | 4 PNG |
| `bikini_bottom_map_3d_model` | 5.0 MB | 3,422,704 B | 495,707 B | 99 PNG |
| `sponge_on_the_run_patrick_base_model_textured` | 3.3 MB | 3,130,080 B | 5,008 B | 1 PNG |
| `sbfbb-spongebob_house` | 2.3 MB | 1,432,480 B | 142,688 B | 55 PNG |
| **`assets/` total** | **28 MB** | | | |

Each model directory contains a `license.txt`. `docs/asset-inventory.md` records 671,140 total triangles and 26.68 MiB across the four models, of which 22.93 MiB (86%) is `scene.bin` geometry; `spongebob-character` alone is 519,664 triangles.

---

## Entry Points & Configuration

### Application entry points

| Path | Role |
|---|---|
| `apps/web/index.html` | HTML document; loads `/src/styles.css` and `/src/main.tsx` as a module, mounts into `<div id="root">`; `<title>Web</title>`, `lang="en"` |
| `apps/web/src/main.tsx` | React entry — `ReactDOM.createRoot(...).render(<StrictMode><App /></StrictMode>)` |
| `apps/web/src/app/app.tsx` | Root component; renders an R3F `<Canvas>` (camera `[0, 1.5, 6]`, `fov: 55`) with `color` background `#0a1e3f`, `fogExp2` density `0.06`, ambient + directional light, and a 60×60 plane mesh; reads `SOURCE_ASSETS` and `totalBudgetBytes()` from `@qa3elhamor/world-domain` |
| `apps/api/src/index.ts` | Barrel — `export * from './lib/health.js'` |
| `apps/api/src/lib/health.ts` | `health(): Response` returning a `HealthResponse` JSON payload with `content-type: application/json`, status 200 |
| `libs/shared/domain/src/index.ts` | Barrel — `result.js`, `branded-id.js`, `value-object.js` |
| `libs/shared/util/src/index.ts` | Barrel — `math.js` |
| `libs/shared/api-interfaces/src/index.ts` | Barrel — `health.js` |
| `libs/world/domain/src/index.ts` | Barrel — `quality-tier.js`, `attribution.js`, `asset-manifest.js` |

Every library and `apps/api` sets `main`/`types` to `./src/index.ts` and exposes an `exports` map pointing at TypeScript source (consumed directly by Vite through the TS project references; `enforceBuildableLibDependency` is disabled in the lint config for this reason). `apps/web/package.json` declares no `main`/`exports`.

### Key configuration files

| File | Purpose |
|---|---|
| `nx.json` | Nx config: plugins `@nx/js/typescript`, `@nx/eslint/plugin`, `@nx/vite/plugin`, `@nx/vitest`; target names `build` / `serve` / `dev` / `preview` / `serve-static` / `typecheck` / `lint` / `test` / `test-ci` / `build-deps` / `watch-deps`; `analytics: false`; `targetDefaults.test.dependsOn: ["^build"]`; `namedInputs` `default` / `production` / `sharedGlobals`; React generator defaults (`bundler: vite`, `style: css`, `linter: eslint`, `babel: true`) |
| `tsconfig.base.json` | Shared compiler options (strict, composite, nodenext, es2022) |
| `tsconfig.json` | Solution file — `files: []`, project references to all 6 projects |
| `apps/web/tsconfig.json` / `.app.json` / `.spec.json` | Web app config split; `tsconfig.app.json` references `libs/shared/util` and `libs/world/domain` `tsconfig.lib.json` |
| `apps/api/tsconfig.json` / `.lib.json` / `.spec.json` | API app configs |
| `libs/*/*/tsconfig.json` / `.lib.json` / `.spec.json` | Per-library configs (4 libraries × 3 = 12) |
| `apps/web/vite.config.mts` | Vite: `port: 4200` on `localhost` (server + preview), `@vitejs/plugin-react`, `outDir: ./dist`, `emptyOutDir`, `reportCompressedSize`, `cacheDir: ../../node_modules/.vite/apps/web`; inline Vitest block (`environment: jsdom`, `globals: true`, `watch: false`, v8 coverage into `./test-output/vitest/coverage`) |
| `apps/api/vitest.config.mts` | Vitest for API (`environment: node`, `globals: true`, `watch: false`, v8 coverage) |
| `libs/*/*/vitest.config.mts` | Per-library Vitest configs (4) |
| `vitest.config.ts` (root) | Vitest workspace aggregation via `test.projects` globs over `**/vite.config.*` and `**/vitest.config.*`, excluding the root files themselves |
| `eslint.config.mjs` (root) | Flat config: `@nx` `flat/base`, `flat/typescript`, `flat/javascript` presets; ignores `**/dist`, `**/out-tsc`, Vite/Vitest timestamp files; carries the full `@nx/enforce-module-boundaries` rule |
| `apps/web/eslint.config.mjs` | Adds `nx.configs['flat/react']` on top of the root config |
| `apps/api/eslint.config.mjs`, `libs/*/*/eslint.config.mjs` | Per-project extensions of the root config (5 total) |
| `.prettierrc` | `{ "singleQuote": true }` |
| `.prettierignore` | `/dist`, `/coverage`, `/.nx/cache`, `/.nx/workspace-data`, `.nx/self-healing` |
| `.github/workflows/ci.yml` | CI (detailed below) |
| `.vscode/extensions.json` | Recommends `nrwl.angular-console`, `esbenp.prettier-vscode`, `dbaeumer.vscode-eslint` |
| `.vscode/mcp.json`, `.mcp.json` (+ `.mcp.json.bak`) | MCP server registration: `ptah` (HTTP, `localhost:51821`) and `firecrawl` (stdio via `npx -y firecrawl-mcp`, key from `${FIRECRAWL_API_KEY}`) |
| `.gitignore` | Ignores `node_modules/`, `dist/`, `out-tsc/`, `build/`, `*.tsbuildinfo`, `.nx/cache`, `.nx/workspace-data`, `test-output/`, `coverage/`, `apps/web/public/models/`, `.env*`, editor/OS files, Vite/Vitest timestamp files, plus a Ptah-managed block ignoring `.agents/skills/`, `.claude/commands/`, `.claude/skills/`, `.codex/agents/`, `.github/agents/`, `.github/skills/` |

### CI pipeline (`.github/workflows/ci.yml`)

- Triggers: push to `main`, all pull requests. Concurrency group per workflow + ref with `cancel-in-progress: true`. Permissions: `contents: read`, `actions: read`.
- Single job `validate` on `ubuntu-latest`:
  1. `actions/checkout@v4` with `fetch-depth: 0`
  2. `actions/setup-node@v4`, Node 22, npm cache
  3. `npm ci`
  4. `nrwl/nx-set-shas@v4`
  5. `npx nx sync:check`
  6. `npx nx affected -t lint typecheck test --parallel=3`
  7. `npx nx affected -t build --parallel=3`
- No deploy, release, or publish job exists.

### Environment configuration

- No `.env`, `.env.example`, `.env.local`, or environment-schema file exists in the repository. `.gitignore` reserves `.env`, `.env.local`, `.env.*.local`.
- The only environment variable referenced in any configuration is `FIRECRAWL_API_KEY` in `.mcp.json` — developer MCP tooling, not application runtime.
- No `Dockerfile`, `docker-compose*`, Terraform, or hosting-platform config (`vercel.json`, `netlify.toml`, `wrangler.toml`) is present.

### Documented commands (`README.md`)

```bash
npm install
npx nx dev web                                  # http://localhost:4200
npx nx run-many -t lint typecheck test build
```

The root `package.json` declares `"scripts": {}` — every target is inferred by the four Nx plugins rather than defined as an npm script or a `project.json` target.

---

## Monorepo Structure

- **Tool:** Nx `23.1.1` over **npm workspaces**. Root `package.json` declares `"workspaces": ["apps/*", "libs/*/*"]`.
- **Project resolution:** each project carries its own `package.json` with an `nx` block supplying `name` and `tags`; TypeScript project references (solution-style `tsconfig.json`) link them. No `project.json` files exist anywhere in the workspace.
- **Projects:** 6 total — 2 applications, 4 libraries.

### Applications

| Project | Package name | Path | Tags | Contents |
|---|---|---|---|---|
| `web` | `@qa3elhamor/web` | `apps/web` | `type:app`, `platform:web` | React + R3F site. In-code and README comments designate it the composition root — the only place allowed to wire content into scene libraries |
| `api` | `@qa3elhamor/api` | `apps/api` | `type:app`, `platform:serverless` | Fetch-API serverless handlers; one `health` handler today |

Neither app carries a `scope:` tag.

### Libraries

| Project | Package name | Path | Tags | Exported contents |
|---|---|---|---|---|
| `shared-domain` | `@qa3elhamor/shared-domain` | `libs/shared/domain` | `scope:shared`, `type:domain`, `platform:shared` | `Result<T,E>` with `ok`, `err`, `isOk`, `isErr`, `mapResult`, `unwrapOr`; `Branded<TBrand>` nominal id type + `brandId`; abstract `ValueObject<TProps>` base class |
| `shared-util` | `@qa3elhamor/shared-util` | `libs/shared/util` | `scope:shared`, `type:util`, `platform:shared` | Pure math: `clamp`, `lerp`, `remap`, `smoothstep` |
| `shared-api-interfaces` | `@qa3elhamor/shared-api-interfaces` | `libs/shared/api-interfaces` | `scope:shared`, `type:api-interfaces`, `platform:shared` | `HealthResponse` DTO. Documented as the only type channel between `apps/web` and `apps/api` |
| `world-domain` | `@qa3elhamor/world-domain` | `libs/world/domain` | `scope:world`, `type:domain`, `platform:shared` | `AssetEntry` contract; `SOURCE_ASSETS` (4 entries); `findAsset`, `totalBudgetBytes`, `assetsMissingAttribution`; `QUALITY_TIERS` / `QualityTier` / `tierAllows`; `Attribution` type, `creditLine`, `ATTRIBUTIONS` (4 CC-BY-4.0 records); `AssetId` branded type |

`SOURCE_ASSETS` entries and their declared budgets:

| id | `sourcePath` | `compressedPath` | `sourceBytes` | `budgetBytes` | `minimumTier` |
|---|---|---|---:|---:|---|
| `bikini-bottom-map` | `assets/bikini_bottom_map_3d_model/scene.gltf` | `null` | 5.0 MB | 1.5 MB | `low` |
| `pineapple-house` | `assets/sbfbb-spongebob_house/scene.gltf` | `null` | 2.3 MB | 0.6 MB | `low` |
| `spongebob-character` | `assets/sponge_on_the_run_spongebob_base_model/scene.gltf` | `null` | 17 MB | 2 MB | `medium` |
| `patrick-character` | `assets/sponge_on_the_run_patrick_base_model_textured/scene.gltf` | `null` | 3.3 MB | 1 MB | `high` |

All four `compressedPath` values are `null`; all four are licensed `CC-BY-4.0` with attribution records in `attribution.ts`.

### Module boundary rules (`eslint.config.mjs`)

`@nx/enforce-module-boundaries` is set to `error` with `enforceBuildableLibDependency: false` and three tag dimensions:

- **`type:`** — `app` and `feature` → `feature | ui | data-access | domain | util | api-interfaces`; `ui` → `ui | domain | util | api-interfaces`; `data-access` → `data-access | domain | util | api-interfaces`; `domain` → `domain | util`; `util` → `util`; `api-interfaces` → `api-interfaces | domain`.
- **`scope:`** — declared contexts `shared`, `world`, `dive`, `landmarks`, `content`, `complaints`, `telemetry`. Each may depend only on itself and `scope:shared`; `scope:shared` may depend only on `scope:shared`.
- **`platform:`** — `serverless` → `serverless | shared`; `web` → `web | shared`; `shared` → `shared`.

Four of the seven declared `scope:` values (`dive`, `landmarks`, `content`, `complaints`, `telemetry`) currently have no library in the workspace.

### Roadmap state (`.ptah/roadmap.md`)

31 tracked items across 8 phases; **5 complete, 26 open**.

| Phase | Items | Completed |
|---|---|---|
| 1 — Foundation | workspace-init, shared-primitives, asset-manifest, ci-baseline | 4 / 4 |
| 2 — Asset Pipeline | asset-audit, asset-compression, asset-attribution-ui | 1 / 3 |
| 3 — The Dive | world-environment, dive-camera, quality-tiers | 0 / 3 |
| 4 — Landmarks & Content | landmark-kernel, content-model, landmark-pineapple, landmark-bureau, cms-integration, landmark-tiki, landmark-krusty-krab | 0 / 7 |
| 5 — Complaints | complaints-domain, complaints-contact-adapter, complaints-api, complaints-wall, complaints-moderation | 0 / 5 |
| 6 — Telemetry & Template Readiness | telemetry-events, template-config, i18n-bilingual | 0 / 3 |
| 7 — Deployment & Hardening | deploy-static, perf-budget, security-hardening | 0 / 3 |
| 8 — QA & Launch | a11y-fallback, qa-smoke, launch-checklist | 0 / 3 |

`README.md` states: "Stage A foundation is complete… No scene, camera, landmark, or backend feature is built yet."

---

## Language Distribution

### First-party source code (`apps/` + `libs/`, excluding `dist/`, `out-tsc/`, and config files)

| Language | Files | % of code files |
|---|---:|---:|
| TypeScript (`.ts`) | 18 | 78.3% |
| TSX (`.tsx`) | 3 | 13.0% |
| CSS | 1 | 4.3% |
| HTML | 1 | 4.3% |
| **Total** | **23** | **100%** |

Combined `.ts` + `.tsx` line count in `apps/` and `libs/`: **508 lines**.

### Same tree including configuration files (59 files)

| Type | Files | % |
|---|---:|---:|
| JSON (tsconfig / package.json) | 24 | 40.7% |
| TypeScript (`.ts`) | 18 | 30.5% |
| `.mts` (Vite/Vitest configs) | 6 | 10.2% |
| `.mjs` (ESLint configs) | 6 | 10.2% |
| TSX (`.tsx`) | 3 | 5.1% |
| HTML | 1 | 1.7% |
| CSS | 1 | 1.7% |

### Whole repository (449 files, excluding `node_modules/`, `.git/`, `.nx/`)

| Category | Files | % |
|---|---:|---:|
| Binary 3D texture assets (`.png`) | 159 | 35.4% |
| Markdown (`.md`) — 121 vendored skill docs, 7 project docs | 128 | 28.5% |
| JSON (configs, manifests, `package-lock.json`) | 40 | 8.9% |
| TypeScript (`.ts`) | 19 | 4.2% |
| Config scripts (`.mjs` 7, `.mts` 6) | 13 | 2.9% |
| glTF model data (`.gltf` 4, `.bin` 4) | 8 | 1.8% |
| Licence text (`.txt`) | 4 | 0.9% |
| TSX (`.tsx`) | 3 | 0.7% |
| Other (`.yml`, `.html`, `.css`, `.ico`, `.bak`, dotfiles, `.gitkeep`) | 10 | 2.2% |
| Build output under `dist/` and `out-tsc/` | remainder | — |

By source line count, TypeScript and TSX account for 100% of first-party program code (508 lines). No other programming language appears in the workspace.
