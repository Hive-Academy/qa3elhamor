# diegetic-overlays: Pineapple prototype

Status: **prototype, awaiting owner sign-off.** Only the Pineapple is converted. Tiki, Krusty
Krab and the Bureau still open their DOM dialogs (pinned by `landmarks.config.spec.ts`).

## What the visitor sees

Dive to the Pineapple. Click it, its beacon, or its LandmarkNav entry:

1. **Bubble curtain.** About 44 bubbles rise up the screen (about 1.2 s). At the same time the
   rest of the town **dims into the fog**: a veil in the world's fog colour, darkest at the
   edges, with a slight blur and desaturation.
2. **The card floats out of the door.** It starts tiny at the pineapple's base, on the side
   facing the camera (the door side), tumbling a little (yaw about 50°, roll about -17°). It
   then eases out over 1.25 s, carried slightly upward by the current, and settles in front of
   the camera. The camera swims to the stop meanwhile, and the card holds its place on screen.
3. **Settled.** It bobs gently in the current: a few pixels of drift, under 1.2° of yaw. A
   caustic light net drifts slowly across the laminate (CSS, `soft-light`). When you point at
   it or tab into it, the current calms and the card holds perfectly still for reading.
4. **Front (identity).** Issuer band, portrait/emblem, name, occupation, residence, civil
   status with the Arabic motto, the GitHub/LinkedIn/Email links and the citizen's statement
   (bio). At the foot is a decorative passport machine-readable zone (`IDQEHKHALIL<<ABDALLAH<<<…`).
   On wide screens it is a landscape ID card: identity on the left, statement on the right.
5. **"Turn over: visa stamps"** (or ←/→ while the card has focus) turns the card about its
   vertical axis (720 ms). The **back** is the skills as visa stamps from Qaa El-Hamour border
   control. Each skill group is a double-ruled ink stamp, with varied ink, shape and angle, and
   the skills are inked chips inside it.
6. **Leave** by any of: the sonar-ping **"Back to the dive"** pill at the bottom, **Esc**, or
   **scrolling the page away** (64 px). The card flies back into the door (0.55 s) and fades,
   the veil lifts, and the dive resumes from where it was.

On a phone (390×844) the card fills the width (370 CSS px, 730 tall). Its faces scroll
internally (`overscroll-behavior: contain`, so scrolling the card never closes it).

Content is the owner's real profile from `content/site.json` through the same parts as the
dialog card. No content was duplicated.

## Design decisions

- **Crisp text.** drei `<Html transform>` draws one CSS px as `distanceFactor/400` world units
  under a CSS perspective of the camera's focal length in px. The rig therefore poses the
  settled card at the exact world scale where one CSS px is one screen px
  (`htmlScaleFor(depth, focalPx)`), so the browser rasterises the text at its own size. The
  capture measures `getBoundingClientRect().width / offsetWidth` = **1.0000** at both
  viewports. Responsive size is plain CSS (`min(54rem, 100vw - 1.25rem)`), so on a phone the
  "camera leans in" until the card fills the viewport, at the same pixel-exact scale. All text
  on the in-world card is ≥ 14 px; body text is 16 px.
- **Accessible real DOM outside the aria-hidden canvas.** drei's default target is the canvas
  container, which is `aria-hidden`. The kernel now gives every in-world scene a **scene slot**
  outside the canvas, inside the open landmark's named region. The card portals there
  (`<Html portal>`).
- **No `occlude`.** The card always sits in front of the camera, between it and the town, so
  raycast occlusion would only cost frames. `occlude` would matter for in-world content that
  stays attached to a model (a menu board on the Krusty Krab). The rig leaves it to such scenes.
- **Flip without `backface-visibility`.** Under drei's CSS matrix chain, Chromium judges the
  facing side the wrong way round: the mirrored back showed on the front. The faces swap
  `visibility` at the half-turn, under symmetric easing, and the hidden face is `inert`.
- **Town dimming is a DOM veil, not fog maths.** Changing the world's fog would mean editing
  `libs/world` (out of scope). A veil also dims the page chrome (nav, credits, depth gauge)
  behind the card. A true in-scene fog pull-in could replace it later (see open issues).
- **Fallback is a runtime choice in the kernel.** `presentation: 'in-world'` keeps `overlay:
  'pineapple'`. With `inWorld` off, the kernel opens that dialog instead and does not mount the
  scene.

## Reusable for Tiki, Krusty Krab and the Bureau

| Piece | Where | Reuse |
| --- | --- | --- |
| `effectivePresentation(definition, inWorld)` | `libs/landmarks/domain` | Any `in-world` landmark with an `overlay` falls back to it automatically. |
| `LandmarkProvider inWorld` | `libs/landmarks/feature` | Already wired in `app.tsx` from `inWorldAvailable({ reducedMotion, tier, webgl })` (`apps/web/src/app/in-world/in-world-mode.ts`). |
| `LandmarkStage` (replaces `LandmarkReturnBar`) | `libs/landmarks/ui` | Named non-modal region, scene slot, sonar-ping leave pill, Esc, leave-on-scroll (close reason `scroll`), focus in (`data-landmark-autofocus`) and focus return. |
| `LandmarkSceneProps.sceneLayer` / `title` | `libs/landmarks/feature` | The portal target for any scene's real DOM. |
| `useFocusedLandmark()` | `libs/landmarks/feature` | Page chrome that reacts to an open in-world landmark. |
| `InWorldCard` rig | `apps/web/src/app/in-world/in-world-card.tsx` | Door-to-camera flight, pixel-exact settle, bob with calm-on-hover/focus, exit back to the door, inert while leaving. Takes `bounds`, `doorHeight`, `depth`, `liftPx`, `timing` and render-prop children. The Krusty Krab menu or the Bureau's complaint scroll can use it as is. |
| Pose maths | `apps/web/src/app/in-world/in-world-pose.ts` | Pure and specced: `focalLengthPx`, `htmlScaleFor`, `worldPerPixel`, timeline easing, `bobAt`, `facingPoint`. |
| `InWorldAtmosphere` | `apps/web/src/app/in-world/in-world-atmosphere.tsx` | Veil and bubble curtain for every in-world landmark, already mounted in `app.tsx`. |

Converting another landmark: set `presentation: 'in-world'` and `scene: '<key>'` (keep its
`overlay` as the fallback), and register a scene in `LANDMARK_SCENES` that renders
`<InWorldCard open={phase === 'focused'} sceneLayer={sceneLayer} bounds={bounds}>`. The DOM it
renders should mark one element `data-landmark-autofocus`.

## Accessibility behaviour

- **Opening.** Focus moves first to the stage's leave button, then onto the card `article`
  (named by its title, `tabIndex=-1`, `data-landmark-autofocus`) as soon as its DOM arrives,
  unless the visitor has already moved focus. The stage is `role="region"` named "The
  Pineapple". Tab order is card links, the flip control, then "Back to the dive". Nothing is
  made inert: the region is non-modal, and the nav can switch to another landmark.
- **The two faces.** The turned-away face is `inert` (and `visibility: hidden`), so Tab and
  screen readers reach only the visible side. A turn is announced through a polite
  `role="status"` ("Showing the back of the card: visa stamps.").
- **Closing.** Esc anywhere, the leave pill, or scrolling away closes it. Focus returns to the
  opener, or to the landmark's LandmarkNav button when the opener was the canvas (verified in
  the browser: focus lands on `button.lmk-index__item` "The Pineapple"). While it flies back,
  the departing card is `inert` and `aria-hidden`.
- **Decoration.** The MRZ, the bubbles and the veil are `aria-hidden`.
- **Fallbacks.** Reduced motion, `?quality=low` (or a governor drop to low) and no WebGL open
  the existing `createCitizenshipCardOverlay` dialog, unchanged. The capture verifies it: the
  dialog is named "The Pineapple" and focus goes to its first link.
- **Bug found and fixed.** React restores focus after a commit to an element that is still in
  the document, and the departing card still is. That pulled focus back into the card after
  close, and then dropped it on `<body>` when the card went inert. The stage now returns focus
  in a passive-effect cleanup, after React's restore.

## Files

Kernel (`libs/landmarks`, generic, documented in `libs/landmarks/README.md`):

- MODIFIED `domain/src/lib/landmark-definition.ts`: `effectivePresentation`; the `overlay` doc now covers the in-world fallback.
- MODIFIED `domain/src/lib/landmark-interaction.ts`: `CloseReason` gains `'scroll'`.
- CREATED `domain/src/lib/landmark-definition.spec.ts`
- CREATED `ui/src/lib/landmark-stage.tsx` and `.css`; DELETED `ui/src/lib/landmark-return-bar.tsx` and `.css` (replaced, not kept alongside).
- MODIFIED `ui/src/index.ts`, `ui/src/lib/landmark-overlay-host.spec.tsx` (stage specs: region, slot persistence, autofocus into the scene, leave-on-scroll).
- MODIFIED `feature/src/lib/landmark-context.tsx`: `inWorld` prop, scene-layer state, `useEffectivePresentation`, `useFocusedLandmark`.
- MODIFIED `feature/src/lib/landmark-dom.tsx`: effective presentation, `LandmarkStage`, `leaveOnScroll`.
- MODIFIED `feature/src/lib/landmark-layer.tsx`: `sceneLayer` and `title` scene props; a fallen-back in-world scene is not mounted.
- MODIFIED `feature/src/lib/landmark-dom.spec.tsx`: in-world stage versus dialog fallback; scroll-away close and focus return.
- MODIFIED `README.md`

App (`apps/web/src/app`):

- CREATED `in-world/in-world-mode.ts`, `in-world/in-world-pose.ts`, `in-world/in-world.spec.ts`
- CREATED `in-world/in-world-card.tsx` and `.css` (the rig)
- CREATED `in-world/in-world-atmosphere.tsx` and `.css` (veil and bubble curtain)
- MODIFIED `overlays/citizenship-card/citizenship-card.tsx`: split into exported parts (`CitizenCardBand`, `CitizenIdentity`, `CitizenLinks`, `CitizenBio`, `CitizenStamps`). The dialog card's markup is unchanged and its spec is untouched and green.
- CREATED `overlays/citizenship-card/citizenship-card-in-world.tsx`, `.css` and `.spec.tsx`
- MODIFIED `overlays/citizenship-card/index.ts`, `landmarks.config.ts` (pineapple `presentation: 'in-world'`, `scene: 'pineapple-card'`, `overlay` kept as the fallback) and `landmarks.config.spec.ts`
- MODIFIED `app.tsx`, three surgical edits only: the `readDeviceCapabilities` import plus two in-world imports; `Landmarks` takes and passes `inWorld`; `<InWorldAtmosphere />` before `<LandmarkOverlays>`.

Not touched: `libs/dive/**`, `libs/world/**`, `dive.config.ts`, `content/**`.

## Verification

- `npx nx run-many -t lint,typecheck,test -p landmarks-domain landmarks-feature landmarks-ui web --skipSync`:
  all green. Tests: 62 across the three landmark libraries, 122 in web.
- Visual: `capture.mjs` (Playwright, swiftshader) against `vite --port 4403`, with
  `?quality=high` and `reducedMotion: 'no-preference'`. The mid-transition frame uses a
  slow-motion hook in the script: page clock and CSS animations at 0.12×.

Screenshots (`shots/`), each at `-desktop` (1440×900) and `-phone` (390×844):

| File | Shows |
| --- | --- |
| `a-before-*` | At the Pineapple, before opening |
| `b-transition-*` | Mid-flight: the card tumbling out of the door through the bubble curtain, town dimming |
| `c-front-*` | Settled front (identity), pointer on the card (calm) |
| `d-back-*` | Back: visa stamps |
| `e-closed-*` | After Esc: dive restored, focus on the Pineapple nav button |
| `f-low-fallback-*` | `?quality=low`: the existing dialog card |

The script also logs a scroll-away check (wheel 300 px, then the stage is closed and focus is
back on the nav) and the focus target and screen scale at each step.

## Open issues and decisions for the owner

1. **Sign-off on the look.** Landscape card on desktop and portrait on phone; visa stamps;
   sonar-ping leave pill; dimming strength. Say if any of it should change before the other
   three landmarks follow.
2. **New copy is hard-coded** in `IN_WORLD_CARD_COPY` (en/ar): "Turn over: visa stamps",
   "Visa stamps", "Border control of Qaa El-Hamour · Entry stamps", and the announcements.
   After sign-off these move to `content/site.json` copy keys. `content/**` was out of scope.
3. **Leave on scroll restores the pre-open scroll.** `dive.release()` snaps the page back to
   where the visitor clicked, so a wheel that closes the card does not also advance the dive;
   the next scroll does. Carrying that scroll through needs a `libs/dive` change, for example
   a `release({ keepScroll: true })` or using `scrollToWaypoint`.
4. **The door is inferred**: the side of the pineapple's bounds facing the camera, 16% up. It
   reads right from the stop's framing. A marked door point (a model node or an explicit
   `door` in the scene registration) would be exact for any camera.
5. **Fog-true dimming.** The veil is DOM. A real fog pull-in (fog density eased up while
   in-world is open) needs a small `libs/world` hook, for example an `OceanWorld` prop or a
   fog context. That belongs to the world owner.
6. ~~**Live tier changes.**~~ Resolved in Revision 1: the presentation is now latched when a
   landmark opens.
7. **No-WebGL** is wired through `readDeviceCapabilities().webgl`, but the page has no canvas
   failure boundary yet (a11y-fallback item). Without WebGL, the dialog path is what the
   a11y-fallback item has to keep reachable.
8. **Shared CSS.** The in-world card restates the dialog shell's `--lmk-*` colours, because
   the shell sets them on `.lmk-overlay`. A shared theme scope would remove the duplication.

## Revision 1 (review `code-review-agy.md`, REVISE 6/10)

| # | Fix | Where |
| --- | --- | --- |
| 1 | **Presentation latched at open.** The provider records the effective presentation in the interaction's `open` effect, against the `inWorld` flag committed at that moment. It clears the latch on that landmark's `close`. While a landmark is open, everything asks `presentationFor()`, so a governor drop to `low` (or reduced motion turning on) never swaps the open card for the dialog, or the reverse. The change applies to the next opening. | `libs/landmarks/feature/src/lib/landmark-context.tsx:145-172` (latch), `:94` (`presentationFor`); used at `landmark-dom.tsx:62` and `landmark-layer.tsx:277` (via `useEffectivePresentation`). Spec: `landmark-dom.spec.tsx:248`. |
| 2 | **Switch-safe focus return.** The stage takes `openId`, so a switch is a new opening of the same stage. Each opening bumps a generation, and a superseded opening's cleanup returns nothing (`:151`). The cleanup also returns nothing when a modal dialog already holds focus, as on a switch to a dialog landmark (`:155`). On a switch the opener is whatever has focus now (the nav entry the visitor used); it falls back to the first opener when focus sits in the departing scene or the canvas (handoff at `:139`). The autofocus no longer picks the previous scene's still-live card (`:110`). | `libs/landmarks/ui/src/lib/landmark-stage.tsx`; `openId` passed from `landmark-dom.tsx`. Specs: `landmark-dom.spec.tsx:282` (in-world to dialog: focus stays in the dialog, then returns to its nav entry) and `:299` (in-world to in-world: focus on the new stage, then returns to the newer opener). Browser check: `g-switch-to-dialog-*` puts focus on the Tiki dialog's close button; after Esc it is on the Tiki nav entry. |
| 3 | **No NaN or Infinity.** `focalLengthPx`, `htmlScaleFor` and `worldPerPixel` return 0 for any non-finite or ≤ 0 input. The rig keeps its last good pose when the focal length or the resulting scale is unusable, and never writes Infinity or NaN into the matrix. | `apps/web/src/app/in-world/in-world-pose.ts:16,34,49`; `in-world-card.tsx:291,314`. Spec: `in-world.spec.ts` ("never yields NaN or Infinity"). |
| 4 | **Phone scroll affordance.** Each face's content sits in a viewport. When it overflows, it shows a bottom fade and a bobbing chevron disc in the corner (clear of the text), which disappear at the end. The content becomes a named, keyboard-scrollable region (`role="region"`, an `aria-label` per face, `tabIndex=0`), but only when it actually overflows, so desktop gains no empty tab stop. On phones the decorative MRZ is hidden and the portrait tightened, so five lines of the statement show before the fade (was two). | `citizenship-card-in-world.tsx:201` (`overflowOf`, specced), `:219` (`ScrollingFace`); `citizenship-card-in-world.css:82-140`, `:467`. Shots: `c-front-phone.jpg`, `d-back-phone.jpg`. |
| 5 | **Re-open while leaving turns round.** `emergeProgress(elapsed, timing, from)` continues from the current flight progress, with no curtain delay, over a proportionally shorter time. The rig keeps the same door. | `in-world-pose.ts:84`; `in-world-card.tsx:262`. Spec: `in-world.spec.ts` ("turns round from where it was"). |
| 6 | **`bobAt` allocates nothing.** It writes into a caller's scratch (`createBob()`), held at module level in the rig. | `in-world-pose.ts:119`; `in-world-card.tsx:286`. Spec: "writes the bob into the scratch". |
| 7 | **Contact adapter wired.** The bureau uses `createContactSubmitter(import.meta.env)`; the doc comment says delivery goes through the provider chosen by `VITE_CONTACT_PROVIDER` (unset or `none` → pending, which sends nothing). The `pendingSubmitter` import is removed. | `apps/web/src/app/landmarks.config.ts:18,77-87`. `landmarks.config.spec.ts` green. |

Not changed, noted for later:
- **Scroll-away restores the pre-open scroll.** That is `libs/dive` (open issue 3).
- **Touch-momentum grace for leave-on-scroll.** This is the review's failure mode 4. It is not in the coordinator's list, and it would need a fake clock in the specs; it is a candidate for round 2.
- **Arabic-only names give an empty MRZ name.** `profile.name.en` is required by the content model, so this does not occur today.

Verification:
- `npx nx run-many -t lint,typecheck,test -p landmarks-domain landmarks-feature landmarks-ui web --skipSync --skip-nx-cache`: all green.
- During the run, `contact-submitters.spec.ts` (the other lane's in-flight file) briefly failed two tests and was green on the final run.
- New shots (JPEG): `c-front-*`, `d-back-*`, and `g-switch-to-dialog-*`, which shows the card open, then Tiki opened straight from it, with focus in the Tiki dialog.
- `capture.mjs` now also logs `focusInDialog`, the overflow hints and the scroll regions.
- The dev server on 4403 is stopped. A first-round Vite process had outlived its task stop; it was killed by PID.
