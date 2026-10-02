# Narrated visits (`apps/web/src/app/narrators/`)

A landmark's in-world presentation, the way the owner signed it off on the Pineapple: you open the
landmark, a narrator swims up beside it and talks in a comic speech bubble, and the landmark's
content comes out around it as 3D objects. Pointing at an object (or tabbing to its label) shows
its detail, and the narrator comments on it. The landmark's full view is one tap away at the end of
the tour. When you leave, the narrator says goodbye and swims off.

The kit does all of that. A landmark supplies only:

- its narration;
- its content objects (DOM views, a layout, a 3D component);
- its full view.

Built on it today: the Pineapple (`pineapple/`: skills as bubbles), the Tiki (`tiki/`: jobs as
stone tablets) and the Krusty Krab (`krusty-krab/`: services as rows on a flipping menu board).

The Complaints Bureau (`bureau/`) is not an object tour: its full view is a form with a
performance of its own (a scroll out of a pneumatic tube, a stamp, a bottle). It composes the
kit's parts directly: `dialogueReducer`, `visitScript`, `useVisitLifecycle`, `LandmarkNarrator`,
`TalkBubbles`, `WorldFrame`, `SpeechBubble`, `useNarratorPost`, and `useSpeechBubblePlacement`
(exported from `narrated-visit.tsx` for this; it keeps the bubble over the narrator and inside
the window). Its comments are not about objects: the President's line after a filing goes
through the dialogue's `select` with a hint id (`hints: filedLines(copy)`, content: `content/site.json` → `copy.complaintFiled*`).

## Add a narrated visit in 5 steps

1. **Cast.** `NARRATOR_CAST` in `src/site.config.ts` already names a narrator for every
   `NarrationLandmarkId` (`cast`). A bundled model is optional, in `bundled`.
2. **Objects.** Map your content to `VisitObject[]` (`visit-types.ts`), one per 3D object. Each
   one has:
   - `label`;
   - optional `caption` lines, under the label on the object;
   - `topic`, the bubble's tag while the narrator comments on it;
   - `detailLabel`;
   - optional `notes` (sentences) and `chips`.
3. **Layout.** Write `<landmark>Layout(view, count, ground) => VisitLayout<Slot>`. Compose it in
   screen terms for the stop's resting view, then place it in the world. Use these helpers:
   - `placeNarrator(view, NarratorSpec, ground)` for the narrator (and, optionally, for
     `narratorAlternatives`: other spots, in order, for when the town hides the first);
   - `pixelSize`;
   - `pointAtScreenAbove` for floating things (`view-layout.ts`);
   - `groundPointAtScreen` for things standing on the sand.

   `isPortrait(aspect)` picks between your two compositions. Spec the layout at 1440×900,
   1280×720 and 390×844: everything on screen, everything apart, nothing under the seabed, all of
   it clear of the 86 px stage bar. `tiki/tiki-layout.spec.ts` is the template.
4. **3D objects.** A component taking `VisitObjectsProps<Slot>`. In its `useFrame`:
   - animate the objects out (`out`) and back;
   - highlight `selected` and fade the others;
   - call `placeObjectDom(...)` once per object, so its label (and the selected one's panel)
     follows it.

   Gate mesh pointer events with `acceptsPick(source, pointerType, progress)`. The patterns to
   copy are `pineapple/skill-bubbles.tsx` and `tiki/stone-tablets.tsx`.
5. **Scene.** Call `createNarratedVisitScene<Slot>({ ... })` in `<landmark>/<landmark>-scene.tsx`,
   then register it in `landmarks.config.ts`:
   - `presentation: 'in-world'`, `scene: '<key>'`;
   - keep `overlay`: the dialog fallback for reduced motion, the low tier and no WebGL;
   - add the `LANDMARK_SCENES` entry.

```tsx
createNarratedVisitScene<MySlot>({
  narration: narration.landmarks['krusty-krab'],
  hints: 'narration',                 // or Record<objectId, LocalizedText> from content
  narrator: narratorFor('krusty-krab', NARRATORS),
  stop: stopView('landmark-krusty-krab'),
  objects: (lang) => menuObjects(serviceItems, lang),
  layout: krustyLayout,
  Objects: MenuDishes,
  shape: 'round',                     // label shape over the objects: 'round' | 'slab'
  doorHeight: 0.16,                   // where objects come from on the model (fraction of height)
  fullView: { render: ({ locale, dir }) => <ServicesMenu … />, icon: <span … /> },
  words: KRUSTY_VISIT_COPY,           // bilingual({ en, ar }): { openFull, objectsList }; register it in i18n/ui-strings.spec.ts
});
```

## The API

| Piece | What it does |
| --- | --- |
| `createNarratedVisitScene(definition)` (`narrated-visit.tsx`) | Turns a `NarratedVisitDefinition<Slot>` into a `LandmarkSceneProps` component. It handles the narrator (`LandmarkNarrator`, with its model or fallback cast), the breath bubbles, the `WorldFrame` and door, the speech bubble and its placement, the HUD, and the full view (`InWorldCard`). |
| `NarratedVisitDefinition` (`visit-types.ts`) | `narration`, `hints?`, `narrator`, `stop`, `objects(lang)`, `layout(view, count, ground)`, `Objects`, `fullView { render, icon?, doorHeight?, liftPx? }`, `words`, `shape?`, `doorHeight?`. |
| `HintSource` / `visitScript` (`visit-script.ts`) | Comments come from either `'narration'` (the landmark's `hints` in `content/narration.json`, keyed by object id) or a record of `LocalizedText` by object id supplied by the content. The Tiki uses each job's `quip`. An object without a comment is still selectable: its detail shows and the tour line stays. |
| `dialogueReducer` (`dialogue.ts`) | Tour, hint interrupt and resume, skip, last-line actions, farewell, reset. `selected` is the one source of truth for the selection. |
| `useVisitLifecycle`, `useObjectPicking`, `useFullView` (`visit-hooks.ts`) | Arrive, farewell, swim off. Hover intent. Esc closes the full view before it closes the landmark. |
| `VisitHud` (`visit-hud.tsx` + `.css`) | The DOM. It holds the speech bubble and its footer: dots, Skip, Next, Back to the tour, and the last-line actions "open the full view" and "Back to the dive". It also renders the objects' label buttons (the accessible list that mirrors the 3D objects, with arrow keys and Home/End) and the detail. The detail is a tray beside the object on wide screens, and inside the bubble below 640 px. |
| `placeObjectDom`, `screenPointOf` (`object-dom.ts`) | Per frame: label transform, opacity, pointer readiness, `--object-w`/`--object-h`, and panel placement (`panelSide` sets a preferred side). |
| `objectKeyStep`, `pickDelay`, `acceptsPick`, `PICKABLE_FROM` (`object-selection.ts`) | Selection rules. |
| `placeNarrator`, `groundPointAtScreen`, `pixelSize`, `isPortrait` (`visit-layout.ts`); `viewFrame`, `pointAtScreen(Above)`, `screenOf`, `worldPerPx`, `yawTowards` (`view-layout.ts`); `stopView` (`stop-view.ts`) | Composition maths. |
| `placeSpeechBubble`, `placePanel`, `windowSafeInsets` (`screen-placement.ts`) | Keeping DOM next to scene things, on screen. `placePanel` takes an `extent` for non-round things and a `prefer`red side. The kit grows the bubble's insets with `windowSafeInsets`, so it stays 12 px inside the browser window even when the stage layer does not match the window; the tail re-aims at the narrator after the clamp (`tailSkewDegrees`: a positive lean is a positive `skewX`). `useSpeechBubblePlacement` reads no layout in its frame loop: the bubble's size and its layer's box are measured when the bubble appears and again on ResizeObserver, window resize or scroll. |
| `chooseNarratorPlacement`, `inSight`, `narratorOnScreen`, `nearerPlacement`, `sceneOccluders` (`narrator-post.ts`) | Keeping the narrator seen. As the visit opens (and on resize), the kit tries the layout's `narrator`, then its optional `narratorAlternatives`, then the first spot again nearer the visitor (same place on screen, same size there). It takes the first that is whole on screen and in sight: no visible, opaque, non-instanced scene mesh outside the visit between the eye and the narrator's middle, head and sides. Failing that, the first in sight; failing that, the nearer spot. A landmark whose first spot is clear is unchanged. The Krusty Krab supplies one alternative (over the restaurant) because the Chum Bucket stands at the left of its view. Models may still stream in when the visit opens: until the narrator has settled, the kit counts the scene's occluders twice a second and chooses again when the count changes (the narrator is still swimming in, so it swims to the better spot); once settled, the choice holds. A visit that composes the kit's parts itself calls `useNarratorPost(layout, view, mounted, visitRoot, settled)` (`narrated-visit.tsx`), with `visitRoot` a group round everything it draws. |
| `useVisitAutoplay`, `VisitAutoplayContext`, `autoplayStep`, `readingMs` (`visit-autoplay.ts`) | Hands-free visits, for the cinematic tour (docs/tour.md). With a `VisitAutoplay` provider reporting `playing` for the visit's landmark, a typed line waits a reading time (900 ms + 45 ms a character, 2–7 s, Arabic alike) and advances; after the typed last line (plus `CONTENT_DWELL_MS` for an object tour) the visit reports `finished`. `paused` and `held` (the full view, the Bureau's scroll or wall) wait. No provider: every visit is manual, as before. Both the kit and the Bureau call it. |
| `narratorName` (`narrator-copy.ts`) | The tag follows who is actually on screen. `LandmarkNarrator onPlaying` reports the fallback cast when the tier gate or a load failure puts it on. |

## Rules the kit already keeps (don't undo them)

- **Text.** Bubble text is 18 px (16 px on phones). Tags, labels, chips and buttons are 15 px.
  The typed copy is `aria-hidden`; the whole line is in a polite live region.
- **Focus.**
  - The bubble is the stage's autofocus target.
  - Focus never drops to `<body>`: the last line's actions take it, and closing the full view
    returns it to "open".
  - Labels are `inert` while the objects are away, while the full view is open, and while
    leaving.
- **Picking.** Hover picks only on a real mouse movement. Touch and pen pick by tapping. Nothing is
  pickable while it is still arriving.
- **Reduced motion, the low tier, no WebGL.** The kernel opens the landmark's `overlay` dialog
  instead (`inWorld={false}`), and the scene is not mounted. Keep the overlay carrying the same
  content.
- **Boundaries.** No kernel (`libs/landmarks`) change is needed. Content is bound in
  `landmarks.config.ts`; the kit never imports content.

## Animated narrators and the resident

Every narrator plays the same clips on the same animator, in its own style: SpongeBob and Patrick
(bundled models, skinned at load) and the original cast (built in code, jointed).

- **Bones at load time.** A bundled model listed in `NARRATOR_RIGS` (`narrators.config.ts`:
  SpongeBob and Patrick) is skinned when it loads: `<Narrator cast={{ object, rig }}>` builds bones from
  the model's `NarratorRigSpec` (`@qa3elhamor/world-feature`, `narrator-rig.ts`), computes the skin
  weights from the vertex positions (cached per model) and plays clips: hop in and wave, idle,
  talk gestures, wave while `waving` (the farewell), react on `poke`, hop away. The GLB is
  unchanged. If rigging fails the model plays as before (static), with a console error.
  - **Patrick** (`PATRICK_RIG`): the top point is his head, rigid with the whole face; the belly is
    the chest; each side point is an arm in three segments (base, middle, tip), bound drooping
    (`rest.armBind`); the bottom points are short legs inside the shorts.
- **The original cast is jointed** (`narrator-jointed.ts`). The crab clerk, the Sardine President
  and the Hamour are built in code as separate parts on pivots (claws, eye stalks, legs, fins,
  tail, moustache, mouth), and an adapter maps the animator's pose (the same bone names, plus the
  extras `jaw`, `tail`, `eye.L`, `eye.R`) onto those pivots. The crab's legs are solved (IK) so its
  feet stay on the floor; a fish's body bends smoothly in its shader with its tail. They are the
  fallback wherever a bundled model is not allowed or fails, and they animate just the same.
- **Personality is data** (`ClipStyle`, `narrator-clip-style.ts`, on each rig's `style`): tempo,
  breath, gesture size, which arm waves and how high, how big the react is, how it travels (hop,
  swim or scuttle) and which fidgets it plays.
  - **SpongeBob:** brisk; scratch, bounce, look, hips.
  - **Patrick:** slow and dopey, deep belly breaths, a heavy low hop; dozes off, pats his belly.
  - **Crab clerk:** quick; the free claw waves (the other holds the stamp), claws clack on the
    talk beat, eye stalks glance; scuttles sideways in and out; `clack` fidget.
  - **Sardine President:** slow and grand, chest out; a slow regal fin wave, the moustache and
    mouth work as he talks; swims in; `puff` fidget.
  - **Hamour:** swims in and out (tail sweep, body bend, fins tucked), fins flutter, the jaw talks;
    `yawn` fidget.
- **How it moves (`narrator-animator.ts`).** Nothing switches. Every layer has a weight: idle,
  listen, talk, fidget, wave, react and hop. Each weight is a critically damped spring with its own
  in and out times (`BLEND`), so motion starts and stops without a jolt.
  - **Talk.** The talk beat follows an envelope with a fast attack (0.15 s) and a slow release
    (0.6 s). The gesturing posture eases out over 0.65 s.
  - **Between lines.** It eases into a **listening** pose: arms a little forward, a lean, a head
    tilt, a nod now and then. It holds that for 5 s after its last line, then relaxes into the idle.
  - **Idle.** Breathing at a drifting rate, a slow weight shift from hip to hip, arms drifting,
    and glances between the camera and a look aside. All of it is noise that never visibly loops.
  - **Fidgets.** A fidget from its style's set plays every few seconds of free time. It is
    never the same one twice running, and it is picked by a seeded generator. The seed comes from
    the post, so the choice is deterministic and never uses `Math.random`.
  - **Landing.** It lands with a damped settle, and the greeting wave waits for the settle.
  - **Jumps.** Some changes cannot be smoothed by a spring: a hop that reverses, a new `?pose`, a
    hand-over. These blend from the last pose shown over 0.45 s.
  - **Reduced motion.** It is still the rest pose.
- **The resident.** Before a visit opens (and after it ends), every landmark's narrator idles at
  home while the visitor dives past (`ResidentNarrator`, `resident.ts`): SpongeBob by the
  Pineapple, Patrick by his rock at the Tiki, the crab clerk by the Krusty Krab's door, the
  Sardine President by the Bureau (`bureau-scene.tsx` mounts it the same way). It loads when the
  camera comes within 4 stop-distances, goes beyond 5, and waves when the camera passes within
  1.6. A bundled model only where the tier allows it; the original cast from medium up (never on
  low). A click or tap makes it react with a pop (`narrator-poke.ts`). The visit's flow and
  `data-visit-state` are unchanged.
- **Where the resident stands.** Set it per landmark in `RESIDENT_PLACEMENTS`
  (`narrators.config.ts`), for example
  `pineapple: { offset: [0.016, 0, 0.138], facing: 'camera', scale: 0.62 }`.
  - `offset` is measured from the landmark's origin (its base, on the seabed), in the landmark's
    own frame. That is scene-world units, as in `LANDMARK_PLACEMENTS`.
  - `facing` is degrees about up in that frame (0 faces its +z), or `'camera'`, which faces the
    stop's eye. It still turns its head and body toward the camera within the usual limit.
  - `scale` multiplies its height: the visit narrator's height times the model's `heightFactor`
    (1 for the original cast). The same spot and scale serve whoever plays there. It is clamped to
    0.2 to 3.
  - An invalid entry is ignored, with a console warning. A landmark without an entry keeps its
    resident at the visit's narrator post.
- **The hand-over.** The resident and the visit's guide share one link per narrator
  (`residentLinkOf`).
  - **Opening.** When the landmark opens, the guide starts exactly where the resident stood: at
    its size and heading, blending from its pose. It then hops to its post. If the resident was not
    on screen, the guide grows in from the resident's spot instead.
  - **Leaving.** After the farewell, the guide hops back to that spot at the resident's size, and
    the resident takes over in place. No one disappears, and no one hops in from the side.
- **Place it live (development only): `?place=resident`.** For example
  `/?quality=high&place=resident&landmark=tiki`. Dive to the landmark: the resident is always
  shown, with a panel at the top right. `&landmark=` (`pineapple`, `tiki`, `krusty-krab`,
  `bureau`) places that one resident only. Without it every resident is shown and editable, and
  the one nearest the camera takes the keys and shows its panel.
  - **Arrows** move it on the ground: up is away from the camera, left and right are the screen's.
  - **PageUp / PageDown** raise and lower it.
  - **Q / E** turn it, starting from the heading it shows when it faces the camera.
  - **+ / -** scale it.
  - **Shift** takes fine steps on any of these.
  - **Alt + drag** on the canvas puts it under the pointer, on the ground.
  - **Face camera** goes back to `'camera'`.
  - **Copy config** copies the exact line to paste into `RESIDENT_PLACEMENTS`. The line is also
    shown in the panel, ready to select.

  Keys are ignored while typing in a field. Production builds never read the URL, and the tool is
  a lazy chunk that is never built for them (`placement-edit.ts`, `placement-tool.tsx`).
- **Preview a clip (development only).** `?pose=` holds one clip on every narrator (bundled or
  original cast), resident or visiting: `idle`, `wave`, `talk`, `hop` (a fish swims, the crab
  scuttles), `react`, `listen`, or a fidget (`scratch`, `bounce`, `look`, `hips`, `doze`,
  `belly`, `clack`, `puff`, `yawn`). Add `&poseAt=0..1` to freeze it partway through, for example
  `/?quality=high&pose=hips&poseAt=0.5`. Add `&narrators=original` to see the original cast where
  a bundled model would play. Production builds ignore all of these.
