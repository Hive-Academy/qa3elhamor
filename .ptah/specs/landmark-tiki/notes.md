# Narrated visits rolled out: shared kit, mixed cast, and the Tiki

Status: **implemented, awaiting owner review.**
- The Pineapple is ported onto a shared kit with no behaviour change.
- The cast is mixed: SpongeBob at the Pineapple and Patrick at the Tiki when
  `VITE_BUNDLED_CHARACTERS=true`; the crab clerk and the Sardine President keep their landmarks.
- The Tiki head is a narrated landmark: one carved stone tablet per job rises out of the sand.

Krusty Krab and the Bureau are not touched. They are ready for the two agents building them on the
kit (`apps/web/src/app/narrators/README.md`).

## Task 1: the narrated-visit kit (`apps/web/src/app/narrators/`)

### What a landmark supplies

```ts
createNarratedVisitScene<Slot>({
  narration,          // narration.landmarks[id]
  hints,              // 'narration' (default) | Record<objectId, LocalizedText | undefined>
  narrator,           // narratorFor(id, NARRATORS)
  stop,               // stopView('landmark-<id>')
  objects,            // (lang) => VisitObject[]: label, caption?, topic?, detailLabel, notes?, chips
  layout,             // (view, count, ground) => { narrator: NarratorPlacement, slots: Slot[] }
  Objects,            // ComponentType<VisitObjectsProps<Slot>>: the 3D objects
  fullView,           // { render({ locale, dir }), icon?, doorHeight?, liftPx? }
  words,              // { en, ar }: { openFull, objectsList }
  shape,              // 'round' | 'slab' (label shape)
  doorHeight,         // where objects come from on the model (fraction of height)
}): ComponentType<LandmarkSceneProps>
```

### What the kit does

| Piece | File |
| --- | --- |
| Lifecycle: arrive, farewell, swim off, re-open mid-goodbye. Hover-intent picking. Full view with Esc first. | `visit-hooks.ts` (+ spec) |
| The scene: narrator (model or fallback cast, the tag follows who plays), breath bubbles, `WorldFrame` and door, speech-bubble placement, HUD, full view in an `InWorldCard` | `narrated-visit.tsx`, `world-frame.tsx` |
| The HUD: the bubble and its footer (dots, Skip, Next, Back to the tour, last-line actions), and the object label list, the a11y mirror of the 3D objects. Arrow keys, Home and End move between labels; `aria-expanded` and `aria-controls` are set on each. The detail is a tray beside the object, or inside the bubble below 640 px. | `visit-hud.tsx` + `.css` (+ spec) |
| The script, with a pluggable hint source: narration hints, or lines supplied by the content | `visit-script.ts` (+ spec) |
| Per-frame label and panel projection for any 3D object | `object-dom.ts` |
| Selection rules (moved from `pineapple/skill-selection.ts`) | `object-selection.ts` (+ spec) |
| Composition helpers: `placeNarrator`, `groundPointAtScreen`, `pixelSize`, `isPortrait` | `visit-layout.ts` (+ spec) |
| `placePanel` gains `extent` (non-round things) and `prefer` (a first side) | `screen-placement.ts` (+ spec) |
| Generic words `leave` and `backToGuide` | `narrator-copy.ts` |
| Contract types | `visit-types.ts` |
| How-to for the next landmarks | `README.md` |

### The Pineapple port

`pineapple/` now holds only what is the Pineapple's own:
- `createPineappleScene`, a thin `createNarratedVisitScene` call, and `skillGroupObjects`;
- `pineappleLayout`, which uses `placeNarrator`;
- `SkillBubbles`, which uses `placeObjectDom` and `acceptsPick`;
- the bubble shader, its copy (`openFull`, `objectsList`, `skillsOf`), and `pineapple.css` (the card glyph and the card's height under the back button).

Removed, not kept alongside: `pineapple-hud.tsx`, `pineapple-hud.css` and `skill-selection.ts`.
Behaviour is unchanged.
- `pineapple-hud.spec.tsx` became `pineapple-visit.spec.tsx`: the same 16 assertions on the kit
  HUD with the Pineapple's words, plus one for `skillGroupObjects`. Only the renamed keys changed
  (`openCard` to `openFull`, `skillsList` to `objectsList`).
- `skill-selection.spec.ts` became `object-selection.spec.ts`, with the same cases.
- `pineapple-layout.spec.ts` is unchanged except one import.
- The regression shots with SpongeBob (`patrick-p-pineapple-spongebob-*`) match the signed-off look.

## Task 1b: the cast config (`narrators.config.ts`)

- `bundled` is a `Partial` record: `{ pineapple: spongebob-narrator, tiki: patrick-narrator }`.
  Krusty Krab and the Bureau have no bundled character, so they keep the crab clerk and the
  Sardine President even with the switch on.
- `useBundledCharacters` comes from `bundledCharactersFromEnv(import.meta.env)`. Only
  `VITE_BUNDLED_CHARACTERS=true` turns it on; it is off by default.
  - The variable is typed in `apps/web/src/vite-env.d.ts`.
  - It is documented in `.env.example` (a "Narrators" section) and in `docs/deploy.md` (one row in
    the variables table).
- The dev-only `?narrators=bundled|original` override is kept.
- The original cast stays the fallback for the low tier and for a model that fails to load
  (`LandmarkNarrator`, unchanged).

## Task 2: the Tiki, narrated (`apps/web/src/app/tiki/`)

### The experience

1. **Arrival.** The narrator swims in from the left and settles up over the rock, beside the
   tiki. With the switch on it is Patrick; otherwise the Hamour. Its bubble types
   `narration.landmarks.tiki`.
2. **The tablets.** One carved stone tablet per job (`content/resume.json`, newest first) rises out
   of the sand in front of the tiki, one after another, each in a puff of sand.
   - Desktop: one shallow fanned row of four, outer tablets turned out. The tiki's face stays
     visible above the middle two.
   - Phone: two rows of wider slabs, with the tiki between the columns.
   - The tablets are real 3D: an extruded low-poly stele with cut top corners and bevelled edges,
     and a raised carved rim inside its outline. It is sandstone, flat-shaded, with position-based
     weathering, darker towards the foot.
   - A clipping plane at the seabed makes them emerge from the sand rather than float up.
   - The sand puff is one `Points` draw for all tablets: deterministic grains spreading and
     settling.
3. **Labels.** Each tablet carries crisp DOM, the same approach as the Pineapple's bubble labels:
   the role, then the company and the years ("2020 – now", "2019 – 2024", "2015").
   - The label button covers the tablet, so mouse, tap and keyboard share one target.
   - Its accessible name is "Lead Software Development Engineer, Prio, 2019 – 2024".
4. **Selecting a tablet** (mouse hover after a 140 ms rest, a tap, or focus with arrow-key
   travel):
   - It comes forward towards the visitor, lifts off the sand, grows 8% and warms to gold. The
     others darken.
   - Its highlights and tech chips show:
     - desktop: in a glass tray **above** it, in the open water. Beside it would cover the next
       tablet; `placePanel prefer: 'above'` falls back to the outer side when there is no room;
     - phone: inside the narrator's bubble, under the comment.
   - The narrator reads **that job's performance review** (`quip`) under a "Review · Prio" tag.
     This uses the pluggable hint source: `hints: jobReviews(entries)`.
   - A job without a quip still shows its detail, and the tour line stays.
5. **End of the tour.** Two actions:
   - **Read the full record**: the page view's Experience section, as an in-world paper slab
     that scrolls inside itself. Focus goes to its `article`. **‹ Back to the guide** or Esc
     returns focus to "Read the full record".
   - **Back to the dive**.
6. **Leaving.** "Back to the dive", Esc or a scroll:
   - the tablets sink back, puffing sand;
   - the narrator says the farewell and swims off;
   - focus returns to the Tiki's nav entry.
7. **Fallback** (reduced motion, the low tier, no WebGL): the `tiki` overlay is now the full
   record in the dialog (`createExperienceRecordOverlay`), replacing `ComingSoonOverlay`.

The landmark kernel (`libs/landmarks`) is unchanged, and so is `content/**`.

### Reuse, not duplication

`ExperienceRecord` renders the page view's own `ExperienceSection`, `pageText`, and the
`page-view.css` classes. `page-view/**` is untouched. The record restates only the sea-colour
custom properties, because no `.page-view` wraps it. It has two variants: `in-world` (scrolling
paper slab) and `dialog` (flat on the host's paper).

### Tiki files

| File | What |
| --- | --- |
| `tiki-scene.tsx` | `createTikiScene`: the kit definition |
| `job-objects.ts` (+ spec) | `jobObjects` (resume entries to tablets), `jobReviews` (quips as hints), `yearsOf` |
| `tiki-layout.ts` (+ spec) | `TIKI_LANDSCAPE` and `TIKI_PORTRAIT`, `tabletFeet`, `tikiLayout`. Tablets stand on the seabed under their screen foot (`groundPointAtScreen`). Specced at 3 viewports: on the sand where wanted, the right pixel height, whole on screen, clear of the bar, apart, and presented nearer while staying on screen. |
| `stone-tablets.tsx` | The 3D tablets, rise and sink, selection, sand puff, label and panel projection |
| `tablet-geometry.ts` | The slab and rim geometry, with weathering |
| `experience-record.tsx` + `.css` (+ spec) | The full record (in-world and dialog), and the overlay factory |
| `tiki-copy.ts` | UI words (en/ar): Read the full record, the list name, `Review · {company}`, the detail name, "now" |

`landmarks.config.ts` (surgical edits):
- tiki: `presentation: 'in-world'`, `scene: 'tiki'`, `overlay: 'tiki'` (the record dialog);
- `LANDMARK_SCENES.tiki = createTikiScene({ entries: resumeEntries, copy, narration, narrator, stop })`.

`landmarks.config.spec.ts` was updated. Its old expectations ("tiki stays a placeholder", "only
the pineapple is in-world") are what this task changes. The narrated landmarks are now checked as
a pair.

`app.tsx` was not touched.

## Accessibility

- **Opening.** Focus lands on the speech bubble (the stage autofocus): a `section` named by the
  narrator ("Patrick" or "The Hamour").
- **Lines.** Each line goes to a polite live region once, whole.
- **The tablets.**
  - They form a list named "Performance reviews, carved in stone". Each is a button with a full
    `aria-label` (role, company, years), `aria-expanded`, and `aria-controls` pointing at the tray
    or the in-bubble detail group.
  - Arrow keys move between tablets (mirrored for right-to-left), and Home and End go to the ends.
  - Focusing a tablet selects it, and the review is announced through the live region.
  - The capture logs focus moving to "Senior Full Stack Developer, …" and the review changing
    with it.
- **Focus never drops to `<body>`.**
  - Last line: focus moves to "Read the full record".
  - Full record open: focus is on its `article` (tabindex -1, named "Experience" by its h2).
  - Esc: back to "Read the full record". The capture logs this.
  - Leaving: focus goes to the "Tiki Head" nav entry.
- **Out of reach when not live.** Labels are `inert` while the tablets are under the sand, while
  the record is open, and while leaving. The farewell bubble is `inert` and `aria-hidden`.
- **The full record's links.** The company link says "(opens in a new tab)". In the dialog
  fallback, focus starts on the first link, as the host does for the Pineapple.
- **Text sizes.** Labels, chips and notes are 15 px; bubble text is 18 px (16 px on a phone).
  Labels on stone use the same light-on-dark text shadow as the Pineapple's.

## Verification

- `npx nx run-many -t lint,typecheck,test -p landmarks-domain landmarks-feature landmarks-ui web --skipSync`:
  **"Successfully ran targets lint, typecheck, test for 4 projects and 13 tasks they depend on."**
  - web: 36 test files, 335 tests, all passing. Lint is clean, with no warnings.
- New or ported specs:

  | Spec | Tests |
  | --- | --- |
  | `object-selection` | 8 |
  | `visit-hooks` | 7 |
  | `visit-script` | 3 |
  | `visit-layout` | 5 |
  | `screen-placement` | +2 |
  | `visit-hud` | 7 |
  | `pineapple-visit` | 17 |
  | `tiki-layout` | 17 |
  | `job-objects` | 4 |
  | `experience-record` | 2 |
  | `narrators.config` | 5 |
  | `landmarks.config` | updated |

- Two caveats from mid-run:
  - One run of `web:typecheck` failed on another agent's uncommitted `vite.config.mts` and
    `tools/deploy/csp-plugin.ts` change. It was green by the final run.
  - `telemetry.spec.ts` timed out once under load (a 9–15 s dynamic import). It passed in the
    final run.

## Screenshots (`shots/`, JPEG)

Captured with `capture.mjs` (Playwright on swiftshader at 1–3 fps, so the motion is slow) against
`vite --port 4411` (never 4400), `?quality=high`. Viewports: desktop 1440×900 and phone 390×844.
Prefixes: `hamour-` is `&narrators=original`; `patrick-` is `&narrators=bundled`.

| File | Shows |
| --- | --- |
| `z-before-*` | Before: the "under construction" dialog |
| `hamour-a-arrival-*` | At the tiki stop, before opening |
| `*-b-narrator-arrives-*` | Narrator in place, the first line, tablets starting to rise in sand puffs. `patrick-b-*` is **Patrick talking**. |
| `*-c-tablets-risen-*` | All four tablets up, labelled |
| `*-d-tablet-selected-*` | Prio's tablet selected: forward and gold, the others darker. The narrator reads its review under "Review · Prio". Highlights and tech show in a tray above it (desktop) or inside the bubble (phone). |
| `*-d2-arrow-key-*` | ArrowRight from it: focus and selection move to the freelance tablet, with its review |
| `*-e-last-line-*` | The last line, with "Read the full record" and "Back to the dive" |
| `*-f-full-record-*` | The full record over the darker sea, with "‹ Back to the guide" |
| `*-g1-farewell-*`, `*-g2-after-leaving-*` | Tablets sinking in puffs, the farewell, then the dive restored |
| `hamour-i-fallback-dialog-*` | Reduced motion: the full record in the landmark dialog |
| `patrick-p-pineapple-spongebob-*` | Regression: the Pineapple on the kit, narrated by SpongeBob |

Tuning rounds before these:
1. Taller tablets hid the tiki.
2. Outer tablets turned inward.
3. The stone read teal and gravestone-like. Fixed with a warmer stone, cut corners and a faint
   self-light.
4. On the phone, labels overflowed. Fixed with taller slabs and tighter label spacing.
5. The desktop tray covered the next tablet. Fixed by putting it above.
6. On the phone, the review bubble covered the narrator, so the narrator was lowered. The
   presented tablet also left the screen, so phones present it less far.

Capture logs (the facts logged at each step: focus, stage, speaker, topic, spoken line, label
boxes, panel): `capture-original-desktop.log`, `capture-original-phone.log` and
`capture-bundled.log`. Two runs reloaded mid-way and were redone: Vite reloaded the page when a
web file changed, the first time from my own edits and the second from another agent's.

The dev server on 4411 was stopped at the end. The owner's 4400 was not touched.

## Open issues and notes for other lanes

1. **Deploy workflow (devops, out of my scope).** `.github/workflows/deploy-pages.yml` does not
   pass `VITE_BUNDLED_CHARACTERS` to the build yet. Add one line next to the contact variables:
   `VITE_BUNDLED_CHARACTERS: ${{ vars.VITE_BUNDLED_CHARACTERS }}`. Then set the repository
   variable to `true` for the owner's Pages deploy.
2. **Copy keys.** The Tiki's UI words (`tiki-copy.ts`) and the kit's (`narrator-copy.ts`) are
   hard-coded en/ar, like the Pineapple's. They move to `content/site.json` after sign-off.
3. **Tiki narration has no `hints`.** That is by design: comments come from each job's `quip`. A
   job added without a quip is selectable and silent.
4. **Phone density.** Four tablets in two rows cover the tiki's base and door; its face stays
   visible between the columns. A fifth job would start a third row. `tabletFeet` handles any
   count, but the composition is tuned for 4.
5. **Arabic.** The page locale is fixed to `en`, so Arabic is not exercised in the shots. The
   role is Arabic in content; the company and quips are English only.
6. **Unrigged characters.** Patrick and SpongeBob are T-posed and talk by squash-and-stretch.
   This is unchanged and was accepted at the Pineapple's sign-off.
7. **Fallback dialog on a phone.** The overlay host moves focus to the first link in the record
   (Prio's company link), which scrolls the "Experience" heading out of view
   (`hamour-i-fallback-dialog-phone`). This is the host's existing autofocus; the Pineapple's card
   does the same. A host option to focus the content's heading instead would fix it, but the
   kernel was left unchanged.
8. **Kernel focused tint.** The washed-out look on the open landmark (open question 3 at the
   Pineapple) applies to the tiki too.
