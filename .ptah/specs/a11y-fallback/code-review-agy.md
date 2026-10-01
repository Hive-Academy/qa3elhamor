# Code Logic & Accessibility Review — `a11y-fallback`

## Summary

| Metric              | Value                                |
| ------------------- | ------------------------------------ |
| Overall score       | 8/10                                 |
| Assessment          | APPROVED                             |
| Blocking issues     | 0                                    |
| Serious issues      | 1                                    |
| Moderate issues     | 2                                    |
| Failure modes found | 3                                    |

The `a11y-fallback` implementation provides an independent, accessible 2D document presentation of the entire site when WebGL is absent, requested via URL (`?view=page`), or when the 3D pipeline fails at runtime. All content models (profile, experience, projects, services, narration stops, editorial credits, and mandatory CC-BY 3D model attributions) are rendered accurately from shared data-access packages. The test suite (`npx nx run web:typecheck`, `web:test`) passes with 28 test suites and 280 tests.

---

## Five Logic Questions

### 1. How does this fail silently?
- **Popstate Focus Desynchronization** (`apps/web/src/app/page-view/presentation.ts:86-99`):
  When a user navigates between the dive and 2D page view via browser Back/Forward buttons, `usePresentation` updates the presentation state via `setPresentation`, but does not set `switched = true`. Consequently, `focusOnMount={view.switched}` remains `false` in `PageView` (`apps/web/src/app/page-view/page-view.tsx:110-112`), leaving screen readers and keyboard users stranded at document body without announcing the view transition or moving focus to `<h1>`.
- **Date Parser NaN on Non-Month Formats** (`apps/web/src/app/page-view/page-parts.tsx:128-129`):
  `formatYearMonth` constructs `new Date(`${yearMonth}-01T00:00:00Z`)`. If an upstream content entry specifies a date string that is year-only (`YYYY`) or already contains a full date (`YYYY-MM-DD`), the string concatenation fails to construct a valid ISO string, producing `Invalid Date` without throwing an error, silently displaying `NaN` or `Invalid Date` to readers.

### 2. What user action produces unexpected behaviour?
- **Activating "Back to the dive" Discards Keyboard Focus** (`apps/web/src/app/app.tsx:125-129` and `apps/web/src/app/page-view/page-view.tsx:74-87`):
  When an assistive technology or keyboard user activates the `<a className="page-view__dive-link">Back to the dive</a>` button, `PageView` unmounts and `<Site>` mounts. Because `<Site>` has no focus-on-mount handler, the active focused element is destroyed from the DOM and focus drops abruptly to `document.body`. The user loses their interaction context and must re-tab through the entire page.

### 3. What input data produces a wrong answer?
- **Malformed Period Input in `formatYearMonth`** (`apps/web/src/app/page-view/page-parts.tsx:118-129`):
  External or non-standard `Period.start` values produce incorrect strings in the `<time>` tag. If `yearMonth` does not match the strict `YYYY-MM` pattern, `formatYearMonth` returns `NaN` in formatted text while the `dateTime` attribute receives the raw string.

### 4. What happens when a dependency fails?
- **GPU Context Loss (> 3000ms)** (`apps/web/src/app/page-view/dive-guard.tsx:28-54`):
  Handled cleanly. When WebGL context is lost, a 3000ms timer starts. If `webglcontextrestored` fires within grace period, the timer clears and the dive continues uninterrupted. If the context stays lost past 3000ms, `onFailure` is invoked, swapping presentation to `pageFor('dive-failed')`.
- **WebGL Context Creation Refusal** (`apps/web/src/app/page-view/dive-guard.tsx:61-70`):
  `createGuardedRenderer` catches renderer creation exceptions (which occur inside R3F asynchronous initialization effects where normal React error boundaries cannot catch them) and routes to `onFailure`.
- **Scene-level Component Throws** (`apps/web/src/app/page-view/dive-guard.tsx:127-149`):
  `DiveFailureBoundary` catches runtime scene errors thrown from `<Canvas>`, invokes `onFailure`, and displays the page view with `noticeFailed`.
- **Credits Derivation Failure** (`apps/web/src/app/credits.tsx:67-78`):
  If asset licence attribution derivation fails, `SiteCreditsList` renders `<CreditsUnavailable />` with an accessible `role="alert"` in place instead of crashing the section.

### 5. What is missing that the requirements never mentioned?
- **Focus Target on Return to Dive**:
  No element is designated to receive focus when switching from page view back to dive view.
- **Initial Bundle Splitting for No-WebGL Clients**:
  `app.tsx` statically imports `@react-three/fiber`, `three`, and the 3D landmark layer. Even though a no-WebGL client never initializes a WebGL context, they must download the entire 3D bundle. Dynamic import (`React.lazy`) for `Site` would ensure complete bandwidth insulation.

---

## Failure Modes

### 1. Focus Loss on Dive Remount
- **Trigger**: Visitor clicks "Back to the dive" from the page view footer or masthead notice.
- **Symptom**: Focused element is removed from DOM; focus falls back to `document.body`.
- **Evidence**: `apps/web/src/app/app.tsx:125-129`, `apps/web/src/app/page-view/page-view.tsx:74-87`
- **Current handling**: `returnToDive` transitions `presentation` to `DIVE`, unmounting `PageView` and rendering `<Site>` with no focus target.
- **Recommendation**: Pass `focusOnMount={view.switched}` to `<Site>`, setting focus to `.scene-note .read-as-page` or the first item of `LandmarkNav`.

### 2. Missing `switched` Flag on Popstate
- **Trigger**: Visitor uses browser Back/Forward navigation to switch between dive and page view.
- **Symptom**: `PageView` mounts without setting focus to the page `<h1>`.
- **Evidence**: `apps/web/src/app/page-view/presentation.ts:86-99`
- **Current handling**: `sync()` updates `setPresentation` but leaves `switched` untouched.
- **Recommendation**: Update `setSwitched(true)` in `sync()` if the URL has altered the view mode.

### 3. Rigid Date Parsing in Period Formatter
- **Trigger**: Upstream period input differs from standard `YYYY-MM` (e.g. `2024` or `2024-03-15`).
- **Symptom**: `Intl.DateTimeFormat` formats an `Invalid Date` object.
- **Evidence**: `apps/web/src/app/page-view/page-parts.tsx:118-129`
- **Current handling**: Constructs `new Date(`${yearMonth}-01T00:00:00Z`)`.
- **Recommendation**: Split string on `-` and sanitize year/month components before constructing `Date`.

---

## Serious Issues

### 1. Keyboard & Screen Reader Focus Stranded on Return to Dive
- **File**: `apps/web/src/app/app.tsx:127` and `apps/web/src/app/page-view/presentation.ts:110`
- **Scenario**: A keyboard user activates "Back to the dive" (`apps/web/src/app/page-view/page-view.tsx:74-87`). The link component is destroyed upon `PageView` unmount.
- **Impact**: Assistive technology users lose their browsing location, violating WCAG 2.4.3 (Focus Order).
- **Fix**: Wire focus acquisition into `<Site>` when `focusOnMount` is true, targeting the dive's primary interactive element (`.read-as-page` link or the landmark navigation button).

---

## Moderate and Minor Issues

### 1. `switched` Flag Stale on History Navigation (Moderate)
- **File**: `apps/web/src/app/page-view/presentation.ts:86-99`
- **Scenario**: Navigating with browser Back/Forward does not trigger `focusOnMount`.
- **Fix**: Call `setSwitched(true)` inside the `popstate` listener callback `sync`.

### 2. Date String Formatting Vulnerability (Moderate)
- **File**: `apps/web/src/app/page-view/page-parts.tsx:118-129`
- **Scenario**: Dates lacking month parts or containing day components format as `Invalid Date`.
- **Fix**: Normalize input dates with regex or fallback to displaying the string directly if parsing fails.

### 3. Monolithic Chunk Loading on No-WebGL Clients (Minor)
- **File**: `apps/web/src/app/app.tsx:1-8`
- **Scenario**: Three.js and R3F chunks are downloaded by devices without WebGL.
- **Fix**: Wrap `Site` in `React.lazy()` so the 3D engine is only downloaded when `presentation.kind === 'dive'`.

### 4. Duplicate Submitter Creation Warning (Minor)
- **File**: `apps/web/src/app/page-view/page-content.ts:63-65`
- **Scenario**: `buildPageContent()` calls `createContactSubmitter(import.meta.env)`, logging redundant dev warnings if API keys are unconfigured.
- **Fix**: Export and reuse a shared submitter singleton.

---

## Data Flow

1. **Entry: Presentation Decision (`apps/web/src/app/app.tsx:109`)** [OK]
   - Probes `hasWebgl()` (`readDeviceCapabilities().webgl`).
   - Checks `window.location.search` for `?view=page`.
   - Result: `pageFor('no-webgl')`, `pageFor('requested')`, or `DIVE`.
2. **2D Page Render (`apps/web/src/app/page-view/page-view.tsx:94`)** [OK]
   - Evaluates content via `pageContent()`.
   - Renders semantic masthead, sticky navigation, and 7 content sections.
   - Sets root `lang="en"` (or `"ar"`) and `dir="ltr"` (or `"rtl"`).
   - If `focusOnMount === true`, focuses `<h1>` [OK].
3. **Contact Form Action (`apps/web/src/app/page-view/site-sections.tsx:58-84`)** [OK]
   - Integrates `<ComplaintScroll>` with injected `submitter`.
   - On submission completion, triggers `toTop()`, scrolling to `(0, 0)` and refocusing `<h1>`.
4. **Transition to Dive (`apps/web/src/app/page-view/presentation.ts:101-110`)** [GAP]
   - Pushes history state without `?view=page`.
   - Sets `switched = true`, unmounts `PageView`, mounts `<Site>`.
   - Focus drops to `document.body` [GAP: Defect 1].
5. **Runtime Failure Catching (`apps/web/src/app/page-view/dive-guard.tsx`)** [OK]
   - `createGuardedRenderer` catches failed `new WebGLRenderer()`.
   - `watchContextLoss` monitors `webglcontextlost` with 3000ms grace period.
   - `DiveFailureBoundary` catches React scene render errors.
   - Dispatches `onFailure`, transitioning state to `pageFor('dive-failed')`.
   - Popstate navigation ignores attempts to remount broken scene, requiring hard reload.

---

## Requirements Fulfilment

| Requirement | Status | Gap |
| ----------- | ------ | --- |
| Disable dive animation under reduced motion | COMPLETE | Handled in `inWorldAvailable` and `DiveProvider reducedMotion` without disabling dive view. |
| Serve readable 2D version to no-WebGL visitors | COMPLETE | No-WebGL probe immediately routes to `PageView` with notice. |
| Every content entry rendered in 2D page | COMPLETE | Profile, bio, skills, resume, projects, services, narration stops, site & model credits all present. |
| Shared contact submitter & validation | COMPLETE | `ComplaintScroll` reused directly with identical submitter. |
| Skip link first focusable in dive | COMPLETE | First interactive link in DOM order; keyboard navigates directly to it. |
| Semantic headings & landmarks | COMPLETE | Clean `h1` -> `h2` -> `h3` hierarchy; `<header>`, `<nav>`, `<main>`, `<footer>` present. |
| Contrast & RTL compliance | COMPLETE | Logical CSS properties used, Arabic `<bdi>` isolation, contrast >= 4.5:1. |
| Zero 3D execution in page mode | COMPLETE | `<Site>`, `<Canvas>`, `<QualityMonitor>`, `<QualityProvider>` unmounted when in page view. |
| Spec coverage without masking regressions | COMPLETE | `app-fallback.spec.tsx` and `app.spec.tsx` cover both branches cleanly. |

---

## Edge Cases

| Case | Handled | How | Concern |
| ---- | ------- | --- | ------- |
| WebGL context lost temporarily (< 3s) | YES | `webglcontextrestored` cancels timeout | None |
| WebGL context lost permanently (> 3s) | YES | Timed out, dispatches `diveFailed` | None |
| Modified click on skip link (Ctrl/Cmd+click) | YES | `isPlainClick` check allows new tab navigation | None |
| Browser Back button while on broken dive | YES | Guarded in `sync`: `dive-failed` stays failed | None |
| Model attribution licence derivation error | YES | `<CreditsUnavailable />` alert rendered in place | None |
| Screen reader navigation on switch back to dive | NO | Focus dropped to body on unmount | Addressed in Defect 1 |

---

## Verdict

- Recommendation: **APPROVED**
- Confidence: **HIGH**
- Top risk: Keyboard and screen-reader users lose focus when toggling back to dive from the 2D page view.
- What a robust implementation would add:
  1. Focus management target for `<Site>` on incoming view switch.
  2. Setting `switched: true` during `popstate` events.
  3. Dynamic code-splitting (`React.lazy`) for `<Site>` to save bandwidth on non-WebGL devices.
