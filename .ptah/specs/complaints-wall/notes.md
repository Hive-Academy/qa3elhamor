# complaints-wall: notes

The approved public complaints show as a Municipal Notice Wall, and visitors can pin their own
complaint to it after moderation. It is off by default. With `VITE_WALL_API_URL` unset, nothing
of it renders and nothing calls the API. The bundler also drops its code and words from the
entry chunk.

## Design decision: an extension of the Bureau visit, not a fifth stop

The President's last line now offers three actions when the wall is on: **File a complaint**,
**Read the public wall**, and **Back to the dive**. The same actions come back after a filing.
"Read the public wall" brings out the board:

- **Desktop:** the board floats out of the Bureau's clerk window, the same way the complaint
  scroll does (`InWorldCard`, real DOM posed in the world). It settles in front of the visitor.
- **Phone:** it is a sheet over the scene (`BureauWallSheet`), sized like the scroll's sheet.

The visit has no dive stop of its own, so the scroll and dive pacing stay as they are.

**Deviation from the brief: the camera does not turn to the board.** The dive owns the camera,
and the kernel only moves it between waypoints (`LandmarkCamera.focus(waypointId)`). Turning it
inside a visit would need a kernel or dive change in `libs/**`, which was out of scope. The
board coming to the visitor gives the same result.

**Why the board is DOM and not a 3D mesh:**

- The site has no bundled 3D font. The same limitation deferred the Bureau signboard.
- DOM keeps every complaint as real text, so it can be selected, read by screen readers, and
  laid out in RTL.

The board is styled as a stone-framed cork board with paper notes pinned on it.

**The board** (`wall/notice-board.tsx`):

- **Notes:** each note shows the subject, a body excerpt of 140 code points, the sender and
  species, and the date. Notes are buttons with one tab stop for the group. Arrow keys move
  between them using the kit's `objectKeyStep` (mirrored in RTL), and Home/End go to the ends.
- **Read more:** Enter or a tap opens the whole complaint on a sheet pinned over the board.
  "Read more" shows only when the text was clamped. Focus moves to the sheet; Esc or "Close the
  note" closes it and returns focus to the note.
- **Paging:** "Newer" and "Older" use the API's cursor. Pages already read are kept, so "Newer"
  never refetches. A stale cursor restarts from the newest page.
- **States:** loading and empty are announced through a status live region. A failure shows an
  alert with a Try again button.
- **Leaving:** Esc with no note open, or "Back to the President", returns to the President's
  bubble. Focus goes back to the bubble's primary action.

**Posting** (`overlays/complaint-scroll`):

- **The choice:** with the wall on, the Bureau form (dialog, in-world scroll, phone sheet, page
  view) gets a "Where should it go?" radio group. The options are "Send privately to Abdallah"
  (the default, through the contact provider) and "Pin it on the public wall".
- **Public complaints:** choosing public hides the reply address. The domain refuses one on a
  public complaint (`not-allowed`), so the text is kept aside in case the visitor switches back,
  but it is never validated or sent. The option's hint says the complaint is moderated before
  it appears and that only the name and species are shown.
- **Validation:** the same domain value objects as before (`complaint-form-rules.ts`).
- **Success:** the result is "Pinned for moderation. It goes up on the public wall once a
  moderator approves it." In the world, the President says `filed-public`.
- **Failures:** a rate limit and an unavailable wall each get their own message. Anything else
  gets the existing "try again" message. The visitor's text is kept in every case.

**Page view:** a "Public wall" section after Contact, with a nav link. It shows the same board
in `page` presentation. Both appear only when the wall is on.

## API contract used

The wall API (`apps/api`, `libs/complaints/feature-api`) is used without changes. Types come
from `@qa3elhamor/shared-api-interfaces`.

- **List:** `GET {VITE_WALL_API_URL}/complaints?limit=6[&cursor=…]` returns
  `200 WallPageResponse { items: WallComplaint[], nextCursor: string | null }`, newest first.
  Each item is validated field by field. Malformed items are dropped and extra fields stripped.
- **Submit:** `POST {VITE_WALL_API_URL}/complaints` with exactly `{ subject, body, senderName,
  senderSpecies }` (the API refuses any other key), JSON. It returns
  `201 { id, status: 'pending' }`.
- **Error mapping** (`wall-client.ts`):

  | Response | Kind | What the visitor sees |
  | --- | --- | --- |
  | `429` (`Retry-After`) | `rate-limited` | "Too many complaints from this reef…" |
  | `503`, or `403 forbidden-origin` | `unavailable` | "The public wall is closed right now…" |
  | `400 invalid-cursor` | `invalid-cursor` | Nothing: the board reloads from page 1 |
  | `400`/`413`/`415` with a refusal code | `refused` | Generic failure |
  | No response | `network` | Generic failure |
  | Timer fired | `timeout` | Generic failure |
  | Caller's signal | `aborted` | Ignored |
  | Anything else | `unexpected` | Generic failure |

- **Requests:** `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, `mode: 'cors'`, and the
  POST is `no-store`. A 12 s timeout covers the whole exchange, body read included. The board
  aborts its request when it unmounts. The client never throws.
- **Text only:** every complaint field renders as React text children with `dir="auto"`. Values
  placed into copy templates ("From {name}, {species}") are each isolated in a `<bdi>`. Nothing
  uses `dangerouslySetInnerHTML`, an `href` or a `src`. A note containing
  `<img src=x onerror=alert(1)>` renders literally: this is unit-tested
  (`notice-board.spec.tsx`), and in a real browser the screenshot run found 0 `<img>` in the
  wall and 0 dialogs.

## Bundle: disabled means none of it

- **How the wall drops out:**
  - `wall/wall-env.ts` reads the env var once:
    `RAW === undefined ? null : readWallApiUrl(RAW)`.
  - Vite inlines `void 0` when the variable is unset, and Rolldown folds the expression to
    `null`. With that, `WALL`, `createWallPort`, the dynamic imports, `routeByVisibility` and
    the wall words all drop out of the entry chunk.
  - The form and the page get the wall's words through `WallPort.words`, never by importing the
    table. `WALL_COPY` is `/* @__PURE__ */`.
- **Shared-module trap:** the board must not import `WALL_COPY`. If it does, the table becomes a
  module shared with the orphan board chunk and lands in `main`. That happened once and was
  fixed, so the board keeps its own copy of two strings (`notice-board-copy.ts`).
- **Verified on the default build:**
  - `main-*.js` has no wall copy, no `createWallClient` and no wall-env warning.
  - `npm run perf:budget` reports `initial JS 94.4 KiB gzip of 105.0 KiB (3 files)` and OK.
  - Before the folding work, the wall copy and port cost about 0.6 KiB gzip in `main`.
- **What remains:** the form's conditional fieldset markup and `ComplaintSendError`, a few
  hundred bytes. They are dead when the wall is off.
- **Orphan chunks:** Rolldown still emits `notice-board-*.js`, `wall-client-*.js` and
  `wall-submitter-*.js` in `dist/`, but nothing references them and they are never fetched.

## Enabling it (owner or forker)

1. **Host the API.**
   - Deploy `apps/api` (Netlify function or any Fetch host) with Postgres.
   - Set `DATABASE_URL`, `IP_HASH_SALT` (≥ 24 chars) and `MODERATION_TOKEN` (≥ 24 chars).
   - Set `CORS_ALLOWED_ORIGINS` to the site's origin, e.g. `https://<user>.github.io`.
   - Run `npm run db:migrate` against it.
   - See `.env.example` and `docs/security.md`, including `EDGE_AUTH_SECRET` when you are not
     on Netlify.
2. **Build the site with the API root.** Set `VITE_WALL_API_URL=https://wall.example.org/api`,
   or `/api` when served from the same origin, as a build variable. On GitHub Pages that is a
   repository variable passed to the build step. The CSP plugin adds the origin to `connect-src`
   and fails the build on a bad value (`tools/deploy/csp.ts`).
3. **Moderate.** Open `moderation.html` with the token and approve pending complaints. Approved
   complaints appear on the wall within the API's cache window: 30 s in the browser, up to 60 s
   plus 300 s stale at a CDN, unless the purge hook is wired.

Local run (needs Docker; it was not available here):

```
npm run db:up && npm run db:migrate && npm run api:dev
# .env from .env.example, add the preview origin to CORS_ALLOWED_ORIGINS
VITE_WALL_API_URL=http://localhost:8787/api npx nx run web:build --skipSync
```

## Verification

- **Lint, typecheck and tests:** `npx nx run-many -t lint,typecheck,test -p web --skipSync`:
  53 files, 670 tests, all passed. New specs:
  - `wall/wall-client.spec.ts`: env parsing, paging, cursor, shape filtering, error mapping,
    timeouts (headers and stalled body), abort.
  - `wall/wall-paging.spec.ts`: the reducer, the excerpt and the date.
  - `wall/notice-board.spec.tsx`: notes, the XSS literal, read more and focus, arrow keys
    (LTR and RTL), paging without refetch, empty, failure and retry, abort on unmount, autofocus
    and the way back.
  - `wall/wall-port.spec.tsx`:
    - Off by default: `WALL` is null, the submitter is the contact one, and the page view has no
      wall heading, region or radios and makes no fetch.
    - The choice shows only when on, defaults to private, and the reply address goes only with
    private complaints.
    - A public post goes out with `visibility: 'public'` and shows the awaiting-moderation text;
      the rate-limit message is shown.
    - The labels stay unique.
    - Routing and the submitter's error mapping.
  - Also: `bureau-visit.spec.tsx` (the wall action only when on, focus restored),
    `bureau-filing.spec.ts` (`filed-public`), and `ui-strings.spec.ts` (both new tables
    registered).
- **Build and budget:** `npx nx run web:build --skipSync` then `npm run perf:budget` is OK,
  with initial JS 94.4 KiB gzip (see above).
- **E2E** (`apps/web-e2e/src/wall.spec.ts`):
  - The default absence tests are kept.
  - New: "complaints wall (on, mocked API)" reads the page view's wall (literal markup, Older
    paging) and pins a complaint (exact 4-key payload, "Pinned for moderation"). A
    `@desktop-only` Bureau test covers "Read the public wall" and "Back to the President".
  - The new tests are skipped unless `E2E_WALL_URL` points at a wall-on preview. The default
    e2e builds (`serve.mjs`, outside my scope) leave the wall off. Run them with:
    `WALL_SERVE_ONLY=1 node .ptah/specs/complaints-wall/wall-visual.mjs`, then
    `E2E_BASE_URL=http://localhost:4432 E2E_WALL_URL=http://localhost:4431 npx playwright test -c apps/web-e2e/playwright.config.ts wall.spec.ts --project desktop`.
  - **Run here, with the two command lines above:** all 4 pass. The first try at the Bureau
    test failed only on a trace-file ENOENT in the shared `test-results` folder, which another
    run was using at the same time. Re-run with `--output` in a temp folder, it passed (37 s).
- **Visual:** `node .ptah/specs/complaints-wall/wall-visual.mjs` builds wall on and off, serves
  them on 4431 and 4432, mocks `/api/complaints` in Playwright, and writes JPEGs to
  `screenshots/`.

## Screenshots (`screenshots/`)

| File | What |
| --- | --- |
| `bureau-wall-en-desktop.jpg`, `bureau-wall-ar-desktop.jpg` | The notice wall out of the Bureau, 1440×900 |
| `bureau-wall-note-*-desktop.jpg` | A note opened on the board |
| `bureau-wall-en-390.jpg`, `bureau-wall-ar-390.jpg`, `bureau-wall-note-*-390.jpg` | The phone sheet, 390×844 |
| `page-wall-{en,ar}-{desktop,390}.jpg` | The page view's Public wall section |
| `post-public-form-en.jpg` → `post-public-pending-en.jpg` | Pinning publicly, then awaiting moderation |
| `off-page-contact-en.jpg` | Disabled build: the Bureau form with no choice. The same run reported 0 wall headings, 0 radios, 0 "public wall" buttons after the Bureau's last line, and 0 `/api/` requests. |

`off-bureau-en-desktop.jpg` is missing: in the last run its frame took longer than the 30 s
screenshot timeout under SwiftShader. The script now allows 120 s. The assertions above ran in
that same flow.

## Open issues

- **The form's intro contradicts the public choice.** It still says "It goes privately to
  Abdallah's desk" when "Pin it on the public wall" is selected. The intro is content
  (`content/site.json` `complaintIntro`, outside my scope). The choice's own hint states the
  public terms. Suggested fix: content-reviewer rewords the intro, or an `complaintIntroPublic`
  key is added.
- **No camera move** (see the decision above). It would need a kernel or dive hook to aim at a
  point that is not a waypoint.
- **E2E wall-on build.** For CI to run the wall-on tests, `apps/web-e2e/scripts/serve.mjs` needs
  a third mode, `wall` (`VITE_WALL_API_URL=/api`), plus a project with that `baseURL`. Both
  files are outside my scope.
- **Orphan lazy chunks** are emitted in the disabled build (see Bundle). They are harmless but
  ship as unused files in `dist/`.
- **Cache window.** After a moderator approves a complaint, it can take up to about 6 minutes to
  appear behind a CDN, unless `CachePurger` is wired. This is an API-side concern.
- **API.** No defects were found. One note for the API owner: `GET /complaints` sends
  `cross-origin-resource-policy: same-origin`. CORS fetches are unaffected, which is how the
  client calls it, so nothing breaks here.

## Revision 1 (review: `code-review-agy.md`, REVISE 7/10)

| Finding | Fix | Spec |
| --- | --- | --- |
| **Serious:** a press on an `aria-disabled` pager button closed the open note | `turn()` in `notice-board.tsx` returns early while loading or when there is no page in that direction. The buttons stay `aria-disabled` and focusable, so focus never drops. | `notice-board.spec.tsx`: "ignores a press on a pager button with nowhere to go, keeping the open note" (one request, note still open) |
| **Serious:** a page whose items were all malformed showed as an empty wall | `readPage` in `wall-client.ts` returns `null` (`unexpected`) when items were sent but none is readable, so the board shows the failure alert and Try again. An unreadable `submittedAt` now makes an item invalid (`isWallComplaint`). A truly empty page is still an empty wall. | `wall-client.spec.ts`: "fails a page whose items are all unreadable…" |
| **Moderate:** Tab left the open note for the pager or "Back to the President" | While a note is open, the pager and the back button are `inert`, as the notes list already was. Inside the board, Tab stays on the note sheet, and Esc or "Close the note" restores everything. | `notice-board.spec.tsx`: "keeps Tab on the open note…" |
| **Moderate:** cursor paging stopped when newly approved complaints pushed seen ones onto the next page | `wall-paging.ts`: a page of only already-shown items with a new cursor reads on past it automatically (`asked` tracks the cursor in flight). It ends only when the cursor is null or does not move, which guards against a loop. | `wall-paging.spec.ts`: "reads on past a page of already-shown complaints…" and "ends paging when … no further cursor" (null and repeated cursor) |
| **Moderate:** the form intro promised privacy while "public" was chosen | Fixed in content by the orchestrator (`content/site.json` `complaintIntro`: "It lands on Abdallah's desk…"), and kept. A guard spec stops the intro from promising privacy again. | `wall-port.spec.tsx`: "keeps the form's intro true for both choices" |
| **Minor:** an unparseable date was dropped silently | Covered by the second fix: such an item is now invalid and filtered out, and an all-invalid page fails visibly. | as above |

### Re-verification

- **Lint and typecheck:** `npx nx run-many -t lint,typecheck -p web --skipSync` passes.
- **Tests:** `npx nx run web:test` passes: 53 files, 677 tests.
  - The first two full `run-many` runs on this machine failed 11 tests, then 2, all on 15 s
    test or hook timeouts in unrelated specs (`dive.config`, `app-fallback`, the
    `complaint-scroll` pending test). About 80 node and chrome processes from other agents were
    running at the time.
  - Each of those specs passed when run alone, and the whole suite passed with
    `--maxWorkers=2`.
- **Build and budget:** `npx nx run web:build --skipSync` then `npm run perf:budget` is OK, with initial JS at 94.4 KiB gzip of 105 KiB. The
  disabled build's `main` still has no wall copy.
