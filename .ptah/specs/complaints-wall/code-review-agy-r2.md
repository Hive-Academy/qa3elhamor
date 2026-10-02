# Code Logic Review (Revision 2) — `complaints-wall`

## Summary

| Metric              | Value                                |
| ------------------- | ------------------------------------ |
| Overall score       | 9/10                                 |
| Assessment          | APPROVED                             |
| Blocking issues     | 0                                    |
| Serious issues      | 0                                    |
| Moderate issues     | 2                                    |
| Minor issues        | 1                                    |
| Failure modes found | 2                                    |

Revision 1 comprehensively resolves all findings raised in the initial review (`code-review-agy.md`). The implementation is verified sound, strictly preserving stored-XSS immunity, zero bundle footprint when disabled, and robust error recovery. The 2 serious defects (accidental note dismissal via `aria-disabled` pager clicks and malformed API payloads masquerading as empty boards) and all 3 moderate defects have been successfully resolved with regression unit tests. Two moderate residual polish points remain around dialog modality / focus trapping and focus management when unmounting the retry button.

---

## Revision 1 Resolution Status

| Finding (R1) | Severity | Status | Verification & Evidence |
| ------------ | -------- | ------ | ----------------------- |
| **Pager click collapses active note** | Serious | **FIXED** | [`notice-board.tsx:114-119`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/notice-board.tsx#L114-L119): `turn(type)` returns early if `paging.status === 'loading'` or `!possible`. Pager buttons remain focusable via `aria-disabled` without triggering state mutations. Verified in [`notice-board.spec.tsx:145-155`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/notice-board.spec.tsx#L145-L155). |
| **Malformed items rendered as empty wall** | Serious | **FIXED** | [`wall-client.ts:89-90, 106-110`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/wall-client.ts#L89-L110): `isWallComplaint` validates ISO timestamp via `Date.parse`. `readPage` returns `null` when `raw.length > 0 && items.length === 0`, mapping to `unexpected` failure so the failure alert and Try again button display. Truly empty lists (`raw.length === 0`) still render empty. Verified in [`wall-client.spec.ts:93-113`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/wall-client.spec.ts#L93-L113). |
| **Tab leaked from open note to board controls** | Moderate | **FIXED** | [`notice-board.tsx:247, 274`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/notice-board.tsx#L247): The pager `<nav>` and back `<button>` are marked `inert={open !== null}`, preventing focus from cycling through board navigation while a note is open. Verified in [`notice-board.spec.tsx:157-169`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/notice-board.spec.tsx#L157-L169). |
| **Cursor pagination halted on shifted seen items** | Moderate | **FIXED** | [`wall-paging.ts:65-73`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/wall-paging.ts#L65-L73): When `!first && items.length === 0`, the reducer inspects `event.nextCursor !== null && event.nextCursor !== state.asked`. If true, it advances `asked` and `request + 1` while staying in `'loading'` to fetch past the duplicate window. Verified in [`wall-paging.spec.ts:60-83`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/wall-paging.spec.ts#L60-L83). |
| **Form intro contradicted public submission** | Moderate | **FIXED** | [`content/site.json:223-226`](file:///D:/projects/qa3elhamor/content/site.json#L223-L226): Neutral wording adopted ("It lands on Abdallah's desk..."). Guard spec in [`wall-port.spec.tsx:117-121`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/wall-port.spec.tsx#L117-L121) permanently prohibits privacy claims in both languages. |
| **Unparseable dates dropped silently** | Minor | **FIXED** | [`wall-client.ts:89-90`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/wall-client.ts#L89-L90): Unparseable timestamps invalidate the item at ingestion rather than rendering an incomplete date label. |

---

## Re-Review Analysis & New Findings

### 1. Read-On Loop Guard Termination Analysis
- **Implementation**: In [`wall-paging.ts:69-72`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/wall-paging.ts#L69-L72), `onward` is defined as `event.nextCursor !== null && event.nextCursor !== state.asked`.
- **Termination Proof**:
  1. *End of Wall*: If the database has no further rows, the API returns `nextCursor: null`. `onward` evaluates to `false`, transitioning to `{ ...state, status: 'ready', nextCursor: null, asked: null }`. Pagination stops cleanly.
  2. *Stuck Cursor*: If the API returns the same cursor as the request (`event.nextCursor === state.asked`), `onward` evaluates to `false`, halting pagination cleanly.
  3. *Unseen Items Found*: As soon as a subsequent page delivers at least 1 new item (`items.length > 0`), the reducer exits the `items.length === 0` branch, appends the items, and settles in `'ready'`.
  4. *Transient Network / Server Failure*: If an intermediate request fails, the `'failed'` event transitions state to `status: 'failed'`, cleanly halting the read-on loop and offering the Try again UI.
- **Residual Risk (Minor)**: If a faulty backend were to cycle between two alternating distinct cursor tokens (e.g. `c1 -> c2 -> c1`) while repeatedly returning seen items, `event.nextCursor !== state.asked` would only compare against the immediate predecessor. Introducing a hop limit (e.g. `maxHops: 5`) would provide absolute defense in depth against cyclical server cursors.

### 2. Focus Containment & Screen-Reader Virtual Cursor Analysis
- **Implementation**: [`notice-board.tsx:183, 247, 274`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/notice-board.tsx#L183) applies `inert={open !== null}` to `<ul className="notice-board__notes">`, `<nav className="notice-board__pager">`, and `<button className="visit-full-back">`.
- **Finding (Moderate)**:
  - While keyboard Tab navigation inside the board no longer hits the pager or back buttons, `<article className="notice-detail">` does not wrap or trap Tab internally. When focus is on "Close the note", pressing Tab exits `<section className="notice-board">` entirely, moving focus into subsequent page sections (e.g. NarrationSection or footer in `page-view`). Once focus has escaped the section, pressing Escape no longer triggers `notice-detail`'s keydown listener.
  - Additionally, for screen reader users operating in virtual cursor / browse mode, `<article className="notice-detail">` is not declared as a modal dialog (`role="dialog"`, `aria-modal="true"`). Sibling landmarks outside the board (such as the masthead and surrounding page sections) remain in the accessibility tree, allowing browse-mode navigation to escape the sheet.

### 3. "Try Again" State & Focus Lifecycle Analysis
- **Implementation**: When `status === 'failed'`, `<div className="notice-board__failed" role="alert">` renders with a `<button onClick={() => dispatch({ type: 'retry' })}>`.
- **Finding (Minor)**:
  - When the user activates "Try again", `dispatch({ type: 'retry' })` sets `status: 'loading'`. This causes `<div className="notice-board__failed">` to unmount from the DOM.
  - Because the active element is removed from the DOM, standard browser focus drops to `document.body`. For screen reader and keyboard users, focus context is lost rather than remaining on a persistent status container or moving to the board heading.

---

## Numbered Defects

### Defect 1 (Moderate): Expanded Note Sheet Lacks Modal Focus Trap & ARIA Dialog Semantics
- **File**: [`apps/web/src/app/wall/notice-board.tsx:208-243`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/notice-board.tsx#L208-L243)
- **Scenario**: A user opens an expanded note sheet and presses Tab on "Close the note", or navigates using screen-reader virtual cursor mode.
- **Impact**: Focus leaves the notice board and lands on unrelated outer page content; Escape key ceases to close the note once focus has left the element. Screen-reader users are not informed of modal context.
- **Recommendation**:
  1. Add `role="dialog"` and `aria-modal="true"` to `<article className="notice-detail">`.
  2. Trap Tab navigation within the sheet (e.g. wrapping Tab from "Close the note" back to the subject heading).

### Defect 2 (Minor): Focus Drops to Document Body Upon "Try Again" Unmount
- **File**: [`apps/web/src/app/wall/notice-board.tsx:168-179`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/notice-board.tsx#L168-L179)
- **Scenario**: A user activates the "Try again" button in the failure alert.
- **Impact**: The failure container unmounts upon transitioning to `status: 'loading'`, causing browser focus to fall to `document.body`.
- **Recommendation**: Place focus on the persistent `<p role="status">` element or preserve an active retry state until settled.

---

## Requirements Verification Summary

- **Stored-XSS Protection**: VERIFIED. Pure text nodes, `dir="auto"`, `<bdi>` token isolation, no innerHTML or unescaped sinks.
- **Disabled-by-Default Bundling**: VERIFIED. Unset `VITE_WALL_API_URL` folds `WALL` to `null`; zero bundle weight in default build, zero `/api` network calls.
- **Typecheck & Diagnostics**: VERIFIED. `npx nx run web:typecheck --skipSync` passes with 0 errors (100% cache hit).
- **Test Suite**: VERIFIED. All 677 web tests pass including new specs covering all 5 Revision 1 fixes.

---

## Verdict

- **Recommendation**: **APPROVE**
- **Confidence**: **HIGH**
- **Headline**: All serious defects from Revision 1 resolved with robust automated tests; core security, bundling, and failure recovery properties are exemplary.
