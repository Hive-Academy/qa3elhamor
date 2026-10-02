# Code Logic Review — `landmark-bureau-narrated`

## Summary

| Metric              | Value          |
| ------------------- | -------------- |
| Overall score       | 7/10           |
| Assessment          | NEEDS_REVISION |
| Blocking issues     | 0              |
| Serious issues      | 3              |
| Moderate issues     | 1              |
| Failure modes found | 4              |

## Five logic questions

### 1. How does this fail silently?

- **Unmounted submit error swallowed after roll-back:** In [complaint-scroll.tsx](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L196-L206), if the visitor puts the scroll away into the tube while a submission is in flight (`filing.stage = 'tube'`), `ComplaintScroll` unmounts. If the asynchronous call to `submitter.submit(draft)` subsequently rejects, `mounted.current` is `false`, and the `.catch` handler only logs `console.error('Complaint delivery failed.', error)`. Because `ComplaintScrollOptions` provides no `onError` callback to notify the parent host (`bureau-scene.tsx`), the error is swallowed completely. The visitor is never informed that their complaint failed to send, and re-opening the scroll displays the preserved draft without any failure alert.
- **Unmounted reducer dispatch on visit exit:** In [bureau-scene.tsx](file:///D:/projects/qa3elhamor/apps/web/src/app/bureau/bureau-scene.tsx#L166-L169), `onStamped` calls `file({ type: 'stamped', delivery })`. If the user has completely exited the landmark ("Back to the dive") while submission was in-flight and `BureauVisit` unmounted, `onStamped` attempts to dispatch to an unmounted reducer without an `isMounted` guard.

### 2. What user action produces unexpected behaviour?

- **Cancelling IME composition or dismissing datalist rolls up the scroll:** In [bureau-scene.tsx](file:///D:/projects/qa3elhamor/apps/web/src/app/bureau/bureau-scene.tsx#L201-L211), the capture-phase keydown listener on `window` intercepts `Escape` without checking `event.isComposing`. When a user composing text via an Input Method Editor (IME, e.g. Japanese, Arabic layout, Chinese) presses Escape to cancel candidate selection, or when a user presses Escape to dismiss the `<datalist>` suggestions on `senderSpecies` ([complaint-scroll.tsx#L431-L439](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L431-L439)), the listener immediately invokes `file({ type: 'roll-back' })` and rolls the scroll back into the pneumatic tube, interrupting user input.
- **Tapping an input on iOS Safari closes the landmark stage:** In [landmark-stage.tsx](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-stage.tsx#L174-L183), `LandmarkStage` listens to window scroll and closes the stage if `Math.abs(window.scrollY - start) >= leaveOnScroll` (64px). On iOS Safari, focusing an `<input>` or `<textarea>` in the mobile sheet triggers an automatic viewport scroll (often 60–120px) to position the input above the on-screen keyboard. Because `onScroll` does not verify if an input element inside the stage is currently focused, it interprets the keyboard scroll as the user scrolling away and calls `onCloseRef.current('scroll')`, unexpectedly closing the entire landmark.

### 3. What input data produces a wrong answer?

- **Rapid duplicate submissions under race conditions:** In [complaint-scroll.tsx](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L184-L196), `onSubmit` guards against double submission using React state: `if (phase.kind === 'sending') return;` followed by `setPhase({ kind: 'sending' })`. Because React state updates are asynchronous, two rapid consecutive submission triggers (e.g. quick double-clicking on the submit button or rapid Enter key repeats) can enter `onSubmit` before the component re-renders into the `'sending'` phase, dispatching duplicate network requests to `submitter.submit(draft)`.

### 4. What happens when a dependency fails?

- **Submitter network failure while form is open:** Correctly handled. [complaint-scroll.tsx](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L201-L206) catches the error, sets `phase: { kind: 'editing', failed: true }`, renders `<p role="alert" className="complaint-scroll__summary">{t('complaintFailureBody')}</p>`, and keeps all entered text intact.
- **No submitter configured (`pendingSubmitter`):** Correctly handled. Returns `{ status: 'delivery-not-wired' }`. The form displays `complaintPendingBody`, hands the stamp over, and the President honestly narrates that the post office is not yet open.
- **Submitter failure after scroll is rolled up:** Fails silently as noted in Question 1.

### 5. What is missing that the requirements never mentioned?

- **Missing `onError` hook on `ComplaintScrollOptions`:** To allow the host to handle and persist submission errors when the scroll is put away while in-flight.
- **Missing synchronous submission lock ref (`submittingRef`):** To prevent duplicate in-flight requests during rapid clicks before React re-renders.
- **Missing `leaveOnScroll` suppression hook / activeElement check in `LandmarkStage`:** To prevent iOS virtual keyboard appearance from terminating the session.
- **Missing `isMounted` guard on `onStamped` in `bureau-scene.tsx`:** To prevent state update warnings when the visitor leaves the landmark mid-submission.

---

## Failure modes

### 1. iOS Virtual Keyboard Scroll Closes Landmark

- Trigger: Visitor taps into any input field (`subject`, `body`, etc.) on iOS Safari in the phone sheet.
- Symptom: As the virtual keyboard opens, the window scrolls >64px to clear space, and the Complaints Bureau immediately closes.
- Evidence: [landmark-stage.tsx:174-183](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-stage.tsx#L174-L183)
- Current handling: `onScroll` blindly compares `Math.abs(window.scrollY - start) >= leaveOnScroll` and invokes `onCloseRef.current('scroll')`.
- Recommendation: Check if `document.activeElement` is an input/textarea or within `slotRef.current`, and suspend or reset `start = window.scrollY`.

### 2. IME Composition / Dropdown Escape Rolls Up Scroll

- Trigger: User presses Escape while an IME candidate window is open or while dismissing the `senderSpecies` datalist suggestion menu.
- Symptom: The form rolls back up into the tube instead of cancelling the composition or closing the popup menu.
- Evidence: [bureau-scene.tsx:201-211](file:///D:/projects/qa3elhamor/apps/web/src/app/bureau/bureau-scene.tsx#L201-L211)
- Current handling: Captures all `Escape` key events unconditionally on `window` and calls `file({ type: 'roll-back' })`.
- Recommendation: Check `if (event.isComposing) return;` and ensure input dropdowns are not prematurely closing the scroll.

### 3. Silent Loss of In-Flight Submission Error on Roll-Back

- Trigger: Visitor presses "Roll it back up" while a complaint submission is pending, and the submission subsequently fails.
- Symptom: `ComplaintScroll` unmounts, the error is swallowed with only `console.error`, and the visitor is never informed that their complaint failed. Re-opening the scroll shows the draft with no error banner.
- Evidence: [complaint-scroll.tsx:196-206](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L196-L206)
- Current handling: `if (mounted.current) setPhase({ kind: 'editing', failed: true })` discards the failure because `mounted.current` is `false`.
- Recommendation: Provide `onError?: (error: unknown) => void` in `ComplaintScrollOptions` and store an error indicator in `bureau-scene.tsx`.

### 4. Double Submission via Rapid Keystroke / Click Race

- Trigger: Visitor rapidly double-clicks the stamp button or presses Enter twice in quick succession.
- Symptom: Two identical complaints are submitted concurrently to the backend / provider.
- Evidence: [complaint-scroll.tsx:184-196](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L184-L196)
- Current handling: Only checks `if (phase.kind === 'sending') return;`, which relies on asynchronous React state update.
- Recommendation: Guard with a synchronous ref: `if (submittingRef.current) return; submittingRef.current = true;`.

---

## Blocking issues

*None.*

---

## Serious issues

### Issue 1: iOS Keyboard Scroll Triggers `leaveOnScroll` and Dismisses Landmark
- File: [libs/landmarks/ui/src/lib/landmark-stage.tsx:174-183](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-stage.tsx#L174-L183)
- Scenario: On mobile Safari, opening the keyboard scrolls the page document. Because the threshold is 64px (`DEFAULT_LEAVE_SCROLL_PX`), the stage detects this as scrolling away.
- Impact: Users on iOS are prevented from completing or typing in the Complaints form.
- Fix: In `LandmarkStage`, suppress `leaveOnScroll` when an input/textarea inside the stage is focused:
  ```ts
  const onScroll = () => {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || slotRef.current?.contains(active))) {
      start = window.scrollY;
      return;
    }
    if (Math.abs(window.scrollY - start) >= leaveOnScroll)
      onCloseRef.current('scroll');
  };
  ```

### Issue 2: Global Capture Escape Intercepts IME Composition and Datalist
- File: [apps/web/src/app/bureau/bureau-scene.tsx:201-211](file:///D:/projects/qa3elhamor/apps/web/src/app/bureau/bureau-scene.tsx#L201-L211)
- Scenario: Capture-phase key listener intercepts Escape indiscriminately.
- Impact: International users using IME input or users closing suggestions have their form unceremoniously rolled away.
- Fix: Check `event.isComposing`:
  ```ts
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    file({ type: 'roll-back' });
  };
  ```

### Issue 3: In-Flight Submission Error Swallowed After Roll-Back
- File: [apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx:196-206](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L196-L206)
- Scenario: The visitor rolls the scroll back while sending; the submission then fails on network error.
- Impact: `onStamped` handles the late success path, but there is no `onError` path. The failure is completely lost, misleading the user into thinking their draft is either safe or submitted.
- Fix: Add `onError?: (error: unknown) => void` to `ComplaintScrollOptions` and call `hostCallbacks.current.onError?.(error)`. In `bureau-scene.tsx`, track `submissionFailed` and show the failure banner upon re-opening.

---

## Moderate and minor issues

- **Double-submit race condition ([complaint-scroll.tsx:184](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L184)):** State-based `phase.kind === 'sending'` check can be bypassed by synchronous rapid clicks before React re-renders. Use a synchronous `submittingRef`.
- **Inline state dispatch in render ([bureau-scene.tsx:156-160](file:///D:/projects/qa3elhamor/apps/web/src/app/bureau/bureau-scene.tsx#L156-L160)):** Calling `file({ type: 'reset' })` synchronously during render violates React purity. Move to an effect listening to `open`.
- **`useVisibleHeight` scroll listener ([bureau-sheet.tsx:13-26](file:///D:/projects/qa3elhamor/apps/web/src/app/bureau/bureau-sheet.tsx#L13-L26)):** `visualViewport` on iOS triggers `scroll` as well as `resize` during keyboard appearance. Attach listener to both events.
- **Unmounted reducer dispatch ([bureau-scene.tsx:166-169](file:///D:/projects/qa3elhamor/apps/web/src/app/bureau/bureau-scene.tsx#L166-L169)):** `onStamped` callback dispatches `file({ type: 'stamped', delivery })` without verifying if `BureauVisit` is still mounted.

---

## Data flow

1. **Visit Arrival (`open === true`):** `BureauVisit` mounts, narrator script loads, `ClerkWindow` lights up. [OK]
2. **Narration Completion:** President reaches final line; `BureauHud` shows "File a complaint" and "Back to the dive". [OK]
3. **Unroll Scroll (`onOpenScroll`):** `dispatch({ type: 'resume' })`, `file({ type: 'unroll' })`. `InWorldCard` settles or `BureauSheet` expands; first field is focused with `preventScroll: true`. [OK]
4. **Keystroke Entry:** User types in fields. Dialogue bubble is unmounted and does not intercept Space/Enter. [OK, except IME Escape]
5. **Form Validation:** Refusal increments `refusals` count and shifts focus to `summaryRef`. Links jump to invalid fields. [OK]
6. **Form Submission:** Submitter called with validated value objects. Button marked `aria-busy` and `aria-disabled`. [Race on rapid click]
7. **Stamp Landing (`onStamped`):** Stamp slams down, paper thumps, status text displays, rods hold for 2400ms. [OK]
8. **Roll Up & Bottle Launch:** Paper rolls into corked bottle, bottle rises with bubble trail and sway, President speaks filed line. [OK]
9. **Disposal on Exit:** All Three.js geometries, materials, canvas textures, and animation frame timers are cleaned up. [OK]

---

## Requirements fulfilment

| Requirement | Status | Gap |
| ----------- | ------ | --- |
| Keystroke isolation (Space/Enter) | COMPLETE | Speech bubble is unmounted during scroll; checks target equality. |
| Esc inside field & IME handling | PARTIAL | Global capture listener catches Esc during IME composition and dropdowns. |
| iOS keyboard scroll vs leave-on-scroll | PARTIAL | Identified in author notes; requires suppression in `LandmarkStage`. |
| Double-submit guard | PARTIAL | React state check allows rapid double-click race; needs ref lock. |
| Mid-submit unmount & late delivery | PARTIAL | Success is handled late; late failure is silently swallowed without error callback. |
| Draft preservation across roll-up | COMPLETE | Preserved in `draft.current` and passed as `initialValues`. |
| Drei Html transform accessibility | COMPLETE | Portaled outside canvas to `sceneLayer`, correct `inert` and `aria-hidden` attributes. |
| Phone sheet visualViewport | COMPLETE | Sizes dynamically to `--bureau-sheet-h` from `visualViewport.height`. |
| Animation cleanup & 3D disposal | COMPLETE | Tube, window light, bottle materials and geometries cleanly disposed. |
| Dialog fallback untouched | COMPLETE | `ComplaintScroll` dialog variant spec untouched; passes all test cases. |
| Typecheck validation | COMPLETE | Clean typecheck: `npx nx run web:typecheck --skipSync` exited with code 0. |

---

## Edge cases

| Case | Handled | How | Concern |
| ---- | ------- | --- | ------- |
| Empty / invalid form submission | YES | Domain value object validation flags errors, shifts focus to summary. | None. |
| Visitor presses Esc while typing | YES | Intercepted in capture phase to roll up scroll instead of closing landmark. | Catches IME composition & datalist popups. |
| Visitor leaves while submission pending | YES | Unmount ref prevents `setPhase` on unmounted component. | If submission fails, error is completely swallowed. |
| No email provider configured | YES | Falls back to `pendingSubmitter`; President honestly states not wired. | None. |
| Reduced motion enabled | YES | Timers drop to 0ms; CSS animations disabled; 3D bottle sway/drift disabled. | None. |
| Orientation change on mobile | YES | Visual viewport dynamically updates sheet height. | Should also listen to visualViewport scroll. |

---

## Verdict

- Recommendation: REVISE
- Confidence: HIGH
- Top risk: iOS Safari users tapping into the complaint fields will trigger the 64px window scroll and immediately close the landmark before typing.
- What a robust implementation would add:
  1. Suspend `leaveOnScroll` in `LandmarkStage` when an input element is focused.
  2. Guard the Escape listener in `bureau-scene.tsx` with `!event.isComposing`.
  3. Add an `onError` callback in `ComplaintScrollOptions` so background failure isn't lost.
  4. Add a synchronous `submittingRef` to prevent rapid double-clicks on the stamp button.
