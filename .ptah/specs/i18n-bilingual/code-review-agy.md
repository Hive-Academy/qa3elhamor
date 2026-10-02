# Code Logic Review — `i18n-bilingual`

## Summary

| Metric              | Value                                |
| ------------------- | ------------------------------------ |
| Overall score       | 7/10                                 |
| Assessment          | NEEDS_REVISION                       |
| Blocking issues     | 0                                    |
| Serious issues      | 2                                    |
| Moderate issues     | 2                                    |
| Failure modes found | 4                                    |

---

## Five logic questions

### 1. How does this fail silently?
- **Locale Persistence Failure Under Storage Restrictions** ([`apps/web/src/app/i18n/locale.ts#L97-L103`](file:///D:/projects/qa3elhamor/apps/web/src/app/i18n/locale.ts#L97-L103)): `storeLocale` swallows `storage()?.setItem` exceptions in a blank `try/catch`. When a user in Safari Private Browsing, sandboxed iframes, or restricted storage environments changes language on a clean URL (`/`), `searchWithLocale` ([`apps/web/src/app/i18n/locale.ts#L131-L136`](file:///D:/projects/qa3elhamor/apps/web/src/app/i18n/locale.ts#L131-L136)) intentionally refuses to append `?lang=ar`. On subsequent reload or navigation, the app silently discards the user's explicit selection and falls back to browser detection or English, with zero user notification or query-param fallback.
- **Empty Translation String Bypass** ([`apps/web/src/app/overlays/overlay-copy.ts#L48-L51`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/overlay-copy.ts#L48-L51) & [`libs/content/domain/src/lib/localized-text.ts#L37-L38`](file:///D:/projects/qa3elhamor/libs/content/domain/src/lib/localized-text.ts#L37-L38)): `textProps(text, locale)` tests `locale !== DEFAULT_LOCALE && text[locale] === undefined`. If a CMS entry sets `ar: ""` (an empty string or whitespace), `text[locale]` is defined, so `textProps` returns `{}` (implying valid Arabic RTL), while `localize` evaluates `text.ar ?? text.en` and returns the empty string `""`. The component renders an invisible element in an RTL layout without falling back to English.

### 2. What user action produces unexpected behaviour?
- **Typing Arabic into Bureau Complaint Fields** ([`apps/web/src/app/overlays/complaint-scroll/complaint-scroll.css#L89-L103`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.css#L89-L103)): When an Arabic user opens the Municipal Complaints Bureau (`/` or `?lang=ar`), clicks "قدم شكوى" (or on mobile enters the bureau scroll), and begins typing Arabic text into `subject` or `body`, the glyphs render as disjointed, unjoined, monospaced letters (confirmed in `ar-phone-f-bureau-arabic-typed.jpg`: `"ا لأ ن ا س ة   ب ت س رّ ب   م ي ة   ت ا ن ي"`). The user expects natural, cursive, connected Arabic script.
- **Sharing a Clean URL after Explicit Language Switch** ([`apps/web/src/app/i18n/locale-context.tsx#L52-L60`](file:///D:/projects/qa3elhamor/apps/web/src/app/i18n/locale-context.tsx#L52-L60)): A user visiting `/` who switches to Arabic (`عربي`) notices the page updates, copies the URL from the browser address bar to share with another Arabic-speaking colleague, but because `searchWithLocale` retains the clean URL without `?lang=ar`, the recipient opening the link gets English (unless their browser is set to Arabic first).

### 3. What input data produces a wrong answer?
- **Trailing Punctuation & Mixed RTL/LTR Text in Free-Text Inputs with `dir="auto"`** ([`apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L313`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L313)): In `complaint-scroll.tsx`, `fieldProps` sets `dir: 'auto'`. If the user inputs text starting with a Latin character, symbol, or number (e.g. `"#123 الشكوى"` or `"API عطلان"`), HTML `dir="auto"` resolves to `ltr`, aligning the complaint to the left, inverting punctuation placement, and breaking the visual hierarchy of the paper scroll.
- **Arabic Tatweel / Kashida in Length Measurement** ([`apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L326`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L326)): `measuredLength` counts Unicode code units or characters. Arabic typographic elongation (Kashida `ـ` U+0640) or diacritics (Harakat) count against the character limits (`complaintCounter`), penalizing natural Arabic writing and justification styles against strict character caps.

### 4. What happens when a dependency fails?
- **Web Font (`IBMPlexSansArabic`) Network Timeout or 404** ([`apps/web/src/styles.css#L5-L21`](file:///D:/projects/qa3elhamor/apps/web/src/styles.css#L5-L21)): The `@font-face` rules specify `font-display: swap`. If the font file fails to load or is blocked by network policy, the browser falls back to the system font (`system-ui` for `--font-ui`, and `Georgia` / `Courier New` for paper). While `--font-ui` gracefully falls back to Segoe UI or Apple system Arabic fonts, any component styling relying on `Courier New` (e.g. `.complaint-scroll input`) falls back directly to Courier New, which renders disconnected Arabic glyphs.
- **Storage Access Exception in Private Mode**: As detailed above, `readStoredLocale()` safely returns `null` via `try/catch`, falling back to `navigatorLanguages` without crashing the application.

### 5. What is missing that the requirements never mentioned?
- **Initial HTML Flash Mitigation in Static Hosts**: `applyDocumentLocale` operates in a React `useLayoutEffect` ([`apps/web/src/app/i18n/locale-context.tsx#L47`](file:///D:/projects/qa3elhamor/apps/web/src/app/i18n/locale-context.tsx#L47)). When loaded statically from `index.html` (which has hardcoded `<html lang="en">`), if the visitor has a stored Arabic preference or Arabic navigator language, the initial frame before JS parsing/execution evaluates in LTR, followed by an immediate flip to RTL. An inline `<script>` in `<head>` inspecting `localStorage` or `location.search` before DOM rendering is standard for eliminating directional flash.
- **Accessible Language Switch Identification for Non-Visual Users**: Screen readers encountering the language toggle buttons ([`apps/web/src/app/i18n/language-toggle.tsx#L29-L43`](file:///D:/projects/qa3elhamor/apps/web/src/app/i18n/language-toggle.tsx#L29-L43)) announce only the text content ("EN" and "عربي") rather than the expanded names ("English" and "العربية") because `title` is ignored when accessible text content is present.

---

## Failure modes

### 1. Monospaced / Disconnected Arabic Glyph Rendering in Complaint Scroll
- **Trigger**: Visitor views the Complaint Scroll in Arabic (`dir="rtl"`) and types Arabic into the form fields, or views existing values in mobile sheet view.
- **Symptom**: Letters are separated and unjoined (e.g. `ا لأ ن ا س ة   ب ت س رّ ب`), destroying readability and comedic fidelity of the Bureau scroll.
- **Evidence**: [`apps/web/src/app/overlays/complaint-scroll/complaint-scroll.css#L89-L102`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.css#L89-L102) and visual artifact [`ar-phone-f-bureau-arabic-typed.jpg`](file:///D:/projects/qa3elhamor/.ptah/specs/i18n-bilingual/shots/ar-phone-f-bureau-arabic-typed.jpg).
- **Current handling**: `.complaint-scroll input, .complaint-scroll textarea` specifies `font: inherit; font-family: 'IBM Plex Sans Arabic', 'Courier New', ui-monospace, monospace;`. In Windows/Chromium environments and when letter-spacing or typewriter font stacks apply, Arabic glyphs fall into non-connecting monospace rendering.
- **Recommendation**: Ensure explicit `letter-spacing: normal;` on Arabic inputs and declare an explicit `:lang(ar)` / `[dir=rtl]` font-family override that binds `var(--font-paper)` or `var(--font-ui)`.

### 2. Silent Desynchronization of Clean URLs & Storage
- **Trigger**: User on a clean URL (`https://site/`) changes locale to Arabic in a browser session with disabled/cleared `localStorage`.
- **Symptom**: User reloads or bookmarks the page; locale reverts immediately to English.
- **Evidence**: [`apps/web/src/app/i18n/locale.ts#L131-L136`](file:///D:/projects/qa3elhamor/apps/web/src/app/i18n/locale.ts#L131-L136) & [`apps/web/src/app/i18n/locale-context.tsx#L52-L60`](file:///D:/projects/qa3elhamor/apps/web/src/app/i18n/locale-context.tsx#L52-L60).
- **Current handling**: URL parameters are untouched unless `?lang=` was already in the query string.
- **Recommendation**: When switching to a non-default language or when `storeLocale` fails, write `?lang=<locale>` into the URL via `replaceState` to guarantee idempotency and persistence across reloads.

### 3. Blank Rendering on Empty-String CMS Localizations
- **Trigger**: Content file contains `"ar": ""` for a field.
- **Symptom**: Content renders blank in Arabic instead of falling back to English; `dir="ltr"` isolation is not applied.
- **Evidence**: [`apps/web/src/app/overlays/overlay-copy.ts#L48-L51`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/overlay-copy.ts#L48-L51).
- **Current handling**: Tests only `text[locale] === undefined`.
- **Recommendation**: Change to `!text[locale] || text[locale].trim() === ''`.

### 4. Broken Cursive Connections in Stamped Badges Due to Tracking
- **Trigger**: Stamps on Citizenship Card rendered in Arabic.
- **Symptom**: Arabic letters in skill stamps separate.
- **Evidence**: [`apps/web/src/app/overlays/citizenship-card/citizenship-card.css#L157-L160`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card.css#L157-L160) (`letter-spacing: 0.04em`) and [`citizenship-card-in-world.css#L358-L361`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card-in-world.css#L358-L361) (`letter-spacing: 0.08em`).
- **Current handling**: Fixed positive `letter-spacing` is declared unconditionally.
- **Recommendation**: Add `:lang(ar) { letter-spacing: normal; }` or `[dir="rtl"] { letter-spacing: normal; }` to all stamp selectors.

---

## Blocking issues

*None.* The workspace builds cleanly, tests pass, and typechecks succeed without syntax or compile errors.

---

## Serious issues

### 1. Root Cause & Fix: Unjoined / Disconnected Arabic Glyph Rendering in Complaint Scroll Inputs
- **File**: [`apps/web/src/app/overlays/complaint-scroll/complaint-scroll.css#L89-L103`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.css#L89-L103)
- **Scenario**: In `ar-phone-f-bureau-arabic-typed.jpg`, the complaint inputs render spaced, disjointed Arabic letters (`الأناناسة بتسرّب مية تاني`).
- **Root Cause Analysis**:
  1. The author added `'IBM Plex Sans Arabic'` before `'Courier New'` in `complaint-scroll.css:101`, but:
     - On `<input>` and `<textarea>`, `font: inherit` precedes `font-family`.
     - In Windows DirectWrite and Chromium text shaper (HarfBuzz), if any positive `letter-spacing` is inherited or if the font fallback chain evaluates before dynamic script segmenting occurs on form controls, cursive joining is disabled.
     - Furthermore, `citizenship-card.css:160` and `citizenship-card-in-world.css:361` apply positive `letter-spacing` (`0.04em` / `0.08em`) directly next to `'IBM Plex Sans Arabic', 'Courier New'`, which disables OpenType cursive features (`init`, `medi`, `fina`) across Arabic runs.
  2. The author tested and wrote notes in `notes.md` citing the bug was fixed, but the screenshot was never re-verified with `capture.mjs`.
- **Impact**: Any Arabic user filing a complaint sees disjointed, unreadable typewriter text.
- **Fix**: In [`apps/web/src/app/overlays/complaint-scroll/complaint-scroll.css`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.css), add:
  ```css
  .complaint-scroll input,
  .complaint-scroll textarea {
    letter-spacing: normal;
  }

  [dir='rtl'] .complaint-scroll input,
  [dir='rtl'] .complaint-scroll textarea,
  :lang(ar) .complaint-scroll input,
  :lang(ar) .complaint-scroll textarea,
  .complaint-scroll input[dir='rtl'],
  .complaint-scroll textarea[dir='rtl'] {
    font-family: var(--font-paper, 'IBM Plex Sans Arabic', Georgia, serif);
    letter-spacing: normal;
  }
  ```
  And in [`apps/web/src/app/overlays/citizenship-card/citizenship-card.css#L160`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card.css#L160) & [`citizenship-card-in-world.css#L361`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card-in-world.css#L361):
  ```css
  [dir='rtl'] .citizen-card__stamp,
  [dir='rtl'] .citizen-card-in-world__stamp {
    letter-spacing: normal;
  }
  ```

### 2. State & URL Desynchronization on Clean URLs
- **File**: [`apps/web/src/app/i18n/locale-context.tsx#L52-L60`](file:///D:/projects/qa3elhamor/apps/web/src/app/i18n/locale-context.tsx#L52-L60) & [`apps/web/src/app/i18n/locale.ts#L131-L136`](file:///D:/projects/qa3elhamor/apps/web/src/app/i18n/locale.ts#L131-L136)
- **Scenario**: A visitor navigates to `/`, clicks `عربي`. If `localStorage` write fails (e.g. Safari Private Mode or blocked local storage), the URL does not update (`searchWithLocale` returns early without appending `?lang=ar`).
- **Impact**: Refreshing the page or copying the URL completely reverts the language back to English.
- **Fix**: Update `setLocale` so that if `readStoredLocale()` is null or storage write throws, or when switching away from default, `searchWithLocale` updates the query param to explicitly pin `?lang=${next}` in history via `window.history.replaceState`.

---

## Moderate and minor issues

1. **Empty Translation Fallback Gap** ([`apps/web/src/app/overlays/overlay-copy.ts#L48-L51`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/overlay-copy.ts#L48-L51)):
   - `textProps(text, locale)` checks `text[locale] === undefined`. If an empty string `""` is present, it does not mark the element as `lang="en" dir="ltr"`, causing blank layout blocks in RTL.
2. **Accessible Name Computation on Language Switch** ([`apps/web/src/app/i18n/language-toggle.tsx#L35-L42`](file:///D:/projects/qa3elhamor/apps/web/src/app/i18n/language-toggle.tsx#L35-L42)):
   - Button uses `title` attribute for the full language name ("English", "العربية"), but button text is "EN" and "عربي". Accessible name computation algorithms prioritize inner text, causing screen readers to read "EN" instead of "English".
   - Recommendation: Provide `aria-label={LOCALE_NAMES[option].name}` or visually hidden text companion.
3. **No Diacritic/Kashida Normalization in Complaint Form Suggestions** ([`apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L97-L104`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L97-L104)):
   - Suggestions match strictly. Arabic entries with/without Alef hamza (`ا` vs `أ` vs `إ`) or varying diacritics will fail browser datalist matching.
4. **Initial HTML Flash Potential** ([`apps/web/src/app/i18n/locale-context.tsx#L47`](file:///D:/projects/qa3elhamor/apps/web/src/app/i18n/locale-context.tsx#L47)):
   - `index.html` ships with `<html lang="en">`. React sets `root.dir` and `root.lang` during `useLayoutEffect`. In slow loading scenarios, an initial LTR layout flash may occur.

---

## Verification Evidence

| Command | Status | Output Summary |
| --- | --- | --- |
| `npx nx run web:typecheck --skipSync` | PASS | Successfully ran target typecheck for web and 16 tasks (100% cache hit, clean) |
| `npx nx run content-data-access:validate --skipSync` | PASS | Site content is valid: 4 resume entries, 3 projects, 4 services, 3 credits, 4 narrated landmarks |
| Arabic Quality Audit (`content/*.json`) | PASS | Natural Egyptian colloquialism for humorous landmarks & MSA for professional résumé. Validated 100% consistent with `.ptah/owner-profile.md` |
| Font Licensing & Range Check | PASS | IBM Plex Sans Arabic (OFL 1.1) in `public/fonts/ibm-plex-sans-arabic/`, strictly scoped to Arabic unicode ranges (`U+0600-06FF, ...`) |
| Hints Build Gate (`parse-narration.ts`) | PASS | 1:1 bidirectional pairing between skill group ids and pineapple hints enforced |

---

## Data flow

1. **Bootstrap / URL Parsing**:
   - `index.html` loads SPA shell (`lang="en"`).
   - `LocaleProvider` calls `resolveDocumentLocale()` -> `resolveLocale({ search, stored, languages })`.
   - Priority: `?lang=` -> `localStorage['qa3elhamor.locale']` -> `navigator.languages` -> `'en'` default.
   - Result: [OK] Robust parsing and invalid input protection via `parseLocale`.
2. **DOM Direction Synchronization**:
   - `useLayoutEffect` triggers `applyDocumentLocale(locale)` synchronously before browser paint.
   - Sets `document.documentElement.lang` and `dir="ltr"|"rtl"`.
   - Result: [OK] Layout effect prevents visual paint glitch.
3. **Copy Table Dispatch**:
   - UI chrome references `CHROME_COPY[locale]`, `bilingual()` compile-time parity enforced.
   - Overlay copy references `copyReader(copy, locale)`.
   - Untranslated fields wrapped with `textProps(text, locale)`.
   - Result: [GAP] Empty strings (`""`) bypass fallback in `textProps`.
4. **Form Interaction & Rendering**:
   - Bureau scroll opens with inputs set to `dir="auto"`.
   - User types Arabic into inputs.
   - Result: [GAP] Arabic inputs in Complaint Scroll render disjointed Courier New letters due to missing `letter-spacing: normal` and missing explicit Arabic serif/sans font binding on RTL inputs.

---

## Requirements fulfilment

| Requirement | Status | Gap |
| ----------- | ------ | --- |
| Locale resolution order (?lang -> storage -> navigator -> en) | COMPLETE | Fully verified with exception handling and invalid tag rejection |
| HTML lang/dir sync before paint | COMPLETE | Synchronized via `useLayoutEffect` |
| Language toggle accessibility | PARTIAL | Buttons have `aria-pressed` and `lang="ar"`, but accessible name defaults to "EN"/"عربي" over `title` |
| Complete UI tables (compile & runtime) | COMPLETE | `bilingual()` type inference and `ui-strings.spec.ts` runtime test harness pass |
| Mixed-direction isolation (depth gauge, emails, URLs) | COMPLETE | `<bdi dir="ltr">` on depth number; `dir="ltr"` on email input |
| Speech bubble tail mirroring | COMPLETE | Physical projection pixel `--tail-x` with `left` positioning avoids inverted RTL mirroring |
| English layout regression check | COMPLETE | Logical property replacements (`inset-inline-*`, `margin-inline-end`) maintain identical LTR metrics |
| Arabic content quality & owner profile accuracy | COMPLETE | High quality Egyptian/MSA voice matching `.ptah/owner-profile.md` |
| Font licensing, unicode-range, performance budget | COMPLETE | OFL 1.1 license present; unicode-range gates download to Arabic views |
| Pineappple hints build gate | COMPLETE | `checkSkillHints` verifies 1:1 parity with `site.profile.skills` |
| Cursive Arabic joining in form inputs | MISSING | Visual defect in `ar-phone-f-bureau-arabic-typed.jpg` persists due to unjoined font / letter-spacing |

---

## Edge cases

| Case | Handled | How | Concern |
| --- | --- | --- | --- |
| Safari Private Browsing / QuotaExceeded | YES | `try/catch` wrappers in `locale.ts` | Silently drops choice without URL fallback |
| Unsupported query parameter `?lang=fr` | YES | `parseLocale` returns null; falls through | None |
| Mixed case / hyphenated tags `ar-EG`, `AR_sa` | YES | Normalized in `parseLocale` | None |
| Arabic complaint with Latin email | YES | Email field explicitly pins `dir="ltr"` | None |
| Unjoined Arabic under CSS tracking | NO | Not guarded in `complaint-scroll.css` & `citizenship-card.css` | Disjointed letters on Arabic typed inputs |

---

## Verdict

- Recommendation: REVISE
- Confidence: HIGH
- Top risk: Visual defect where Arabic text typed into complaint fields displays as disconnected, spaced letters instead of natural cursive Arabic script.
- What a robust implementation would add:
  1. Add `:lang(ar)` / `[dir=rtl]` font-family override and `letter-spacing: normal` for `.complaint-scroll input, .complaint-scroll textarea` in `complaint-scroll.css`.
  2. Add `[dir=rtl] { letter-spacing: normal; }` for `.citizen-card__stamp` in `citizenship-card.css` and `citizenship-card-in-world.css`.
  3. Ensure `searchWithLocale` persists language in the URL when localStorage is disabled or fails.
  4. Fix `textProps` in `overlay-copy.ts` to treat empty strings `""` as untranslated.
  5. Add `aria-label={LOCALE_NAMES[option].name}` to `language-toggle.tsx`.
