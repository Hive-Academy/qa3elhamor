# Code Logic Review (Round 2) — diegetic-overlays (Pineapple Prototype)

## Summary

| Metric | Value |
| --- | --- |
| Overall score | 9/10 |
| Assessment | APPROVED |
| Previous issues resolved | 6/6 (2 Serious, 4 Moderate) |
| New blocking issues | 0 |
| New serious issues | 0 |
| New moderate issues | 0 |
| Residual minor notes | 1 (out-of-scope test divergence from narrator asset additions) |

The author's Revision 1 directly resolves all 2 serious and 4 moderate defects identified in round 1 with high engineering precision. Presentation state is cleanly latched upon landmark opening; focus restoration is hardened with generation tracking and modal detection to eliminate switch races; projection calculations are protected with strict non-finite and non-positive guards; mobile text truncation is addressed through dynamic scrollable regions and visual affordances; flight reversals from mid-departure seamlessly resume from current position; and per-frame heap allocations in `bobAt` are reduced to zero. 

The kernel primitives (`LandmarkStage`, `presentationFor` latching, generation-based focus return, leave-on-scroll, and `inWorld` gating) are robust and production-ready for subsequent narrator and landmark rollouts.

---

## Verification of Previous Issues (Round 1 → Round 2)

| # | Previous Finding | Severity | Status | Verification & Evidence |
|---|---|---|---|---|
| 1 | **Unlatched Quality Downgrade Mutates Open Presentation** | Serious | **FIXED** | [`libs/landmarks/feature/src/lib/landmark-context.tsx:145-172`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-context.tsx#L145-L172): `latched` ref captures effective presentation on `open` and clears on matching `close`. [`presentationFor`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-context.tsx#L197-L200) serves the latched state while open. Live quality downgrade retains in-world card until closed. Verified by test in [`libs/landmarks/feature/src/lib/landmark-dom.spec.tsx:248-280`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-dom.spec.tsx#L248-L280). |
| 2 | **Focus Hijacking Race on Landmark Switch** | Serious | **FIXED** | [`libs/landmarks/ui/src/lib/landmark-stage.tsx:73, 86, 148-161`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-stage.tsx#L148-L161): `LandmarkStage` tracks `generation.current`. Superseded openings abort cleanup (`generation.current !== mine`). If active focus is inside `[aria-modal="true"]`, cleanup returns early. Autofocus on switch filters out live cards from previous scene ([`landmark-stage.tsx:110-120`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-stage.tsx#L110-L120)). Verified by tests in [`landmark-dom.spec.tsx:282-315`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-dom.spec.tsx#L282-L315) and screenshot [`shots/g-switch-to-dialog-desktop.jpg`](file:///D:/projects/qa3elhamor/.ptah/specs/diegetic-overlays/shots/g-switch-to-dialog-desktop.jpg). |
| 3 | **Missing NaN/Zero Guards on Projection Calculations** | Moderate | **FIXED** | [`apps/web/src/app/in-world/in-world-pose.ts:16-51`](file:///D:/projects/qa3elhamor/apps/web/src/app/in-world/in-world-pose.ts#L16-L51): `focalLengthPx`, `htmlScaleFor`, and `worldPerPixel` validate inputs via `usable()` (finite and > 0) and safely return `0` on invalid input. [`apps/web/src/app/in-world/in-world-card.tsx:291, 314`](file:///D:/projects/qa3elhamor/apps/web/src/app/in-world/in-world-card.tsx#L291): `CardPose` early-returns to preserve the last valid pose when `focal <= 0` or `scale <= 0`. Verified by tests in [`apps/web/src/app/in-world/in-world.spec.ts:50-63`](file:///D:/projects/qa3elhamor/apps/web/src/app/in-world/in-world.spec.ts#L50-L63). |
| 4 | **Undiscoverable Internal Scroll on Mobile Viewports** | Moderate | **FIXED** | [`apps/web/src/app/overlays/citizenship-card/citizenship-card-in-world.tsx:201-272`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card-in-world.tsx#L201-L272): `ScrollingFace` and `overflowOf` dynamically add `role="region"`, `aria-label`, and `tabIndex=0` when content overflows. Mobile CSS hides MRZ ([`citizenship-card-in-world.css:467`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card-in-world.css#L467)), tightens portrait padding to reveal 5 statement lines, and displays a bottom fade with animated chevron indicator (`.citizen-pass__more`, [`citizenship-card-in-world.css:82-140`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card-in-world.css#L82-L140)). Verified in screenshot [`shots/c-front-phone.jpg`](file:///D:/projects/qa3elhamor/.ptah/specs/diegetic-overlays/shots/c-front-phone.jpg). |
| 5 | **Asymmetric Flight Reset on Rapid Re-Open** | Moderate | **FIXED** | [`apps/web/src/app/in-world/in-world-pose.ts:84-94`](file:///D:/projects/qa3elhamor/apps/web/src/app/in-world/in-world-pose.ts#L84-L94): `emergeProgress` accepts `from` parameter. [`apps/web/src/app/in-world/in-world-card.tsx:260-265`](file:///D:/projects/qa3elhamor/apps/web/src/app/in-world/in-world-card.tsx#L260-L265): detects `reversing = m.phase === 'leaving' && m.progress > 0` and sets `m.emergeFrom = m.progress`, reversing smoothly without delay from current position. Verified by test in [`apps/web/src/app/in-world/in-world.spec.ts:109-116`](file:///D:/projects/qa3elhamor/apps/web/src/app/in-world/in-world.spec.ts#L109-L116). |
| 6 | **Per-Frame Heap Allocations in `bobAt`** | Moderate | **FIXED** | [`apps/web/src/app/in-world/in-world-pose.ts:119-127`](file:///D:/projects/qa3elhamor/apps/web/src/app/in-world/in-world-pose.ts#L119-L127): `bobAt` mutates a caller-supplied `out: Bob` scratch object. [`apps/web/src/app/in-world/in-world-card.tsx:186, 286`](file:///D:/projects/qa3elhamor/apps/web/src/app/in-world/in-world-card.tsx#L186): `bobScratch` allocated once at module level. Zero allocations per frame. Verified by test in [`apps/web/src/app/in-world/in-world.spec.ts:100-107`](file:///D:/projects/qa3elhamor/apps/web/src/app/in-world/in-world.spec.ts#L100-L107). |
| 7 | **Bureau Contact Submitter Wiring** | Clean-up | **FIXED** | [`apps/web/src/app/landmarks.config.ts:87`](file:///D:/projects/qa3elhamor/apps/web/src/app/landmarks.config.ts#L87): wired to `createContactSubmitter(import.meta.env)`; `pendingSubmitter` import removed. Verified by `landmarks.config.spec.ts` (all green). |

---

## Detailed Check of Fix Implementations

### 1. Latch Logic in `landmark-context.tsx`
- **Mechanism:** `LandmarkProvider` maintains a `latched` ref (`{ id: string, presentation: LandmarkPresentation } | null`). In the interaction effect handler ([`:161-172`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-context.tsx#L161-L172)), upon receiving an `'open'` effect for a definition, `latched.current` is assigned `effectivePresentation(definition, inWorldRef.current)`. It is cleared only when receiving `'close'` for that exact landmark ID.
- **Consumption:** `presentationFor` checks `latched.current?.id === definition.id`. If matched, it returns the frozen presentation regardless of downstream `inWorld` prop fluctuations. Both `useEffectivePresentation` and `useFocusedLandmark` delegate to `presentationFor`.
- **Verdict:** Fully sound. A quality drop to `'low'` mid-interaction preserves the active in-world card; the fallback to dialog applies cleanly on the next open.

### 2. Switch-Safe Focus Return in `landmark-stage.tsx`
- **Mechanism:**
  - `LandmarkStage` accepts `openId` and forms `session = open ? (openId ?? '') : null` ([`:76`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-stage.tsx#L76)). Switching between landmarks triggers a new layout effect invocation.
  - `generation.current` increments on every session opening ([`:86`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-stage.tsx#L86)). The passive `useEffect` cleanup compares `generation.current !== mine` ([`:151`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-stage.tsx#L151)); if superseded by a newer opening, it aborts without returning focus.
  - Modal collision check: if `document.activeElement?.closest('[aria-modal="true"]')` is truthy ([`:155`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-stage.tsx#L155)), the newly opened dialog owns focus and the cleanup leaves it undisturbed.
  - Previous scene isolation: autofocus snapshots pre-existing candidate elements into a `previous` set ([`:110-112`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-stage.tsx#L110-L112)) so that departing DOM nodes still in the slot are never focused.
- **Verdict:** Solves both switch-to-dialog and switch-to-stage focus races.

### 3. Overflow Affordance & Keyboard Region in `citizenship-card-in-world.tsx`
- **Mechanism:** `ScrollingFace` mounts a viewport wrapping the scrollable face. `overflowOf` measures `scrollHeight - clientHeight > 1` and remaining distance.
- **Keyboard accessibility:** `role="region"`, `aria-label`, and `tabIndex=0` are conditionally attached *only* when `overflow.scrollable` is true ([`:263-265`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card-in-world.tsx#L263-L265)). On desktop viewports where content fits comfortably, no extraneous tab stops or landmarks are created.
- **Visuals:** When `overflow.more` is true, `.citizen-pass__more` renders an animated chevron disc (`:before` and `:after`) above a gradient fade mask ([`citizenship-card-in-world.css:82-140`](file:///D:/projects/qa3elhamor/apps/web/src/app/overlays/citizenship-card/citizenship-card-in-world.css#L82-L140)).
- **Mobile layout:** At `<= 30rem`, the decorative passport MRZ text is hidden (`display: none`), expanding vertical space for 5 visible bio lines before the fade.
- **Verdict:** Highly polished UX; addresses the truncation discovery defect without adding desktop tab stops.

### 4. Reverse-from-Current Flight in `in-world-card.tsx`
- **Mechanism:** When `phase` becomes `'emerging'`, `CardPose` checks `reversing = m.phase === 'leaving' && m.progress > 0` ([`:262`](file:///D:/projects/qa3elhamor/apps/web/src/app/in-world/in-world-card.tsx#L262)). If true, `m.emergeFrom = m.progress` and `m.door` is preserved. `emergeProgress` calculates `start + remaining * easeOutCubic(elapsed / duration)` with a duration scaled proportionally to remaining distance (`:84-94`).
- **Verdict:** Physics-consistent motion. The card smoothly reverses direction mid-flight rather than jumping back to the door.

---

## Test & Suite Status

Ran: `npx nx run-many -t lint,typecheck,test -p landmarks-domain landmarks-feature landmarks-ui web --skipSync --skip-nx-cache`

- **`landmarks-domain`**: 25/25 tests passed (100%), lint clean, typecheck clean.
- **`landmarks-ui`**: 18/18 tests passed (100%), lint clean, typecheck clean.
- **`landmarks-feature`**: 22/22 tests passed (100%), lint clean, typecheck clean.
- **`web` in-world & landmarks test suites**:
  - `in-world.spec.ts`: 13/13 passed.
  - `citizenship-card-in-world.spec.tsx`: 7/7 passed.
  - `citizenship-card.spec.tsx`: 11/11 passed.
  - `landmarks.config.spec.ts`: 7/7 passed.
  - `landmark-ports.spec.tsx`: 4/4 passed.
  - `dive.config.spec.ts`: 8/8 passed.
  - `contact-submitters.spec.ts`: 35/35 passed.
  - `complaint-scroll.spec.tsx`: 13/13 passed.
  - Total passed in `web`: 160 tests.
- **Out-of-Scope Workspace Divergences**:
  - `content-domain:typecheck`: fails due to concurrent narrator lane (`narration` property added to `ContentFiles` interface while unit tests are being updated).
  - `web:test` (`app.spec.tsx > reports the manifested asset count`): fails expecting `/8 assets manifested/` because the narrator lane added 2 new GLB assets to `asset-manifest.ts` (now 10). Unrelated to the landmark kernel or diegetic overlays.

---

## Verdict

- **Recommendation:** APPROVED
- **Confidence:** HIGH
- **Score:** 9/10
- **Summary:** The diegetic-overlays Pineapple prototype and its underlying kernel components (`LandmarkStage`, `LandmarkProvider` presentation latching, switch-safe focus restoration, pixel-exact R3F Html scaling) are robust, accessible, and ready for owner sign-off and subsequent landmark adaptation.
