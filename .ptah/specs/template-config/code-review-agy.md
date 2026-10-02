# Code Logic Review — `template-config`

## Summary

| Metric              | Value                                |
| ------------------- | ------------------------------------ |
| Overall score       | 8/10                                 |
| Assessment          | REVISE                               |
| Blocking issues     | 0                                    |
| Serious issues      | 2                                    |
| Moderate issues     | 2                                    |
| Minor issues        | 1                                    |
| Failure modes found | 4                                    |

## Five logic questions

### 1. How does this fail silently?

- **Untracked Arabic PII in sample validation:** In [`libs/content/data-access/src/lib/content-example.spec.ts#L43-L52`](file:///D:/projects/qa3elhamor/libs/content/data-access/src/lib/content-example.spec.ts#L43-L52), the check verifying that `content.example/` carries none of the owner's identity only inspects English name tokens via `localize(owner.profile.name, 'en')`. If the owner's Arabic name ("عبدالله", "خليل") or contact details leak into `content.example/*.json`, the test silently passes with exit code 0.
- **Missing CSS custom property fallbacks causing FOUC:** In [`apps/web/src/styles.css#L35-L37`](file:///D:/projects/qa3elhamor/apps/web/src/styles.css#L35-L37) and [`apps/web/src/moderation/moderation.css#L9`](file:///D:/projects/qa3elhamor/apps/web/src/moderation/moderation.css#L9), `background: var(--theme-sea);` and text colors lack fallback values. During early paint in development or before JavaScript initializes the virtual module `virtual:site-theme.css`, `var(--theme-sea)` evaluates to invalid/transparent, causing the browser to render its default white background canvas despite `<meta name="theme-color">` being set in `<head>`.
- **Silent omission of social preview tags:** In [`apps/web/src/site-build.ts#L156-L172`](file:///D:/projects/qa3elhamor/apps/web/src/site-build.ts#L156-L172), if `SITE.meta.ogImage` is configured but the `SITE_URL` environment variable is unset, `headTags` silently omits `og:image` and `og:url` without logging any build-time warning or diagnostic message.

### 2. What user action produces unexpected behaviour?

- **Git Bash path expansion during `deploy:prepare`:** While [`apps/web/vite.config.mts#L17-L22`](file:///D:/projects/qa3elhamor/apps/web/vite.config.mts#L17-L22) explicitly detects and rejects Git Bash mangled drive paths (`C:/Program Files/Git/...`), [`tools/deploy/prepare-artefact.ts#L25-L26`](file:///D:/projects/qa3elhamor/tools/deploy/prepare-artefact.ts#L25-L26) does not check for this. Running `SITE_BASE=/repo/ npm run deploy:prepare` on Windows Git Bash results in `base = /C:/.../`, causing incorrect resource filtering and broken relative links.
- **Mismatched landmark and dive route definitions:** If a user deletes a landmark from `LANDMARKS` in [`apps/web/src/site.config.ts`](file:///D:/projects/qa3elhamor/apps/web/src/site.config.ts) but forgets to remove its corresponding stop in `DIVE_CONFIG.route` (or vice-versa), `vite build` succeeds without warning. The resulting crash only manifests at runtime when the client mounts [`apps/web/src/app/dive-shell.tsx#L67`](file:///D:/projects/qa3elhamor/apps/web/src/app/dive-shell.tsx#L67).

### 3. What input data produces a wrong answer?

- **Invalid CSS colour values:** In [`apps/web/src/site-build.ts#L49-L55`](file:///D:/projects/qa3elhamor/apps/web/src/site-build.ts#L49-L55), `cssValue()` strips dangerous characters (`[;{}<>\\]|\/\*`), but does not validate CSS syntax or color keywords. A typo such as `theme.accent: 'bleu'` or malformed function `rgb(99999)` passes build-time validation and writes `:root { --theme-accent: bleu; }`, causing CSS parsers to discard the rule at runtime and leaving accents unstyled without any compilation error.
- **Spurious directory prefixes in public paths:** In [`apps/web/src/site-build.ts#L74-L80`](file:///D:/projects/qa3elhamor/apps/web/src/site-build.ts#L74-L80), `publicPath()` strips leading slashes. If a user sets `favicon: 'public/favicon.ico'` or `'assets/favicon.ico'`, the check passes and generates `<link rel="icon" href="/public/favicon.ico" />`, which 404s at runtime because files in `apps/web/public/` are served at the root.

### 4. What happens when a dependency fails?

- **Git unavailable during template reset:** In [`tools/template/reset.ts#L21-L30`](file:///D:/projects/qa3elhamor/tools/template/reset.ts#L21-L30), if `git` is absent or encounters an unexpected error (e.g. in a non-git directory or container), `uncommitted()` returns `null`. As a result, the uncommitted changes guard is completely bypassed, and existing files in `content/` are overwritten without prompting or requiring `--force`.
- **Malformed content JSON:** In [`apps/web/src/site-build.ts#L120-L132`](file:///D:/projects/qa3elhamor/apps/web/src/site-build.ts#L120-L132) and [`apps/web/vite.config.mts#L55-L56`](file:///D:/projects/qa3elhamor/apps/web/vite.config.mts#L55-L56), if `content/site.json` is missing or contains invalid JSON, `readSiteJson()` throws immediately during HTML transformation, safely failing the build.

### 5. What is missing that the requirements never mentioned?

- **Build-time validation for landmarks and cast:** While brand, metadata, and theme colours are verified during Vite transformation, `LANDMARKS`, `DIVE_CONFIG`, and `NARRATOR_CAST` are completely ignored by the build plugin. They are only evaluated at runtime when `buildLandmarkRegistry()` runs in `dive-shell.tsx`.
- **Arabic PII leak assertion in content test:** The unit test suite validates English name tokens but ignores Arabic script tokens from `owner.profile.name.ar`, leaving a gap in fork privacy enforcement.

## Failure modes

### 1. FOUC on Cold Load and Dev Refresh

- Trigger: Initial page load before JavaScript evaluates `virtual:site-theme.css`.
- Symptom: White background flash before the dark-sea theme renders.
- Evidence: [`apps/web/src/styles.css#L34-L37`](file:///D:/projects/qa3elhamor/apps/web/src/styles.css#L34-L37), [`apps/web/src/main.tsx#L1-L2`](file:///D:/projects/qa3elhamor/apps/web/src/main.tsx#L1-L2).
- Current handling: `background: var(--theme-sea)` has no fallback and depends on dynamic CSS module injection.
- Recommendation: Provide static fallbacks for baseline theme variables: `background: var(--theme-sea, #0a1e3f); color: var(--theme-foam, #e6f2ff); font-family: var(--font-ui, system-ui, sans-serif);`.

### 2. Undetected Arabic PII in Sample Content

- Trigger: Leakage of Arabic name or location tokens into `content.example/site.json`.
- Symptom: Test suite passes green while owner's Arabic identity is shipped to forks.
- Evidence: [`libs/content/data-access/src/lib/content-example.spec.ts#L43-L52`](file:///D:/projects/qa3elhamor/libs/content/data-access/src/lib/content-example.spec.ts#L43-L52).
- Current handling: Only checks `ownerName = localize(owner.profile.name, 'en')`.
- Recommendation: Iterate over both `en` and `ar` name parts in `owner.profile.name`, asserting that neither appears in `example`.

### 3. Drive-Path Mangling in Artefact Preparation

- Trigger: Running `SITE_BASE=/repo/ npm run deploy:prepare` in Git Bash on Windows.
- Symptom: Output directory filtering fails or calculates mangled URLs like `/C:/Program Files/.../`.
- Evidence: [`tools/deploy/prepare-artefact.ts#L25-L27`](file:///D:/projects/qa3elhamor/tools/deploy/prepare-artefact.ts#L25-L27) vs [`apps/web/vite.config.mts#L17-L22`](file:///D:/projects/qa3elhamor/apps/web/vite.config.mts#L17-L22).
- Current handling: `prepare-artefact.ts` blindly trims leading/trailing slashes without inspecting drive letters.
- Recommendation: Share `siteBase()` validation between `vite.config.mts` and `prepare-artefact.ts`.

### 4. Runtime-Only Crash for Invalid Landmark / Dive Routing

- Trigger: Removing or renaming a landmark in `LANDMARKS` without synchronizing `DIVE_CONFIG.route`.
- Symptom: `nx build web` passes; loading the 3D dive in a browser throws `Invalid landmarks config: ...`.
- Evidence: [`apps/web/src/app/landmarks.config.ts#L122-L138`](file:///D:/projects/qa3elhamor/apps/web/src/app/landmarks.config.ts#L122-L138).
- Current handling: Validation is bound to `LANDMARK_REGISTRY` instantiation in `dive-shell.tsx`.
- Recommendation: Run `buildLandmarkRegistry()` in `site-build.ts` or during project graph build verification.

## Blocking issues

None. The core functionality, screenshot fidelity, reset safety, and build scripts function without data loss or blocking failures.

## Serious issues

### Defect 1: Unprotected Root CSS Variables and FOUC Risk

- File: [`apps/web/src/styles.css#L34-L37`](file:///D:/projects/qa3elhamor/apps/web/src/styles.css#L34-L37), [`apps/web/src/moderation/moderation.css#L8-L13`](file:///D:/projects/qa3elhamor/apps/web/src/moderation/moderation.css#L8-L13)
- Scenario: When loading `index.html` or `moderation.html`, `<link rel="stylesheet" href="/src/styles.css">` is parsed before `virtual:site-theme.css` is injected by JavaScript.
- Impact: Because `var(--theme-sea)` has no fallback value, the root canvas paints white `#ffffff` before flipping to navy `#0a1e3f`.
- Fix: Add baseline fallback values to `:root` selectors or directly to the declarations:
  ```css
  html,
  body {
    margin: 0;
    background: var(--theme-sea, #0a1e3f);
    color: var(--theme-foam, #e6f2ff);
    font-family: var(--font-ui, system-ui, sans-serif);
  }
  ```

### Defect 2: Arabic Owner PII Untracked in Content Example Verification

- File: [`libs/content/data-access/src/lib/content-example.spec.ts#L43-L52`](file:///D:/projects/qa3elhamor/libs/content/data-access/src/lib/content-example.spec.ts#L43-L52)
- Scenario: An author updates `content.example/site.json` and inadvertently includes Arabic owner tokens ("عبدالله", "خليل").
- Impact: The test suite passes despite owner PII being shipped to third-party forks.
- Fix: Expand `content-example.spec.ts` to assert against Arabic script tokens:
  ```typescript
  const ownerEn = localize(owner.profile.name, 'en');
  const ownerAr = localize(owner.profile.name, 'ar');
  for (const name of [ownerEn, ownerAr]) {
    for (const word of name.split(/\s+/u).filter((part) => part.length > 2)) {
      expect(example, `"${word}" from content/site.json`).not.toContain(word);
    }
  }
  ```

## Moderate and minor issues

### Defect 3 (Moderate): Inconsistent `SITE_BASE` Git Bash Guard in Deployment Script
- File: [`tools/deploy/prepare-artefact.ts#L25-L27`](file:///D:/projects/qa3elhamor/tools/deploy/prepare-artefact.ts#L25-L27)
- Scenario: Running `SITE_BASE=/repo/ npm run deploy:prepare` in Git Bash mangles the path to `C:/...`.
- Fix: Add the drive-letter regex check present in `vite.config.mts:17-22`.

### Defect 4 (Moderate): Landmark and Cast Integrity Unchecked at Build Time
- File: [`apps/web/src/site-build.ts#L197-L220`](file:///D:/projects/qa3elhamor/apps/web/src/site-build.ts#L197-L220), [`apps/web/src/app/landmarks.config.ts#L122-L138`](file:///D:/projects/qa3elhamor/apps/web/src/app/landmarks.config.ts#L122-L138)
- Scenario: Mismatched landmark or dive route passes `nx build web`, only failing on browser load.
- Fix: Trigger `buildLandmarkRegistry()` inside `siteTemplate`'s `buildStart` hook.

### Defect 5 (Minor): Missing Build Notice for Omitted Social Meta Tags
- File: [`apps/web/src/site-build.ts#L156-L172`](file:///D:/projects/qa3elhamor/apps/web/src/site-build.ts#L156-L172)
- Scenario: `meta.ogImage` is configured, but `SITE_URL` is omitted in the build environment.
- Fix: Log a console warning informing the developer that `og:image` was skipped due to missing `SITE_URL`.

## Data flow

1. **Config Definition** (`site.config.ts`): Defines pure data (`SITE`, `LANDMARKS`, `DIVE_CONFIG`, `NARRATOR_CAST`). [OK]
2. **Build Transformation** (`siteTemplate` in `vite.config.mts` -> `site-build.ts`):
   - Injects `<head>` tags replacing `<!-- site:head -->`. [OK]
   - Evaluates and escapes `SITE.meta` and `copy.siteTitle`/`copy.siteDescription`. [OK]
   - Generates virtual stylesheet `virtual:site-theme.css`. [OK]
3. **CSP Insertion** (`contentSecurityPolicy` in `tools/deploy/csp-plugin.ts`):
   - Slices `<head>` directly after `<meta charset="utf-8">` and inserts strict `<meta http-equiv="Content-Security-Policy">`. [OK]
4. **Client Initialization** (`main.tsx` -> `styles.css` & `app.tsx`):
   - Loads CSS custom properties and initial HTML. [GAP: Missing CSS variable fallbacks in `styles.css` causes FOUC]
5. **Dive Shell Mount** (`dive-shell.tsx`):
   - Evaluates `buildDivePath()` and `buildLandmarkRegistry()`. [GAP: Validation occurs here rather than during `vite build`]

## Requirements fulfilment

| Requirement | Status | Gap |
| ----------- | ------ | --- |
| Owner deployment unchanged | COMPLETE | Pixel comparison confirmed within fish animation noise; tab title and OG tags updated as designed. |
| Theme CSS generation | COMPLETE | 15 tokens mapped correctly to `:root`. Minor FOUC risk due to missing declaration fallbacks. |
| Head generation & CSP ordering | COMPLETE | CSP is positioned after charset and before generated head tags/scripts; plugin ordering is sound. |
| `SITE_BASE` handling | COMPLETE | Drive-letter guard prevents Git Bash mangling in `vite.config.mts`. `prepare-artefact.ts` should align. |
| `template:reset` safety | COMPLETE | Refuses on uncommitted changes, leaves non-content files untouched, platform-independent. |
| `content.example` privacy | PARTIAL | English owner tokens checked; Arabic owner tokens omitted in `content-example.spec.ts`. |
| Config validation & landmark removal | COMPLETE | Removing landmarks from config cleanly omits scene factory creation without runtime crashes. |
| Documentation accuracy | COMPLETE | Spot-checked 5 walkthrough steps; commands and instructions accurately match implementation. |
| CC-BY credit flow | COMPLETE | Models strictly require `license: 'CC-BY-4.0'` and matching attribution entries in `ATTRIBUTIONS`. |
| Secrets isolation | COMPLETE | No secrets or credentials in `site.config.ts`; environment variables preserved. |

Implicit requirements not addressed: None.

## Edge cases

| Case | Handled | How | Concern |
| ---- | ------- | --- | ------- |
| Landmark removed from config | YES | `LANDMARK_SCENES` only maps scenes with active definitions | None |
| Git Bash converts `/repo/` | YES | `siteBase()` detects `^[A-Za-z]:[\\/]` and aborts with hint | Not present in `prepare-artefact.ts` |
| Malicious CSS injection in theme | YES | `cssValue()` rejects semicolons, brackets, comments | Does not check CSS syntax validity |
| Uncommitted edits during reset | YES | `execFileSync('git', ['status', ...])` aborts without `--force` | Bypassed if git binary missing |
| Omitted `SITE_URL` | YES | Social preview meta tags safely skipped | No warning emitted to developer |

## Verdict

- Recommendation: REVISE
- Confidence: HIGH
- Top risk: Unstyled white flash (FOUC) during initial load before virtual theme styles attach, and unnoticed Arabic owner name leakage in fork samples.
- What a robust implementation would add:
  1. Add static fallback defaults to `--theme-sea`, `--theme-foam`, and `--font-ui` in `apps/web/src/styles.css`.
  2. Update `libs/content/data-access/src/lib/content-example.spec.ts` to assert against Arabic name tokens.
  3. Mirror the Git-Bash drive path guard in `tools/deploy/prepare-artefact.ts`.
  4. Perform landmark and dive registry validation during build time rather than deferring exclusively to client runtime.
