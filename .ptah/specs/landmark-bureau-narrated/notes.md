# The Complaints Bureau, narrated (contact)

Status: **implemented, awaiting owner review.**

The Bureau now opens in the world, on the narrated-visit kit:

- The Sardine President narrates.
- The clerk window lights up.
- The real complaint form comes out of a pneumatic tube on a paper scroll.
- The Sardine Municipal Stamp slams down.
- The scroll rolls into a bottle that floats to the surface.

The dialog form stays the fallback.

## The experience

1. **Arrival.** The Sardine President swims in on the left and reads `narration.landmarks.bureau`
   (4 lines). Meanwhile the clerk window on the Bureau (the Chum Bucket model) lights up, with a
   couple of flickers.
   - The window has a painted frame, a counter and a cream enamel sign carrying the landmark's
     name.
   - A brass pneumatic tube runs down beside it, its mouth on the counter.
2. **Last line.** Two actions: **File a complaint** (the primary action, with a rolled-scroll
   glyph) and **Back to the dive**.
3. **The scroll.** It shoots out of the tube in a puff of air bubbles.
   - **Desktop (≥ 640 px wide and ≥ 560 px tall).** The paper flies out of the window and
     settles in front of the visitor with drei `Html transform` (`InWorldCard`, at pixel-exact
     scale). Once settled it **unrolls**: the bottom rod travels down as the sheet grows.
   - **Phone (or a short landscape screen).** The paper is a **screen-space sheet** over the
     scene, because readable typing wins over the effect. It unrolls the same way. It fits
     between the top of the screen and the stage bar, and **shrinks to the visual viewport**
     when the on-screen keyboard is up (`--bureau-sheet-h` from `visualViewport`). Only the
     paper scrolls inside itself, never the page; page scroll would close the landmark.
   - The form is the **real `ComplaintScroll`**: the same validation (the complaints domain's
     value objects) and the same error summary. It sends through the **shared
     `CONTACT_SUBMITTER`** (`contact-submitter.ts`).
   - Focus goes to the subject field once the paper has unrolled.
   - **‹ Roll it back up** or **Esc** puts the scroll back in the tube **unsent and keeps the
     draft**. Esc is caught before the stage's Esc, so it does not close the Bureau. The draft
     also survives leaving and coming back. Focus returns to "File a complaint".
4. **Stamp.** On a successful delivery:
   - The Sardine Municipal Stamp (the form's SVG) **slams down** onto the filled-in paper
     (scale 2.4 → 1 with a squash), with an ink ring. The paper takes a **thump**: a few
     damped pixels of shake.
   - The result ("Complaint stamped" and the success or pending copy, in `role=status`) sits
     over the inert form, and focus moves to its heading.
   - After 2.4 s the paper **rolls up** (the rods meet) and a **corked glass bottle** with the
     rolled complaint and a red band appears where the paper was. It turns neck-up and **floats
     to the surface**, rocking in the current, with a bubble trail. On a phone it starts lower,
     so it is seen rising past the bubble.
   - The President's bubble comes back under a **"Complaint stamped"** tag and says where the
     bottle is going. Focus moves to **File another complaint**.
5. **Honesty.**
   - With no provider configured (`pendingSubmitter`), the paper shows the form's own
     `complaintPendingBody`.
   - The President says the post office has not opened yet, so this bottle is going nowhere,
     and points to the Citizenship Card.
   - No fake "sent".
6. **Failure.** The form's own `complaintFailureBody` alert shows ("The stamp slipped…"). All
   the text stays, the paper stays unrolled, and no stamp, bottle or narrator line appears.
7. **Leaving** ("Back to the dive", Esc or a scroll): the farewell from `narration.json`, then
   the President swims off. Focus goes to the Bureau's nav entry.
8. **Fallback** (reduced motion, the low tier, no WebGL): the existing dialog form, unchanged.

### Keystrokes and focus

- The speech bubble only answers Space and Enter pressed on itself (`SpeechBubble` checks
  `target === currentTarget`).
- While the scroll is out, the bubble is not rendered at all. Typing Space or Enter in any field
  never advances the dialogue (spec, and the capture logs `speaker: null` while typing).
- Nothing traps focus. Tab moves through the paper, "Roll it back up", then the stage bar.
- Focus never drops to `<body>`:
  - subject field on unroll;
  - the error summary on a refused stamp;
  - the result heading when stamped;
  - "File another complaint" once afloat;
  - "File a complaint" after rolling back.
  - The paper stays reachable while it rolls up, so focus has somewhere to be in between.

### The President stays seen

- He is posted by the kit's **`useNarratorPost`**, with `settled = dialogue.stage !==
  'waiting'`, as the Krusty Krab does. A visit root group round the window, narrator and bottle
  is excluded from the occluders.
- His bubble is placed by **`useSpeechBubblePlacement`**, which now includes the kit's
  `windowSafeInsets` clamp.
- Captured: desktop bubble at x = 12 (480 wide); 390 px bubble at x = 12 (366 wide).
- Desktop: the President floats over the rocks left of the Bureau, clear of the paper (which
  spans x 416–1024).
- Phone: he floats left of the bucket, under his bubble.

## Files

### Created: `apps/web/src/app/bureau/`

| File | What |
| --- | --- |
| `bureau-scene.tsx` | `createBureauScene`, the scene. It composes the kit's parts: the dialogue, `useVisitLifecycle`, `LandmarkNarrator`, `TalkBubbles`, `WorldFrame`, `useNarratorPost` and `useSpeechBubblePlacement`. It adds the filing timers, Esc to roll back, the draft, the window, the bottle, the in-world card or the phone sheet, and the HUD. |
| `bureau-filing.ts` (+ spec, 7) | The pure filing state machine. Stages `tube → unrolled → stamped → rolling → afloat`; roll-back; a late stamp after the scroll was put away; reset. Also `scrollOut`, `filedLineOf` and `paperStateOf`. |
| `bureau-hud.tsx` | The President's bubble and its footer: dots, Skip and Next; File a complaint or File another complaint, and Back to the dive. Also the dim, the phone sheet slot and focus hand-back. |
| `bureau-scroll.tsx` + `.css` | The paper around `ComplaintScroll variant="in-world"`: unroll and roll-up by sheet height, stamp slam, thump, ink ring, "Roll it back up", focus on unroll. Reduced-motion guards. |
| `bureau-sheet.tsx` | The phone sheet, `useVisibleHeight` (visual viewport) and `sheetHeightFor`. |
| `clerk-window.tsx` | The 3D clerk window: flickering lamp light, counter, canvas-texture sign, brass tube with an air puff. |
| `message-bottle.tsx` | The 3D bottle: a lathe glass body, rolled paper inside, cork, rise, sway, drift and a bubble trail. Fixed in the world where it lets go. |
| `bureau-layout.ts` | The President's spot, window size and bottle size, for landscape and portrait. |
| `bureau-copy.ts` | UI words in en/ar: File a complaint, Roll it back up, the scroll's name. The President's two filed lines (delivered and unsent) in Egyptian Arabic, matching `narration.json`'s voice. |
| `bureau.css` | The scroll glyph, the lighter dim, the phone sheet. |
| `bureau-visit.spec.tsx` (14) | Keystroke isolation, the bubble's actions, the filed line and tag, focus hand-back, focus on unroll, draft kept, roll back, refused stamp, delivered, pending, failed, a late stamp after the scroll was put away, sheet heights. |

### Modified

- `overlays/complaint-scroll/complaint-scroll.tsx`: minimal, additive. Optional props are
  `variant` (`'dialog'` default | `'in-world'`), `initialValues`, `onDraftChange` and
  `onStamped`. `onStamped` is called even if the scroll was put away while sending, so a late
  delivery is not lost.
  - In-world, the stamped result overlays the inert, filled-in paper (`.complaint-scroll__stamp-mark`).
  - The dialog output is unchanged; its 272-line spec passes untouched.
  - `index.ts` exports `EMPTY_COMPLAINT_FORM` and `ComplaintScrollOptions`.
  - `complaint-scroll.css` gains the stamp-mark rules.
- `landmarks.config.ts`, bureau lines only:
  - `presentation: 'in-world'` and `scene: 'bureau'`;
  - `LANDMARK_SCENES.bureau = createBureauScene(…)`;
  - the bureau overlay now uses **`CONTACT_SUBMITTER`** (the shared one) instead of creating
    its own `createContactSubmitter(import.meta.env)`, with the import switched accordingly.
- `landmarks.config.spec.ts`: `bureau` joins the narrated list. "Keeps the other landmarks in
  their dialogs" became "presents every landmark in the world", since none is left in a dialog.
  The Krusty agent confirmed both files are consistent with its edits.
- Kit (`narrators/`), additive only:
  - `useSpeechBubblePlacement` is exported from `narrated-visit.tsx`;
  - a README paragraph explains how the Bureau composes the kit's parts.
  - `useNarratorPost` was exported by the Krusty agent at my request.

Not touched: `libs/**`, `content/**`, `tools/**`, `app.tsx`, `pineapple/**`, `tiki/**`, `krusty-krab/**`.

## Verification

- `npx nx run-many -t lint,typecheck,test -p web --skipSync` returned **"Successfully ran
  targets lint, typecheck, test for project web and 16 tasks it depends on"**. web has 42 test
  files and 392 tests, all passing; lint is clean.
- Bureau specs: `bureau-filing` 7 and `bureau-visit` 14. `complaint-scroll.spec.tsx` (the dialog
  form) is unchanged and passing.

## Screenshots (`shots/`, JPEG)

`capture.mjs` (Playwright, swiftshader) ran against my own `vite --port 4413` (never 4400) with
`?quality=high`, at desktop 1440×900 and phone 390×844.

- **Outcomes are mocked by intercepting the provider request in Playwright.** There is no switch
  in the app.
  - The dev server ran with `VITE_CONTACT_PROVIDER=web3forms` and a dummy key.
  - `delivered`: the route answers 200 with `success: true`.
  - `failed`: the route answers 500.
  - `pending`: a server with no provider; the log shows 0 provider requests.
- **Intermediate frames.** The stamp hold, roll and bottle are faster than a swiftshader
  screenshot (more than 2 s each). From the stamp press on, the capture installs Playwright's
  clock, pauses page time and steps it (`clock.runFor`), so `g1`–`h3` are deterministic. CSS
  animations still run in real time.
- `capture-fallback.mjs`: the reduced-motion dialog on the phone, opened from the landmark list.

| Prefix / id | Shows |
| --- | --- |
| `z-before-*` | Before: the dialog only |
| `*-a-arrival` | At the Bureau stop |
| `*-b-president-talking` | The President's first line; the window is lit |
| `*-c-last-line` | "File a complaint" and "Back to the dive" |
| `*-d-scroll-unrolled` | Desktop: the paper in front of the visitor. Phone: the sheet. Subject field focused. |
| `*-e-validation-errors` | Empty stamp: the error summary focused, the fields marked |
| `*-f-typing` | Filled in, typed with the keyboard (Enter and Space in fields; `speaker: null` throughout) |
| `delivered/pending-g1`, `g2` | The stamp landed on the paper, with the result text |
| `*-h1-rolling` | Rolled up: the rods meet |
| `*-h2-bottle-floating`, `h2b` | The bottle rising, with the President's filed line starting |
| `*-h3-filed-line` | The filed line: delivered on one, honest "not sent" on the other |
| `*-i-farewell` | Leaving |
| `failed-g-failed-*` | Failure copy, text kept, paper still open |
| `delivered-z-fallback-dialog-*` | Reduced motion: the dialog form |
| `z-settled-check-*` | After passing `settled` to `useNarratorPost`: the President is still visible, bubble on screen |

Logs: `capture-delivered-phone.log`, `capture-failed.log`, `capture-pending.log`. The desktop
delivered run's facts are in this session's output. They are the same shape: focus, stage,
speaker, topic, spoken line, bubble box, paper state and box, status, alert, provider request
count.

My 4413 server was stopped at the end; 4400 was never touched.

## Open issues

1. **The bucket looks washed out** (cream) while focused. This is the kernel's focused or hover
   tint, the same as open question 3 at the Pineapple and Tiki. It is not mine to change
   (`libs/**`).
2. **iOS keyboard and leave-on-scroll.** The stage closes the landmark after 64 px of page
   scroll. The phone sheet keeps all scrolling inside the paper, and focus uses
   `preventScroll`. However, iOS Safari can scroll the document when the keyboard opens even
   for fixed content. That cannot be tested in Chromium emulation, so it **needs a real-device
   check**. If it triggers, the fix is kernel-side: suspend `leaveOnScroll` while a field in
   the stage has focus.
3. **Enter in a single-line field submits the form**, as in the dialog (standard form
   behaviour). The capture shows the summary appearing; the President is unaffected.
4. **The tube** reads as a brass pipe beside the window rather than an obvious pneumatic tube at
   this distance. The scroll emerges from the window centre, not exactly from the tube mouth:
   `InWorldCard` computes its own door.
5. **Copy keys.** `bureau-copy.ts` (en/ar UI words and the two filed lines) is hard-coded like
   the other visits' copy. It moves to `content/site.json` / `narration.json` after sign-off.
6. **Arabic** is not exercised in the shots (the page locale is fixed to `en`).
7. A Vite HMR console error (`tailSkewDegrees` missing from `screen-placement.ts`) appeared once
   mid-capture. It came from another agent's in-flight kit edit; the next load was clean.

## Revision 1 (independent review `code-review-agy.md`: REVISE 7/10)

### 1. iOS keyboard vs leave-on-scroll (serious): fixed generically in the stage

- `libs/landmarks/ui/src/lib/landmark-stage.tsx`: page scroll does not count as leaving while a
  text field inside the stage's scene has focus, nor for `TEXT_ENTRY_SCROLL_GRACE_MS` (1 s)
  after it blurs. During that time `start` is re-based to the current position, so the keyboard
  scrolling the page back on close is not a leave either.
- New exports: `isTextEntry(element)` (input except button-like types, textarea, select,
  contenteditable) and `TEXT_ENTRY_SCROLL_GRACE_MS`.
- Documented in `libs/landmarks/README.md` and on `leaveOnScroll`.
- Spec (`landmark-overlay-host.spec.tsx`): focus a field, scroll 120 px, and it stays open; blur
  and scroll back within the grace, and it stays open; a real scroll after the grace leaves.
  Also an `isTextEntry` table.

### 2. Escape (serious)

- In the stage: an Escape with `isComposing` or keyCode 229 never closes it (`isComposingKey`,
  exported). Spec.
- In the Bureau (`bureau/bureau-keys.ts`, `scrollEscape`, with spec) the order is:
  - IME composition: ignored, the input method keeps it.
  - While the complaint is being sent: swallowed (no roll-back, no close).
  - In a field: the first Escape only leaves the field, moving focus to "Roll it back up".
    That Escape also closes a datalist or select popup, which cannot be detected reliably, so
    no text or scroll is ever lost to a popup Escape.
  - Otherwise: roll back, with the draft kept.
  - Everything handled calls `preventDefault`, so the stage does not close.

### 3. Rolled back or left while submitting (serious)

- **Roll-back is blocked while sending.** The filing reducer ignores `roll-back` when
  `sending`. "Roll it back up" is `aria-disabled` (dimmed, progress cursor) and does nothing.
  Esc is swallowed.
- **Leaving mid-send still surfaces the result.**
  - The Bureau wraps the shared `CONTACT_SUBMITTER` in `singleFlight(submitter, watcher)`
    (new, `complaint-submitter.ts`). The watcher hears every outcome even after the form has
    unmounted.
  - Success: the late `onStamped` sets `afloat`. The President now announces the filed line
    once per bottle as soon as he is there, so on the visitor's return.
  - Failure away from the paper sets `failedAway`. The next paper opens with the form's own
    failure notice (new `initialFailed` option on `ComplaintScroll`) over the kept draft.
  - In-flight state survives `reset`.
- Specs:
  - filing: roll-back blocked, `failedAway` only when away, kept across leaving, cleared by a
    new attempt;
  - an integration spec in `bureau-visit.spec.tsx`: send → roll-back refused → leave → fail →
    the next paper shows the alert with the full text.

### 4. Double submit (moderate)

- `ComplaintScroll` sets a synchronous `sendingNow` ref guard: two submits before a re-render
  send once. Spec, in the dialog spec file; the existing tests are untouched.
- Across the in-world paper and the phone sheet (a resize mid-send remounts the other
  presentation), `singleFlight` makes a second submit join the one in flight. Specs:
  `complaint-submitter.spec.ts`, and two `BureauScroll` instances sharing one submission.

### Minors

- The reset on leaving moved from a render-time dispatch to an effect.
- `useVisibleHeight` also listens to `visualViewport` `scroll` (iOS reports the keyboard that
  way too).
- "Unmounted reducer dispatch": `BureauVisit` never unmounts while the landmark exists (it
  renders `null` when away), and a React dispatch after unmount is a no-op anyway, so no guard
  was added.

### Kept

The orchestrator's `libs/landmarks/feature/src/lib/landmark-layer.tsx` change (the open-state
tint) is untouched.

### Verification

- `npx nx run-many -t lint,typecheck,test -p landmarks-ui landmarks-feature web --skipSync`
  returned **"Successfully ran targets lint, typecheck, test for 3 projects and 14 tasks they
  depend on"**.
- web: 44 files, 406 tests. landmarks-ui: 21 tests.
- New or extended specs:
  - `bureau-keys` 4;
  - `bureau-filing` +3 (10);
  - `bureau-visit` +3 (17);
  - `complaint-submitter` 2;
  - `complaint-scroll` +2;
  - stage +3.
- No visual change apart from the disabled "Roll it back up" while sending, so no new
  screenshots. The in-browser path is covered by the specs. No server was started in this
  round.
