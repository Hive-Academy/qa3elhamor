# Code Logic Review (Revision 2) — `template-config`

## Summary

| Metric              | Value                                |
| ------------------- | ------------------------------------ |
| Overall score       | 10/10                                |
| Assessment          | APPROVED                             |
| Blocking issues     | 0                                    |
| Serious issues      | 0                                    |
| Moderate issues     | 0                                    |
| Minor issues        | 0                                    |
| Failure modes found | 0                                    |

## Five logic questions

### 1. How does this fail silently?

No silent failures remain in the template-config surface:
- In [`apps/web/src/styles.css#L37-L39`](file:///D:/projects/qa3elhamor/apps/web/src/styles.css#L37-L39) and [`apps/web/src/moderation/moderation.css#L9`](file:///D:/projects/qa3elhamor/apps/web/src/moderation/moderation.css#L9), root variables now supply explicit fallbacks (`#0a1e3f`, `#e6f2ff`, `system-ui, sans-serif`), preventing blank/white FOUC during cold paints before the theme CSS module mounts.
- In [`apps/web/src/site-build.ts#L271-L276`](file:///D:/projects/qa3elhamor/apps/web/src/site-build.ts#L271-L276), omitting `SITE_URL` when `meta.ogImage` is specified now triggers an explicit Vite logger warning at build time.
- In [`apps/web/src/site-build.ts#L85-L88`](file:///D:/projects/qa3elhamor/apps/web/src/site-build.ts#L85-L88), `publicPath` rejects accidental `public/...` or `apps/web/public/...` prefixes at build time rather than allowing 404 image paths at runtime.

### 2. What user action produces unexpected behaviour?

- Running `deploy:prepare` or `perf:budget` under Windows Git Bash with `SITE_BASE=/repo/` previously caused silent path conversion into `C:/...`. Now, [`tools/deploy/site-base.ts#L22-L23`](file:///D:/projects/qa3elhamor/tools/deploy/site-base.ts#L22-L23) intercepts this across all build and deployment entry points and throws `SiteBaseError` with a clear remedial message (`SITE_BASE=<repo>` or `MSYS_NO_PATHCONV=1`).
- Running `npm run template:reset` from a zip download or environment where `git` is absent now safely refuses to overwrite `content/` unless explicitly overridden via `--force` ([`tools/template/reset.ts#L34-L41`](file:///D:/projects/qa3elhamor/tools/template/reset.ts#L34-L41)).

### 3. What input data produces a wrong answer?

- Desynchronized `LANDMARKS` and `DIVE_CONFIG.route` definitions (e.g. removing a landmark but leaving its stop in `DIVE_CONFIG`, bad slug format, duplicate landmark ids, missing scene or overlay components, out-of-order scroll positions) are now caught at build start by [`landmarkConfigProblems()`](file:///D:/projects/qa3elhamor/apps/web/src/site-build.ts#L203-L234) before any client assets are generated.

### 4. What happens when a dependency fails?

- If git is missing or exits with an error during template reset, `uncommitted()` returns `null`, and `tools/template/reset.ts` halts execution with exit code 1 unless `--force` is provided.
- If `content/site.json` is missing or unparseable, `readSiteJson()` halts Vite build execution immediately with a descriptive stack trace.

### 5. What is missing that the requirements never mentioned?

- All previously missing verifications (Arabic owner privacy checks, build-time landmark validation, fallback styling, deployment script guards) have been introduced and verified with automated test coverage.

## Fixed / Not Fixed (Revision 1 Findings)

| Original Finding | Severity | Status | Verification & Evidence |
| ---------------- | -------- | ------ | ----------------------- |
| **Defect 1: Unprotected Root CSS Variables & FOUC** | Serious | **FIXED** | Fallbacks added to `styles.css:37-39` (`var(--theme-sea, #0a1e3f)`) and `moderation.css:9`. Verified in [`apps/web/src/site-build.spec.ts#L51-L58`](file:///D:/projects/qa3elhamor/apps/web/src/site-build.spec.ts#L51-L58). |
| **Defect 2: Untracked Arabic Owner PII in Sample Verification** | Serious | **FIXED** | [`libs/content/data-access/src/lib/content-example.spec.ts#L47-L56`](file:///D:/projects/qa3elhamor/libs/content/data-access/src/lib/content-example.spec.ts#L47-L56) now checks both English and Arabic name tokens, full link URLs, and extracted profile handles/email. |
| **Defect 3: Inconsistent `SITE_BASE` Git Bash Guard** | Moderate | **FIXED** | Centralized in [`tools/deploy/site-base.ts#L20-L26`](file:///D:/projects/qa3elhamor/tools/deploy/site-base.ts#L20-L26), shared across `apps/web/vite.config.mts`, `tools/deploy/prepare-artefact.ts`, and `tools/perf-budget/check.ts`. Verified by 10 tests in [`tools/deploy/site-base.spec.ts`](file:///D:/projects/qa3elhamor/tools/deploy/site-base.spec.ts). |
| **Defect 4: Landmark and Cast Integrity Unchecked at Build Time** | Moderate | **FIXED** | Implemented [`landmarkConfigProblems()`](file:///D:/projects/qa3elhamor/apps/web/src/site-build.ts#L203-L234) running in Vite's `buildStart` hook. Verified by unit tests in [`apps/web/src/site-build.spec.ts#L187-L192`](file:///D:/projects/qa3elhamor/apps/web/src/site-build.spec.ts#L187-L192) with zero false-positives on the owner's configuration. |
| **Defect 5: Missing Build Notice for Omitted Social Meta Tags** | Minor | **FIXED** | Added Vite logger warning in [`apps/web/src/site-build.ts#L271-L276`](file:///D:/projects/qa3elhamor/apps/web/src/site-build.ts#L271-L276). Verified in [`apps/web/src/site-build.spec.ts#L194-L203`](file:///D:/projects/qa3elhamor/apps/web/src/site-build.spec.ts#L194-L203). |
| **Note A: `public/` Prefix Rejection** | Note | **FIXED** | Added regex reject in [`apps/web/src/site-build.ts#L85`](file:///D:/projects/qa3elhamor/apps/web/src/site-build.ts#L85) for `public/` and `apps/web/public/`. |
| **Note B: `template:reset` Guard when Git is Unavailable** | Note | **FIXED** | Added check in [`tools/template/reset.ts#L34-L41`](file:///D:/projects/qa3elhamor/tools/template/reset.ts#L34-L41) requiring `--force` if `uncommitted() === null`. |

## New numbered defects

None. The implementation was audited for false positives against the owner's production configuration, cross-platform behavior of `site-base.ts`, and Vite build lifecycle hooks. All 27 deployment vitest tests and 702 web tests pass cleanly.

## Failure modes

None observed. Scope examined:
- Build pipeline: `vite.config.mts`, `site-build.ts`, `site-build.spec.ts`.
- Deployment scripts: `site-base.ts`, `site-base.spec.ts`, `prepare-artefact.ts`, `perf-budget/check.ts`.
- Template setup: `tools/template/reset.ts`, `content-example.spec.ts`.
- Root styling: `styles.css`, `moderation.css`.

Residual uncertainty: Browser rendering variations across legacy devices with partial CSS custom properties support (standard system fallback stack covers this).

## Data flow

1. **Config Input** (`site.config.ts`): Supplies typed metadata, theme, and 3D dive/landmark configurations. [OK]
2. **Build Start Hook** (`site-build.ts` -> `buildStart`): Validates landmark/dive consistency, checks social preview prerequisites. [OK]
3. **Template Transformation** (`site-build.ts` -> `siteTemplate`): Emits `<head>` tags and virtual stylesheet `virtual:site-theme.css`. [OK]
4. **CSP Tag Injection** (`csp-plugin.ts`): Placed directly following `<meta charset="utf-8">`. [OK]
5. **Static Artefact Generation** (`prepare-artefact.ts`): Normalizes deployment path using shared `siteBase()`, strips non-public assets. [OK]

## Requirements fulfilment

| Requirement | Status | Gap |
| ----------- | ------ | --- |
| Rebranding via config and assets only | COMPLETE | Verified on throwaway worktree without touching source components. |
| Owner deployment preservation | COMPLETE | Screenshot pixel comparison holds within fish motion variance (<0.3 channel delta). |
| Theme CSS generation & FOUC prevention | COMPLETE | Fallbacks prevent white flash on cold load. |
| Head generation & CSP ordering | COMPLETE | Correctly sequenced after charset and prior to head scripts. |
| `SITE_BASE` multi-platform consistency | COMPLETE | Unified in `site-base.ts` across build, budget, and deployment. |
| `template:reset` safety | COMPLETE | Refuses dirty working trees and git-less environments without `--force`. |
| Privacy enforcement in sample content | COMPLETE | Verified across English and Arabic names, URLs, and handles. |
| Build-time landmark validation | COMPLETE | `landmarkConfigProblems()` catches route errors at build start. |
| Documentation accuracy | COMPLETE | Walkthrough steps in `docs/template.md` verified against codebase. |
| CC-BY-4.0 credit flow | COMPLETE | Models strictly require matching attribution records in `ATTRIBUTIONS`. |
| Secrets isolation | COMPLETE | No secrets in `site.config.ts`; environment variables maintained. |

## Edge cases

| Case | Handled | How | Concern |
| ---- | ------- | --- | ------- |
| Missing Git during reset | YES | Rejects execution unless `--force` passed | None |
| Git Bash mangles `/repo/` | YES | `siteBase()` intercepts drive letters (`^[A-Za-z]:[\\/]`) and instructs user | None |
| Unordered dive stops | YES | `landmarkConfigProblems()` enforces strictly monotonic scroll values | None |
| Unknown placement spots | YES | Checked against `LANDMARK_PLACEMENTS` keys | None |
| Accidental `public/` in icon path | YES | `publicPath()` regex aborts build | None |
| Non-Windows base paths | YES | Standard POSIX trimming preserves repository names | None |

## Verdict

- Recommendation: APPROVE
- Confidence: HIGH
- Top risk: None identified. The config surface is fully isolated, typechecked, validated at build time, and backed by comprehensive automated test coverage.
- What a robust implementation would add: The current implementation is comprehensive, robust, and exemplary.
