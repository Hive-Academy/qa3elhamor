# Code Logic Review — `complaints-wall`

## Summary

| Metric              | Value                                |
| ------------------- | ------------------------------------ |
| Overall score       | 7/10                                 |
| Assessment          | NEEDS_REVISION                       |
| Blocking issues     | 0                                    |
| Serious issues      | 2                                    |
| Moderate issues     | 3                                    |
| Failure modes found | 5                                    |

The `complaints-wall` implementation delivers a solid, well-architected feature honoring its core security constraints (text-only DOM sinks, bidirectional isolation, strict dynamic bundling with zero default-bundle footprint, clean CSP integration, and resilient timeout/abort lifecycles). However, two serious logic issues in interaction and API error handling require revision before production: (1) `aria-disabled` pager controls allow click execution that unexpectedly dismisses open note sheets, and (2) API responses with malformed complaint items are silently discarded to empty arrays, causing broken API data to masquerade as a pristine empty wall ("Nothing is pinned yet").

---

## Five Logic Questions

### 1. How does this fail silently?

- **Broken API schema masked as empty wall** ([`wall-client.ts:100-108`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/wall-client.ts#L100-L108), [`wall-paging.ts:61-65`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/wall-paging.ts#L61-L65), [`notice-board.tsx:135`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/notice-board.tsx#L135)):
  When `GET /complaints` succeeds with HTTP 200 but returns items where every item fails `isWallComplaint` (e.g. backend schema migration drifts, `submittedAt` renamed to `created_at`, or `senderSpecies` serialized as a complex object), `readPage` filters `body['items']` to an empty array `[]` and returns `{ ok: true, value: { items: [], nextCursor: ... } }`. On the initial page load, `wallPagingReducer` records `pages: [[]]`, and `NoticeBoard` determines `empty = true`, rendering `words.empty` ("Nothing is pinned yet. Be the first: file a complaint..."). The failure is completely silent to both visitors and site operators: broken API data produces a false "healthy but empty" state rather than an error alert.
- **Unparseable timestamps silently omitted** ([`note-text.ts:24-30`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/note-text.ts#L24-L30), [`notice-board.tsx:285-302`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/notice-board.tsx#L285-L302)):
  If a complaint's `submittedAt` string fails `Date.parse`, `noteDate` returns `null`. `SenderLine` conditionally renders `{date && (<> · <time dateTime={note.submittedAt}>{date}</time></>)}`. The note renders without any date stamp, giving no diagnostic signal that the timestamp was malformed.

### 2. What user action produces unexpected behaviour?

- **Clicking an `aria-disabled` pager button dismisses open note** ([`notice-board.tsx:112-115, 246, 257`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/notice-board.tsx#L112-L115)):
  The "Newer" and "Older" navigation controls use `aria-disabled={!hasNewer(paging) || loading || undefined}` rather than the native HTML `disabled` attribute. Unlike native `disabled`, `aria-disabled` does not block browser pointer or keyboard click events. When a visitor is actively reading an open note sheet on page 1 and clicks the visually disabled "Newer" button (or repeatedly clicks "Older" while loading), `turn('newer')` executes, which unconditionally runs `setSelected(null)`. This unexpectedly collapses the note the user was reading.
- **Tabbing out of expanded note detail into background pager** ([`notice-board.tsx:181-182, 207-239`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/notice-board.tsx#L181-L182)):
  When a note is clicked to open the detail view (`<article className="notice-detail">`), `<ul className="notice-board__notes">` is marked `inert`, but `<nav className="notice-board__pager">` and the "Back to the President" button remain fully focusable and active. Keyboard users tabbing past "Close the note" cycle out of the detail overlay into background navigation controls while the overlay remains visually active.
- **Contradictory intro copy when toggling Bureau complaint destination** ([`complaint-scroll.tsx:396, 443-479`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L396)):
  The Bureau form's header static text declares `complaintIntro` ("It goes privately to Abdallah's desk"). When the visitor checks "Pin it on the public wall", the form displays the public radio description, but the prominent intro directly above continues to claim that the submission goes privately to Abdallah's desk.

### 3. What input data produces a wrong answer?

- **Concurrent wall insertions prematurely terminate pagination** ([`wall-paging.ts:58-65`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/wall-paging.ts#L58-L65)):
  If 6 new complaints are approved while a visitor is reading page 1, requesting page 2 returns 6 items that shifted down into the cursor query and were already rendered on page 1. The deduplication set `seen` removes all 6 items (`items.length === 0`). The branch `if (!first && items.length === 0)` unconditionally returns `{ ...state, status: 'ready', failure: null, nextCursor: null }`, wiping out `nextCursor` even if the server sent a valid cursor for subsequent pages. This falsely marks the wall as having reached its end, making all older complaints unreachable.

### 4. What happens when a dependency fails?

- **API Offline / Network Failure** ([`wall-client.ts:223-225`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/wall-client.ts#L223-L225)):
  `fetchImpl` rejects; `exchange` catches and returns `{ ok: false, failure: { kind: 'network', status: null, code: null } }`. `NoticeBoard` displays `{words.failed}` with a `{words.retry}` button that increments `request` and triggers a re-fetch.
- **API Request Timeout (12s)** ([`wall-client.ts:197-204`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/wall-client.ts#L197-L204)):
  `setTimeout` aborts the internal `AbortController`. `exchange` returns `{ ok: false, failure: { kind: 'timeout' } }`. UI offers retry.
- **Stalled Response Body** ([`wall-client.ts:228`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/wall-client.ts#L228)):
  `untilAborted(response.json(), controller.signal)` ensures that a server that emits 200 OK headers but hangs mid-stream is aborted by the 12s timer.
- **HTTP 429 Rate Limiting** ([`wall-client.ts:142-149`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/wall-client.ts#L142-L149), [`wall-submitter.ts:24-26`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/wall-submitter.ts#L24-L26)):
  Client parses `Retry-After` seconds and returns `ComplaintSendError('rate-limited')`. Form renders `wallWords.rateLimited` ("Too many complaints from this reef for now. Try again later.").
- **Dynamic Chunk Load Glitch** ([`wall-port.ts:40-41`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/wall-port.ts#L40-L41)):
  If downloading `wall-client` or `wall-submitter` fails (transient offline), `loaded.catch(() => (loaded = null))` clears the cached rejected promise, enabling subsequent user attempts to retry loading the chunk.

### 5. What is missing that the requirements never mentioned?

- **Focus trap on expanded note detail**: No focus trap prevents keyboard focus from escaping into the underlying board pager.
- **Click guarding for `aria-disabled` buttons**: Standard accessible button practice requires either the native `disabled` attribute or explicit event prevention in the click handler.
- **Pagination shift recovery**: When a pagination fetch returns only already-seen records due to newly inserted records at the top, the client should query the next cursor rather than assuming end-of-feed.
- **Adaptive form intro copy**: Content or copy variant (`complaintIntroPublic`) explaining the moderation path when the public radio option is selected.

---

## Failure Modes

### 1. `aria-disabled` Pager Button Click Collapses Active Detail Note

- Trigger: User clicks or activates the visually disabled "Newer" button on page 1 while viewing an expanded note.
- Symptom: The expanded note sheet immediately vanishes, losing reading progress.
- Evidence: [`apps/web/src/app/wall/notice-board.tsx:112-115, 246`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/notice-board.tsx#L112-L115)
- Current handling: `onClick={() => turn('newer')}` executes unconditionally and runs `setSelected(null)`.
- Recommendation: Guard `turn()` or use native `disabled` attribute.

### 2. Malformed Complaint Items Render as Empty Wall

- Trigger: Backend returns 200 OK with schema-invalid items on page 1.
- Symptom: User is shown "Nothing is pinned yet. Be the first..." instead of an error alert.
- Evidence: [`apps/web/src/app/wall/wall-client.ts:100-108`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/wall-client.ts#L100-L108), [`apps/web/src/app/wall/notice-board.tsx:135`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/notice-board.tsx#L135)
- Current handling: `isWallComplaint` filters all bad items; `readPage` returns `{ items: [] }`; `NoticeBoard` treats `pages.length === 1 && notes.length === 0` as empty.
- Recommendation: If `body.items.length > 0` but `filtered.length === 0`, return `{ ok: false, failure: { kind: 'unexpected' } }`.

### 3. Shifted Cursor Deduplication Terminates Older Paging

- Trigger: New complaints are approved while a user is reading, causing the older cursor query to return records already seen on page 1.
- Symptom: Older pagination stops permanently; older complaints become inaccessible.
- Evidence: [`apps/web/src/app/wall/wall-paging.ts:62-65`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/wall-paging.ts#L62-L65)
- Current handling: `if (!first && items.length === 0) return { ...state, status: 'ready', failure: null, nextCursor: null };`
- Recommendation: If `items.length === 0` but `event.nextCursor !== null`, auto-fetch `event.nextCursor` rather than clearing `nextCursor`.

### 4. Detail Note Sheet Leaks Keyboard Focus to Background Controls

- Trigger: User presses Tab or Shift+Tab while reading an expanded note sheet.
- Symptom: Focus escapes to background pager controls or "Back to the President" button.
- Evidence: [`apps/web/src/app/wall/notice-board.tsx:181, 207-239, 242-262`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/notice-board.tsx#L181)
- Current handling: `<article className="notice-detail">` has no keyboard focus wrap/trap; only the notes list `<ul>` is marked `inert`.
- Recommendation: Make the detail sheet a modal dialog (`role="dialog"`, `aria-modal="true"`) or mark the entire frame outside the detail sheet inert when `open !== null`.

### 5. Contradictory Bureau Form Intro Copy

- Trigger: User toggles from "Send privately" to "Pin it on the public wall".
- Symptom: Form header continues to read: "It goes privately to Abdallah's desk."
- Evidence: [`apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx:396`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L396)
- Current handling: Static `t('complaintIntro')` is rendered unconditionally.
- Recommendation: Swap intro text or omit the sentence when `pinning` is active.

---

## Blocking Issues

None. No vulnerabilities (stored XSS, unauthorized data transmission, CSRF, or prototype pollution) were identified.

---

## Serious Issues

### 1. `aria-disabled` Pager Buttons Dismiss Note and Trigger Spurious State Updates

- File: [`apps/web/src/app/wall/notice-board.tsx:112-115, 246, 257`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/notice-board.tsx#L112-L115)
- Scenario: A user reading an open note sheet clicks on the visually disabled "Newer" button (or repeatedly clicks "Older" while loading).
- Impact: `aria-disabled` does not block mouse clicks. `turn(type)` executes and unconditionally runs `setSelected(null)`, closing the note the user was reading.
- Fix:
  ```ts
  const turn = (type: 'newer' | 'older') => {
    if (loading || (type === 'older' ? !hasOlder(paging) : !hasNewer(paging))) return;
    setSelected(null);
    dispatch({ type });
  };
  ```
  Alternatively, apply the HTML `disabled={!hasNewer(paging) || loading}` attribute to the `<button>`.

### 2. Malformed Server Responses Disguised as Empty Wall

- File: [`apps/web/src/app/wall/wall-client.ts:100-108`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/wall-client.ts#L100-L108)
- Scenario: The wall API returns 200 OK with items that fail `isWallComplaint` due to schema drift or backend bug.
- Impact: All items are filtered out; `readPage` returns `{ items: [], nextCursor }`. The board announces "Nothing is pinned yet" instead of alerting the user that the wall data could not be parsed.
- Fix:
  In `readPage`:
  ```ts
  const rawItems = body['items'];
  const validItems = rawItems.filter(isWallComplaint).map(toWallComplaint);
  if (rawItems.length > 0 && validItems.length === 0) return null; // Triggers unexpected failure alert
  ```

---

## Moderate and Minor Issues

- **Detail Sheet Focus Trapping & ARIA Dialog Semantics** ([`apps/web/src/app/wall/notice-board.tsx:208-239`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/notice-board.tsx#L208-L239)): The expanded note sheet is an `<article>` rather than a modal dialog. Pressing Tab cycles through background pager controls.
- **Premature Pagination Cutoff on Concurrent Writes** ([`apps/web/src/app/wall/wall-paging.ts:62-65`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/wall-paging.ts#L62-L65)): Deduplication of shifted records sets `nextCursor: null`, permanently cutting off older records.
- **Mismatched Form Intro Copy** ([`apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx:396`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/complaint-scroll/complaint-scroll.tsx#L396)): Intro still mentions private delivery when public wall option is checked.
- **Date String Validation in DOM** ([`apps/web/src/app/wall/note-text.ts:24-30`](file:///D:/projects/qa3elhamor/apps/web/src/app/wall/note-text.ts#L24-L30)): Unparseable ISO strings return `null` and omit the `<time>` tag silently without logging or fallback.

---

## Data Flow

1. **Build / Bundle Phase** [`OK`]:
   - `wall-env.ts:48-49`: `RAW_WALL_API_URL === undefined ? null : readWallApiUrl(...)` folds to `null` in default builds.
   - `wall-port.ts:53-54`: `WALL` folds to `null`. Dynamic imports for `wall-client`, `wall-submitter`, and `notice-board` are never invoked; wall copy and code drop out of entry chunks.
   - `tools/deploy/csp.ts:43-58, 86-88`: `wallApiOrigin(env)` includes external wall origin in `connect-src` only when set.
2. **Mount Phase (`presentation: 'in-world' | 'sheet' | 'page'`)** [`OK`]:
   - `NoticeBoard` creates `WallClient` and initial `wallPagingReducer` state.
   - `useEffect` creates an `AbortController` and issues `client.list({ cursor: null })`.
3. **Data Ingestion & Deserialization** [`GAP - Silent Failure`]:
   - `wall-client.ts:210-242`: Fetches with `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`. Stalled bodies bounded by 12s timeout controller.
   - `wall-client.ts:100-108`: Sanitizes items field-by-field. **Gap**: Drops all corrupt items without error, causing broken responses to mimic empty lists.
4. **Rendering Pinned Notes** [`OK - Secure`]:
   - `PinnedNote`: Every user field (`subject`, `excerpt.text`, `senderName`, `senderSpecies`) is rendered purely as React text children with `dir="auto"`.
   - `SenderLine`: User tokens are isolated in `<bdi dir="auto">`. No innerHTML, markdown, or dangerous attributes exist.
5. **Interactive Navigation & Paging** [`GAP - Pager Button Click`]:
   - Arrow keys navigate roving tabindex via `objectKeyStep` (mirrored in RTL).
   - Enter/Tap opens detail sheet; Escape or "Close the note" restores focus to the active note.
   - **Gap**: Pager buttons use `aria-disabled` without click prevention, closing open notes when clicked.
6. **Public Submission Flow** [`OK`]:
   - Selecting "Pin it on the public wall" hides `replyEmail` and strips it from the draft.
   - Form applies domain value objects (`ComplaintSubject`, `ComplaintBody`, `SenderName`, `SenderSpecies`).
   - `wall-client.ts:260-279` submits exact 4 keys (`subject`, `body`, `senderName`, `senderSpecies`).
   - Returns status `'awaiting-moderation'`; President speaks `filed-public`.

---

## Requirements Fulfilment

| Requirement | Status | Gap |
| ----------- | ------ | --- |
| Stored-XSS Protection | COMPLETE | None. All paths from API to DOM use text children, `dir="auto"`, and `<bdi>` isolation. |
| Disabled-by-default | COMPLETE | When `VITE_WALL_API_URL` is unset, `WALL` folds to `null`. Zero `/api` fetches, zero runtime leaks. |
| Client Resilience & Error Mapping | COMPLETE | Timeouts (12s), abort on unmount, 429 Retry-After, 503 unavailable, 400 invalid-cursor mapped cleanly. |
| Public Submission & Validation | COMPLETE | Same domain rules; reply address omitted; moderation state announced. |
| A11y & RTL Support | PARTIAL | Roving tabindex and RTL arrows work well; gap: detail sheet lacks modal focus trap, pager buttons use unhandled `aria-disabled`. |
| CSP Alignment | COMPLETE | `tools/deploy/csp.ts` adds wall origin to `connect-src` only when configured. |
| TypeScript Diagnostics | COMPLETE | `npx nx run web:typecheck --skipSync` passes with 0 errors. |

Implicit requirements not addressed:
- Graceful recovery when concurrent wall submissions shift pagination cursor windows.

---

## Edge Cases

| Case | Handled | How | Concern |
| ---- | ------- | --- | ------- |
| Stored XSS via HTML/Script payload | YES | Rendered literally as React text children; verified by unit tests | None |
| RTL text inside LTR UI (and vice versa) | YES | `dir="auto"` on text blocks, `<bdi>` isolation around user tokens in templates | None |
| Network offline mid-exchange | YES | AbortController + catch maps to `'network'`; UI displays alert with retry | None |
| Backend hangs after sending headers | YES | `untilAborted` races `response.json()` against 12s timeout controller | None |
| Stale/Invalid cursor | YES | 400 `invalid-cursor` resets reducer to initial page 1 reload | None |
| Unset `VITE_WALL_API_URL` | YES | Bundler folds `WALL` to `null`; no modules loaded or fetched | None |
| Rapid double-submit on Bureau form | YES | `sendingNow.current` ref synchronously halts concurrent dispatches | None |
| Shifted cursor with identical seen items | NO | Reducer sets `nextCursor: null`, terminating pagination prematurely | Older complaints become unreachable |
| Click on disabled pager button | NO | `aria-disabled` allows click; resets `selected` note | Closes note visitor was reading |

---

## Verdict

- Recommendation: REVISE
- Confidence: HIGH
- Top risk: Pager buttons using `aria-disabled` without click guards degrade reading UX by abruptly dismissing active note sheets, while corrupted API list payloads silently present as an empty board rather than surfacing an error.
- What a robust implementation would add:
  1. Add click guards or native `disabled` attributes to `notice-board.tsx` pagination buttons.
  2. Differentiate between an authentically empty list (`rawItems.length === 0`) and a corrupted list (`rawItems.length > 0 && validItems.length === 0`) in `wall-client.ts`.
  3. Add modal dialog semantics (`role="dialog"`, `aria-modal="true"`) and focus trapping to the expanded note detail sheet.
  4. Auto-advance to the next cursor when shifted cursor deduplication results in zero novel items.
