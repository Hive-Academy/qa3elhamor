# Code Review: Batch 1 Domain Libraries (Round 2)

Independent review of the remediations applied to `@qa3elhamor/content-domain`, `@qa3elhamor/content-data-access`, `@qa3elhamor/content-files`, and `@qa3elhamor/complaints-domain` in `D:\projects\qa3elhamor`.

---

## 1. Content Model (`@qa3elhamor/content-domain`, `@qa3elhamor/content-data-access`, `@qa3elhamor/content-files`)

### Verdict
- **Verdict**: APPROVED
- **Score**: 10/10
- **Summary**: All five actionable findings from Round 1 have been completely resolved with clean, idiomatic architectures. The library now features a complete `ProjectItem` domain entity and accessor, a build-time validation target wired into `web:build`, clean Nx workspace package packaging for content files with no boundary-rule suppressions, native dependency-graph cache invalidation, and hardened URL/mailto validation.

### Round 1 Findings Status Table

| Finding | Severity | Description | Status | Evidence / Verification |
| :--- | :--- | :--- | :--- | :--- |
| **1.1** | Serious | Inability to model developer portfolio projects | **RESOLVED** | [project-item.ts:1-55](file:///D:/projects/qa3elhamor/libs/content/domain/src/lib/project-item.ts#L1-L55), [parse-projects.ts:1-85](file:///D:/projects/qa3elhamor/libs/content/domain/src/lib/parse/parse-projects.ts#L1-L85), [projects.json:1-56](file:///D:/projects/qa3elhamor/content/projects.json#L1-L56), [site-content.ts:28-30](file:///D:/projects/qa3elhamor/libs/content/data-access/src/lib/site-content.ts#L28-L30). Fully modeled with `sortProjects`, links (`repo`, `live`, `case-study`), media, tech, highlights, and frozen exposure. |
| **1.2** | Serious | Build gate absence in `vite build` | **RESOLVED** | [validate-content.ts:1-24](file:///D:/projects/qa3elhamor/libs/content/data-access/src/bin/validate-content.ts#L1-L24), [package.json:23-36](file:///D:/projects/qa3elhamor/libs/content/data-access/package.json#L23-L36), [package.json:15-28](file:///D:/projects/qa3elhamor/apps/web/package.json#L15-L28). Target `content-data-access:validate` runs before `web:build` via `dependsOn` and stops invalid builds in CI. |
| **1.3** | Moderate | Monorepo boundary bypass & leaky `rootDir` | **RESOLVED** | [package.json:1-15](file:///D:/projects/qa3elhamor/content/package.json#L1-L15), [content-files.ts:5-9](file:///D:/projects/qa3elhamor/libs/content/data-access/src/lib/content-files.ts#L5-L9), [content-files.d.ts:1-25](file:///D:/projects/qa3elhamor/libs/content/data-access/src/content-files.d.ts#L1-L25), [tsconfig.lib.json:4,14](file:///D:/projects/qa3elhamor/libs/content/data-access/tsconfig.lib.json#L4-L14), [eslint.config.mjs:67-71](file:///D:/projects/qa3elhamor/eslint.config.mjs#L67-L71). Packaged as `@qa3elhamor/content-files` (`type:data`), `eslint-disable` removed, `rootDir` restored to `"src"`. |
| **1.4** | Moderate | Incomplete cache invalidation for downstream | **RESOLVED** | [package.json:40](file:///D:/projects/qa3elhamor/libs/content/data-access/package.json#L40), [package.json:15-17](file:///D:/projects/qa3elhamor/apps/web/package.json#L15-L17). Direct graph edge to `@qa3elhamor/content-files` and `implicitDependencies: ["content-data-access"]` in `web` ensure automatic cache busting on content changes. |
| **1.5** | Minor | Sample `site.json` omits `avatar` example | **SKIPPED** | Skipped deliberately by orchestrator instruction. Schema and parser support for `avatar` remain functional. |
| **1.6** | Minor | URL policy allows protocol-relative & empty mailto | **RESOLVED** | [reader.ts:229-258](file:///D:/projects/qa3elhamor/libs/content/domain/src/lib/parse/reader.ts#L229-L258). Regex `SITE_RELATIVE = /^\/[^/\\]/` rejects `//` and `/\`; `EMAIL_ADDRESS` regex enforces valid recipients on `mailto:` schemes; project links enforce `WEB_URL`. |

### New Findings
- None. Verification confirmed 100% test pass rate across 34 test cases, clean declaration emit, zero lint warnings, and build gate integration.

---

## 2. Complaints Domain (`@qa3elhamor/complaints-domain`)

### Verdict
- **Verdict**: APPROVED
- **Score**: 10/10
- **Summary**: All four findings from Round 1 have been resolved with defensive, pure-domain guards. Storage reconstruction accepts `unknown` and gracefully reports non-object rows; timestamps enforce chronological consistency; lifecycle transitions guard against backwards clock drift without silent clamping; and clock injection safely checks prototype tags to support cross-realm Date instances while rejecting invalid/non-Date values.

### Round 1 Findings Status Table

| Finding | Severity | Description | Status | Evidence / Verification |
| :--- | :--- | :--- | :--- | :--- |
| **2.1** | Moderate | `restoreComplaint` throws `TypeError` on non-object | **RESOLVED** | [complaint-snapshot.ts:48-61](file:///D:/projects/qa3elhamor/libs/complaints/domain/src/lib/complaint-snapshot.ts#L48-L61). Accepts `stored: unknown`, checks `isRecord(stored)`, and returns `{ field: 'record', reason: 'malformed' }` without throwing. |
| **2.2** | Minor | `restoreComplaint` accepts out-of-order timestamps | **RESOLVED** | [complaint-snapshot.ts:74-76](file:///D:/projects/qa3elhamor/libs/complaints/domain/src/lib/complaint-snapshot.ts#L74-L76). Compares `Date.parse(updatedAt) < Date.parse(submittedAt)` and returns `{ field: 'updatedAt', reason: 'out-of-order' }`. |
| **2.3** | Minor | `transitionComplaint` allows `updatedAt` regression | **RESOLVED** | [complaint.ts:233-235](file:///D:/projects/qa3elhamor/libs/complaints/domain/src/lib/complaint.ts#L233-L235). Explicitly checks `Date.parse(instant.value) < Date.parse(complaint.updatedAt)` and returns `err({ type: 'invalid-clock', reason: 'before-last-update' })`. |
| **2.4** | Minor | `toInstant` throws on non-Date input | **RESOLVED** | [complaint.ts:91-99](file:///D:/projects/qa3elhamor/libs/complaints/domain/src/lib/complaint.ts#L91-L99). Guards with `Object.prototype.toString.call(now) === '[object Date]'` and checks `Number.isNaN`, returning `err({ type: 'invalid-clock', reason: 'not-a-date' })`. |

### New Findings
- None. Verification confirmed 100% test pass rate across 197 test cases with comprehensive clock and snapshot guard suites.
