# Code Logic Review (Revision 2) — `i18n-bilingual`

## Summary

| Metric              | Value                                |
| ------------------- | ------------------------------------ |
| Overall score       | 9/10                                 |
| Assessment          | APPROVED                             |
| Blocking issues     | 0                                    |
| Serious issues      | 0                                    |
| Moderate issues     | 0                                    |
| Failure modes found | 0                                    |

---

## Status of Prior Findings (R1 -> R2)

| Issue from R1 | Severity | Status | Evidence / Verification |
| ------------- | -------- | ------ | ----------------------- |
| **1. Unjoined/Spaced Arabic in Complaint Inputs** | Serious | **FIXED** | [`styles.css:47-49`](file:///D:/projects/qa3elhamor/apps/web/src/styles.css#L47-L49) sets `:lang(ar) { letter-spacing: normal !important; }`. [`complaint-scroll.css:101-113`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.css#L101-L113) sets `letter-spacing: normal` and binds `var(--font-paper)` for Arabic scroll inputs. Retaken shots [`ar-phone-f-bureau-arabic-typed.jpg`](file:///D:/projects/qa3elhamor/.ptah/specs/i18n-bilingual/shots/ar-phone-f-bureau-arabic-typed.jpg) and [`ar-desktop-f-bureau-arabic-typed.jpg`](file:///D:/projects/qa3elhamor/.ptah/specs/i18n-bilingual/shots/ar-desktop-f-bureau-arabic-typed.jpg) visually confirm natural cursive Arabic script. |
| **2. Clean URL + Refused Storage Dropping Locale** | Serious | **FIXED** | [`locale.ts:131-135`](file:///D:/projects/qa3elhamor/apps/web/src/app/i18n/locale.ts#L131-L135) & [`locale-context.tsx:55-63`](file:///D:/projects/qa3elhamor/apps/web/src/app/i18n/locale-context.tsx#L55-L63): `searchWithLocale` always sets `?lang=` upon switch via `window.history.replaceState`. Survives storage-refusal reloads. Verified in [`locale-switch.spec.tsx:58-68`](file:///D:/projects/qa3elhamor/apps/web/src/app/i18n/locale-switch.spec.tsx#L58-L68). |
| **3. Blank Rendering on Empty-String Translation** | Moderate | **FIXED** | [`libs/content/domain/src/lib/localized-text.ts:40-43`](file:///D:/projects/qa3elhamor/libs/content/domain/src/lib/localized-text.ts#L40-L43) treats blank/whitespace as missing; [`apps/web/src/app/overlays/overlay-copy.ts:48-51`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/overlay-copy.ts#L48-L51) derives fallback directly from `localize`. Verified in [`arabic-text.spec.ts:8-19`](file:///D:/projects/qa3elhamor/apps/web/src/app/i18n/arabic-text.spec.ts#L8-L19). |
| **4. Accessible Name on Language Toggle Buttons** | Moderate | **FIXED** | [`ui-strings.ts:69-72`](file:///D:/projects/qa3elhamor/apps/web/src/app/i18n/ui-strings.ts#L69-L72) & [`language-toggle.tsx:36`](file:///D:/projects/qa3elhamor/apps/web/src/app/i18n/language-toggle.tsx#L36): `aria-label` provides `"EN, English"` and `"عربي، العربية"`, complying with WCAG 2.5.3 (Label in Name). Verified in [`locale-switch.spec.tsx:52-56`](file:///D:/projects/qa3elhamor/apps/web/src/app/i18n/locale-switch.spec.tsx#L52-L56). |
| **5. Directional Layout Flash Prior to Paint** | Minor | **FIXED** | [`main.tsx:8`](file:///D:/projects/qa3elhamor/apps/web/src/main.tsx#L8) calls `applyDocumentLocale(resolveDocumentLocale().locale)` before `ReactDOM.createRoot` and `root.render`. |

---

## Analysis of Revision 1 Changes

### 1. URL State & History Coordination
- **Query Parameter Preservation**:
  [`locale.ts:131-135`](file:///D:/projects/qa3elhamor/apps/web/src/app/i18n/locale.ts#L131-L135):
  ```ts
  export function searchWithLocale(search: string, locale: Locale): string {
    const params = new URLSearchParams(search);
    params.set(LOCALE_PARAM, locale);
    return `?${params.toString()}`;
  }
  ```
  `URLSearchParams` preserves any existing query parameters (such as `view=page`, `quality=high`).
- **Hash and History State Preservation**:
  [`locale-context.tsx:58-62`](file:///D:/projects/qa3elhamor/apps/web/src/app/i18n/locale-context.tsx#L58-L62):
  ```ts
  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${search}${window.location.hash}`,
  );
  ```
  The call accurately preserves `window.history.state`, retains `window.location.hash`, and appends the updated query string.
- **Interaction with Page-View History (`?view=page`)**:
  - In [`apps/web/src/app/page-view/presentation.ts`](file:///D:/projects/qa3elhamor/apps/web/src/app/page-view/presentation.ts), switching views (`readAsPage` / `returnToDive`) relies on `hrefFor(window.location, view)` which reads `location.search` and modifies only `VIEW_PARAM`.
  - Because `setLocale` uses `replaceState` rather than `pushState`, changing language on the Page View (`?view=page`) does not introduce intermediate history entries. Pressing the browser's Back button correctly returns to the previous page or the Dive view without extra language-switch clicks.
  - Verified by [`locale-switch.spec.tsx:136-151`](file:///D:/projects/qa3elhamor/apps/web/src/app/i18n/locale-switch.spec.tsx#L136-L151) and [`app-fallback.spec.tsx:50-70`](file:///D:/projects/qa3elhamor/apps/web/src/app/app-fallback.spec.tsx#L50-L70).

### 2. Cursive Shaping & Letter Spacing
- **Global Reset**: [`styles.css:47-49`](file:///D:/projects/qa3elhamor/apps/web/src/styles.css#L47-L49) sets `:lang(ar) { letter-spacing: normal !important; }`. This neutralizes any component tracking (e.g. `letter-spacing: 0.08em` on stamps or cards) across Arabic text elements.
- **Exceptions Maintained**: In [`citizenship-card-in-world.tsx:155`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card-in-world.tsx#L155), the machine-readable passport zone is explicitly marked `<p className="citizen-pass__mrz" aria-hidden="true" lang="en" dir="ltr">`, ensuring that the OCR-B / Courier tracking (`0.12em`) remains applied to Latin passport codes.
- **Complaint Scroll Inputs**: In [`complaint-scroll.css:108-113`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.css#L108-L113), `.complaint-scroll:lang(ar) input:not([type='email'])` and `textarea` explicitly specify `font-family: var(--font-paper)`. Even under font network failure or blocking, fallback resolves to Georgia and system Arabic serif with proper cursive joining rather than monospaced Courier New.

---

## Five Logic Questions

### 1. How does this fail silently?
There are no silent failures remaining. If `localStorage` write throws, the URL query parameter `?lang=` explicitly preserves the visitor's choice across reloads. If a translation is missing or empty, `localize` and `textProps` fall back to English with `lang="en" dir="ltr"` alignment.

### 2. What user action produces unexpected behaviour?
None found. Navigation, browser Back/Forward, section anchor jumps, dialog openings, and language switches maintain consistent state across both Dive and Page views.

### 3. What input data produces a wrong answer?
None found. Empty strings and whitespace-only strings now trigger the fallback chain rather than rendering blank elements.

### 4. What happens when a dependency fails?
If `IBMPlexSansArabic` fails to load, `var(--font-paper)` falls back to system Arabic serif and `var(--font-ui)` falls back to system UI Arabic fonts, ensuring text remains cursive and legible in both locales.

### 5. What is missing that the requirements never mentioned?
All core requirements, edge cases, and accessibility considerations (label in name, mixed-direction isolation, storage-blocked environments) are addressed.

---

## Verification Evidence

| Check | Result | Evidence |
| ----- | ------ | -------- |
| `npx nx run web:typecheck --skipSync` | **PASS** | 17/17 tasks cached/clean, zero TypeScript errors |
| `npx nx run content-data-access:validate --skipSync` | **PASS** | 4 resume entries, 3 projects, 4 services, 3 credits, 4 narrated landmarks validated |
| Vitest Test Suite (`web`, `content-domain`, `content-data-access`) | **PASS** | 49 test files passed, 582 tests passed |
| Visual Inspection (`ar-phone-f-bureau-arabic-typed.jpg`) | **PASS** | Input text `"الأناناسة بتسرّب مية تاني"` and `"المية في كل حتة من ٣ أيام..."` renders with cursive, connected Arabic letters and natural spacing |
| Visual Inspection (`ar-desktop-f-bureau-arabic-typed.jpg`) | **PASS** | Verified desktop layout joins Arabic inputs cleanly with typewriter email field preserved |

---

## Verdict

- Recommendation: **APPROVE**
- Confidence: **HIGH**
- Score: **9/10**
- Assessment: Robust, resilient, accessible implementation of bilingual RTL/LTR support with zero regressions.
