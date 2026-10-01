# Code Logic Review — `dive-tuning`

## Summary

| Metric              | Value    |
| ------------------- | -------- |
| Overall score       | 7/10     |
| Assessment          | REVISE   |
| Blocking issues     | 0        |
| Serious issues      | 2        |
| Moderate issues     | 2        |
| Minor issues        | 2        |
| Failure modes found | 4        |

The implementation introduces well-engineered foundations: `MonotoneCurve` provides mathematically sound PCHIP Hermite spline interpolation with Fritsch–Butland tangents and Fritsch–Carlson monotonic end slopes; `framingScale` addresses the fixed 55° vertical FOV on mobile devices by pulling the camera back along the line of sight; and `DivePath` attention smoothly blends camera gaze between landmarks. Frame-rate independence of the analytical critical spring is preserved, and all 188 unit tests and typechecks across `dive-domain`, `dive-feature`, and `web` pass cleanly.

However, two serious behavioral issues require revision before merge:
1. **Depth gauge semantics**: Panning `floorY` to the finale position ($y \approx 4.0$) causes earlier deeper waypoints (Pineapple at $y=3.79$, Tiki at $y=3.20$) to saturate at maximum depth (−180 m) early in the dive (progress 0.20–0.36), followed by an apparent ascent (−174 m at Krusty Krab, −163 m at Complaints Bureau) before returning to −180 m at the finale.
2. **Instantaneous look-at snap on consecutive waypoint focus**: When `focusWaypoint()` is called while already focused on a landmark, `focusPoint` is overwritten immediately while `focusBlend.value` is already 1.0, causing the camera gaze to snap abruptly on frame 0 instead of smoothly panning to the new landmark.

---

## Five logic questions

### 1. How does this fail silently?
- **Depth gauge saturation at early waypoints** ([`dive.config.ts:133`](file:///D:/projects/qa3elhamor/apps/web/src/app/dive.config.ts#L133) and [`dive-path.ts:293`](file:///D:/projects/qa3elhamor/libs/dive/domain/src/lib/dive-path.ts#L293)):
  `floorY` is set to `finale.position[1]` ($y \approx 4.0$). Because Pineapple ($y = 3.79$) and Tiki ($y = 3.20$) sit lower, `depthRatioOfY` clamps to 1.0. The depth gauge silently clamps at −180 m for both stops, masking 0.59 world units (~12 m) of camera descent between Pineapple and Tiki, then reads shallower (−174 m, −163 m) on later landmarks without error.
- **Provider option omission** ([`dive-context.tsx:37`](file:///D:/projects/qa3elhamor/libs/dive/feature/src/lib/dive-context.tsx#L37)):
  `DiveProviderProps` does not declare `attention` or `framing` options. Any attempts by higher-level callers to pass custom attention ranges or framing rules are silently ignored as `new DiveController` receives only `{ responsiveness, lookAhead, sway }`.

### 2. What user action produces unexpected behaviour?
- **Sequential landmark navigation while in focus mode** ([`dive-controller.ts:207-208`](file:///D:/projects/qa3elhamor/libs/dive/feature/src/lib/dive-controller.ts#L207-L208), [`dive-controller.ts:321-323`](file:///D:/projects/qa3elhamor/libs/dive/feature/src/lib/dive-controller.ts#L321-L323)):
  When a user opens LandmarkNav and clicks "The Pineapple" and then clicks "Complaints Bureau", the camera position springs smoothly towards the Bureau, but the camera look-at angle instantly snaps across the entire scene towards the Bureau's focus point on the first frame.
- **Scrolling past Complaints Bureau towards Finale** ([`dive.config.ts:71, 81`](file:///D:/projects/qa3elhamor/apps/web/src/app/dive.config.ts#L71)):
  The Complaints Bureau dwell band extends to scroll $\approx 0.905$, and attention pull extends to $\approx 0.93$ (`after-transit-93`). The user experiences an abrupt ~180° camera rotation compressed into the final 0.07 fraction of the scroll track (~0.5 viewport heights).

### 3. What input data produces a wrong answer?
- **Non-finite `referenceAspect` in framing options** ([`framing.ts:27-29`](file:///D:/projects/qa3elhamor/libs/dive/feature/src/lib/framing.ts#L27-L29)):
  If a custom `DiveFramingOptions` is provided with `referenceAspect: NaN`, the check `aspect >= options.referenceAspect` evaluates to false. `scale` computes `NaN`, and `Math.min(..., NaN)` returns `NaN`, injecting `NaN` into camera world coordinates.

### 4. What happens when a dependency fails?
- **Zero or negative canvas dimensions on mount** ([`dive-camera.tsx:21`](file:///D:/projects/qa3elhamor/libs/dive/feature/src/lib/dive-camera.tsx#L21)):
  Correctly handled: `width > 0 && height > 0` guards against zero-division during initial mount or SSR before dimensions are resolved.
- **Scroll container without scrollable overflow** ([`scroll-source.ts:3`](file:///D:/projects/qa3elhamor/libs/dive/feature/src/lib/scroll-source.ts#L3)):
  Correctly handled: `progressFromScroll` safely defaults to 0 if `maxScroll <= 0` or non-finite.

### 5. What is missing that the requirements never mentioned?
- **Monotonic narrative depth vs. physical elevation**:
  The requirements state that depth increases as you dive. However, the 3D town geometry is not a monotonic slope—Pineapple sits in a valley while Complaints Bureau sits atop a cliff. Setting `floorY` to the finale height created a false ceiling at early stops. A clear decision is needed: should depth measure physical depth below surface (allowing decreases when ascending hills), or should it track monotonic dive progression?
- **Orientation change smoothing**:
  When a mobile device changes orientation (e.g. portrait to landscape), `framingDistance` changes discontinuously from ~1.98 to 1.0. Because `framing` is applied directly to `position` without spring smoothing, the camera leaps instantly along the line of sight.

---

## Failure modes

### FM-1: Depth Gauge Ceiling Saturation & Narrative Inversion
- **Trigger**: Visitor scrolls through Pineapple (scroll 0.20) and Tiki (scroll 0.36).
- **Symptom**: Depth gauge reads −180 m (100% full) at Pineapple, stays at −180 m at Tiki, then decreases to −174 m at Krusty Krab, −163 m at Bureau, and goes back to −180 m at the finale.
- **Evidence**: [`dive.config.ts:133`](file:///D:/projects/qa3elhamor/apps/web/src/app/dive.config.ts#L133), [`dive-path.ts:293`](file:///D:/projects/qa3elhamor/libs/dive/domain/src/lib/dive-path.ts#L293).
- **Current handling**: `floorY` is assigned `finale.position[1]` ($y \approx 4.0$), while Pineapple is $y = 3.79$ and Tiki is $y = 3.20$. `clamp01` forces all $y \le 4.0$ to 180 m.
- **Recommendation**: Set `floorY` to the true lowest camera point (`Math.min(...controlPoints.map(p => p[1]))`), or define depth as a monotone narrative function along dive progress.

### FM-2: Discontinuous Look-At Snap on Consecutive Waypoint Focus
- **Trigger**: User focuses on a waypoint via landmark nav or kernel, and then clicks another waypoint while still in focus mode.
- **Symptom**: Camera look-at jumps instantaneously on frame 0 to the second waypoint's focus point, while camera position animates smoothly over ~1 second.
- **Evidence**: [`dive-controller.ts:207-208`](file:///D:/projects/qa3elhamor/libs/dive/feature/src/lib/dive-controller.ts#L207-L208), [`dive-controller.ts:321-323`](file:///D:/projects/qa3elhamor/libs/dive/feature/src/lib/dive-controller.ts#L321-L323).
- **Current handling**: `this.focusPoint = waypoint.focus` immediately replaces the target, while `this.focusBlend.value` remains at 1.0.
- **Recommendation**: When switching focus between waypoints, either smoothly interpolate `focusPoint` using a spring, or reset `focusBlend.value = 0` to ease the gaze transition.

### FM-3: Abrupt Finale Rotation from Compressed Transit Arc
- **Trigger**: Visitor scrolls past Complaints Bureau (scroll 0.86) to Finale (scroll 1.0).
- **Symptom**: Rapid ~180° camera rotation compressed into scroll 0.93–1.00.
- **Evidence**: [`dive.config.ts:71, 81`](file:///D:/projects/qa3elhamor/apps/web/src/app/dive.config.ts#L71), `after-transit-93-desktop.jpg`.
- **Current handling**: Bureau scroll is 0.86 with dwell 0.09 and attention outer 22 units, keeping focus on the bucket until scroll 0.93.
- **Recommendation**: Shift Bureau waypoint to `scroll: 0.82` (or reduce attention outer near the end) to allow ~0.15 scroll fraction for the final swing.

### FM-4: Single-Frame Position Jump on Mobile Viewport Reorientation
- **Trigger**: Visitor rotates phone from portrait (390×844) to landscape (844×390) while viewing a landmark.
- **Symptom**: Camera instantly pops closer along line of sight with no animation.
- **Evidence**: [`dive-controller.ts:190-192`](file:///D:/projects/qa3elhamor/libs/dive/feature/src/lib/dive-controller.ts#L190-L192), [`dive-controller.ts:327-332`](file:///D:/projects/qa3elhamor/libs/dive/feature/src/lib/dive-controller.ts#L327-L332).
- **Current handling**: `setViewAspect` immediately sets `framingDistance = framingScale(aspect)`.
- **Recommendation**: Apply critical spring damping to `framingDistance` during `step(dt)`.

---

## Blocking issues
*(None)*

---

## Serious issues

### DEF-1: Non-monotonic depth gauge readings and premature ceiling saturation
- **File**: [`apps/web/src/app/dive.config.ts:131-134`](file:///D:/projects/qa3elhamor/apps/web/src/app/dive.config.ts#L131-L134) & [`libs/dive/domain/src/lib/dive-path.ts:292-299`](file:///D:/projects/qa3elhamor/libs/dive/domain/src/lib/dive-path.ts#L292-L299)
- **Scenario**: In `buildDiveSpec()`, `floorY` is set to `finale.position[1]` ($y \approx 4.0$). Pineapple camera height is $y = 3.79$ and Tiki camera height is $y = 3.20$. In `depthRatioOfY(y)`, values where $y < floorY$ are clamped to 1.0.
- **Impact**: Depth reads −180 m at scroll 0.20, remains −180 m at scroll 0.36, drops to −174 m at Krusty Krab, drops to −163 m at Complaints Bureau, and rises back to −180 m at the finale. This contradicts the UX promise of depth reflecting dive progression and masks real vertical movement between Pineapple and Tiki.
- **Fix**:
  Set `floorY` to the minimum camera height across all control points:
  ```ts
  const floorY = Math.min(...controlPoints.map((p) => p[1]));
  ```
  Alternatively, if the finale must display exactly `config.floorMeters`, calculate displayed depth as a function of path progress rather than raw instantaneous Y.

### DEF-2: Instantaneous look-at snap when switching focus between waypoints
- **File**: [`libs/dive/feature/src/lib/dive-controller.ts:201-210`](file:///D:/projects/qa3elhamor/libs/dive/feature/src/lib/dive-controller.ts#L201-L210) & [`libs/dive/feature/src/lib/dive-controller.ts:321-324`](file:///D:/projects/qa3elhamor/libs/dive/feature/src/lib/dive-controller.ts#L321-L324)
- **Scenario**: In `focusWaypoint(id)`, `this.focusPoint = waypoint.focus` and `this.focusBlendTarget = 1`. If the controller is already in `mode === 'focus'`, `this.focusBlend.value` is already 1. In `writePose()`, `mixInto(lookAt, focus, blend)` immediately applies the new focus point with blend = 1.0.
- **Impact**: While the camera position springs smoothly to the new waypoint, the camera gaze jerks discontinuously on the very first frame.
- **Fix**:
  Track `currentFocusPoint` with a spring or vector lerp, or re-arm the blend when switching targets:
  ```ts
  if (this.state.mode === 'focus' && this.focusPoint && waypoint.focus) {
    // smoothly transition focusPoint rather than hard replacing
  }
  ```

---

## Moderate and minor issues

### DEF-3: Compressed final pan from Complaints Bureau to Finale
- **File**: [`apps/web/src/app/dive.config.ts:71, 81`](file:///D:/projects/qa3elhamor/apps/web/src/app/dive.config.ts#L71)
- **Detail**: Bureau at `scroll: 0.86` with dwell 0.09 leaves only ~0.07 of scroll for the 180° swing to the credits notice.
- **Fix**: Shift Bureau to `scroll: 0.82` to expand the finale transit window.

### DEF-4: Undamped camera jump on device orientation change
- **File**: [`libs/dive/feature/src/lib/dive-controller.ts:190-192, 327`](file:///D:/projects/qa3elhamor/libs/dive/feature/src/lib/dive-controller.ts#L190-L192)
- **Detail**: `setViewAspect` immediately mutates `framingDistance`, causing an un-eased step change in camera position on viewport resize.
- **Fix**: Ease `framingDistance` via a critical spring or lerp in `step(dt)`.

### DEF-5: `DiveProvider` omits `attention` and `framing` options in React context props
- **File**: [`libs/dive/feature/src/lib/dive-context.tsx:8-19, 36-39`](file:///D:/projects/qa3elhamor/libs/dive/feature/src/lib/dive-context.tsx#L8-L19)
- **Detail**: `DiveProviderProps` lacks `attention` and `framing` props; forks cannot customize these without altering library source.
- **Fix**: Expose `attention?: DiveAttentionRange` and `framing?: DiveFramingOptions` on `DiveProviderProps`.

### DEF-6: Stale reference to obsolete control point in `credits-plaque.tsx` documentation
- **File**: [`libs/world/ui/src/lib/credits-plaque.tsx:14`](file:///D:/projects/qa3elhamor/libs/world/ui/src/lib/credits-plaque.tsx#L14)
- **Detail**: Doc comment refers to old control point `[-22, 2.8, 14]` which no longer exists after `finalePose` introduction.
- **Fix**: Update documentation to reference `finalePose` from `dive.config.ts`.

---

## Data flow

1. **Scroll Input**: `windowScrollSource` reads `win.scrollY / maxScroll()` $\to$ `progressFromScroll` (clamped to $[0, 1]$). [OK]
2. **Progress Mapping**: `controller.target = path.progressAtScroll(scroll)` through `MonotoneCurve.at(s)` with Fritsch–Butland slopes. [OK]
3. **Spring Simulation**: `step(dt)` advances critically damped spring towards `target` with analytical exponential decay. [OK]
4. **Trajectory Sampling**: `path.sampleInto(progress, position, tangent)` samples Catmull-Rom spline with arc-length lookup. [OK]
5. **Look-Ahead Vector**: Samples path ahead by `lookAhead / path.length` (or tangents past end). [OK]
6. **Attention Blending**: `path.attentionInto` computes smoothstep falloff and weighted midpoint between adjacent foci. [OK]
7. **Explicit Focus Blending**: Blends `focusPoint` via `focusBlend` spring. *(GAP: Snaps if already focused, DEF-2)*
8. **Aspect-Aware Framing**: Multiplies distance along line of sight by `(framingDistance - 1) * max(attention, blend)`. [OK]
9. **Idle Sway**: Applies multi-frequency trigonometric drift to unreduced motion. [OK]
10. **State Publication**: Publishes depth, progress, velocity, and nearest waypoint to listeners when changes exceed epsilon. *(GAP: Depth gauge saturation, DEF-1)*

---

## Requirements fulfilment

| Requirement | Status | Gap |
| ----------- | ------ | --- |
| Re-author dive route for 4 landmarks | COMPLETE | All 4 landmarks cleanly centered and in view on desktop and 390px phone. |
| Aspect-aware mobile framing | COMPLETE | `framingScale` and pull-back along line of sight prevent clipping on narrow viewports. |
| Pacing & dwell near waypoints | COMPLETE | `MonotoneCurve` knots provide stable dwell bands with controlled creep. |
| Smoothness & look-ahead | COMPLETE | Increased lookAhead (12) and tuned sway (0.16) eliminate twitching. |
| Invertible scroll mapping | COMPLETE | `scrollAtProgress` via 48-step bisection inverts monotonically. |
| Finale framing (no kelp staring) | COMPLETE | Ends squarely facing credits plaque at 7.5 units distance, elevated above kelp. |
| Depth gauge consistency | PARTIAL | Clamps to −180 m prematurely at Pineapple and Tiki, then decreases at Bureau (DEF-1). |
| Waypoint transition smoothness | PARTIAL | `focusWaypoint` snaps look-at target on sequential clicks (DEF-2). |

---

## Edge cases

| Case | Handled | How | Concern |
| ---- | ------- | --- | ------- |
| Zero / NaN scroll or dt | YES | Clamped by `clamp01` and `MAX_FRAME_SECONDS` | Fully guarded |
| Dwell bands overlapping | YES | Knots shrunk to $\le 45\%$ of interval to prevent overlap | Monotonicity guaranteed |
| Waypoints at start / end (0 or 1) | YES | Knots filtered by `x > xs[0] && x < 1` | Identity fallback works |
| Fast orientation flip | NO | `setViewAspect` step-mutates `framingDistance` | Visual pop on phone rotate (DEF-4) |
| Consecutive `focusWaypoint` calls | NO | Replaces `focusPoint` with active blend | Look target snap (DEF-2) |
| Large scroll delta / tab switch | YES | Clamped to 0.1 s maximum delta time | Spring does not explode |

---

## Verdict

- Recommendation: **REVISE**
- Confidence: **HIGH**
- Top risk: Depth gauge showing −180 m at 20% scroll, decreasing to −163 m, and returning to −180 m will confuse users and create bug reports for broken dive progression.
- What a robust implementation would add:
  1. Fix `floorY` computation so depth either measures true physical depth without early clamping or strictly tracks narrative dive progress.
  2. Smooth `focusPoint` transitions when switching between waypoints in `focus` mode.
  3. Advance Complaints Bureau to `scroll: 0.82` to eliminate the rushed finale rotation.
  4. Expose `framing` and `attention` props on `DiveProviderProps`.
