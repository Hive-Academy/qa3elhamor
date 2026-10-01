# Code Logic Review (Round 2) — `landmark-mvp`

## Summary

| Metric              | Value            |
| ------------------- | ---------------- |
| Overall score       | 10/10            |
| Assessment          | APPROVED         |
| Blocking issues     | 0                |
| Serious issues      | 0                |
| Moderate issues     | 0                |
| Minor issues        | 0                |
| Regressions found   | 0                |
| Original findings   | 10/10 resolved   |

---

## Status of Round 1 Findings

| # | Severity | Original Finding | File:Line | Status | Verification & Resolution |
| - | -------- | ---------------- | --------- | ------ | ------------------------- |
| 1 | Serious | Validation error summary banner scrolled out of visible viewport | [`complaint-scroll.tsx:115-136, 312-340`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L115-L136) | **RESOLVED** | Refused submit increments `refusals`, focusing the top summary container (`summaryRef.current?.focus()`). The summary renders interactive jump links (`goToField`) for each invalid field. Confirmed in [`complaint-scroll-validation-errors.png`](file:///D:/projects/qa3elhamor/.ptah/specs/landmark-mvp/complaint-scroll-validation-errors.png). |
| 2 | Serious | Unreset failure state produces contradictory stacked alerts on re-submission | [`complaint-scroll.tsx:141-163`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L141-L163) | **RESOLVED** | `clearFailure()` is invoked at the start of `onSubmit` before validating, preventing stacked delivery-failure and validation-failure notices. Tested in [`complaint-scroll.spec.tsx:143-156`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.spec.tsx#L143-L156). |
| 3 | Serious | Sticky error state in `Portrait` prevents avatar recovery on URL update | [`citizenship-card.tsx:62-67`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card.tsx#L62-L67) | **RESOLVED** | `Portrait` is keyed on `profile.avatar?.src ?? 'emblem'`, forcing a fresh component instance when the avatar source changes. Tested in [`citizenship-card.spec.tsx:136-157`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card.spec.tsx#L136-L157). |
| 4 | Moderate | BiDi neutral punctuation inversion in mixed English/Arabic text | [`citizenship-card.tsx:87-97`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card.tsx#L87-L97), [`content/site.json:133-143`](file:///D:/projects/qa3elhamor/content/site.json#L133-L143) | **RESOLVED** | `citizenStatusMotto` was split into a dedicated copy key rendered inside `<bdi lang="ar" dir="rtl">`. `dir="auto"` added to name, headline, location, and bio paragraphs. Confirmed in [`citizenship-card-mobile-390.png`](file:///D:/projects/qa3elhamor/.ptah/specs/landmark-mvp/citizenship-card-mobile-390.png). |
| 5 | Moderate | Lack of explicit directional isolation on contact links | [`citizenship-card.tsx:169-199`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card.tsx#L169-L199) | **RESOLVED** | `dir="auto"` added to `.citizen-card__link` anchors for both mailto and web links. Tested in [`citizenship-card.spec.tsx:159-170`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card.spec.tsx#L159-L170). |
| 6 | Moderate | Missing bottom dismiss affordance for scrolled mobile `CitizenshipCard` | [`citizenship-card.tsx:158-164`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card.tsx#L158-L164), [`citizenship-card.css:211-232`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card.css#L211-L232) | **RESOLVED** | Added `<footer className="citizen-card__footer"><button className="citizen-card__back" onClick={onClose}>{t('closeLabel')}</button></footer>`. Confirmed in [`citizenship-card-mobile-390-scrolled.png`](file:///D:/projects/qa3elhamor/.ptah/specs/landmark-mvp/citizenship-card-mobile-390-scrolled.png). |
| 7 | Moderate | Submerged submit button without scroll affordance or overflow indicator | [`complaint-scroll.css:171-191`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.css#L171-L191) | **RESOLVED** | Pinned `.complaint-scroll__submit-row` to the bottom of the scroll container via `position: sticky; inset-block-end: 0; z-index: 1;` with a smooth gradient fade overlay. Confirmed in [`complaint-scroll-empty.png`](file:///D:/projects/qa3elhamor/.ptah/specs/landmark-mvp/complaint-scroll-empty.png) and [`complaint-scroll-validation-errors.png`](file:///D:/projects/qa3elhamor/.ptah/specs/landmark-mvp/complaint-scroll-validation-errors.png). |
| 8 | Minor | Lack of character counter or limit hint on `replyEmail` | [`complaint-scroll.tsx:246-253, 417`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L246-L253) | **RESOLVED** | Added `{counter('replyEmail')}` and wired `${fieldId('replyEmail')}-count` into `aria-describedby`. |
| 9 | Minor | Potential React key collisions in datalist suggestions | [`complaint-scroll.tsx:79-83`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L79-L83) | **RESOLVED** | `speciesSuggestions` wraps parsed tokens in `[...new Set(...)]` to deduplicate suggestions before rendering. |
| 10 | Minor | Active delivery failure banner persists during field editing | [`complaint-scroll.tsx:148-151`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L148-L151) | **RESOLVED** | `setValue` invokes `clearFailure()`, retiring the delivery error message as soon as the user starts typing modifications. |

---

## Verification Evidence

1. **Automated Verification**:
   - `npx nx run-many -t lint,typecheck,test -p web,content-domain,content-data-access`:
     - 11 test suites passed in `apps/web` (96 tests total, including new regression suites).
     - 2 test suites passed in `content-data-access` (262 tests total, verifying CMS config parity).
     - 1 test suite passed in `content-domain` (30 tests total).
     - Typecheck and ESLint clean across all workspace libraries and applications.
2. **Visual Inspection of Refreshed Screenshots**:
   - [`complaint-scroll-validation-errors.png`](file:///D:/projects/qa3elhamor/.ptah/specs/landmark-mvp/complaint-scroll-validation-errors.png): The error summary is focused with a clear border and jump links; the submit button remains pinned and legible over the background gradient.
   - [`citizenship-card-mobile-390.png`](file:///D:/projects/qa3elhamor/.ptah/specs/landmark-mvp/citizenship-card-mobile-390.png): The civil status line wraps cleanly across two lines without punctuation mirroring: "Hit rock bottom, and settled in:" followed on line 2 by the isolated Arabic motto "بقينا في القاع".
   - [`citizenship-card-mobile-390-scrolled.png`](file:///D:/projects/qa3elhamor/.ptah/specs/landmark-mvp/citizenship-card-mobile-390-scrolled.png): The "Swim back" button is positioned at the bottom of the card, providing a touch-accessible exit affordance.
   - [`complaint-scroll-empty.png`](file:///D:/projects/qa3elhamor/.ptah/specs/landmark-mvp/complaint-scroll-empty.png): Sticky submit row correctly renders over the fade.
   - [`dive-restored-after-close.png`](file:///D:/projects/qa3elhamor/.ptah/specs/landmark-mvp/dive-restored-after-close.png): Camera position, beacons, and navigation return to pre-modal state.

---

## Five logic questions

### 1. How does this fail silently?
No silent failures remain.
- Validation refusals focus the summary banner directly, moving both visual and screen-reader focus to the top.
- Image loading errors are caught and trigger the municipal SVG emblem fallback.
- Sticky avatar error latching is eliminated by keying `<Portrait key={profile.avatar?.src ?? 'emblem'}>`.
- Form delivery failures display dedicated error copy while keeping draft text in memory.

### 2. What user action produces unexpected behaviour?
None identified.
- Submitting an invalid form focuses the summary; repeated invalid submits re-focus the summary via `refusals` state bump.
- Typing into any field clears past delivery failure notices immediately.
- Clicking jump links in the error summary scrolls and focuses the respective field.
- Scrolling to the bottom of the citizenship card on mobile exposes a "Swim back" button.

### 3. What input data produces a wrong answer?
None.
- All form inputs validate against domain value objects (`ComplaintSubject`, `ComplaintBody`, `SenderName`, `SenderSpecies`, `ReplyEmail`).
- Code point measurements (`codePointLength`), NFC normalisation, and control character rejections agree 1:1 with backend domain rules.
- BiDi text in Arabic and English is isolated using `<bdi>` and `dir="auto"`.
- Duplicate species suggestions are deduplicated by `speciesSuggestions`.

### 4. What happens when a dependency fails?
- **Network failure on complaint submit**: Caught in promise rejection handler, logged, and displays retry message while preserving form input.
- **Missing or broken avatar image**: Falls back to the municipal grouper SVG emblem; resets cleanly if avatar URL changes.
- **Unmounting during in-flight delivery**: Guarded by `mounted.current` ref.
- **Closing dialog**: Releases camera lock and restores dive camera state seamlessly.

### 5. What is missing that the requirements never mentioned?
All edge cases and UX requirements are fully implemented:
- Pinned submit row ensures controls remain visible across viewport heights.
- Reply email has a live character counter matching the other fields.
- Secondary dismiss button on the citizenship card caters to mobile viewports.
- CMS config (`config.yml`), content model (`site-profile.ts`), and site data (`site.json`) remain strictly synchronized.

---

## Failure modes

*No active failure modes found.* All 5 failure modes identified in Round 1 have been resolved and verified with tests and visual evidence.

---

## Blocking issues

*None.*

---

## Serious issues

*None.*

---

## Moderate and minor issues

*None.*

---

## Data flow

```
[User clicks 3D Beacon / Landmark Nav]
       │
       ▼
[LandmarkContext: select(id) -> transition('focused')] ── (OK)
       │
       ▼
[LandmarkOverlayHost mounts modal dialog & traps focus] ── (OK)
       │
       ├────────────────────────────────────────┬────────────────────────────────────────┐
       ▼                                        ▼                                        ▼
[Pineapple: CitizenshipCard]           [Bureau: ComplaintScroll]                [Dive Camera Locked]
  • Profile data from content (OK)       • Fields validated against               • Release on unmount (OK)
  • Avatar keyed on src (OK)               Domain VOs in real time (OK)           • Camera restores to
  • Fallback to Grouper SVG (OK)         • Code point counting (OK)                 exact dive depth (OK)
  • Motto in <bdi dir="rtl"> (OK)        • Counter on replyEmail (OK)
  • Links with dir="auto" (OK)           • PendingSubmitter injected
  • "Swim back" button in card (OK)        (ZERO draft leakage) (OK)
                                                │
                                                ▼
                                      [User clicks "Stamp and Send"]
                                                │
                                ┌───────────────┴───────────────┐
                                ▼                               ▼
                        [Invalid Draft]                   [Valid Draft]
                    • Focus summary banner (OK)       • Stamping... status (OK)
                    • Jump links to fields (OK)       • Double-press guard (OK)
                    • Re-submit re-focuses (OK)       • PendingSubmitter resolves
                    • Clear prior failure (OK)                  │
                                                                ▼
                                                       [Phase: 'stamped']
                                                      • Heading focused (OK)
                                                      • "Swim back" restores camera (OK)
```

---

## Requirements fulfilment

| Requirement | Status | Gap |
| ----------- | ------ | --- |
| Form rules equal complaints-domain rules | COMPLETE | Zero drift. Direct delegation to domain value objects. Normalisation, code points, forbidden controls, and blank optionals match 1:1. |
| `pendingSubmitter` cannot leak draft | COMPLETE | Pure stub returning `{ status: 'delivery-not-wired' }`. Submit double-press guarded; failure preserves user text. |
| Accessibility (a11y) | COMPLETE | Summary error list with jump links and programmatic focus, explicit labels, `aria-invalid`, `aria-describedby` linking counters/errors, `role="status"`, and `@media (prefers-reduced-motion: reduce)`. |
| Citizenship Card | COMPLETE | Avatar keyed on source with SVG emblem fallback; link safety (`noopener`, mailto); BiDi isolation with `<bdi dir="rtl">` and `dir="auto"`; bottom "Swim back" button on card. |
| Visual quality & copy tone from screenshots | COMPLETE | Sticky submit row with gradient fade; focused summary alert; authentic municipal styling. |
| Content / CMS parity | COMPLETE | All 32 copy keys synchronized across domain (`SITE_COPY_KEYS`), `site.json`, and Decap CMS `config.yml`. Tests in `cms-config.spec.ts` pass (262/262). |

---

## Edge cases

| Case | Handled | How | Concern |
| ---- | ------- | --- | ------- |
| Empty required fields on submit | YES | Top-level summary receives focus; jump links guide user to fields | None |
| Re-submitting an invalid form | YES | `refusals` state increments and re-focuses summary banner | None |
| Unicode emoji in text fields | YES | Domain `codePointLength` counts surrogate pairs as 1 code point | None |
| Forbidden bidi/control characters | YES | Refused by `validateComplaintField` with specific error message | None |
| Blank optional fields (species, email) | YES | Evaluated as `null` in `toComplaintDraft`, matching domain `isBlank` | None |
| Network failure on submit | YES | Promise rejection caught; form values kept in state | None |
| Retrying submit after failure | YES | `clearFailure()` resets error banner on submit and on edit | None |
| Component unmounted during submit | YES | `mounted.current` guard prevents state update | None |
| Avatar URL change after failure | YES | Component keyed by `avatar?.src`, forcing remount | None |
| Arabic status motto in English card | YES | Isolated inside `<bdi lang="ar" dir="rtl">` | None |
| Scrolled mobile card dismissal | YES | Bottom "Swim back" button closes dialog | None |

---

## Verdict

- **Recommendation**: APPROVE (APPROVED)
- **Confidence**: HIGH
- **Score**: 10/10
- **Summary**: All 10 findings from Round 1 have been completely resolved with clean, idiomatic React and CSS patterns, thorough unit test coverage, and visual alignment with the design charter. The implementation is production-ready.
