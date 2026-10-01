# dive-tuning — notes

Roadmap item **dive-tuning**: re-author the dive now that all four landmarks are in the scene.
Success criteria: every waypoint frames its landmark cleanly on desktop (1440×900) and on a
390 px phone (390×844), and the owner signs off on the feel. The first is met (screenshots
below). The second still needs the owner.

## What was wrong (from the BEFORE screenshots)

1. **The camera never looked at the landmarks while scrolling.** In scroll mode the gaze was
   always 9 world units ahead along the path. A waypoint's `focus` was only used after a
   click (landmark-kernel `focusWaypoint`). Resting on a waypoint showed:
   - pineapple: the landmark off-screen right;
   - tiki: rocks and open water;
   - Krusty Krab: empty water;
   - bureau: the credits board, not the bucket.

   See `before-*-desktop.jpg`.
2. **Pacing was pure arc length.** The open-water descent took the first 46% of the scroll;
   the pineapple sat at 0.465 and the tiki at 0.551. There was nowhere to linger: any scroll
   moved the camera.
3. **The end was 5 units from the credits board.** The last frame was the lower half of the
   notice over dark kelp (`before-end-*.jpg`).
4. **No aspect handling.** The vertical FOV is fixed at 55°, so a portrait phone sees only
   about 27° horizontally and crops whatever desktop frames.

## What changed

### `libs/dive/domain`

- **`MonotoneCurve`** (new, `monotone-curve.ts`). A PCHIP curve (Fritsch–Butland tangents)
  through knots, with `at(x)` and `inverse(y)`. It is monotone, never overshoots, and its
  slope is continuous, so there are no velocity jumps at knots.
- **`DivePath` pacing**, all optional and backward compatible (no `scroll` and no `pacing`
  means scroll equals progress, as before):
  - `DiveWaypointSpec.scroll`: the scroll fraction at which the camera reaches the stop.
    Set it on every stop or on none.
  - `DivePathSpec.pacing { dwell, creep }`: each stop holds a `dwell` band of scroll in
    which the camera only creeps `creep` world units. Bands shrink to fit when stops are
    close together.
  - `progressAtScroll`, `scrollAtProgress`, `scrollOf(id)` and `DiveWaypoint.scroll`.
- **`DivePath` attention**:
  - `DivePathSpec.endFocus`.
  - `attentionInto(progress, { inner, outer }, out)` returns a weight in [0, 1] and writes
    the point to look at (a stop's focus, or the end focus).
  - When two stops' pulls overlap, the focus slides between them, weighted by both pull and
    position in the gap. It is continuous across every stop; a spec checks this.
- `validate()` now also reports bad `scroll` (mixed, out of (0, 1), out of order), bad
  `pacing` and a bad `endFocus`.

### `libs/dive/feature`

- **`framing.ts`** (new): `framingScale(aspect)` = `(1.6 / aspect)^0.55`, capped at 2. That
  is 1 on desktop, about 1.98 on a 390×844 phone and about 1.52 on a 3:4 tablet.
- **`DiveController`**:
  - Scroll input goes through `path.progressAtScroll`. `scrollToWaypoint` scrolls to
    `waypoint.scroll`, and `hold`/`release` store the **scroll fraction**, so restoring
    after an overlay is exact under pacing.
  - `writePose` blends look-ahead → attention focus → explicit focus.
  - Near a stop, on a narrow viewport, the camera stands back along its line of sight by
    `framingScale` (weighted by the attention or focus blend), so the subject stays centred.
    Open-water travel is never moved.
  - New `setViewAspect(aspect)`.
  - New options `attention` (an `outer` of 0 disables it) and `framing`.
- **`DiveCamera`** passes the canvas aspect to the controller whenever the canvas resizes.
- `ScrollSource` docs now say it deals in scroll fraction, not progress.

### Spring, look-ahead and sway (`DIVE_CONTROLLER_DEFAULTS`)

| value                           | before | after                                         | why                                                                                        |
| ------------------------------- | ------ | --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| responsiveness (1/s)            | 3.2    | 3.8                                           | 90% follow in about 1.0 s, not 1.2 s; touch scrolling felt floaty                          |
| lookAhead (world units)         | 9      | 12                                            | steadier heading on bends, now that stops are framed by attention instead                  |
| sway (world units)              | 0.22   | 0.16                                          | less shake on a landmark seen from about 10 units                                          |
| attention { inner, outer }      | —      | { 3, 22 }                                     | the gaze starts turning 22 units out and locks for the last 3; short hops pan stop to stop |
| framing { ref, strength, max }  | —      | { 1.6, 0.55, 2 }                              | phone portrait stands about 2× further back at stops                                       |
| pacing { dwell, creep }         | —      | { 0.09, 1.2 }                                 | about 0.63 viewport heights of scroll held per stop (8 screens)                            |

### Route (`apps/web/src/app/dive.config.ts`) — world units, `WORLD_SCALE` 20

| #   | entry                   | BEFORE offset / focusHeight / scroll | AFTER offset / focusHeight / scroll                                                                                     |
| --- | ----------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| 1-3 | pass (descent)          | (38,31,42) (30,19,28) (23,9,14)      | unchanged                                                                                                               |
| 4   | stop pineapple          | [3.5,2.4,7] / 1.3 / 0.465 (arc)      | [3.5,2.4,7] / 1.3 / **0.20**                                                                                            |
| 5   | stop tiki               | [-2.5,1.8,6.5] / 1.0 / 0.551         | [-2.5,1.8,6.5] / 1.0 / **0.36**                                                                                         |
| 6   | pass                    | (0,4.5,6)                            | **(0,5.5,8)**: clears Sandy's dome                                                                                      |
| 7   | stop krusty-krab        | [6,2.2,2.5] / 1.2 / 0.768            | **[9,3.6,3.75] / 0.5 / 0.60**: building and clam sign both in frame                                                     |
| 8   | pass                    | —                                    | **(-5.5,7.5,9)** (new): swings south of the bucket, above the rocks                                                     |
| 9   | stop bureau             | [-3,2,6.5] / 1.3 / 0.901             | **[-3.5,3.4,8.5] / 1.8 / 0.86**: from the open side; the old +x side had a rock in front on phone                       |
| 10  | end                     | pass (-22,2.8,14), looks along path  | **finale**: 7.5 units in front of the credits board on the side it faces, 3 above its foot, looking at the notice centre |

- The finale is computed from `@qa3elhamor/world-ui`'s `DEFAULT_PLAQUE_POSITION` and
  `DEFAULT_PLAQUE_FACING` (`finalePose`). If the board moves, the end follows it. The finale
  camera ends at world ≈ (-20.54, 4.0, 12.29); the end focus is (-25.4, 4.5, 18).
- `floorY` is now the finale's height, so the dive still ends reading exactly
  `floorMeters` (180).
- Scroll gaps between consecutive stops (surface, stops, end) are 0.20, 0.16, 0.24, 0.26
  and 0.14.

### Specs

- `monotone-curve.spec.ts` (new, 8 tests).
- `dive-path.spec.ts`: +14, now 36 (pacing, validation, attention continuity and panning).
- `framing.spec.ts` (new, 4 tests).
- `dive-controller.spec.ts`: +10 (pacing through the controller, scroll-fraction
  hold/release, attention at stop/away/end, look-target continuity over 1,000 scroll steps,
  portrait pull-back along the line of sight). The existing tests now pin `lookAhead: 9`
  and attention off, so they still describe plain path-following.
- `dive.config.spec.ts`:
  - drift tests are kept;
  - control points = route + finale;
  - depth never exceeds `floorMeters`;
  - the end sits in front of the board on its facing side at `finale.distance`;
  - each stop arrives at its authored scroll;
  - at least 0.1 of the scroll lies between neighbouring stops.

## Verification

`npx nx run-many -t lint,typecheck,test -p dive-domain dive-feature web --skipSync --skip-nx-cache`
reports "Successfully ran targets lint, typecheck, test for 3 projects and 14 tasks they
depend on":

| project      | tests passed |
| ------------ | ------------ |
| dive-domain  | 44 / 44      |
| dive-feature | 41 / 41      |
| web          | 103 / 103 (12 files) |

## Screenshots

All are in this folder. They were captured headlessly (Playwright 1.63 Chromium,
SwiftShader WebGL, `?quality=high`) against `vite --port 4401`, with
`prefers-reduced-motion: reduce`. Reduced motion snaps the camera to the exact resting pose:
SwiftShader runs at 2–8 fps, and with 0.1 s frame clamping the spring never settled in a
normal wait.

- **BEFORE**: `before-{start,pineapple,tiki,krusty-krab,bureau,end}-{desktop,phone}.jpg`,
  at scroll 0, 0.465, 0.551, 0.768, 0.901 and 1 (the old waypoint positions).
- **AFTER**: `after-{start,pineapple,tiki,krusty-krab,bureau,end}-{desktop,phone}.jpg`, at
  scroll 0, 0.20, 0.36, 0.60, 0.86 and 1.
- **Transit (desktop)**: `after-transit-{10,28,48,72,93}-desktop.jpg`. They show that
  between stops the view pans from one landmark to the next rather than staring at open
  seabed.
- `capture.mjs` is the throwaway capture script:
  `node capture.mjs <prefix> '<{"name": scroll}>' [desktop|phone]`. It hardcodes the npx
  cache path of Playwright on this machine.

Fish and kelp in the AFTER shots come from the concurrent ambient-life lane.

## Out-of-scope changes I recommend (not made)

1. **`libs/world/ui/src/lib/credits-plaque.tsx`** (world lane): the `DEFAULT_PLAQUE_POSITION`
   doc comment says the board sits past "the dive's last control point (world
   [-22, 2.8, 14])". That control point no longer exists. The dive now ends on the line from
   the board toward `DEFAULT_PLAQUE_FACING`, 7.5 units out (`finalePose` in `dive.config.ts`).
   Only the comment is stale; the values are what the finale uses.
2. **Krusty Krab hit bounds** (landmarks lane / `landmarks.config.ts`): the model's bounds
   take in the clam sign as well as the building, so the beacon floats over empty seabed
   between them. A tighter `hitTarget` would put the beacon over the building.
3. **Mobile page CSS** (app styles): consider `overscroll-behavior-y: none` on the document,
   so Android pull-to-refresh and iOS rubber-banding at the top of the dive do not fight the
   scroll-driven camera.
4. **iOS toolbar resize**: `windowScrollSource` divides by `scrollHeight - innerHeight`, and
   `innerHeight` changes as the Safari toolbar collapses. That nudges progress by about 1%
   mid-scroll; the spring absorbs it and it is barely visible inside a hold. Using
   `clientHeight` would make it stable but stop the dive from reaching 1.0 with the toolbar
   collapsed, so I left it. This is worth a real-device check.

## Open issues

- **Owner sign-off on feel is pending.** Springs, holds and look-ahead are unit-tested, and
  the poses are verified by screenshot. Headless SwiftShader cannot judge motion feel. Check
  it with a wheel, a trackpad, and iOS and Android touch.
- **Depth gauge.** The pineapple and tiki cameras sit lower than the finale (y 3.8 and 3.2
  against 4.0), so the gauge reads 180 m there (it clamps). It then reads 174 m at the
  Krusty Krab, 163 m at the bureau, and 180 m at the end. Making the deepest stop the floor
  would instead end the dive at about 175 m. This is the owner's call.
- **The final pan is compressed.** The swing from the bucket to the notice happens in the
  last ~0.1 of the scroll (`after-transit-93` still shows the bucket). If it feels abrupt,
  move the bureau to `scroll: 0.82`.
- **The start view is unchanged**: a dark overview of the town from the surface, with the
  beacons showing where to go.
- **Kelp on phone.** Ambient kelp (another lane) can stand in front of the board on the
  phone finale when the camera is low. An intermediate iteration with the finale 2 units
  above the foot showed it. The camera now sits 3 units up, and the current AFTER shot is
  clear.
- **No provider props for the new options.** `DiveProvider` exposes no `attention` or
  `framing` props; the tuned defaults apply. Adding them is trivial if a fork needs it.

## Revision 1 (review `code-review-agy.md`, REVISE 7/10)

This revision supersedes the "Depth gauge" and "final pan" open issues above, the
`scroll: 0.86` for the bureau, and the "floor is the finale's height" rule.

| Fix | What | Where |
| --- | ---- | ----- |
| DEF-1 depth gauge | Depth is now **narrative and monotone**. `DivePath` keeps a running minimum of camera height along the arc-length table and interpolates it, so climbing a hill never winds the gauge back. Raw height is still available as `depthOfY`. The new `DivePath.lowestYOf(controlPoints)` / `lowestY` give the true lowest point of the sampled curve (not just of the control points). The config uses it as `floorY`, so the deepest point reads exactly `floorMeters`. The controller publishes `path.depthAt(progress)`. | `libs/dive/domain/src/lib/dive-path.ts:125` (`lowestY`), `:155` (running min), `:264` (`lowestYOf`), `:337` (`depthAt`); `libs/dive/feature/src/lib/dive-controller.ts:345`; `apps/web/src/app/dive.config.ts:136` |
| DEF-2 look-at snap | The explicit focus is now a per-axis critical spring (`focusLook`) that follows `focusPoint`. Switching straight from one focused landmark to another pans the gaze; the first frame moves under 0.5 units, against a cut of about 18 before. A first focus still starts on the new point and eases in through the blend. Focusing a stop with no `focus` now fades the old focus out instead of dropping it, which removes a second snap. Reduced motion still jumps. | `libs/dive/feature/src/lib/dive-controller.ts:123` (state), `:225` (`focusWaypoint`), `:324` (spring step) |
| DEF-3 compressed finale | Bureau moved to `scroll: 0.82`. Its hold ends at 0.865, leaving 0.135 of the scroll (about 0.95 viewport heights) for the swing to the notice; 0.18 counted from the stop itself. Retook `after-bureau-{desktop,phone}.jpg`, `after-end-{desktop,phone}.jpg` and `after-transit-93-desktop.jpg`. Bureau and end framing are unchanged and clean. At 0.93 the view is now mid-swing, where before it was still parked on the bucket. | `apps/web/src/app/dive.config.ts:81` |
| DEF-4 framing jump | `framingDistance` is a critical spring stepped in `step(dt)` (closed form, so frame-rate independent; the spec checks 60 against 144 fps). `setViewAspect` only sets the target. The **first** aspect snaps, so the page does not open with a pull-back animation. The first frame and reduced motion also snap. | `libs/dive/feature/src/lib/dive-controller.ts:209` (`setViewAspect`), `:316` (step) |
| DEF-5 provider props | `DiveProviderProps` gains `attention?` and `framing?`, passed through to the controller. The memo depends on their primitive fields, so inline objects do not rebuild the controller (and lose the visitor's place) on every render. | `libs/dive/feature/src/lib/dive-context.tsx:20-22`, `:65` |
| framing NaN guard | `framingScale` replaces any option that is not finite or is out of range (`referenceAspect` ≤ 0, `strength` < 0, `maxScale` < 1) with its `DIVE_FRAMING_DEFAULTS` value. The result is always finite and ≥ 1. | `libs/dive/feature/src/lib/framing.ts:31`, `:39` |

**What the gauge reads now** (measured on the built route): 17.5 m at the surface; 175.8 m at
the pineapple. It reaches 180 m at scroll ≈ 0.29, where the curve dips to y = 3.07 just before
the tiki, and holds 180 m at the tiki, the Krusty Krab, the bureau and the end. **The end
reads exactly `floorMeters` (180 m).** It can never read less than it did earlier in the
dive.

**New and updated specs:**
- `dive-path.spec.ts`: running-minimum depth; monotone over a 12-unit hill; `lowestYOf`
  matches `lowestY`.
- `dive.config.spec.ts`: depth non-decreasing over 5,000 samples and ≤ `floorMeters`; ends
  at `floorMeters`; `floorY` equals `lowestY`; stops read non-decreasing depth.
- `dive-controller.spec.ts`:
  - focus switching pans (≤ 0.5 units in the first frame, < 1 per frame across);
  - a first focus eases in;
  - reduced motion snaps;
  - switching to a stop with no focus fades out;
  - the first aspect is immediate;
  - a rotation eases and gives the same result at 60 and 144 fps;
  - reduced motion jumps.
- `framing.spec.ts`: NaN, infinite and out-of-range options fall back to the defaults.
- `dive-context.spec.tsx` (new): `attention` and `framing` pass through; equal inline options
  keep the same controller, and a changed value rebuilds it.

**Verification:**
`npx nx run-many -t lint,typecheck,test -p dive-domain dive-feature web --skipSync --skip-nx-cache`
reports "Successfully ran targets lint, typecheck, test for 3 projects":

| project      | tests passed |
| ------------ | ------------ |
| dive-domain  | 46 / 46      |
| dive-feature | 51 / 51      |
| web          | 121 / 121    |

During one intermediate run, `apps/web/src/app/in-world/in-world.spec.ts` (the concurrent
diegetic-card lane, not mine) failed on a `-0`/`+0` comparison. It passed on the final run.

DEF-6 (the credits-plaque doc comment in `libs/world`) is left to the orchestrator, as
instructed.
