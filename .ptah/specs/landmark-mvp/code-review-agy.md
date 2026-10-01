# Code Logic Review — `landmark-mvp`

## Summary

| Metric              | Value                                |
| ------------------- | ------------------------------------ |
| Overall score       | 7/10                                 |
| Assessment          | NEEDS_REVISION                       |
| Blocking issues     | 0                                    |
| Serious issues      | 3                                    |
| Moderate issues     | 4                                    |
| Minor issues        | 3                                    |
| Failure modes found | 5                                    |

---

## Scope & Verification Evidence

- **Projects examined**: `apps/web`, `libs/content/domain`, `libs/content/data-access`, `libs/complaints/domain`, `libs/landmarks/domain`, `libs/landmarks/ui`, `libs/landmarks/feature`.
- **Target files reviewed**:
  - `apps/web/src/app/overlays/overlay-copy.ts`
  - `apps/web/src/app/overlays/citizenship-card/citizenship-card.tsx`
  - `apps/web/src/app/overlays/citizenship-card/citizenship-card.css`
  - `apps/web/src/app/overlays/citizenship-card/citizenship-card.spec.tsx`
  - `apps/web/src/app/overlays/complaint-scroll/complaint-form-rules.ts`
  - `apps/web/src/app/overlays/complaint-scroll/complaint-form-rules.spec.ts`
  - `apps/web/src/app/overlays/complaint-scroll/complaint-submitter.ts`
  - `apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx`
  - `apps/web/src/app/overlays/complaint-scroll/complaint-scroll.css`
  - `apps/web/src/app/overlays/complaint-scroll/sardine-stamp.tsx`
  - `apps/web/src/app/overlays/complaint-scroll/complaint-scroll.spec.tsx`
  - `apps/web/src/app/landmarks.config.ts` (+ spec)
  - `content/site.json` (31 new copy keys)
  - `libs/content/domain/src/lib/site-profile.ts` (`SITE_COPY_KEYS`)
  - `apps/web/public/admin/config.yml`
- **Screenshots audited**:
  - `.ptah/specs/landmark-mvp/citizenship-card-desktop.png`
  - `.ptah/specs/landmark-mvp/citizenship-card-mobile-390.png`
  - `.ptah/specs/landmark-mvp/citizenship-card-mobile-390-scrolled.png`
  - `.ptah/specs/landmark-mvp/complaint-scroll-empty.png`
  - `.ptah/specs/landmark-mvp/complaint-scroll-validation-errors.png`
  - `.ptah/specs/landmark-mvp/complaint-scroll-stamped.png`
  - `.ptah/specs/landmark-mvp/dive-restored-after-close.png`
- **Automated Verification**:
  - `npx nx run-many -t lint,typecheck,test -p web,content-domain,content-data-access`
  - Target tests: 87/87 passed (`web`), 259/259 passed (`content-data-access`), 30/30 passed (`content-domain`).
  - Lint and TypeScript declaration emitting passed with zero errors.

---

## Five logic questions

### 1. How does this fail silently?
- **Error summary banner scrolled out of visible viewport**: In [`apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx:130-138`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L130-L138), when an invalid submission is attempted, the code locates the first invalid field (`subject`) and executes `target.closest('.complaint-scroll__field')?.scrollIntoView({ block: 'nearest' })`. Because the error summary banner (`<p role="alert" className="complaint-scroll__summary">`) is rendered *above* the fields at lines 270–273, scrolling `subject` to the top edge scrolls the summary banner off-screen above the paper dialog's scroll viewport. Visual users submitting from the bottom of the form never see the top-level error summary banner (verified in [`.ptah/specs/landmark-mvp/complaint-scroll-validation-errors.png`](file:///D:/projects/qa3elhamor/.ptah/specs/landmark-mvp/complaint-scroll-validation-errors.png)).
- **Latching avatar failure state across profile updates**: In [`apps/web/src/app/overlays/citizenship-card/citizenship-card.tsx:182-195`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card.tsx#L182-L195), `Portrait` maintains local state `const [failed, setFailed] = useState(false)`. If an avatar image fails to load once (e.g. temporary network error or CMS local preview edit), `failed` is set to `true`. If the parent component passes an updated `avatar` prop with a new valid URL, `failed` is never reset because there is no `useEffect` or key dependency. The UI silently remains stuck rendering the fallback SVG emblem.
- **BiDi parenthesis inversion on mobile line breaks**: In [`apps/web/src/app/overlays/citizenship-card/citizenship-card.tsx:77-80`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card.tsx#L77-L80) and [`content/site.json:138`](file:///D:/projects/qa3elhamor/content/site.json#L138), the English `citizenStatusValue` is `"Hit rock bottom, settled in (بقينا في القاع)"`. Because the `<dd>` lacks directional isolation, when the text wraps on a 390px mobile viewport, the Unicode Bidirectional Algorithm (UBA) treats the closing parenthesis as an LTR neutral following an RTL segment, rendering it on the left of the Arabic phrase as `)في القاع` (verified in [`.ptah/specs/landmark-mvp/citizenship-card-mobile-390.png`](file:///D:/projects/qa3elhamor/.ptah/specs/landmark-mvp/citizenship-card-mobile-390.png)).

### 2. What user action produces unexpected behaviour?
- **Re-submitting an invalid form after a network failure**: In [`apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx:124-152`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L124-L152), if `submitter.submit()` rejects, `phase` transitions to `{ kind: 'editing', failed: true }`, rendering the `complaintFailureBody` alert banner ("The stamp slipped and your complaint was not sent. Your text is still here; try again."). If the visitor edits a field to an invalid state and presses submit, `toComplaintDraft` returns `null` and `onSubmit` returns early without resetting `phase`. Consequently, the form displays two conflicting alert banners simultaneously: one claiming the submission attempt slipped and failed over the network, and another stating the Municipality cannot accept the form yet due to validation errors.
- **Editing form fields while delivery failure alert is active**: In [`apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx:116-118`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L116-L118), `setValue` updates only `values`. As a visitor types into the form to correct an issue after an API failure, `phase.failed` remains `true`. The error banner continues to claim "The stamp slipped... try again" while the user is actively revising the draft.
- **Scrolling to the bottom of the Citizenship Card on mobile**: In [`apps/web/src/app/overlays/citizenship-card/citizenship-card.tsx:50-142`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card.tsx#L50-L142) and [`libs/landmarks/ui/src/lib/landmark-overlay-host.css:26-30`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-overlay-host.css#L26-L30), scrolling down on a 390px screen moves the modal header containing the title and `×` button off-screen (verified in [`.ptah/specs/landmark-mvp/citizenship-card-mobile-390-scrolled.png`](file:///D:/projects/qa3elhamor/.ptah/specs/landmark-mvp/citizenship-card-mobile-390-scrolled.png)). Unlike `ComplaintScroll` (which provides a "Swim back" button in stamped mode), `CitizenshipCard` provides no exit affordance at the bottom of the content, forcing the mobile user to scroll all the way back to the top to dismiss the card.

### 3. What input data produces a wrong answer?
- **Contact links in Arabic mode containing English labels or URLs**: In [`apps/web/src/app/overlays/citizenship-card/citizenship-card.tsx:146-170`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card.tsx#L146-L170), `CitizenLink` outputs `<a className="citizen-card__link" ...>{label}</a>`. When `locale="ar"` (`dir="rtl"`), if `profile.links` contains English labels (e.g. "GitHub", "LinkedIn", "sam@example.com") or raw URLs, the anchor does not declare `dir="ltr"` or `dir="auto"`. In contrast to `complaint-scroll.tsx:339` (which explicitly provides `dir="ltr"` for email inputs), `CitizenLink` lacks directional isolation.
- **Duplicate entries in species suggestions**: In [`apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx:65-70, 325-327`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L65-L70), `speciesSuggestions` splits the comma-separated copy string and maps items directly to `<option key={species} value={species} />`. If CMS content introduces a repeated entry, React throws key-collision warnings.

### 4. What happens when a dependency fails?
- **Submitter rejects with error**: Correctly handled in [`apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx:146-151`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L146-L151). The error is logged, `phase` updates to `failed: true`, and the form values are preserved in state so no user input is lost.
- **Component unmounts while submit is in flight**: Correctly handled via the `mounted` ref in [`apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx:101-107`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L101-L107), preventing React state updates on unmounted trees.
- **Avatar fails to load (404/network error)**: Handled gracefully by `onError` in [`apps/web/src/app/overlays/citizenship-card/citizenship-card.tsx:193`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card.tsx#L193), replacing the image with the municipal grouper SVG emblem (`data-testid="citizen-emblem"`).
- **Missing optional profile data (location, avatar, skills, links)**: Handled safely in `citizenship-card.tsx` with default residence copy (`citizenResidenceDefault`) and selective rendering of sections.
- **Dive camera release on overlay dismiss**: Handled cleanly by `LandmarkOverlayHost` and `LandmarkProvider`. As evidenced by [`.ptah/specs/landmark-mvp/dive-restored-after-close.png`](file:///D:/projects/qa3elhamor/.ptah/specs/landmark-mvp/dive-restored-after-close.png), the dive camera and beacons restore to their exact pre-overlay coordinates.

### 5. What is missing that the requirements never mentioned?
- **Bottom dismiss/close button on mobile for `CitizenshipCard`**: The card is tall and contains bio, skills, and links; on mobile, scrolling pushes the header close button off-screen.
- **Scroll indicator/fade cue on overflowing dialog paper**: In [`.ptah/specs/landmark-mvp/complaint-scroll-validation-errors.png`](file:///D:/projects/qa3elhamor/.ptah/specs/landmark-mvp/complaint-scroll-validation-errors.png), the submit button is bisected by the bottom border of `.lmk-overlay__paper`. There is no visual scroll shadow or gradient cue indicating that more content lies below the fold.
- **Character count for replyEmail**: Although `replyEmail` enforces a 254-character limit (and 64-character local-part limit), it is the only input without a live character counter.
- **Explicit `<bdi>` or directional isolation for localized profile fields**: `citizenStatusValue` mixes Arabic and English without `<bdi>` or `dir="auto"`, producing punctuation inversion on mobile line breaks.

---

## Failure modes

### 1. Off-screen alert banner on form validation failure
- **Trigger**: Sighted user scrolled to the bottom of the form clicks "Stamp and send" with missing required fields.
- **Symptom**: The top-level error summary banner (`<p role="alert" className="complaint-scroll__summary">`) is scrolled above the visible viewport of the paper modal and is completely invisible.
- **Evidence**: [`apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx:135-138`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L135-L138) and screenshot [`.ptah/specs/landmark-mvp/complaint-scroll-validation-errors.png`](file:///D:/projects/qa3elhamor/.ptah/specs/landmark-mvp/complaint-scroll-validation-errors.png).
- **Current handling**: Calls `target.closest('.complaint-scroll__field')?.scrollIntoView({ block: 'nearest' })` on the first invalid field, which aligns the field to the top of the container and pushes the summary banner off-screen.
- **Recommendation**: Scroll the `.complaint-scroll__sheet` or paper container to the top (`scrollTop = 0` or target the summary banner) so both the summary message and the first invalid field are visible.

### 2. Contradictory stacked alert messages on invalid retry
- **Trigger**: Network submission failure occurs (`phase.failed = true`), followed by user attempting to submit an invalid form draft.
- **Symptom**: Both `complaintFailureBody` ("The stamp slipped...") and `complaintErrorSummary` ("The Municipality cannot accept this form yet...") appear simultaneously.
- **Evidence**: [`apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx:124-140, 270-278`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L124-L140).
- **Current handling**: `phase.failed` is never cleared when validation fails in `onSubmit`.
- **Recommendation**: Reset `failed: false` in `setPhase` upon initiating a new submission attempt, or clear `failed` when values change.

### 3. Sticky avatar failure state across prop updates
- **Trigger**: Profile avatar fails to load once, followed by a prop update providing a new `avatar.src`.
- **Symptom**: The avatar image remains broken/replaced by the SVG emblem; the new image is never rendered.
- **Evidence**: [`apps/web/src/app/overlays/citizenship-card/citizenship-card.tsx:182-195`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card.tsx#L182-L195).
- **Current handling**: Local `const [failed, setFailed] = useState(false)` is never reset.
- **Recommendation**: Add a `key={avatar?.src}` on `Portrait` or reset `setFailed(false)` in an effect when `avatar?.src` changes.

### 4. BiDi neutral punctuation inversion on mobile line wrap
- **Trigger**: Viewing the Citizenship Card in English on a narrow mobile viewport (390px).
- **Symptom**: The closing parenthesis in `(بقينا في القاع)` flips to the left side of the Arabic text as `)في القاع`.
- **Evidence**: [`content/site.json:138`](file:///D:/projects/qa3elhamor/content/site.json#L138) and screenshot [`.ptah/specs/landmark-mvp/citizenship-card-mobile-390.png`](file:///D:/projects/qa3elhamor/.ptah/specs/landmark-mvp/citizenship-card-mobile-390.png).
- **Current handling**: Rendered as raw text inside `<dd>` without directional isolation.
- **Recommendation**: Wrap Arabic phrases inside LTR strings in `<bdi>` or use Unicode isolate marks (U+2067 / U+2069).

### 5. Mobile dismiss trap on long overlay content
- **Trigger**: Visitor scrolls through skills and bio on mobile devices.
- **Symptom**: Close button and header are scrolled off-screen; no dismiss button exists at the bottom.
- **Evidence**: [`apps/web/src/app/overlays/citizenship-card/citizenship-card.tsx:50-142`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card.tsx#L50-L142) and screenshot [`.ptah/specs/landmark-mvp/citizenship-card-mobile-390-scrolled.png`](file:///D:/projects/qa3elhamor/.ptah/specs/landmark-mvp/citizenship-card-mobile-390-scrolled.png).
- **Current handling**: Relies solely on the top header `×` button.
- **Recommendation**: Add a bottom "Swim back" / Close button in `CitizenshipCard`, or render sticky headers inside `LandmarkOverlayHost`.

---

## Blocking issues

*None found.* The implementation compiles cleanly, passes 100% of test suites (87 web, 259 content-data-access, 30 content-domain), does not leak complaint drafts, maintains memory safety, and correctly restores dive camera coordinates upon dismissal.

---

## Serious issues

### Finding 1: Validation error summary banner scrolled out of visible viewport
- **File**: [`apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx:130-138`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L130-L138)
- **Scenario**: When a user clicks the submit button with invalid fields, `target.closest('.complaint-scroll__field')?.scrollIntoView({ block: 'nearest' })` is invoked for the first invalid field (`subject`).
- **Impact**: In [`.ptah/specs/landmark-mvp/complaint-scroll-validation-errors.png`](file:///D:/projects/qa3elhamor/.ptah/specs/landmark-mvp/complaint-scroll-validation-errors.png), the top of the viewport aligns to the "Subject" input. The error summary `<p role="alert" className="complaint-scroll__summary">` rendered at lines 270–273 is scrolled entirely above the viewport. Sighted users are deprived of the high-level error summary.
- **Fix**: Target the error summary container for scrolling, or scroll the paper container to top:
  ```tsx
  const summary = formRef.current?.querySelector('.complaint-scroll__summary');
  if (summary) {
    summary.scrollIntoView({ block: 'nearest' });
  } else if (target) {
    target.closest('.complaint-scroll__field')?.scrollIntoView({ block: 'nearest' });
  }
  ```

### Finding 2: Unreset failure state produces contradictory stacked alerts on re-submission
- **File**: [`apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx:124-152`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L124-L152) & [`lines 270-278`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L270-L278)
- **Scenario**: A delivery fails due to a network glitch (`phase.failed: true`). The user attempts to adjust fields, introduces a validation error (e.g. clears subject), and clicks submit.
- **Impact**: `onSubmit` exits early without resetting `phase`. Both `complaintFailureBody` ("The stamp slipped and your complaint was not sent. Your text is still here; try again.") and `complaintErrorSummary` ("The Municipality cannot accept this form yet. Fix the fields marked below.") are rendered simultaneously, misleading the user into thinking a second submission was attempted and failed.
- **Fix**: Reset `failed: false` whenever submit is initiated, and clear it on user edits:
  ```tsx
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (phase.kind === 'sending') return;
    setSubmitAttempted(true);
    setPhase((current) => (current.kind === 'editing' && current.failed ? { kind: 'editing', failed: false } : current));
    ...
  ```

### Finding 3: Sticky error state in `Portrait` prevents avatar recovery on URL update
- **File**: [`apps/web/src/app/overlays/citizenship-card/citizenship-card.tsx:182-195`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card.tsx#L182-L195)
- **Scenario**: If `avatar.src` fails to load once, `failed` becomes `true`. When the component receives updated profile data with a valid `avatar.src`, the image does not re-render.
- **Impact**: The fallback SVG emblem remains displayed permanently during the session even after avatar URL corrections in CMS local preview or dynamic profile updates.
- **Fix**: Add a key or reset effect on `avatar?.src`:
  ```tsx
  useEffect(() => {
    setFailed(false);
  }, [avatar?.src]);
  ```

---

## Moderate and minor issues

### Finding 4 (Moderate): BiDi neutral punctuation inversion in mixed English/Arabic text
- **File**: [`content/site.json:138`](file:///D:/projects/qa3elhamor/content/site.json#L138) and [`apps/web/src/app/overlays/citizenship-card/citizenship-card.tsx:77-80`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card.tsx#L77-L80)
- **Problem**: In [`.ptah/specs/landmark-mvp/citizenship-card-mobile-390.png`](file:///D:/projects/qa3elhamor/.ptah/specs/landmark-mvp/citizenship-card-mobile-390.png), `citizenStatusValue` ("Hit rock bottom, settled in (بقينا في القاع)") wraps at 390px. Because `<dd>` lacks directional isolation, the closing parenthesis renders as `)في القاع`.
- **Fix**: Wrap directional text segments in `<bdi>` or separate the Arabic quip in content/markup.

### Finding 5 (Moderate): Lack of explicit directional isolation on contact links
- **File**: [`apps/web/src/app/overlays/citizenship-card/citizenship-card.tsx:146-170`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card.tsx#L146-L170)
- **Problem**: When `dir="rtl"` is set on `<article>`, `CitizenLink` does not declare `dir="ltr"` or `dir="auto"`. English URLs, usernames, and email links rely on default inline bidi resolution, which can scramble punctuation and domain components.
- **Fix**: Add `dir="auto"` or `dir="ltr"` to `.citizen-card__link`.

### Finding 6 (Moderate): Missing bottom dismiss affordance for scrolled mobile `CitizenshipCard`
- **File**: [`apps/web/src/app/overlays/citizenship-card/citizenship-card.tsx:50-142`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card.tsx#L50-L142)
- **Problem**: In [`.ptah/specs/landmark-mvp/citizenship-card-mobile-390-scrolled.png`](file:///D:/projects/qa3elhamor/.ptah/specs/landmark-mvp/citizenship-card-mobile-390-scrolled.png), scrolling through the card pushes the top close button off-screen. Users must scroll back through the entire card to find the dismiss button.
- **Fix**: Render a secondary dismiss button ("Swim back" / `t('closeLabel')`) at the bottom of the card.

### Finding 7 (Moderate): Submerged submit button without scroll affordance or container overflow indicator
- **File**: [`libs/landmarks/ui/src/lib/landmark-overlay-host.css:26-30`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-overlay-host.css#L26-L30) & [`.ptah/specs/landmark-mvp/complaint-scroll-validation-errors.png`](file:///D:/projects/qa3elhamor/.ptah/specs/landmark-mvp/complaint-scroll-validation-errors.png)
- **Problem**: In the validation error state, the submit button is bisected at the bottom border of `.lmk-overlay__paper`. There is no visual scroll shadow or gradient cue indicating that more content lies below.
- **Fix**: Add an internal scroll shadow or fade indicator to `.lmk-overlay__paper` to signal scrollable overflow.

### Finding 8 (Minor): Lack of character counter or limit hint on `replyEmail`
- **File**: [`apps/web/src/app/overlays/complaint-scroll/complaint-form-rules.ts:83-88`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-form-rules.ts#L83-L88) & [`complaint-scroll.tsx:334-351`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L334-L351)
- **Problem**: `subject`, `body`, `senderName`, and `senderSpecies` all render live character counters. `replyEmail` enforces 254 characters and a 64-character local-part limit, but provides no visual counter.
- **Fix**: Expose the counter or document the limit in the field hint.

### Finding 9 (Minor): Potential React key collisions in datalist suggestions
- **File**: [`apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx:325-327`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L325-L327)
- **Problem**: `<option key={species} value={species} />` uses raw strings as keys. Duplicate entries in CMS configuration would cause duplicate key warnings.
- **Fix**: Use `key={`${species}-${index}`}` or deduplicate with `Array.from(new Set(...))`.

### Finding 10 (Minor): Active delivery failure banner persists during field editing
- **File**: [`apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx:116-118`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L116-L118)
- **Problem**: Typing into inputs after an API failure does not clear `phase.failed`.
- **Fix**: Clear `failed: false` in `setValue`.

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
       ├─────────────────────────────────┬────────────────────────────────┐
       ▼                                 ▼                                ▼
[Pineapple: CitizenshipCard]   [Bureau: ComplaintScroll]        [Dive Camera Locked]
  • Profile data from content    • Fields validated against       • Release on unmount (OK)
  • Avatar image load              Domain VOs in real time (OK)   • Camera restores to
  • Fallback to Grouper SVG (OK) • Code point counting (OK)         exact dive depth (OK)
  • BiDi wrap inversion [GAP 4]  • PendingSubmitter injected
  • Links with noopener (OK)       (ZERO draft leakage) (OK)
  • No mobile exit btn [GAP 6]           │
                                         ▼
                               [User clicks "Stamp and Send"]
                                         │
                         ┌───────────────┴───────────────┐
                         ▼                               ▼
                 [Invalid Draft]                   [Valid Draft]
             • Focus first invalid (OK)        • Stamping... status (OK)
             • Summary off-screen [GAP 1]      • Double-press guard (OK)
             • Conflicting alerts [GAP 2]      • PendingSubmitter resolves
                                                         │
                                                         ▼
                                                [Phase: 'stamped']
                                               • Heading focused (OK)
                                               • "Swim back" restores camera (OK)
```

---

## Requirements fulfilment

| Requirement | Status | Gap |
| ----------- | ------ | --- |
| Form rules equal complaints-domain rules | COMPLETE | Zero drift. Uses `ComplaintSubject`, `ComplaintBody`, `SenderName`, `SenderSpecies`, `ReplyEmail` directly. Normalisation, code points, forbidden controls, and blank optionals match 1:1. |
| `pendingSubmitter` cannot leak draft | COMPLETE | `pendingSubmitter` ignores the draft argument and returns hardcoded `{ status: 'delivery-not-wired' }`. Submit double-press guarded; failure preserves user text. |
| Accessibility (a11y) | COMPLETE | Explicit labels, `aria-invalid`, dynamic `aria-describedby` (linking counters and errors), `role="alert"`, `role="status"`, programmatic focus movement, and full `@media (prefers-reduced-motion: reduce)` support. |
| Citizenship Card | PARTIAL | Avatar gracefully falls back to SVG emblem; link safety enforced (`noopener noreferrer` on web, mailto untouched); RTL direction supported. **Gap**: BiDi neutral punctuation wrap on 390px screen ([`content/site.json:138`](file:///D:/projects/qa3elhamor/content/site.json#L138)); missing LTR island on links. |
| Visual quality & copy tone from screenshots | PARTIAL | Authentic nautical municipal Egyptian theme; crisp SVG stamp. **Gap**: Submit button sliced off at bottom of dialog under error state; error summary banner scrolled out of view. |
| Content / CMS parity | COMPLETE | All 31 copy keys added to `libs/content/domain/src/lib/site-profile.ts`, `content/site.json`, and `apps/web/public/admin/config.yml`. Tests in `cms-config.spec.ts` pass (259/259). |

---

## Edge cases

| Case | Handled | How | Concern |
| ---- | ------- | --- | ------- |
| Empty required fields on submit | YES | Marked invalid, first invalid field focused | Summary banner scrolled off-screen ([GAP 1]) |
| Unicode emoji in text fields | YES | Domain `codePointLength` counts surrogate pairs as 1 code point | Counter accurately reflects domain count |
| Forbidden bidi/control characters | YES | Refused by `validateComplaintField` with specific error message | None |
| Blank optional fields (species, email) | YES | Evaluated as `null` in `toComplaintDraft`, matching domain `isBlank` | None |
| Network failure on submit | YES | Promise rejection caught; form values kept in state | Unreset failure state causes stacked alerts ([GAP 2]) |
| Component unmounted during submit | YES | `mounted.current` guard prevents state update | None |
| Avatar 404 / network failure | YES | `onError` replaces image with municipal grouper SVG | Stale failure state on prop change ([GAP 3]) |
| Missing optional profile fields | YES | Fallback copy for residence, optional sections skipped | None |
| Arabic locale (RTL) | YES | Logical CSS properties, `dir="rtl"` applied | Links lack `dir="auto"`; status wrap glitch ([GAP 4, 5]) |
| Rapid double-click on submit | YES | `phase.kind === 'sending'` guard ignores second press | None |

---

## Verdict

- **Recommendation**: REVISE (NEEDS_REVISION)
- **Confidence**: HIGH
- **Top risk**: Validation error summary scrolling out of the visible paper viewport, coupled with stacked contradictory alert banners when retrying after a failed delivery attempt.
- **What a robust implementation would add**:
  1. Fix scroll-to-field logic in `complaint-scroll.tsx` to ensure the `<p role="alert" className="complaint-scroll__summary">` banner remains visible in the paper modal viewport.
  2. Reset `phase.failed` to `false` when initiating a new submission attempt or editing fields.
  3. Reset `failed: false` in `Portrait` when `avatar?.src` prop changes.
  4. Wrap the Arabic status quip in `<bdi>` in `content/site.json` or `citizenship-card.tsx` to prevent neutral punctuation inversion on mobile line breaks.
  5. Add a secondary "Swim back" button at the bottom of `CitizenshipCard` for mobile viewports.
