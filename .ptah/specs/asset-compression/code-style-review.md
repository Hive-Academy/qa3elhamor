# Code Style Review — `asset-compression`

**Verdict:** APPROVED  
**Overall Score:** 8/10  

## Summary

| Metric          | Value        |
| --------------- | ------------ |
| Overall score   | 8/10         |
| Assessment      | APPROVED     |
| Blocking issues | 0            |
| Serious issues  | 1            |
| Minor issues    | 7            |
| Files reviewed  | 9            |

The `asset-compression` implementation delivers an exceptionally well-engineered, reproducible, and domain-pure asset pipeline. Domain manifests (`SOURCE_MODELS`, `WEB_ASSETS`) maintain total purity with zero I/O or framework dependencies. Attribution records (`ATTRIBUTIONS`) are strictly bound to source models to enforce CC-BY-4.0 licensing invariants at both compile time and runtime. The migration from `workspace:*` to `*` ensures compatibility with `npm ci`. The ESLint boundary configurations properly account for build tooling. Emitted models are un-ignored and committed in `apps/web/public/models/`, satisfying the offline reproducible build invariant. The only serious finding is that CI does not currently execute `npm run assets:verify`, leaving budget and asset integrity checks unenforced on PRs.

---

## Five Style Questions

### 1. What breaks in six months?
- **CI fails to catch asset budget/integrity regressions:** Because `assets:verify` is only a root `package.json` script and not configured as an Nx target or CI step in `.github/workflows/ci.yml:39`, changes to models or `WEB_ASSETS` budgets in `libs/world/domain/src/lib/asset-manifest.ts` can be merged without validating that the emitted GLBs meet byte budgets or parse without corruption.
- **Tooling expansion blocked by ESLint boundary:** In `eslint.config.mjs:120-123`, `scope:tools` is not allowed to depend on `scope:tools`. If a second tool library is added under `tools/`, it will not be permitted to import shared tooling utilities without updating ESLint boundaries.

### 2. What would a new team member misread?
- **Initial load budget discrepancy in documentation:** In `docs/asset-compression-report.md:40`, the prose states that initial load budgets sum to `1,829 KiB`, whereas the results table on line 29 and the domain manifest in `libs/world/domain/src/lib/asset-manifest.ts:87-122` specify `1,800.0 KiB` (`1200 + 4 * 150 KiB`).
- **Stale float-tolerance comment in tests:** In `libs/world/domain/src/lib/asset-manifest.spec.ts:65`, the comment indicates byte counts are fractional floats requiring tolerance, but the assertion below it performs an exact integer equality check (`.toBe()`) because budgets were converted to exact integer multiples of `KiB`.
- **Orphan branded type:** `libs/world/domain/src/lib/attribution.ts:4` exports `export type AssetId = Branded<'Asset'>;`, but `AssetEntry.id` in `asset-manifest.ts:33` uses unbranded `string`. A new engineer might assume `AssetId` is used to brand web asset identifiers when it is currently unused.

### 3. What does this cost to maintain?
- **Committing 3.1 MiB of binary GLBs to Git:** Storing compressed assets under `apps/web/public/models/` keeps deployments and preview builds pure and fast (no build-time geometry processing or heavy native tooling in CI), but requires developers modifying models to remember to run `npm run assets:compress` and commit both binaries and metadata.
- **Dual manifest & pipeline recipes:** Updating or adding a landmark requires synchronized changes in `libs/world/domain/src/lib/asset-manifest.ts`, `tools/asset-pipeline/compress.ts`, and `tools/asset-pipeline/landmarks.ts`. The pipeline's built-in `assertNoDrift()` effectively mitigates divergence.

### 4. Where is this inconsistent with the rest of the repository?
- **ESLint scope self-dependency:** In `eslint.config.mjs:91-123`, every other scope (`scope:world`, `scope:dive`, `scope:landmarks`, etc.) allows depending on itself and `scope:shared`. `scope:tools` is the only scope that omits itself from `onlyDependOnLibsWithTags` and reaches across into `scope:world`.
- **String typing for domain entity identifiers:** Elsewhere in the domain layer, branded types (`Branded<'...'>`) are utilized for identifiers, whereas `AssetEntry.id` is typed as loose `string`.

### 5. What would you have done differently?
- Wired `npm run assets:verify` directly into `.github/workflows/ci.yml` as a mandatory validation step.
- Defined a `WebAssetId` union type for `AssetEntry.id` and exported it from `asset-manifest.ts` so calls to `findAsset(id)` and consumers in `apps/web` are type-guarded against typos.
- Included `await MeshoptDecoder.ready;` in the documentation's bare Three.js snippet to prevent asynchronous WASM initialization races.

---

## Blocking Issues

*None.*

---

## Serious Issues

### 1. CI does not execute `assets:verify`
- **File:** [`.github/workflows/ci.yml:39`](file:///D:/projects/qa3elhamor/.github/workflows/ci.yml#L39)
- **Problem:** The repository defines `"assets:verify": "tsx tools/asset-pipeline/compress.ts --verify"` in root `package.json`, but `tools/asset-pipeline/package.json` specifies no Nx targets. CI runs `npx nx affected -t lint typecheck test build`, which skips `tools/asset-pipeline` entirely and never runs `assets:verify`.
- **Impact:** An author can alter `WEB_ASSETS` budget ceilings in `libs/world/domain/src/lib/asset-manifest.ts` or inadvertently corrupt a committed `.glb` file, and CI will pass without verifying that assets conform to budgets or parse correctly.
- **Fix:** Add a validation step in `.github/workflows/ci.yml` after `npm ci`:
  ```yaml
  - run: npm run assets:verify
  ```
  Alternatively, register a `verify` target in `tools/asset-pipeline/package.json` and add `verify` to the `nx affected` command list.

---

## Minor Issues

### 2. `eslint.config.mjs` prevents `scope:tools` from importing sibling tools and accesses `scope:world` directly
- **File:** [`eslint.config.mjs:120-122`](file:///D:/projects/qa3elhamor/eslint.config.mjs#L120-L122)
- **Problem:** The tag boundary for `scope:tools` is configured as:
  ```javascript
  {
    sourceTag: 'scope:tools',
    onlyDependOnLibsWithTags: ['scope:world', 'scope:shared'],
  }
  ```
  It omits `'scope:tools'` (preventing multiple tooling libraries from sharing code) and directly accesses `scope:world`, bypassing the rule documented in line 90 that contexts only reach themselves and `scope:shared`.
- **Fix:** Add `'scope:tools'` to `onlyDependOnLibsWithTags`:
  ```javascript
  {
    sourceTag: 'scope:tools',
    onlyDependOnLibsWithTags: ['scope:tools', 'scope:world', 'scope:shared'],
  }
  ```

### 3. Prose and table discrepancy for initial-load budget sum
- **File:** [`docs/asset-compression-report.md:40`](file:///D:/projects/qa3elhamor/docs/asset-compression-report.md#L40)
- **Problem:** Line 40 states: `against budgets summing to 1,829 KiB`, whereas the results table on line 29 and `asset-manifest.ts:87-122` show exactly `1,800.0 KiB` (`1200 + 4 * 150 KiB = 1800 KiB`).
- **Fix:** Change `1,829 KiB` to `1,800 KiB` in `docs/asset-compression-report.md:40`.

### 4. Unused orphan branded type `AssetId` in `attribution.ts` while `AssetEntry.id` is an unconstrained `string`
- **File:** [`libs/world/domain/src/lib/attribution.ts:4`](file:///D:/projects/qa3elhamor/libs/world/domain/src/lib/attribution.ts#L4) and [`libs/world/domain/src/lib/asset-manifest.ts:33`](file:///D:/projects/qa3elhamor/libs/world/domain/src/lib/asset-manifest.ts#L33)
- **Problem:** `attribution.ts` exports `export type AssetId = Branded<'Asset'>;`, but this type is not referenced anywhere in the repository. Meanwhile, `AssetEntry.id` is typed as loose `string`.
- **Fix:** Define a union `export type WebAssetId = typeof WEB_ASSETS[number]['id'];` (or utilize `AssetId`) and type `AssetEntry.id` accordingly, or remove the unused `AssetId` export.

### 5. Stale float-tolerance comment in `asset-manifest.spec.ts`
- **File:** [`libs/world/domain/src/lib/asset-manifest.spec.ts:65-66`](file:///D:/projects/qa3elhamor/libs/world/domain/src/lib/asset-manifest.spec.ts#L65-L66)
- **Problem:** Line 65 contains the comment `// 1.2 MiB and 0.6 MiB are fractional byte counts, so compare with float tolerance.`, but line 66 performs an exact equality check: `expect(initialLoadBudgetBytes()).toBe(totalBudgetBytes() - lazyTotal);`. Because all budgets were refactored to exact integer multiples of `KiB`, no floating-point tolerance is needed.
- **Fix:** Update or remove the comment on line 65 to reflect that budgets are exact integer byte values.

### 6. Code snippet in documentation omits `await MeshoptDecoder.ready`
- **File:** [`docs/asset-compression-report.md:88-91`](file:///D:/projects/qa3elhamor/docs/asset-compression-report.md#L88-L91)
- **Problem:** The example loading snippet for bare `GLTFLoader` demonstrates `loader.setMeshoptDecoder(MeshoptDecoder);` without first awaiting `MeshoptDecoder.ready`. In Three.js, WASM compilation is asynchronous; invoking the decoder before `ready` resolves can throw runtime errors in vanilla environments.
- **Fix:** Update the documentation snippet:
  ```typescript
  await MeshoptDecoder.ready;
  loader.setMeshoptDecoder(MeshoptDecoder);
  ```

### 7. Missing uniqueness test for `SOURCE_MODELS`
- **File:** [`libs/world/domain/src/lib/asset-manifest.spec.ts:34-37`](file:///D:/projects/qa3elhamor/libs/world/domain/src/lib/asset-manifest.spec.ts#L34-L37)
- **Problem:** `asset-manifest.spec.ts` tests that `WEB_ASSETS` IDs are unique, but does not explicitly assert that `SOURCE_MODELS` contains unique IDs.
- **Fix:** Add a test verifying `new Set(SOURCE_MODELS.map((m) => m.id)).size === SOURCE_MODELS.length`.

### 8. License URL uses insecure HTTP
- **File:** [`libs/world/domain/src/lib/attribution.ts:33`](file:///D:/projects/qa3elhamor/libs/world/domain/src/lib/attribution.ts#L33)
- **Problem:** `CC_BY_4` defines `licenseUrl: 'http://creativecommons.org/licenses/by/4.0/'` using HTTP rather than HTTPS.
- **Fix:** Update `licenseUrl` to `'https://creativecommons.org/licenses/by/4.0/'`.

---

## File-by-File

### `libs/world/domain/src/lib/asset-manifest.ts`
**Score: 8/10** — [B] 0, [S] 0, [M] 1.  
Exemplary domain purity with zero I/O or platform dependencies. Correctly models source models and web assets with explicit byte budgets and quality tiers. `AssetEntry.id` could be more strictly typed as a union rather than plain `string`.

### `libs/world/domain/src/lib/attribution.ts`
**Score: 8/10** — [B] 0, [S] 0, [M] 2.  
Elegant binding of CC-BY-4.0 attribution records directly to `SourceModelId`, ensuring derivative web assets retain source credits. Contains an unused `AssetId` branded type export and uses HTTP for the license URL.

### `libs/world/domain/src/lib/asset-manifest.spec.ts`
**Score: 8/10** — [B] 0, [S] 0, [M] 2.  
Comprehensive test coverage pinning budget boundaries, attribution completeness, lazy asset segregation, and path uniqueness. Carries a stale comment regarding float tolerance and omits a duplicate ID assertion on `SOURCE_MODELS`.

### `apps/web/src/app/app.tsx` & `app.spec.tsx`
**Score: 9/10** — [B] 0, [S] 0, [M] 0.  
Clean composition root wiring. Respects the architectural boundary by consuming `WEB_ASSETS` and `initialLoadBudgetBytes` from `@qa3elhamor/world-domain` without leaking content into scene internals. Spec stubs the canvas cleanly and tests overlay content.

### `eslint.config.mjs`
**Score: 8/10** — [B] 0, [S] 0, [M] 1.  
Adds `type:tool`, `scope:tools`, and `platform:node` tags in harmony with the monorepo's 3D tagging scheme. Omission of self-dependency for `scope:tools` restricts multi-tool composition.

### `package.json` & Subproject `package.json` files
**Score: 9/10** — [B] 0, [S] 0, [M] 0.  
Replaced `workspace:*` with `*` across all subproject package manifests, fixing npm compatibility while preserving local workspace linking. Added required glTF-Transform, Meshoptimizer, and Sharp tool dependencies.

### `.github/workflows/ci.yml`
**Score: 6/10** — [B] 0, [S] 1, [M] 0.  
Builds and tests affected projects, but fails to execute `npm run assets:verify`. Missing verification allows unverified or over-budget 3D assets to bypass pull request checks.

### `.gitignore`
**Score: 10/10** — [B] 0, [S] 0, [M] 0.  
Properly un-ignores `apps/web/public/models/`, allowing deterministic compressed GLBs and `placements.json` to be committed.

### `tools/asset-pipeline/README.md` & `docs/asset-compression-report.md`
**Score: 8/10** — [B] 0, [S] 0, [M] 2.  
Outstanding technical documentation detailing geometry quantization, texture compression tradeoffs, and KTX2 migration pathways. Minor discrepancy between prose and table for initial load budget sum, and missing `await MeshoptDecoder.ready` in vanilla Three.js snippet.

---

## Pattern Compliance

| Repository Rule or Nearby Convention | Status | Evidence |
| ------------------------------------ | ------ | -------- |
| Domain purity (no I/O, no framework) | PASS | [`libs/world/domain/src/lib/asset-manifest.ts:1-175`](file:///D:/projects/qa3elhamor/libs/world/domain/src/lib/asset-manifest.ts#L1-L175) |
| Strict bounded-context tags | PASS | [`eslint.config.mjs:79-143`](file:///D:/projects/qa3elhamor/eslint.config.mjs#L79-L143) |
| Monorepo workspace linking | PASS | [`package.json:53-57`](file:///D:/projects/qa3elhamor/package.json#L53-L57) & [`apps/web/package.json:6-7`](file:///D:/projects/qa3elhamor/apps/web/package.json#L6-L7) |
| Offline reproducible assets committed | PASS | [`.gitignore:27-30`](file:///D:/projects/qa3elhamor/.gitignore#L27-L30) |
| CC-BY-4.0 attribution enforcement | PASS | [`libs/world/domain/src/lib/attribution.ts:37-76`](file:///D:/projects/qa3elhamor/libs/world/domain/src/lib/attribution.ts#L37-L76) |
| CI verification gate | FAIL | [`.github/workflows/ci.yml:39`](file:///D:/projects/qa3elhamor/.github/workflows/ci.yml#L39) |

---

## Maintenance Debt

- **Introduced:** 8 committed compressed `.glb` models (3.18 MiB) and corresponding placement definitions in `apps/web/public/models/`.
- **Retired:** Uncompressed asset dependencies and outdated `SOURCE_ASSETS` structure.
- **Net:** Strongly positive. Asset load for initial view drops to 1.24 MiB (well below 2 MiB budget), with explicit attribution and reproducible toolchain.

---

## Verdict

- **Recommendation:** APPROVED
- **Confidence:** HIGH
- **Key concern:** CI does not execute `npm run assets:verify`, leaving byte budgets and asset integrity unverified during automated checks.
- **What a 10/10 version would do differently:**
  1. Add `- run: npm run assets:verify` to `.github/workflows/ci.yml`.
  2. Type `AssetEntry.id` as a discriminated union `WebAssetId` instead of `string`.
  3. Include `'scope:tools'` in `onlyDependOnLibsWithTags` for `scope:tools` in `eslint.config.mjs`.
  4. Fix the 1,829 KiB vs 1,800 KiB discrepancy in `docs/asset-compression-report.md:40`.
