# Code Logic Review — diegetic-overlays (Pineapple Prototype)

## Summary

| Metric              | Value                                |
| ------------------- | ------------------------------------ |
| Overall score       | 6/10                                 |
| Assessment          | NEEDS_REVISION                       |
| Blocking issues     | 0                                    |
| Serious issues      | 2                                    |
| Moderate issues     | 4                                    |
| Failure modes found | 4                                    |

The diegetic overlay implementation demonstrates solid engineering foundations: mathematical derivation of pixel-exact scale (`apparent = 1.0000`), cleanly portalling real DOM outside the `aria-hidden` canvas into a landmark stage region, leveraging native `inert` and `visibility: hidden` for backface occlusion, and ensuring zero runtime allocations for core Three.js math in `useFrame`. 

However, critical runtime logic gaps exist: presentation state is unlatched during active viewing (causing abrupt unmounting if quality tiers downgrade mid-interaction), focus restoration in passive `useEffect` cleanups introduces timing races during landmark switching, mathematical safeguards against collapsed viewports are absent, and mobile layout leaves truncated biographical text undiscoverable.

---

## Five logic questions

### 1. How does this fail silently?

- **Unlatched Quality Downgrade Destroys 3D Scene Without Exit Animation:**
  In [`apps/web/src/app/landmarks.config.ts:34`](file:///D:/projects/qa3elhamor/apps/web/src/app/landmarks.config.ts#L34), Pineapple is configured as `presentation: 'in-world'`. In [`apps/web/src/app/app.tsx:114`](file:///D:/projects/qa3elhamor/apps/web/src/app/app.tsx#L114), `inWorldAvailable` passes live `tier: quality.tier`. When a visitor has the Pineapple card open and the quality monitor drops to `'low'` under load, `effectivePresentation` in [`libs/landmarks/domain/src/lib/landmark-definition.ts:58-67`](file:///D:/projects/qa3elhamor/libs/landmarks/domain/src/lib/landmark-definition.ts#L58-L67) immediately switches to `'dialog'`. In [`libs/landmarks/feature/src/lib/landmark-layer.tsx:277-280`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-layer.tsx#L277-L280), `sceneRuns` evaluates to `false`, causing the active `<Scene>` (`InWorldCard`) to unmount instantly with zero exit flight. Simultaneously, [`libs/landmarks/feature/src/lib/landmark-dom.tsx:82-101`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-dom.tsx#L82-L101) mounts `LandmarkOverlayHost`. The user experiences an unexpected pop-up dialog replacing the 3D card without user initiation.
- **Scroll Restore Swallows Visitor Scroll Action:**
  In [`libs/landmarks/ui/src/lib/landmark-stage.tsx:130-139`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-stage.tsx#L130-L139), exceeding the 64 px delta triggers `onCloseRef.current('scroll')`. Kernel release delegates to `dive.release()` in [`libs/dive/feature/src/lib/dive-controller.ts:263-272`](file:///D:/projects/qa3elhamor/libs/dive/feature/src/lib/dive-controller.ts#L263-L272), which forcibly calls `source.scrollTo(this.heldScroll, false)`. The physical scroll distance the user produced to swim forward is discarded and snapped back, requiring a second scroll gesture to resume page navigation.

### 2. What user action produces unexpected behaviour?

- **Card Departure Mid-Flight Re-open Snaps Position:**
  In [`apps/web/src/app/in-world/in-world-card.tsx:89-92`](file:///D:/projects/qa3elhamor/apps/web/src/app/in-world/in-world-card.tsx#L89-L92), closing sets `phase = 'leaving'`. If the user clicks the Pineapple model or nav button while the card is mid-flight returning to the door, `open` becomes `true` again and `phase` resets to `'emerging'`. However, `emergeProgress` in [`apps/web/src/app/in-world/in-world-pose.ts:67-70`](file:///D:/projects/qa3elhamor/apps/web/src/app/in-world/in-world-pose.ts#L67-L70) calculates progress solely from `(elapsed - timing.delay) / timing.emerge` with no recollection of current position `m.progress`. The card snaps instantly back to the door before emerging, producing a visual glitch.
- **Accidental Close From Touch Momentum or Non-Scroll Drag:**
  In [`libs/landmarks/ui/src/lib/landmark-stage.tsx:132-136`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-stage.tsx#L132-L136), `Math.abs(window.scrollY - start) >= leaveOnScroll` monitors window scroll. On mobile touchscreens, dragging anywhere outside the scrollable container (`.citizen-pass__scroll`), such as the header band (`.citizen-card__band`), MRZ foot, or flip button, scrolls the `window`. Furthermore, residual inertial scroll from opening immediately crosses 64 px, prematurely closing the card.
- **Switching Landmarks Induces Focus Stealing Race:**
  In [`libs/landmarks/ui/src/lib/landmark-stage.tsx:109-118`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-stage.tsx#L109-L118), passive `useEffect` cleanup returns focus on close. When switching directly to another landmark (e.g. Tiki dialog or complaints wall), the new component mounts and focuses its own content during layout; subsequent execution of `LandmarkStage`'s passive cleanup invokes `target?.focus({ preventScroll: true })`, either stealing focus back to the previous opener or attempting to focus an element outside a newly active dialog.

### 3. What input data produces a wrong answer?

- **Zero or Non-Finite Viewport Height Yields `Infinity` Matrix Transform:**
  In [`apps/web/src/app/in-world/in-world-card.tsx:278-305`](file:///D:/projects/qa3elhamor/apps/web/src/app/in-world/in-world-card.tsx#L278-L305), `focal` is calculated as `camera.projectionMatrix.elements[5] * (size.height / 2)`. In [`apps/web/src/app/in-world/in-world-pose.ts:26-35`](file:///D:/projects/qa3elhamor/apps/web/src/app/in-world/in-world-pose.ts#L26-L35), `htmlScaleFor` and `worldPerPixel` divide directly by `focalPx`. If `size.height === 0` (e.g. headless render, unmounted container, or during resize frames), `focal === 0`, producing `Infinity` scale and offsets. `world.compose(pos, quat, scaleVec)` populates the matrix with `Infinity`/`NaN`, silently corrupting scene transformations.
- **Missing English Translation Strips MRZ Data Entirely:**
  In [`apps/web/src/app/overlays/citizenship-card/citizenship-card-in-world.tsx:143`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card-in-world.tsx#L143), the MRZ zone explicitly formats `localize(profile.name, 'en')`. If a profile provides only an Arabic name (`{ ar: '...' }`), `localize` falls back to the Arabic string. In [`machineReadableZone`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card-in-world.tsx#L49-L64), `replace(/[^A-Z ]+/gu, '')` strips all non-Latin characters, producing empty parts and rendering `IDQEH<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<` without a surname or given name.

### 4. What happens when a dependency fails?

- **In-Scene Component Crash:**
  Safely isolated. In [`libs/landmarks/feature/src/lib/landmark-layer.tsx:310-329`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-layer.tsx#L310-L329), `ModelBoundary` wraps `<Scene>`. If `InWorldCard` throws, `reportSceneError` logs `landmark_scene_error` to telemetry, the scene unmounts to `null`, and the canvas continues running smoothly. The DOM stage remains open, allowing the user to click "Back to the dive".
- **WebGL Unavailable:**
  Cleanly handled. [`apps/web/src/app/in-world/in-world-mode.ts:18-22`](file:///D:/projects/qa3elhamor/apps/web/src/app/in-world/in-world-mode.ts#L18-L22) checks `webgl`. If false, `effectivePresentation` returns `'dialog'`, and the content renders in `LandmarkOverlayHost`.

### 5. What is missing that the requirements never mentioned?

- **Visual Affordance for Mobile Text Truncation:**
  On a 390×844 mobile viewport ([`shots/c-front-phone.jpg`](file:///D:/projects/qa3elhamor/.ptah/specs/diegetic-overlays/shots/c-front-phone.jpg)), the Citizen Statement terminates abruptly mid-sentence ("...scalable SaaS platforms and") right above the MRZ passport border. Because mobile browsers suppress scrollbars when idle, and the MRZ footer visually frames the card as complete, visitors have no visual cue (gradient fade, scroll indicator, or scroll shadow) that the text is scrollable.
- **Presentation Mode Latching:**
  Requirement stated that `inWorldAvailable` dictates presentation, but omitted behavior when device conditions fluctuate while open. A stable presentation requires latching at open time.

---

## Failure modes

### 1. Mid-View Presentation Swap on Quality Downgrade
- **Trigger:** Quality monitor downgrades `tier` from `'medium'` to `'low'` (or system switches `prefers-reduced-motion`) while Pineapple card is open.
- **Symptom:** In-world 3D card disappears instantly with no exit animation; paper dialog appears abruptly over the screen.
- **Evidence:** [`libs/landmarks/domain/src/lib/landmark-definition.ts:58-67`](file:///D:/projects/qa3elhamor/libs/landmarks/domain/src/lib/landmark-definition.ts#L58-L67), [`libs/landmarks/feature/src/lib/landmark-layer.tsx:277-280`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-layer.tsx#L277-L280), [`libs/landmarks/feature/src/lib/landmark-dom.tsx:61-63`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-dom.tsx#L61-L63).
- **Current handling:** `effectivePresentation` recalculates dynamically on every render pass.
- **Recommendation:** Latch the active presentation mode upon landmark activation (`open = true`) and retain it until the landmark closes.

### 2. Focus Return Collision on Landmark Switch
- **Trigger:** Opening another landmark directly from LandmarkNav or scene while Pineapple is open.
- **Symptom:** Focus fails to remain on the newly opened landmark's primary element; instead, passive cleanup in `LandmarkStage` fires post-commit and redirects focus to the previous opener or `<body>`.
- **Evidence:** [`libs/landmarks/ui/src/lib/landmark-stage.tsx:109-118`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-stage.tsx#L109-L118).
- **Current handling:** `useEffect` cleanup blindly executes `target?.focus({ preventScroll: true })`.
- **Recommendation:** Verify that active focus is not already contained within an active landmark region or dialog before restoring focus, or bypass focus return when the close reason is `'switch'`.

### 3. Division by Zero / Non-Finite Scale on Zero Viewport
- **Trigger:** Viewport height equals 0 (initial layout cycle or hidden iframe).
- **Symptom:** Scene group matrix is assigned `NaN`/`Infinity`.
- **Evidence:** [`apps/web/src/app/in-world/in-world-card.tsx:278-305`](file:///D:/projects/qa3elhamor/apps/web/src/app/in-world/in-world-card.tsx#L278-L305), [`apps/web/src/app/in-world/in-world-pose.ts:31, 34`](file:///D:/projects/qa3elhamor/apps/web/src/app/in-world/in-world-pose.ts#L31).
- **Current handling:** No guard in `htmlScaleFor` or `worldPerPixel`.
- **Recommendation:** Add guard in `htmlScaleFor`: `if (!Number.isFinite(focalPx) || focalPx <= 0) return 0;` and bypass matrix updates when `focal <= 0`.

### 4. Premature Leave-on-Scroll Triggered by Touch Deceleration
- **Trigger:** Touch momentum continues rolling after tapping a landmark on mobile.
- **Symptom:** In-world card immediately closes upon opening.
- **Evidence:** [`libs/landmarks/ui/src/lib/landmark-stage.tsx:130-139`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-stage.tsx#L130-L139).
- **Current handling:** Checks `Math.abs(window.scrollY - start) >= 64` unconditionally from mount.
- **Recommendation:** Ignore scroll events for the first 300 ms after opening, or sample `start` only after scrolling begins.

---

## Blocking issues

*None found.* The implementation is structurally sound, contains zero crash loops, and all typecheck/lint/test gates pass across all packages.

---

## Serious issues

### 1. Dynamic Tier Downgrade Mutates Open Landmark Presentation
- **File:** [`libs/landmarks/feature/src/lib/landmark-dom.tsx:61-63`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-dom.tsx#L61-L63) & [`libs/landmarks/feature/src/lib/landmark-layer.tsx:277-280`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-layer.tsx#L277-L280)
- **Scenario:** The frame rate governor detects sluggish performance and downgrades quality to `'low'` while the visitor is reading the in-world card.
- **Impact:** Instant destruction of the 3D scene; the card vanishes without animation, and the dialog suddenly pops open, breaking visual continuity.
- **Fix:** In `LandmarkOverlays` (or `LandmarkProvider`), latch presentation state on landmark open:
  ```tsx
  const [latchedPresentation, setLatchedPresentation] = useState<LandmarkPresentation | null>(null);
  useEffect(() => {
    if (focusedId && !latchedPresentation) {
      setLatchedPresentation(definition ? effectivePresentation(definition, inWorld) : null);
    } else if (!focusedId) {
      setLatchedPresentation(null);
    }
  }, [focusedId, definition, inWorld, latchedPresentation]);
  ```

### 2. Focus Hijacking Race on Landmark Switch
- **File:** [`libs/landmarks/ui/src/lib/landmark-stage.tsx:109-118`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-stage.tsx#L109-L118)
- **Scenario:** Visitor clicks another landmark button in `LandmarkNav` while Pineapple is open.
- **Impact:** When the new landmark mounts, its autofocus logic sets focus to the new target. Later, React fires the passive `useEffect` cleanup of the closing `LandmarkStage`, executing `target?.focus({ preventScroll: true })`. This pulls focus away from the newly opened landmark back to the old button.
- **Fix:** Guard the focus return cleanup by checking if focus is already within an active landmark container or another focusable landmark element:
  ```tsx
  useEffect(() => {
    if (!open) return;
    return () => {
      const active = document.activeElement;
      if (active && active !== document.body && !active.closest('.lmk-stage')) {
        return; // Another component legitimately took focus
      }
      const opener = openerRef.current;
      const target = isReturnableFocus(opener) ? opener : (returnFocusRef.current?.() ?? null);
      target?.focus({ preventScroll: true });
    };
  }, [open]);
  ```

---

## Moderate and minor issues

1. **Missing NaN/Zero Guards on Projection Calculations** ([`apps/web/src/app/in-world/in-world-pose.ts:31-35`](file:///D:/projects/qa3elhamor/apps/web/src/app/in-world/in-world-pose.ts#L31-L35)): `htmlScaleFor` and `worldPerPixel` must guard against non-positive or non-finite `focalPx`.
2. **Undiscoverable Internal Scroll on Mobile Viewports** ([`apps/web/src/app/overlays/citizenship-card/citizenship-card-in-world.css:81-88`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card-in-world.css#L81-L88)): In `c-front-phone.jpg`, the biographical statement is visually truncated without affordance. Add a CSS scroll indicator or subtle bottom gradient mask over `.citizen-pass__scroll`.
3. **Asymmetric Flight Reset on Rapid Re-Open** ([`apps/web/src/app/in-world/in-world-card.tsx:89-92`](file:///D:/projects/qa3elhamor/apps/web/src/app/in-world/in-world-card.tsx#L89-L92)): When re-opening while `phase === 'leaving'`, `m.progress` is reset to 0 instead of blending from the current position.
4. **Per-Frame Garbage Collection in `bobAt`** ([`apps/web/src/app/in-world/in-world-pose.ts:92-99`](file:///D:/projects/qa3elhamor/apps/web/src/app/in-world/in-world-pose.ts#L92-L99)): `bobAt` allocates a new object `{ x, y, roll, yaw }` 60–120 times per second. Reuse a static scratch object to eliminate per-frame heap churn.

---

## Data flow

1. **Trigger Open (`activate`):** Model click, beacon click, or `LandmarkNav` Enter → Dispatched to `LandmarkInteraction`. [OK]
2. **Camera Transition:** `LandmarkProvider` listener invokes `camera.focus(waypoint)` (`dive.focusWaypoint`). [OK]
3. **DOM Mount (`LandmarkStage`):** Mounts region, sets up `MutationObserver` for autofocus, captures opener. [OK]
4. **Scene Mount (`InWorldCard`):** Drei `<Html>` portals into `sceneLayer` outside `<Canvas>`. [OK]
5. **Autofocus Delegation:** `MutationObserver` observes arrival of `[data-landmark-autofocus]`, focusing the card `<article>`. [OK]
6. **Interaction & Calming:** Pointer hover or keyboard focus sets `calm = true`, easing bob oscillation to zero. [OK]
7. **Two-Face Flipping:** Button click or Arrow Left/Right toggles `data-side`, setting opposite face `inert` and `visibility: hidden`. [OK]
8. **Dismissal (Esc / Button / Scroll):** Dispatches close reason. [OK]
9. **Exit Flight:** Card sets `inert`, scales down and returns towards door over 0.55s. [OK]
10. **Focus Return:** Passive `useEffect` cleanup restores focus to opener or nav button. [Gap: races on landmark switch].

---

## Requirements fulfilment

| Requirement | Status | Gap |
| ----------- | ------ | --- |
| In-world Pineapple presentation (`presentation: 'in-world'`) | COMPLETE | None. Correctly registered in `landmarks.config.ts`. |
| Pixel-exact text rendering via drei `<Html transform>` | COMPLETE | Verified `scale = 1.0000` via `htmlScaleFor`. |
| Accessible real DOM outside canvas | COMPLETE | Portalled to `sceneLayer` inside `LandmarkStage` region. |
| Two-face flip with inert hidden side | COMPLETE | Front/back toggles `inert` and `visibility: hidden`. |
| Polite screen-reader announcements on turn | COMPLETE | Polite `role="status"` element announces side. |
| Fallback to DOM dialog under low tier / reduced motion | PARTIAL | Unlatched; live tier downgrade causes abrupt mid-view unmount. |
| Close via Esc, button, and leave-on-scroll (64px) | COMPLETE | Plumbed cleanly to kernel and telemetry. |
| Clean focus restoration on close | PARTIAL | Passive cleanup races during direct landmark switches. |
| Non-converted landmarks open dialogs | COMPLETE | Pinned by tests (`tiki`, `krusty-krab`, `bureau`). |

---

## Edge cases

| Case | Handled | How | Concern |
| ---- | ------- | --- | ------- |
| WebGL disabled | YES | `inWorldAvailable` routes to dialog overlay | None |
| Reduced motion preferred | YES | `inWorldAvailable` routes to dialog overlay | None |
| Live quality tier drops to low | NO | Abruptly swaps presentation mode mid-view | Visual flicker; 3D exit animation skipped |
| Rapid re-open during exit flight | PARTIAL | Sets phase to emerging | Teleports card back to door instead of easing |
| User touches non-scrollable card header on mobile | NO | Propagates to window scroll | Accidental close on small drags |
| Profile lacks English translation | PARTIAL | Fallback string passed to MRZ | Non-Latin characters stripped, producing blank name |
| Viewport height collapses to 0 | NO | `focal` becomes 0, producing `Infinity` scale | Corrupts Three.js matrix |

---

## Verdict

- **Recommendation:** REVISE
- **Confidence:** HIGH
- **Top risk:** Mid-view quality tier fluctuations or rapid navigation between landmarks trigger jarring presentation swaps and focus stealing bugs.
- **What a robust implementation would add:**
  1. Latch `presentation` mode at landmark activation time to eliminate mid-interaction UI replacement.
  2. Guard `LandmarkStage`'s passive focus restoration against focus stealing when switching landmarks.
  3. Introduce division-by-zero / non-finite guards in `htmlScaleFor`, `worldPerPixel`, and `CardPose`.
  4. Add visual scroll affordance (fade mask / scroll indicator) to the mobile bio statement.
  5. Prevent touch drags on non-scrollable card chrome from triggering the 64 px window leave threshold.
