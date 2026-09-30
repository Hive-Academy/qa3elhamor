# Code Review: Batch 1 Domain Libraries

Independent review of `@qa3elhamor/content-domain` / `@qa3elhamor/content-data-access` and `@qa3elhamor/complaints-domain` in `D:\projects\qa3elhamor`.

---

## 1. Content Model (`@qa3elhamor/content-domain` & `@qa3elhamor/content-data-access`)

### Verdict
- **Verdict**: REVISE
- **Score**: 7/10
- **Summary**: The library exhibits strong validation error aggregation, robust parsing primitives, clean functional localization fallbacks (`{ en, ar? }`), and deep freezing of shared content. However, it cannot model portfolio projects for a developer template, relies on an architectural boundary escape with leaky `tsconfig` paths, suffers an Nx cache invalidation hole for consumer applications, and defers validation entirely to browser runtime rather than enforcing it during `vite build`.

### Findings

#### Finding 1.1 (Serious) — Inability to model developer portfolio projects without code changes
- **File & Line**: [content.ts:7-13](file:///D:/projects/qa3elhamor/libs/content/domain/src/lib/content.ts#L7-L13) and [site-profile.ts:39-49](file:///D:/projects/qa3elhamor/libs/content/domain/src/lib/site-profile.ts#L39-L49)
- **Problem**: Scope decisions (`.ptah/scope-decisions.md:28-42`) declare this codebase a "shippable template others fork and deploy" as well as the owner's personal developer portfolio, where all personal content must be data-driven and expressible purely via `content/*.json`. However, `Content` models only `profile`, `copy`, `resume`, `services`, and `credits`. There is no `Project` entity or `projects.json` collection (e.g. project title, slug, summary, demo/repo links, screenshots/media, and tech stack). A developer evaluating or forking this portfolio cannot showcase their software projects without modifying TypeScript source code in domain, data-access, and feature libraries.
- **Suggested Fix**: Add a `ProjectItem` domain model in `libs/content/domain/src/lib/project-item.ts`, an accompanying `content/projects.json` file, and wire `projects: readonly ProjectItem[]` into `Content` and `parseContent`.

#### Finding 1.2 (Serious) — Build gate absence: `vite build` does not execute content validation
- **File & Line**: [site-content.ts:18](file:///D:/projects/qa3elhamor/libs/content/data-access/src/lib/site-content.ts#L18)
- **Problem**: Content validation occurs via `resolveContent(contentFiles)` at module evaluation time. During `vite build`, Vite bundles TypeScript source files into JavaScript chunks without executing application module code. If a content editor introduces a schema violation or syntax error in `content/*.json`, `vite build` completes successfully with exit code 0. The corrupt JSON is bundled into production assets, causing an unhandled `ContentValidationFailure` in the client's browser that renders a blank screen.
- **Suggested Fix**: Implement build-time verification at one of two gates:
  1. Add a custom Vite plugin in `apps/web/vite.config.ts` using the `buildStart` hook:
     ```ts
     {
       name: 'validate-site-content',
       buildStart() {
         resolveContent(contentFiles);
       },
     }
     ```
  2. Configure Nx target dependencies in `nx.json` so that `apps/web:build` depends on `content-data-access:test` or a dedicated lightweight `content:validate` target.

#### Finding 1.3 (Moderate) — Monorepo boundary bypass and leaky `rootDir` in data-access
- **File & Line**: [content-files.ts:6-11](file:///D:/projects/qa3elhamor/libs/content/data-access/src/lib/content-files.ts#L6-L11) and [tsconfig.lib.json:4,12](file:///D:/projects/qa3elhamor/libs/content/data-access/tsconfig.lib.json#L4-L12)
- **Problem**: `content-files.ts` reaches five directory levels up (`../../../../../content/*.json`), requiring an `eslint-disable @nx/enforce-module-boundaries` suppression comment. To compile external JSON files, `libs/content/data-access/tsconfig.lib.json` overrides `"rootDir": "../../.."`, which breaks TypeScript library encapsulation by treating the monorepo root as the project root and polluting declaration outputs.
- **Suggested Fix**: Elevate `content/` to a formal Nx project (e.g. `content/project.json` with name `@qa3elhamor/content` and tags `["scope:content", "type:data", "platform:shared"]`), OR configure a TypeScript path mapping in `tsconfig.base.json` (`"@qa3elhamor/content/*": ["content/*"]`) and whitelist `@qa3elhamor/content/*` in `eslint.config.mjs` under `@nx/enforce-module-boundaries` `allow`. This eliminates the `eslint-disable` and restores `"rootDir": "src"` in `tsconfig.lib.json`.

#### Finding 1.4 (Moderate) — Incomplete Nx cache invalidation for downstream applications
- **File & Line**: [package.json:23-29](file:///D:/projects/qa3elhamor/libs/content/data-access/package.json#L23-L29) and [nx.json:3-14](file:///D:/projects/qa3elhamor/nx.json#L3-L14)
- **Problem**: `libs/content/data-access/package.json` overrides `namedInputs.default` with `"{workspaceRoot}/content/**/*"`. While this invalidates `content-data-access` tasks, downstream applications (`apps/web`) do not automatically invalidate if their cache configuration references only `sharedGlobals` or `production` inputs and `content-data-access` is consumed directly via source without build targets.
- **Suggested Fix**: Add `"{workspaceRoot}/content/**/*"` to `namedInputs.sharedGlobals` in root `nx.json:13`, ensuring all tasks across the workspace invalidate immediately when any content file changes.

#### Finding 1.5 (Minor) — Sample `content/site.json` omits `avatar` documentation example
- **File & Line**: [site.json:3-47](file:///D:/projects/qa3elhamor/content/site.json#L3-L47) and [site-profile.ts:32-36,46](file:///D:/projects/qa3elhamor/libs/content/domain/src/lib/site-profile.ts#L32-L36)
- **Problem**: `content/README.md:17,30` and `site-profile.ts` describe avatar support (`src` and localized `alt`), but `content/site.json` omits the `avatar` property entirely. A developer creating their portfolio from sample files has no sample JSON structure to guide them.
- **Suggested Fix**: Add an illustrative avatar field in `content/site.json` (e.g. `"avatar": { "src": "/avatar.webp", "alt": { "en": "Developer portrait", "ar": "صورة شخصية" } }`).

#### Finding 1.6 (Minor) — URL policy allows backslash protocol-relative URLs and empty mailto
- **File & Line**: [reader.ts:237-248](file:///D:/projects/qa3elhamor/libs/content/domain/src/lib/parse/reader.ts#L237-L248) and [parse-site.ts:50-52](file:///D:/projects/qa3elhamor/libs/content/domain/src/lib/parse/parse-site.ts#L50-L52)
- **Problem**: The check `url.startsWith('/') && !url.startsWith('//')` does not reject strings beginning with `/\` or `/\\`, which certain web browsers treat as protocol-relative external URLs. Furthermore, `URL.canParse('mailto:')` evaluates to `true`; an empty `mailto:` URL passes `requiredUrl` and `readLink` without triggering an error.
- **Suggested Fix**: Strengthen the site-relative URL check using `/^\/[^/\\]/`. In `readLink`, ensure `mailto:` URLs contain an actual email recipient matching an address pattern, and verify non-email links do not use `mailto:`.

---

## 2. Complaints Domain (`@qa3elhamor/complaints-domain`)

### Verdict
- **Verdict**: APPROVED
- **Score**: 9/10
- **Summary**: Exemplary Domain-Driven Design implementation. Strict aggregate isolation guarantees that private complaints cannot transition into public wall posts. Validation of user-generated content correctly applies Unicode code-point length limits after NFC normalization and line collapsing, blocks C0/C1 control and bidi-override characters, and intentionally omits HTML escaping to prevent double-escaping at render time. Events omit user text, clocks are injected, and snapshot restoration treats database records as untrusted input.

### Findings

#### Finding 2.1 (Moderate) — `restoreComplaint` throws uncaught `TypeError` on nullish storage inputs
- **File & Line**: [complaint-snapshot.ts:60](file:///D:/projects/qa3elhamor/libs/complaints/domain/src/lib/complaint-snapshot.ts#L60)
- **Problem**: `restoreComplaint` begins with `if (!isVisibility(stored.visibility))`. If an untrusted storage provider or API returns `null`, `undefined`, or a non-object record, accessing `stored.visibility` throws an unhandled runtime `TypeError: Cannot read properties of null/undefined` rather than returning a typed `Result.err`.
- **Suggested Fix**: Add an initial defensive type assertion:
  ```ts
  if (typeof stored !== 'object' || stored === null) {
    return err({
      type: 'invalid-complaint',
      issues: [{ field: 'visibility', reason: 'malformed' }],
    });
  }
  ```

#### Finding 2.2 (Minor) — `restoreComplaint` does not verify `updatedAt >= submittedAt`
- **File & Line**: [complaint-snapshot.ts:68-69](file:///D:/projects/qa3elhamor/libs/complaints/domain/src/lib/complaint-snapshot.ts#L68-L69)
- **Problem**: `restoreComplaint` validates that `submittedAt` and `updatedAt` are valid ISO-8601 strings, but does not verify chronological ordering. A database row where `updatedAt < submittedAt` is accepted as valid state.
- **Suggested Fix**: Compare the timestamps and record an issue if `stored.updatedAt < stored.submittedAt`:
  ```ts
  if (isIsoInstant(stored.submittedAt) && isIsoInstant(stored.updatedAt) && stored.updatedAt < stored.submittedAt) {
    issues.push({ field: 'updatedAt', reason: 'malformed' });
  }
  ```

#### Finding 2.3 (Minor) — `transitionComplaint` allows timestamp regression on past clock injection
- **File & Line**: [complaint.ts:222-246](file:///D:/projects/qa3elhamor/libs/complaints/domain/src/lib/complaint.ts#L222-L246)
- **Problem**: When a lifecycle transition is applied, `updatedAt` is updated to `instant.value`. If the caller provides a `now: Date` timestamp that is earlier than `complaint.updatedAt` (e.g. clock drift, out-of-order event replay), the complaint's `updatedAt` moves backwards in time.
- **Suggested Fix**: Enforce `instant.value >= complaint.updatedAt` or clamp `updatedAt = instant.value < complaint.updatedAt ? complaint.updatedAt : instant.value`.

#### Finding 2.4 (Minor) — `toInstant` throws `TypeError` on non-Date input
- **File & Line**: [complaint.ts:91-92](file:///D:/projects/qa3elhamor/libs/complaints/domain/src/lib/complaint.ts#L91-L92)
- **Problem**: `toInstant(now: Date)` calls `Number.isNaN(now.getTime())`. If called from untrusted JavaScript where `now` is not a Date instance (e.g. plain object or string), `now.getTime()` throws a runtime `TypeError`.
- **Suggested Fix**: Guard with `!(now instanceof Date) || Number.isNaN(now.getTime())`.
