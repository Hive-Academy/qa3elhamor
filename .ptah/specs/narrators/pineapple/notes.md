# Narrated Pineapple: owner-review prototype

Status: **prototype, awaiting owner sign-off.** Only the Pineapple is wired. Tiki, Krusty Krab
and the Bureau still open their DOM dialogs, and nothing changed for them.

This replaces the first prototype's full-screen floating card. The owner said that card "still
feels like a popup filling the whole screen". The card is still here, but now as a deliberate
secondary view, one tap away.

## The experience

1. **Arrival.** The visitor dives to the Pineapple and clicks it (or its beacon, or its LandmarkNav
   entry). The camera eases to the stop's framing, which shows the pineapple with room around
   it. It does not close in on a panel.
   - The bubble curtain rises.
   - The town dims at the edges only. The veil is a vignette with its blur masked to the rim, so
     the pineapple, the narrator and the bubbles stay clear and sharp.
   - The page chrome steps back: the landmark list, depth gauge, credits and title note fade to
     16%, and the floating beacons hide. Pointing at or tabbing into the list brings it back.
2. **The narrator swims in.** By default this is the Hamour guide (`<Narrator>` from
   `@qa3elhamor/world-feature`). It swims in from off screen on the left, settles beside the
   pineapple and turns three-quarter to the visitor.
3. **The speech bubble.** A comic bubble pops up with its tail pointing at the narrator's head:
   cream paper, an ink outline, a hard offset shadow and a yellow name tag ("The Hamour").
   - It types each line of `narration.landmarks.pineapple.lines`, pausing after punctuation.
   - While a line types, the narrator talks: squash-and-stretch, the jaw opens, and little breath
     bubbles rise from its mouth.
   - The untyped rest of the line is laid out but transparent, so the bubble never resizes while
     it types.
   - Progress dots show the line.
   - To advance: a click or tap anywhere on the bubble, Space or Enter on it, or **Next ›**.
     Advancing finishes a typing line first, then moves on. **Skip** jumps to the last line.
4. **The skill bubbles.** As the first line starts, the six skill groups from `content/site.json`
   drift out of the pineapple's door one after another.
   - Each is a real 3D sphere with a custom shader: a thin-film iridescent rim, a tinted core
     glow, a window highlight, a caustic shimmer drifting across it, and a jelly wobble. The
     shader is fog-aware.
   - They rise on an arc to their slots around the pineapple and bob there, each a different
     sea-glass colour.
   - Each carries its group label as crisp DOM. The label is a button the size of the bubble.
5. **Picking a bubble.** Point at a bubble (after a 140 ms rest), focus its label, or tap it.
   - The bubble grows 24% and brightens, and the others fade back.
   - The group's skills appear as chips. On desktop they sit in a small glass tray on the
     bubble's far side from the pineapple. On a phone they appear inside the narrator's bubble.
   - The narrator interrupts the tour with that group's `hints[groupId]` line, under a second
     tag naming the group.
   - **Back to the tour ›** resumes. A line the visitor had already read comes back whole; an
     interrupted line is typed again.
6. **End of the tour.** The last line typed out shows two actions:
   - **Open the full Citizenship Card**. The existing in-world card (`InWorldCard` +
     `CitizenshipCardInWorld`) flies out of the door over a darker sea, focus moves onto it, and
     **‹ Back to the guide** (or Esc) brings the guide back, with focus on the button that
     opened the card.
   - **Back to the dive**.
7. **Leaving.** "Back to the dive" (in the bubble or on the stage bar), Esc, or scrolling the page
   64 px:
   - The bubbles drift back into the door.
   - The narrator says its `farewell`, which types out, lingers a moment and fades.
   - The narrator then swims away up and to the left.
   - The dive is restored and focus goes back to the Pineapple's nav entry.
   - Re-opening before the narrator has left restarts the tour at once.
8. **Fallback, unchanged.** Under reduced motion, the low tier, or no WebGL, the kernel opens the
   existing Citizenship Card dialog (`inWorld` flag plus the presentation latched at open).
   The scene is not mounted.

Content is real: the owner's narration (`@qa3elhamor/content-data-access` `narration`) and skill
groups (`profile.skills`). Nothing is duplicated or hard-coded except the UI words listed under
open questions.

## Design decisions

- **Composed for the screen, placed in the world.** The visit is designed in screen terms: where
  on the viewport each thing sits, and how many pixels big it is, against the stop's resting
  view (`stopView`: the dive stop's eye and focus, plus the dive's own portrait pull-back,
  `framingScale`). It is then turned into world positions and sizes once (`pineappleLayout`).
  After that the narrator and bubbles are ordinary 3D objects: they get parallax from the
  camera's sway and stay put when the camera moves on, but they always land where the
  composition wants them.
  - There are two compositions: landscape, with the narrator on the left and bubbles arcing
    round the right, and portrait, with the narrator above the pineapple and bubbles around it.
  - Pixel sizes are clamped fractions of the viewport.
  - A slot that would sink under the seabed (low on a screen that looks down, as on phones)
    comes nearer along its own line of sight, so it keeps its screen spot and its pixel size
    (`pointAtScreenAbove`).
  - `libs/dive` was out of scope, and this needed no per-landmark framing from it.
- **Small, crisp DOM only where it earns its place.** The bubble, the labels and the chips are
  plain DOM in the landmark stage's scene slot, outside the aria-hidden canvas. They are not
  transformed, so the text is pixel-crisp. One drei `<Html>` root at the slot's origin holds all
  of it. The scene projects anchors every frame and writes `transform`s directly, with no React
  re-render per frame.
  - Bubble text is 18 px on desktop and 16 px on phones; tags, labels, chips and buttons are
    15 px.
  - The speech bubble is placed by `placeSpeechBubble`: above the anchor and kept on screen,
    with the tail leaning to keep pointing at the narrator. It hides if the narrator swims off
    screen.
  - The chips tray is placed by `placePanel`, on the bubble's outer side, falling back through
    the other sides.
- **Labels as the bubble.** Each label button covers its whole sphere, so pointing, tapping and
  tabbing share one target. The R3F meshes also take pointer events as a fallback.
- **Hover is real movement.** A label is hover-picked only on a mouse `pointermove` that has real
  movement. Without this, a bubble sliding under a resting cursor (the speech bubble shrinking
  after a hint, say) started an unwanted comment. Touch picks by tapping.
- **The full card is secondary.** It opens only from the end-of-tour action, with Skip one tap
  before it. Esc closes the card before it closes the landmark: a capture-phase listener calls
  `preventDefault`, and the stage respects `defaultPrevented`.
- **No new kernel capability.** `libs/landmarks` is untouched. The kernel already had
  everything this needed: the scene slot, `close`, the latched presentation, leave-on-scroll,
  autofocus and focus return.
- **Narrator in world units.** The landmark frame is in scene-world units (x20). A `WorldFrame`
  group cancels the frame's transform, so the narrator, bubbles and talk bubbles are in world
  units and axes. That is the space the cast heights are tuned for, and where facing the camera
  is natural.

## Cast config (`apps/web/src/app/narrators.config.ts`)

```ts
cast: { pineapple: 'hamour', tiki: 'hamour', 'krusty-krab': 'crab-clerk', bureau: 'sardine-president' },
useBundledCharacters: false,
bundled: { pineapple: spongebob-narrator, tiki: patrick-narrator, 'krusty-krab': spongebob-narrator, bureau: patrick-narrator } // heightFactor 1.9
```

- `narratorFor(landmark, config)` returns `{ kind: 'cast', cast }` or
  `{ kind: 'model', asset, heightFactor, fallback }`.
- `LandmarkNarrator` loads the model lazily: `useCompressedModel` behind Suspense, gated by
  `assetAllowed`, so the medium tier and up get it. It falls back to the original cast when the
  tier does not allow the model or the model fails to load.
- The model is drawn `height × heightFactor` tall. `<Narrator>` fits it by its measured height,
  which equals the manifest's `standingHeight` because the LODs stand on y = 0. That is the same
  as scaling by `desiredHeight / standingHeight`.
- **Preview without editing the file:** `?narrators=bundled` (or `=original`) in **development
  builds only** (`import.meta.env.DEV`). A production deployment cannot be flipped from the URL.
- The switch was tested: `shots/h-spongebob-desktop.jpg` shows SpongeBob at the Pineapple. He
  swims in T-posed (the LOD is unrigged), faces the visitor, squashes and stretches while
  talking, and the tag reads "SpongeBob". The default ships `false`.

## Files

Created (`apps/web/src/app/`):

- `narrators.config.ts`, `narrators.config.spec.ts`: the cast switch.
- `narrators/dialogue.ts` + `.spec.ts`: the dialogue state machine (tour, hint interrupt and
  resume, skip, last-line actions, farewell, reset).
- `narrators/typewriter.ts` + `.spec.ts`: code-point-safe typing pace with punctuation pauses,
  and the `useTypewriter` hook.
- `narrators/view-layout.ts` + `.spec.ts`: the screen-to-world maths (`viewFrame`,
  `pointAtScreen`, `pointAtScreenAbove`, `screenOf`, `worldPerPx`, `yawTowards`). The spec also
  covers `stopView`.
- `narrators/stop-view.ts`: the stop's resting view and seabed height, from `dive.config.ts`.
- `narrators/screen-placement.ts` + `.spec.ts`: `placeSpeechBubble` and `placePanel`.
- `narrators/speech-bubble.tsx` + `.css`: the comic bubble, generic.
- `narrators/landmark-narrator.tsx`: config choice to `<Narrator>`, with lazy model, tier gate
  and fallback. Also `speechAnchorOf`.
- `narrators/talk-bubbles.tsx`: breath bubbles while talking (one instanced draw).
- `narrators/narrator-copy.ts`: bubble UI words and narrator names (en/ar).
- `pineapple/pineapple-scene.tsx`: `createPineappleScene`, the visit's lifecycle, `WorldFrame`
  and the door.
- `pineapple/pineapple-hud.tsx` + `.css` + `.spec.tsx`: the DOM (bubble footer, labels, chips,
  card dim).
- `pineapple/pineapple-layout.ts` + `.spec.ts`: the two compositions and the placement, specced
  at 1440×900, 1280×720 and 390×844 (on screen, apart, above the seabed, clear of the bar).
- `pineapple/skill-bubbles.tsx`, `pineapple/skill-bubble-material.ts`: the 3D bubbles and their
  shader.
- `pineapple/skill-selection.ts` + `.spec.ts`: arrow-key travel (mirrored right-to-left) and
  hover intent.
- `pineapple/pineapple-copy.ts`: visit UI words (en/ar).

Modified:

- `landmarks.config.ts`: the pineapple's scene is now `'pineapple'`, registered with
  `createPineappleScene({ profile, copy, narration, narrator, stop })`, and the `overlay` is
  kept as the fallback.
- `overlays/citizenship-card/citizenship-card-in-world.tsx` and `index.ts`: removed
  `createCitizenshipCardScene`. It was replaced, not kept alongside. `CitizenshipCardInWorld` is
  unchanged and reused.
- `in-world/in-world-atmosphere.tsx`: sets `data-in-world` on `<html>` while an in-world
  landmark is open.
- `in-world/in-world-atmosphere.css`: the veil is now a clear-centred vignette with its blur
  masked to the rim, and the chrome fades and beacons hide under `data-in-world`.
- `app.spec.tsx`: the asset-count assertion reads `WEB_ASSETS.length` (10 now) instead of
  hard-coding 8. This edit is already in commit `5664a5c` (made by the orchestrator while this
  lane was running).

Not touched: `app.tsx`, which needed no change; `libs/**`; `content/**`; `tools/**`.

## Reusable for Tiki, Krusty Krab and the Bureau

| Piece | Reuse |
| --- | --- |
| `narratorFor` + `LandmarkNarrator` | Any landmark: `<LandmarkNarrator choice={narratorFor('bureau', NARRATORS)} … />`. |
| `dialogueReducer` + `SpeechBubble` + `useTypewriter` | Any landmark's tour. Hints are keyed by object id: Tiki job ids, Krusty dish ids. |
| `viewFrame` / `pointAtScreenAbove` / `stopView` | Compose any visit for its stop, in screen terms. Each landmark writes its own `*LayoutSpec`. |
| `placeSpeechBubble` / `placePanel` | Any DOM that follows something in the scene. |
| `TalkBubbles` | Every narrator. |
| `SkillBubbles` + `createSkillBubbleMaterial` | Project "message bottles" or menu dishes need a different mesh. The motion (door to slot, bob, select-grow) and the label/panel projection are the pattern to lift, into `narrators/` once a second landmark needs it. |
| `WorldFrame` / `doorOf` | Pineapple-local for now. Move them to `narrators/` with the second landmark. |
| `InWorldCard` | The Bureau's scroll as a "one tap away" view, the same way the card is used here. |

To convert another landmark:
1. Set `presentation: 'in-world'` and `scene: '<key>'`, keeping its `overlay` as the fallback.
2. Write a `create<Landmark>Scene` that mirrors `PineappleVisit`.
3. Add a layout spec.

`content/narration.json` already has lines, hints and farewells for all four landmarks.

## Accessibility

- **Opening.** The stage moves focus to its leave button, then onto the speech bubble as soon as
  it appears. The bubble is a `section` named by the narrator ("The Hamour"), with
  `aria-roledescription="speech bubble"` and `data-landmark-autofocus`. The capture logs
  `active: section.speech "The Hamour"`.
  - The bubble starts transparent, not `visibility: hidden`, so focus can land on it before its
    first placement. Hidden elements refuse focus; this was a bug found in round 1.
- **Lines.** The typed copy is `aria-hidden`. The whole line is in a polite `aria-live` element
  inside the bubble, so a screen reader hears each line once, whole. Progress is a list named
  "Line n of N".
- **Keyboard.** Tab order:
  1. The bubble's controls (Skip, Next, or the two actions).
  2. The skill labels, a list named "His specialties, as bubbles". Each is a button with
     `aria-expanded`, and `aria-controls` pointing at the chips tray or the in-bubble chips list.
  3. "Back to the dive".

  Arrow keys move between labels (Right/Down on, Left/Up back, mirrored right-to-left; Home and
  End go to the ends). Focusing a label selects it, and the narrator's comment is announced
  through the live region. Space or Enter on the bubble advances. Esc closes the card first,
  then the landmark.
- **Focus never drops to `<body>`.** When "Next" disappears on the last line, focus moves to
  "Open the full Citizenship Card". Closing the card returns focus there. Leaving returns focus
  to the Pineapple's nav entry.
- **Out of reach when not live.** The labels are `inert` while the bubbles are inside the door,
  while the card is open (they are also `display: none` then), and while leaving. The farewell
  bubble is `inert` and `aria-hidden`.
- **Decoration.** The 3D bubbles, talk bubbles, veil and curtain are inside the aria-hidden
  canvas or marked `aria-hidden`.
- **Reduced motion, low tier, no WebGL:** the dialog card, unchanged
  (`shots/i-low-fallback-*.jpg`, where focus is on its first link).

## Verification

- `npx nx run-many -t lint,typecheck,test -p landmarks-domain landmarks-feature landmarks-ui web --skipSync`:
  **all green** (lint, typecheck and test for all four projects).
- `npx nx run web:test --skipSync`: 23 files and 232 tests, all passing. That includes the fixed
  `app.spec.tsx` asset count. New specs:
  - dialogue, 11 tests
  - typewriter, 4
  - view-layout and stopView, 11
  - screen-placement, 7
  - pineapple-layout, 15 (three viewports)
  - skill-selection, 5
  - narrators.config, 4
  - pineapple-hud, 14 (bubble, typing, advance and skip, actions, hint and resume, farewell
    inert, card step-aside, labels list, focus, tap and arrow keys, real-movement hover, tray
    and in-bubble chips with `aria-controls`)
- Visual: `capture.mjs` (Playwright on swiftshader at 1–6 fps, so motion timings in the shots
  are slow) against `vite --port 4405`, `?quality=high`, `reducedMotion: 'no-preference'`.
  JPEG, desktop 1440×900 and phone 390×844.

### Screenshots (`shots/`)

| File | Shows |
| --- | --- |
| `a-arrival-*` | At the Pineapple stop, before clicking. |
| `b-narrator-arrives-*` | The Hamour arrived and the first line in its bubble, caught the moment the bubble is placed. The skill bubbles start leaving the door right after; at the capture's 1–2 fps they may not have appeared yet. |
| `c-mid-dialogue-*` | Line 2, all six bubbles out around the pineapple. |
| `d-bubble-selected-*` | "Architecture" picked: grown and bright, the others faded, its skills (a tray on desktop, in-bubble chips on the phone), and the narrator's hint under an "Architecture" tag. |
| `e-last-line-*` | The last line with "Open the full Citizenship Card" and "Back to the dive". |
| `f-full-card-*` | The full card over the darker sea, with "Back to the guide". |
| `g1-farewell-*` | Just after leaving: the farewell typing, bubbles gone back in, chrome back. The phone's is caught later (slow renderer), with the bubble fading. |
| `g2-after-leaving-*` | Dive restored, narrator gone. |
| `h-spongebob-desktop` | `?narrators=bundled`: SpongeBob narrating at the Pineapple (dev-only preview of the switch). |
| `i-low-fallback-*` | `?quality=low`: the existing dialog card. |
| `r1-*` | The first round, kept for comparison. Problems it showed: bubbles floating far above the pineapple and one over its door; a bubble hidden under the seabed on the phone; beacons and nav cluttering the scene; the tray covering the narrator on the phone; focus left on the stage button. |

The capture also logs the focus target at each step, a scroll-away leave (which ends at the
farewell with focus on the nav entry), and the Esc-closes-card-first check (focus back on
"Open the full Citizenship Card").

The dev server on 4405 was stopped at the end. The first one hit its background time limit; a
second one could not bind the port because the first was still serving; the leftover Vite
process was then stopped by PID.

## Open questions for the owner

1. **Sign-off on the look and flow:**
   - the comic bubble and its typing pace (42 characters a second, with pauses)
   - the bubble colours, and their placement: an arc on the right on desktop, a ring on the phone
   - selected skills shown in a tray on desktop and inside the speech bubble on phones
   - the full card only at the end of the tour, with Skip one tap before it. Alternative: a small
     "Full card" link always in the bubble.
2. **Narration copy.**
   - Line 4 says "The card lists his underwater specialties. Pick one…". The specialties are now
     the bubbles, so it should be something like "Those bubbles are his specialties. Pick
     one…". `content/**` was out of scope; this goes to the content lane.
   - The new UI words are hard-coded in en/ar (`narrator-copy.ts`, `pineapple-copy.ts`): Next,
     Skip, Back to the tour, Open the full Citizenship Card, Back to the guide, the skills list
     name. They move to `content/site.json` copy keys after sign-off.
3. **The pineapple's look while open.** The kernel's hover tint stays on while focused, which
   washes the pineapple a little flat (`b`–`e`). A softer "focused" tint is a small kernel
   option (`LandmarkLayer`), but the kernel was left untouched for this.
4. **Two Hamours.** The ambient Hamour sometimes swims through while the guide Hamour talks
   (`g1-farewell-desktop`). Hiding the ambient one while a Hamour narrates needs a `libs/world`
   hook (out of scope).
5. **SpongeBob/Patrick.** They are T-posed and unrigged, and their mouth is a texture, so they
   "talk" by squash-and-stretch only. Enable them on your own deployment only, accepting the IP
   risk explained in `scope-decisions.md`. If a bundled model fails to load, the tag would
   still say "SpongeBob" over the Hamour fallback. That is a rare path, noted for the rollout.
6. **Arabic.** All the new words have Arabic, but the page's locale is fixed to `en` today, so it
   is not exercised in the shots.

## Notes for other lanes (not done here; out of scope)

- **content:** reword pineapple line 4 (above). Copy keys for the new UI words after sign-off.
- **world:** an ambient-life hook to keep the ambient Hamour out of shot while a Hamour narrates.
  A fog pull-in to replace the DOM veil (as in the first prototype's notes).
- **dive:** `release({ keepScroll: true })` so a scroll that leaves the landmark also advances the
  dive. This was noted in the first prototype and is unchanged.

## Revision 1 (review `code-review-agy.md`, REVISE 6/10)

| # | Fix | Where | Spec |
| --- | --- | --- | --- |
| 1 | **The selection has one source of truth: the dialogue state.** `DialogueState.selected` replaces the scene's own `useState`. The event `hint` became `select`. `resume`, `skip`, `farewell` and `reset` clear the selection, and so does any `advance` out of a hint, because it goes through `resume`. Advancing with Space, Enter or a click on the bubble now un-highlights the 3D bubble, un-dims the others and closes the desktop tray. | `narrators/dialogue.ts`; `pineapple/pineapple-scene.tsx` (`selected = dialogue.selected`; `onPick` dispatches `select`) | `dialogue.spec.ts` "selects with the hint, and clears the selection however the tour resumes" |
| 2 | **A group with no hint still shows its skills.** `select` on an id with no hint selects it without a comment. The tour line stays, or, if another group's comment was showing, the narrator goes back to the tour. The chips follow `selected`, not the hint: the tray on desktop, inside the speech bubble on a phone (in both footers, the actions one included). `aria-controls` follows the chips. | `dialogue.ts` (`select`); `pineapple-hud.tsx` (`panelShown` and `chips` from `selectedGroup`) | `dialogue.spec.ts` "selects an object with no hint…"; `pineapple-hud.spec.tsx` "shows the skills of a group the narrator has nothing to say about, on desktop and phone" |
| 3 | **Picks by pointer type and readiness.** `acceptsPick(source, pointerType, progress)`: hover counts for a mouse only, so touch and pen pick by tapping; nothing counts while a bubble is under `PICKABLE_FROM` (0.8) out of the door. Used by the R3F meshes. The DOM labels also get `pointer-events: none` until a bubble is pickable, and already hover only on real mouse movement. | `pineapple/skill-selection.ts`, `skill-bubbles.tsx` | `skill-selection.spec.ts` "acceptsPick" |
| 4 | **Reduced motion in the typewriter.** `useTypewriter(…, { instant })` shows the whole line at once and still calls `onTyped` exactly once per take. `SpeechBubble` and `PineappleHud` take `reducedMotion` from the scene: no typing, no caret, no pop and no fade. | `narrators/typewriter.ts`, `speech-bubble.tsx` + `.css`, `pineapple-hud.tsx` | `typewriter.spec.ts` "useTypewriter" (3 tests); `pineapple-hud.spec.tsx` "under reduced motion…" |
| 5 | **Breath bubbles sized to the rendered narrator.** They use `narratorRenderedHeight` (bundled `heightFactor` included) for size and position. `mouthOf` puts them high and close to the face on a standing character, and low and forward on a fish. | `narrators/landmark-narrator.tsx` (`mouthOf`); `pineapple-scene.tsx` | `landmark-narrator.spec.ts` |
| 6 | **The name tag follows who is on screen.** `LandmarkNarrator onPlaying` reports what actually plays: the model once it loads, or `fallbackOf(choice)` when the tier gate or a load failure puts the cast on. The scene then uses that for the speaker name, the speech anchor and the breath bubbles. | `landmark-narrator.tsx` (`onPlaying`, `fallbackOf`, boundary `onFallback`); `pineapple-scene.tsx` (`playing`) | `landmark-narrator.spec.ts` (`fallbackOf`) |

Verification:
- `npx nx run-many -t lint,typecheck,test -p landmarks-domain landmarks-feature landmarks-ui web --skipSync --skip-nx-cache`:
  all targets succeed.
- web has 24 test files and 246 tests (was 232).
- `capture-rev1.mjs`, run on my own port 4406, never the owner's 4400, retook the `d` shots and
  added `d2`:
  - `shots/d-bubble-selected-*.jpg`: "Architecture" selected (hover on desktop, tap on the phone),
    its skills showing and the narrator's comment under the "Architecture" tag.
  - `shots/d2-back-to-tour-*.jpg`: two presses of Space on the bubble, the first finishing the
    comment and returning to the tour, the second going on to line 2. The selection is gone on
    screen: every bubble is back to the same size and brightness, and the tray (desktop) and
    in-bubble chips (phone) have closed. The capture logs `selected: []`, `panel: null`,
    `chips: null` and `stage: tour`, with focus on the bubble.
  - The script waits until every bubble is pickable before it hovers. At swiftshader's 1–2 fps
    that takes several seconds, which is exactly the new "not while flying out" guard at work.
- Dev server on 4406 stopped. `content/**` was not touched (the orchestrator is rewording line 4).
