# The Krusty Krab, narrated: services on a flipping menu board

Status: **implemented, awaiting owner review.** Built on the narrated-visit kit
(`apps/web/src/app/narrators/README.md`). There is one additive kit change, made at the
coordinator's request: the narrator stays visible (see "Kit change" below).

## The experience

1. **Arrival.** The crab clerk swims in and settles on the left, in front of the Chum Bucket. Its
   bubble types `narration.landmarks['krusty-krab']`.
2. **The board.** A wooden menu board rises out of the sand beside the restaurant, between the crab
   and the Krusty Krab. It is real 3D:
   - two posts and a framed face;
   - a red and white striped awning with a scalloped valance and a wooden cap;
   - the sand clips it as it rises.

   The face shows bare planks first, then flips over on its hinges, with a little overshoot, to a
   green chalkboard. One slate row per service then pops on, top to bottom.
3. **Rows.** Each row carries crisp DOM: the dish name (`menuName`) over the real service
   (`title`). The label button covers the row, so mouse, tap and keyboard share one target.
   Arrow keys, Home and End move between rows.
4. **Selecting a row** (mouse hover after a 140 ms rest, a tap, or focus):
   - **The row zooms.** It comes out of the board along the line of sight, so it stays put on
     screen and only grows: about 1.3× on desktop and 1.1× on a phone. It warms to gold, and the
     other rows darken.
   - **Its dish spins up** over the awning's restaurant end, in turn down the menu: a Krabby
     Patty, a kelp shake, a bottle of the secret formula, then the patty again.
   - **The detail** is the description and the tags. On desktop it sits in the tray to the right
     of the row; on a phone it goes inside the bubble.
   - **The crab comments.** `services.json` has no quip, so the crab quotes the dish's own
     joke **price** under a "Price · Kelp Shake" tag (`menuComments`). A narration hint keyed by
     service id would take precedence, and the price would then show as a note. A dish with
     neither is selectable and silent (the kit's missing-hint path). Content was not edited.
5. **Last line.** Two actions: **See the full menu** and **Back to the dive**.
   - The full menu is the page view's own `ServicesSection`, reused the way the Tiki reuses
     `ExperienceSection`, on a paper slab with a red top band that scrolls inside itself.
   - Esc or "‹ Back to the guide" returns focus to "See the full menu".
6. **Leaving.** The rows pop off, the face flips back, the board sinks, and the crab says the
   farewell and swims off.
7. **Fallback** (reduced motion, the low tier, no WebGL): the `krusty-krab` overlay is now the
   full menu in the dialog (`createServicesMenuOverlay`). It replaces `ComingSoonOverlay`.

## Files (`apps/web/src/app/krusty-krab/`)

| File | What |
| --- | --- |
| `krusty-scene.tsx` | `createKrustyScene`: the kit definition |
| `menu-objects.ts` (+ spec) | `menuObjects` turns services into rows; `menuComments` supplies the price, or a narration hint, as the crab's line |
| `krusty-layout.ts` (+ spec) | `KRUSTY_LANDSCAPE` and `KRUSTY_PORTRAIT`, `krustyLayout`, `menuRows`, `rowLift`, `rowCentre`. The board stands on the sand under its screen foot. Each composition has one alternative crab spot. Specced at 1440×900, 1280×720 and 390×844: on the sand, the right pixel height, whole on screen, clear of the bar, rows apart and at least 48 × 260 px, the zoom staying put on screen, and every crab spot whole on screen. |
| `menu-board.tsx` | The 3D board, the open and close timeline (rise, flip, rows), selection, and label and panel projection |
| `menu-dish.tsx` | Low-poly patty, shake and formula bottle |
| `services-menu.tsx` + `.css` (+ spec) | The full menu (in-world and dialog) and the overlay factory |
| `krusty-copy.ts` | UI words (en/ar): See the full menu, the list name, `Price · {dish}`, the detail name, the price note |

`landmarks.config.ts`: surgical edits to the krusty-krab entries only.
- `presentation: 'in-world'`, `scene: 'krusty-krab'`.
- The overlay is the menu dialog.
- `LANDMARK_SCENES['krusty-krab']` is added.
- The now-unused `ComingSoonOverlay` import was removed.

`landmarks.config.spec.ts`: krusty-krab is in the in-world list, and its overlay is no longer
the placeholder. The bureau agent has since added its own lines to both files.

## Kit change (`narrators/`, additive, documented in its README)

The owner reported the crab spawning inside the neighbouring building, with the bubble touching
the screen edge.

- **`narrator-post.ts`** (+ spec). As the visit opens, and on resize, the kit tries spots in
  order:
  1. the layout's `narrator`;
  2. the new optional `VisitLayout.narratorAlternatives`;
  3. the first spot again, nearer the visitor (same place and same size on screen).

  It takes the first spot whose body is whole on screen and in sight. "In sight" is a raycast
  from the eye to the narrator's middle, head and both sides. It is tested against visible,
  opaque, non-instanced scene meshes outside the visit, which are the same rules as the landmark
  beacons. Failing that, it takes the first spot in sight; failing that, the nearer spot.

  A landmark whose first spot is clear is unchanged, so the Pineapple and the Tiki are unaffected
  (their specs pass). The choice is made before the narrator swims in.
- **`screen-placement.ts`.** `windowSafeInsets` grows the bubble's insets when the stage layer
  is offset from, or wider than, the browser window. The bubble then stays at least 12 px inside
  the window, and the tail re-aims at the narrator after the clamp.
- **The specs** cover:
  - a hidden spot is skipped for the next one in sight, and a clear first spot is kept;
  - the edge-clipped versus hidden ordering;
  - the nearer spot keeps its screen position and size;
  - which meshes count as occluders (not instanced, transparent, invisible, hit targets or the
    visit's own);
  - the bubble clamp and tail re-aim at 390 px;
  - insets for an offset layer.
- In every capture the bubble's left edge is at 12 px (desktop and phone).

## Verification

- `npx nx run-many -t lint,typecheck,test -p web --skipSync`:
  - **lint and typecheck pass**;
  - **tests: 374 of 376 pass**. The two failures are not from this work:
    - `telemetry.spec.ts › receives opens through the production landmark port` hits its 15 s
      timeout on a dynamic import of `landmark-ports`, which does not import the landmark
      config. It also fails when run alone on this loaded machine. The Tiki notes recorded the
      same flake (a 9–15 s import).
    - `complaint-scroll.spec.tsx › pendingSubmitter never delivers…` expects copy text that
      the Bureau agent's in-flight work changed.
  - An earlier run, made while a Playwright capture was running, timed out across many unrelated
    specs. The quiet rerun gave the result above.
- The Krusty Krab, kit and landmark specs (`krusty-krab`, `narrators`, `pineapple`, `tiki`):
  all pass.

## Screenshots (`shots/`, JPEG, `?quality=high`, port 4412, never 4400)

`capture.mjs` is adapted from the Tiki's. Desktop is 1440×900 and phone is 390×844. The facts
logged at each step are in `capture.log`. All shots were retaken after Revision 1.

| File | Shows |
| --- | --- |
| `a-arrival-*` | At the stop, before opening |
| `b-narrator-arrives-*`, `b2-board-flipping-*` | The crab arriving, and the board rising and flipping as the first line types |
| `c-crab-talking-*` | Crab talking, all four rows on the chalkboard |
| `d-service-selected-*` | Kelp Shake zoomed and gold, its shake spinning over the awning, the crab saying "Priced in kelp, negotiable", and the detail in the tray (desktop) or the bubble (phone) |
| `d2-arrow-key-*` | ArrowDown to Complaint Bureau Premium, which brings up the formula bottle |
| `e-last-line-*` | "See the full menu" and "Back to the dive" |
| `f-full-menu-*` | The full menu over the darker sea |
| `g1-farewell-*`, `g2-after-leaving-*` | Board going away and the farewell, then the dive restored |
| `i-fallback-dialog-*` | Reduced motion: the full menu in the landmark dialog |

Tuning rounds:
1. The board was too big and the zoomed row slid down over its neighbour. The fix was a smaller
   board and zooming along the line of sight.
2. The chalkboard read almost black. The fix was a lighter green with a faint self-light.
3. The valance rendered as spikes. The fix was half discs.
4. The crab was behind the Chum Bucket. The fix was the kit's visibility choice plus a nearer
   spot.
5. The desktop board overlapped the crab. The fix was moving the board to x 0.40.
6. The dish was hidden behind the bubble. The fix was moving it to the restaurant end.

The dev server on 4412 was stopped. The owner's 4400 was not touched.

## Open issues

1. **Phone composition.** The board fills the lower half and hides the restaurant; only the clam
   sign shows behind the crab. The rows are large and readable (two lines each, 15 px). Shrinking
   the board to show the restaurant would cost row height. This is the owner's call.
2. **The crab's comment is the joke price.** For richer lines, add `hints` keyed by service id
   to `narration.json` under `krusty-krab`. They take over automatically, and the price moves to
   a note.
3. **Copy keys.** `krusty-copy.ts` is hard-coded en/ar like the other visits. Its strings move to
   `content/site.json` after sign-off.
4. **`ComingSoonOverlay`.** No landmark uses it any more. The file and its import in
   `landmarks.config.spec.ts` remain.
5. **Kernel focused tint.** The open landmark (the restaurant) washes out to orange. This is the
   same open question as at the Pineapple and the Tiki.
6. **Arabic.** The page locale is fixed to `en`, so Arabic was not exercised in the shots.

## Revision 1 (review `code-review-agy.md`, REVISE 7/10)

1. **The tail skew was inverted, confirmed before fixing.** `tail-check.mjs` renders the kit's
   real bubble CSS and tail markup and places the bubble with `placeSpeechBubble`'s maths. It
   puts the narrator 6 px from the far left and the far right edge, on desktop (1440) and phone
   (390), and measures the tail tip with `getScreenCTM`:
   - **With the old `-skew`**, the tip went away from the narrator in all four cases, missing it
     by 52–64 px (`t-tail-negated-*`).
   - **With `+skew`**, the tip leans towards the narrator in all four cases, missing it by
     15–24 px (`t-tail-plain-*`). The remaining miss is the kit's existing lean clamp (1.2 × the
     tail's length), because these anchors sit past the bubble's reach.
   - **In the normal compositions the lean is 0**, so the tail drops straight onto the crab's
     head and the earlier shots looked right.

   The fix is a pure `tailSkewDegrees(place)` in `screen-placement.ts` (a positive lean gives a
   positive `skewX`), used by `useSpeechBubblePlacement`. The spec pins the sign:
   - `len × tan(deg) = lean` for leans of −26 to 26;
   - a clamped bubble with the narrator far left gives a negative skew;
   - far right gives a positive skew.
2. **No layout reads in the frame loop.** `useBubbleGeometry` measures the bubble's size and its
   layer's window box when the bubble appears. It measures again only on a ResizeObserver
   callback (the bubble or the layer), on window `resize`, and on window `scroll` (captured,
   passive). `useFrame` now only reads cached numbers and writes styles.
3. **Stale occlusion.** `useNarratorPost` makes its choice when the visit opens. Then, until the
   narrator has settled (the tour stage leaves `waiting`), it counts the scene's occluders every
   0.5 s and chooses again when the count changes, for example when a building finishes
   streaming in. The narrator is still swimming in at that point, so it swims to the better
   spot. Once settled, the choice holds and nothing jumps.
   - `settled` is a new optional fifth parameter. The Bureau's four-argument call still works and
     keeps re-checking only while the occluder count changes.
   - The README is updated.
4. **Renderer state.** `MenuBoard` saves `gl.localClippingEnabled` and restores it on unmount.
   The Tiki's `stone-tablets.tsx` had the same leak and got the same three-line fix, at the
   coordinator's request.
5. **Bottom inset and bidi.**
   - `windowSafeInsets` now also grows `bottom` for a layer running past the window; it is
     specced.
   - Dish and service names in `priceOf`, `detailOf` and `priceNote` are wrapped in first-strong
     isolates (U+2068/U+2069), so `السعر · {dish}` keeps its order with any name. The spec checks
     the Arabic tag.
6. **Telemetry flake.** `telemetry.spec.ts` now mocks `@qa3elhamor/world-feature` (the
   three/GLTF/Meshopt/R3F runtime that `landmark-ports` pulls in) and imports `landmark-ports`
   statically. The test took 15 s or more under load; it now takes milliseconds, and the whole
   file runs in 124 ms. The timeout was not raised.

Verification:
- `npx nx run-many -t lint,typecheck,test -p web --skipSync`: **"Successfully ran targets lint,
  typecheck, test for project web and 16 tasks it depends on"**, with 42 test files and
  392 tests passing. Nx reported a full cache hit for an identical tree. Before that, the direct
  vitest run of the touched specs (`telemetry`, `narrators`, `krusty-krab`, `tiki`, `pineapple`)
  passed 175 of 175.
- All shots were retaken (desktop and phone, port 4412). The crab is visible next to the board
  and the bubble is 12 px from the edge. The 4412 server was stopped.
