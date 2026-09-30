# Code Logic Review — `landmark-kernel`

## Summary

| Metric              | Value            |
| ------------------- | ---------------- |
| Overall score       | 6/10             |
| Assessment          | NEEDS_REVISION   |
| Blocking issues     | 1                |
| Serious issues      | 4                |
| Moderate issues     | 5                |
| Minor issues        | 3                |
| Failure modes found | 5                |

---

## Five logic questions

### 1. How does this fail silently?
- **Silently rejected activation while focused** ([`libs/landmarks/domain/src/lib/landmark-interaction.ts:83-85`](file:///D:/projects/qa3elhamor/libs/landmarks/domain/src/lib/landmark-interaction.ts#L83-L85)): While in `focused` state, `transition()` returns the existing state unchanged for any incoming `activate` or `hover` event. If an overlay provides a "Jump to next landmark" action or a script triggers activation, the call is discarded without error, callback, or feedback.
- **Synchronous scroll restoration under active scroll lock** ([`libs/landmarks/ui/src/lib/landmark-overlay-host.tsx:98-103`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-overlay-host.tsx#L98-L103) & [`libs/landmarks/feature/src/lib/landmark-context.tsx:123`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-context.tsx#L123)): When an overlay closes, `actions.close()` synchronously triggers `camera.release()` before React commits the unmount of `LandmarkOverlayHost`. At this exact moment, `document.documentElement.style.overflow` is still `'hidden'`. In browsers where programmatic `window.scrollTo()` fails or is clamped under `overflow: hidden`, scroll restoration is silently dropped.
- **Un-occluded beacon rendering through world geometry** ([`libs/landmarks/feature/src/lib/landmark-layer.tsx:217-226`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-layer.tsx#L217-L226)): Drei's `<Html>` wrapper lacks `occlude` and distance culling. Beacons float directly through mountains, seabed dunes, and foreground structures at 100% opacity without depth testing.
- **Duplicate texture disposal without deduplication** ([`libs/world/feature/src/lib/ocean-floor.tsx:40-45`](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/ocean-floor.tsx#L40-L45)): While materials are collected in a `Set<Material>`, textures are extracted via `Object.values(material)` and disposed directly. If multiple materials in a GLB share a normal map or roughness map, `.dispose()` is called repeatedly on the same texture object.

### 2. What user action produces unexpected behaviour?
- **Clicking a landmark in the 3D scene and closing the overlay** ([`libs/landmarks/ui/src/lib/landmark-overlay-host.tsx:77-93`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-overlay-host.tsx#L77-L93)): When opened by clicking the 3D mesh, `document.activeElement` is `document.body` (since `<Canvas>` is `aria-hidden` and untabbed). On closing the dialog, `opener.focus()` focuses `document.body`, dropping keyboard/screen-reader focus to the top of the document. If clicked via the beacon button (`tabIndex={-1}` inside `<Canvas aria-hidden="true">`), focus is returned to an element inside an `aria-hidden` container.
- **Tapping on touch devices without a dedicated hover preview**: Mobile touch devices emit synthetic pointer/click events in rapid succession. A single tap activates the landmark and immediately opens the modal dialog, giving mobile users no way to read the beacon label/caption without launching the modal overlay.
- **Dragging to scroll starting on a beacon**: Beacons have `pointer-events: auto` and a `<button>` element. Touching a beacon to initiate a scroll gesture triggers click activation rather than smooth dive scrolling.

### 3. What input data produces a wrong answer?
- **Landmarks requiring in-world 3D presentation instead of a 2D dialog** ([`libs/landmarks/domain/src/lib/landmark-definition.ts:54`](file:///D:/projects/qa3elhamor/libs/landmarks/domain/src/lib/landmark-definition.ts#L54) & [`libs/landmarks/feature/src/lib/landmark-dom.tsx:40-58`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-dom.tsx#L40-L58)): `LandmarkDefinition.overlay` is strictly required. Registering a landmark like `complaints-wall` forces `LandmarkOverlays` to wrap it in `LandmarkOverlayHost` (a full-screen modal 2D aged-paper dialog over a dark water backdrop), making it impossible to render an in-world 3D complaints board without kernel edits.
- **Reusing a model asset across multiple landmarks** ([`libs/world/feature/src/lib/use-compressed-model.ts:22-35`](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/use-compressed-model.ts#L22-L35)): `useCompressedModel` returns `gltf.scene` without cloning. In Three.js, an `Object3D` cannot have multiple parents. Assigning the same model asset to two landmarks removes the meshes from the first landmark and moves them to the second.
- **Overlay content requiring external data props**: `LandmarkOverlayProps` receives only `{ landmarkId, title, locale, dir, onClose }`. It cannot receive content payloads from `content/` (e.g. bio text, services menu items, credit lists) or per-landmark configuration.

### 4. What happens when a dependency fails?
- **Model load failure (404/network error)**: Handled properly by `ModelBoundary` in [`libs/landmarks/feature/src/lib/landmark-layer.tsx:310-335`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-layer.tsx#L310-L335). It clears the loader cache via `evictModel`, fires `reportModelError`, and renders the fallback clickable sphere with beacon intact.
- **Invalid dive waypoint or missing overlay key**: Handled fail-fast at boot time by `createLandmarkRegistry` ([`libs/landmarks/domain/src/lib/landmark-registry.ts:170-184`](file:///D:/projects/qa3elhamor/libs/landmarks/domain/src/lib/landmark-registry.ts#L170-L184)), producing descriptive error messages.
- **Dive camera release on unmount**: `LandmarkProvider` cleanup correctly releases the camera if unmounted while focused ([`libs/landmarks/feature/src/lib/landmark-context.tsx:131-137`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-context.tsx#L131-L137)).

### 5. What is missing that the requirements never mentioned?
- **In-scene custom 3D children**: `LandmarkLayer` only renders `<primitive object={model} />` and hit meshes. There is no slot or render prop for custom 3D children (e.g. 3D interactive menu cards, floating complaint slips, custom particle emitters).
- **Per-landmark camera framing parameters**: Landmarks only specify `waypoint: string`. There is no framing distance, elevation offset, or FOV adjustment per landmark.
- **Background `inert` during dialog display**: `LandmarkOverlayHost` does not mark the root app tree `inert`, allowing screen readers and virtual cursors to leak out of the portal into background DOM.
- **Distance attenuation and occlusion for beacons**: Drei `<Html>` beacons lack depth occlusion and distance attenuation, resulting in visual clutter.

---

## Failure modes

### 1. Inability to support non-dialog in-world landmarks
- **Trigger**: Introducing `complaints-wall` (in-world board) or `krusty-krab` (3D menu with hover-zoom).
- **Symptom**: `complaints-wall` cannot render without declaring an `overlay` key in `LANDMARKS`. Upon activation, `LandmarkOverlays` mounts `LandmarkOverlayHost`, dimming the scene with a 2D modal dialog rather than presenting an in-world 3D board.
- **Evidence**: [`libs/landmarks/domain/src/lib/landmark-registry.ts:105-108`](file:///D:/projects/qa3elhamor/libs/landmarks/domain/src/lib/landmark-registry.ts#L105-L108), [`libs/landmarks/feature/src/lib/landmark-dom.tsx:40-58`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-dom.tsx#L40-L58).
- **Current handling**: Validation fails if `overlay` is omitted. `LandmarkOverlays` unconditionally renders `LandmarkOverlayHost`.
- **Recommendation**: Support `overlay?: string | null` or `presentation?: 'dialog' | 'in-world' | 'none'`, and provide in-scene child rendering in `LandmarkLayer`.

### 2. Focus loss on closing 3D-initiated landmark overlays
- **Trigger**: User clicks a landmark model or beacon in the 3D canvas, opens the overlay, and closes it via Escape or the close button.
- **Symptom**: Focus is dropped to `document.body` or into the `aria-hidden` canvas container instead of returning to the landmark list navigation button.
- **Evidence**: [`libs/landmarks/ui/src/lib/landmark-overlay-host.tsx:77-93`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-overlay-host.tsx#L77-L93), [`libs/landmarks/feature/src/lib/landmark-layer.tsx:228-230`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-layer.tsx#L228-L230).
- **Current handling**: Captures `document.activeElement` on open; falls back to whatever was focused (often `<body>`).
- **Recommendation**: When `opener` is `document.body` or within `<Canvas>`, route return focus to the corresponding button in `LandmarkNav` via `document.querySelector(`[data-landmark-id="${id}"]`)`.

### 3. Scroll lock race corrupting dive camera release
- **Trigger**: Visitor opens an overlay while scrolled mid-dive, then dismisses it.
- **Symptom**: `camera.release()` calls `source.scrollTo(this.heldScroll, false)` while `document.documentElement.style.overflow = 'hidden'` is still active on `<html>`. On browsers where `scrollTo` is ignored under `overflow: hidden`, the scroll position is not restored, or on mobile WebKit where `scrollY` resets to 0, dive progress snaps to 0.
- **Evidence**: [`libs/landmarks/ui/src/lib/landmark-overlay-host.tsx:98-103`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-overlay-host.tsx#L98-L103), [`libs/dive/feature/src/lib/dive-controller.ts:199-204`](file:///D:/projects/qa3elhamor/libs/dive/feature/src/lib/dive-controller.ts#L199-L204).
- **Current handling**: `LandmarkProvider` calls `camera.release()` synchronously on close dispatch, while `LandmarkOverlayHost` removes `overflow: hidden` in a separate React layout/effect cycle.
- **Recommendation**: Remove scroll lock before triggering camera release, or preserve scroll offset explicitly via window scroll position locking technique (e.g. `position: fixed; top: -${scrollY}px`).

### 4. Single-instance scene graph constraint in `useCompressedModel`
- **Trigger**: Two landmark definitions point to the same model URL (e.g. identical props or architectural elements).
- **Symptom**: The first landmark becomes invisible because Three.js reparents `gltf.scene` to the second landmark. When either unmounts, shared textures and geometries are disposed while still in use.
- **Evidence**: [`libs/world/feature/src/lib/use-compressed-model.ts:22-35`](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/use-compressed-model.ts#L22-L35).
- **Current handling**: Documents "Mount the result once; it is not cloned".
- **Recommendation**: Clone the loaded scene (`clone()` or `SkeletonUtils.clone()`) per landmark instance while retaining shared geometries/textures under refcounted disposal.

### 5. Beacon bleed-through across world geometry
- **Trigger**: Visitor looks towards a landmark that is physically obstructed by terrain (e.g. Krusty Krab behind the hill or distant buildings).
- **Symptom**: Beacons float unobstructed on top of foreground mountains, cluttering the view and misrepresenting line of sight.
- **Evidence**: [`libs/landmarks/feature/src/lib/landmark-layer.tsx:217-226`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-layer.tsx#L217-L226).
- **Current handling**: Unoccluded `<Html>` with `zIndexRange={[20, 0]}`.
- **Recommendation**: Enable `occlude` prop on `<Html>` or compute camera-to-landmark distance with visibility/opacity fading based on depth.

---

## Blocking issues

### 1. Architectural lock-in: Mandatory 2D dialog shell blocks in-world landmarks
- **File**: [`libs/landmarks/domain/src/lib/landmark-registry.ts:105-108`](file:///D:/projects/qa3elhamor/libs/landmarks/domain/src/lib/landmark-registry.ts#L105-L108) & [`libs/landmarks/feature/src/lib/landmark-dom.tsx:40-58`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-dom.tsx#L40-L58)
- **Scenario**: Roadmap items require `krusty-krab` (3D menu with hover-zoom) and `complaints-wall` (in-world 3D board, NOT a dialog).
- **Impact**: Neither landmark can be built on the kernel without breaking changes. `LandmarkDefinition` forces every landmark to register an `overlay` key, and `LandmarkOverlays` unconditionally renders a 2D modal paper dialog portalled into `document.body`, obscuring the 3D scene with an overlay backdrop. Furthermore, `LandmarkLayer` provides no mechanism to inject custom 3D children into the scene graph.
- **Fix**:
  1. Make `overlay` optional in `LandmarkDefinition` (`readonly overlay?: string;`).
  2. Support a `presentation` mode or custom overlay host (`mode: 'dialog' | 'in-world' | 'custom'`).
  3. Allow `LandmarkLayer` or `LandmarkDefinition` to accept in-scene child components (e.g. `renderInScene?: (definition: LandmarkDefinition) => ReactNode`).

---

## Serious issues

### 2. Missing background `inert` and focus trap boundary
- **File**: [`libs/landmarks/ui/src/lib/landmark-overlay-host.tsx:138-170`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-overlay-host.tsx#L138-L170)
- **Scenario**: User opens an overlay and navigates with assistive technology (VoiceOver, NVDA, or TalkBack) using virtual cursor or swipe gestures.
- **Impact**: The dialog is portalled into `document.body`, but the main app root and sibling DOM trees are NOT set to `inert`. Screen readers can escape the dialog and interact with the canvas, depth gauge, or nav in the background.
- **Fix**: Use native HTML `<dialog>` with `.showModal()`, or apply `inert` to `#root` / background siblings while `open` is true.

### 3. Focus drop to `body` on closing 3D-activated overlay
- **File**: [`libs/landmarks/ui/src/lib/landmark-overlay-host.tsx:77-93`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-overlay-host.tsx#L77-L93)
- **Scenario**: Visitor activates a landmark by clicking the 3D model in the canvas, then presses Escape or the close button.
- **Impact**: Because the canvas is not focusable (`aria-hidden="true"`), `document.activeElement` was `<body>`. When the overlay unmounts, `opener.focus()` sets focus to `<body>`, resetting the virtual cursor to the top of the document.
- **Fix**: If `opener` is `body` or inside `<Canvas>`, explicitly return focus to the landmark's corresponding button in `LandmarkNav` (`document.querySelector(`[data-landmark-id="${landmarkId}"]`)?.focus()`).

### 4. Direct state machine lock-out between landmarks
- **File**: [`libs/landmarks/domain/src/lib/landmark-interaction.ts:83-85`](file:///D:/projects/qa3elhamor/libs/landmarks/domain/src/lib/landmark-interaction.ts#L83-L85)
- **Scenario**: While one landmark is focused, an overlay or external control attempts to navigate directly to another landmark (`activate('bureau')`).
- **Impact**: `transition()` ignores `activate` if `state.phase === 'focused'`. Calling `activate` for a different landmark is a no-op; the user is forced to close the current landmark first.
- **Fix**: Allow `activate` to transition from `focused(A)` to `focused(B)` when `event.id !== state.id`, emitting a `close` effect for A and an `open` effect for B.

### 5. Scroll lock desynchronization with dive release
- **File**: [`libs/landmarks/ui/src/lib/landmark-overlay-host.tsx:98-103`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-overlay-host.tsx#L98-L103) & [`libs/dive/feature/src/lib/dive-controller.ts:199-204`](file:///D:/projects/qa3elhamor/libs/dive/feature/src/lib/dive-controller.ts#L199-L204)
- **Scenario**: Overlay is closed; `actions.close()` calls `camera.release()`.
- **Impact**: In `release()`, `source.scrollTo(this.heldScroll, false)` runs synchronously while `document.documentElement.style.overflow` is still `'hidden'`. On mobile browsers (such as iOS Safari), calling `scrollTo` while locked can fail or reset `scrollY` to 0, corrupting camera dive progress upon return.
- **Fix**: Synchronize scroll unlocking with camera release: restore `overflow` prior to `camera.release()`, or track scroll offset via fixed-position layout locking rather than raw `overflow: hidden`.

---

## Moderate and minor issues

### Moderate issues
1. **Shared texture multi-disposal in `disposeObjectTree`** ([`libs/world/feature/src/lib/ocean-floor.tsx:40-45`](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/ocean-floor.tsx#L40-L45)): Multiple materials sharing a texture cause duplicate `.dispose()` invocations. Textures should be collected in a `Set<Texture>`.
2. **Missing `occlude` on beacon `<Html>`** ([`libs/landmarks/feature/src/lib/landmark-layer.tsx:217-226`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-layer.tsx#L217-L226)): Beacons do not test depth against the terrain mesh, showing labels through solid geometry.
3. **No distance fading or max-distance culling for beacons** ([`libs/landmarks/feature/src/lib/landmark-layer.tsx:217`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-layer.tsx#L217)): Beacons across the entire scene render at full size and opacity regardless of distance.
4. **Z-index collision between beacons and `LandmarkNav`** ([`libs/landmarks/feature/src/lib/landmark-layer.tsx:224`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-layer.tsx#L224) & [`libs/landmarks/ui/src/lib/landmark-index.css:5`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-index.css#L5)): Beacons have `zIndexRange={[20, 0]}`, while `LandmarkNav` has `z-index: 10`. Projected beacons overlapping the navigation list block clicks to the list buttons.
5. **No data payload passed to overlays** ([`libs/landmarks/ui/src/lib/overlay-types.ts:4-13`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/overlay-types.ts#L4-L13)): `LandmarkOverlayProps` lacks content or domain data props, forcing overlays to rely on global imports.

### Minor issues
1. **Emissive tint mutation on shared materials** ([`libs/landmarks/feature/src/lib/landmark-layer.tsx:275-290`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-layer.tsx#L275-L290)): `useHoverTint` directly mutates `material.emissive`. If materials are shared across objects, hovering one tints all of them.
2. **Untyped error handling in `reportModelError`** ([`libs/landmarks/feature/src/lib/landmark-context.tsx:48-51`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-context.tsx#L48-L51)): `error: unknown` is passed into `reportLandmarkEvent` with minimal serialization safeguards.
3. **Vite deprecation warning in test configs** ([`vitest.config.mts:4:9`](file:///D:/projects/qa3elhamor/libs/landmarks/domain/vitest.config.mts)): Uses `__dirname` instead of `import.meta.dirname`.

---

## Data flow

1. **User interaction** (3D mesh click, beacon click, or `LandmarkIndex` button press)
   - *Status*: OK
2. **`LandmarkInteraction.dispatch({ type: 'activate', id, source })`**
   - *Status*: GAP (Blocked if already focused on another landmark; [`landmark-interaction.ts:83`](file:///D:/projects/qa3elhamor/libs/landmarks/domain/src/lib/landmark-interaction.ts#L83))
3. **Transition to `focused` & emit `open` effect**
   - *Status*: OK
4. **`LandmarkProvider` effect execution**
   - Camera: `cameraRef.current.focus(waypoint)`
   - Telemetry: `onLandmarkEvent({ type: 'landmark_open', ... })`
   - *Status*: OK
5. **DiveController mode shift to `'focus'`**
   - Captures `heldScroll`; sets target to `waypoint.progress`; eases camera to waypoint
   - *Status*: OK
6. **DOM Overlay rendering (`LandmarkOverlays`)**
   - Mounts `LandmarkOverlayHost` with `open={true}`
   - *Status*: GAP (Forces modal 2D dialog shell for all landmarks; [`landmark-dom.tsx:41`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-dom.tsx#L41))
7. **Scroll lock applied (`overflow = 'hidden'`)**
   - *Status*: GAP (Does not mark background `inert`; [`landmark-overlay-host.tsx:98`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-overlay-host.tsx#L98))
8. **User dismissal (Escape, backdrop, or close button)**
   - *Status*: OK
9. **`LandmarkInteraction.dispatch({ type: 'close', reason })`**
   - *Status*: OK
10. **Synchronous `camera.release()` & return to scroll**
    - *Status*: GAP (`release()` runs before scroll unlock commit; [`landmark-context.tsx:123`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-context.tsx#L123))
11. **Return focus to opener**
    - *Status*: GAP (Drops to `body` if opened via 3D canvas; [`landmark-overlay-host.tsx:91`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-overlay-host.tsx#L91))

---

## Requirements fulfilment

| Requirement | Status | Gap |
| ----------- | ------ | --- |
| Positioned 3D landmark models via data entry | COMPLETE | Works as specified via `LANDMARKS` configuration and `LandmarkLayer`. |
| Hit targets, hover, and focus states | COMPLETE | Box, bounds, and sphere hit targets with hover emissive tint and lift bob. |
| Camera focus transition to waypoint | COMPLETE | Integrates cleanly with `useDiveLandmarkCamera` and `DiveController`. |
| Bound HTML overlay with accessible shell | PARTIAL | Solid dialog styling and focus trap, but lacks `inert` background and focus return to 3D triggers. |
| Strict boundary rules (landmarks importing only landmarks/shared) | COMPLETE | Fully verified; zero forbidden imports into dive, world, or web. |
| Support planned landmarks (Pineapple, Bureau) | COMPLETE | Fully compatible with 2D modal dialog overlays. |
| Support planned landmarks (Krusty Krab 3D menu, Complaints Wall in-world board) | MISSING | Kernel lacks in-scene child slots and non-dialog presentation modes. |
| Shared model caching and disposal | PARTIAL | Refcount mechanism works for single instances, but models cannot be cloned or reused across landmarks. |

---

## Edge cases

| Case | Handled | How | Concern |
| ---- | ------- | --- | ------- |
| Rapid repeated clicks on same landmark | YES | State machine ignores redundant `activate` events | None |
| Clicking another landmark while focused | NO | Discarded by `transition()` | Prevents direct landmark switching |
| Escape pressed mid-camera-swim | YES | Eases smoothly back to `heldScroll` | Scroll restoration may clash with active scroll lock |
| Model 404 or network failure | YES | Handled via `ModelBoundary` fallback sphere & beacon | Cache cleared cleanly |
| Touch interaction (tap without hover) | PARTIAL | Bypasses hover straight to `activate` | Cannot inspect beacon without opening full modal |
| Landmark unmounted while focused | YES | Handled via `LandmarkProvider` teardown effect | Camera released cleanly |
| Multiple landmarks sharing model asset | NO | Not cloned; reparented in Three.js | First landmark model disappears |

---

## Gaps for the landmark items

### 1. `krusty-krab` (3D menu with hover-zoom)
- **In-scene children**: Requires 3D menu items rendered within the landmark's local coordinate system. Currently, `LandmarkLayer` only accepts a single GLB model with no extension points for child 3D meshes.
- **Hover-zoom interaction**: Requires interactive sub-elements in 3D that zoom towards the camera on hover, requiring sub-object hit detection not supported by the single-box hit target abstraction.

### 2. `complaints-wall` (In-world board, NOT a dialog)
- **Non-dialog presentation**: Currently, every landmark MUST specify an `overlay` key, and `LandmarkOverlays` unconditionally renders `LandmarkOverlayHost` (a 2D modal dialog with full-screen backdrop). `complaints-wall` requires an in-world 3D board where notes are posted in 3D space, meaning it must be able to suppress the 2D modal overlay shell.

### 3. `landmark-pineapple` & `landmark-bureau` (Bio and form overlays)
- **Content data injection**: Overlays currently receive only `{ landmarkId, title, locale, dir, onClose }`. They have no prop mechanism to receive content data (bio copy, project highlights, form submission endpoints) from the page configuration.

### 4. Camera framing customization
- **No per-landmark camera framing**: Only a dive `waypoint` is specified. If a landmark needs a specific FOV, camera offset, or framing distance (e.g. framing the Complaints Wall head-on versus framing the Pineapple from above), `LandmarkDefinition` provides no fields to pass this to the camera controller.

---

## Verdict

- **Recommendation**: REVISE
- **Confidence**: HIGH
- **Top risk**: The abstraction forces all landmarks into 2D modal dialogs and provides no in-scene 3D extension points, blocking `krusty-krab` (3D menu) and `complaints-wall` (in-world board) from being built without refactoring the kernel.
- **What a robust implementation would add**:
  1. Make `overlay` optional and support `presentation: 'dialog' | 'in-world' | 'none'`.
  2. Add `children` / `renderScene` slot to `LandmarkLayer` for in-scene 3D interactive objects.
  3. Decouple scroll unlock timing from camera release to avoid mobile scroll restoration races.
  4. Ensure `LandmarkOverlayHost` sets `inert` on background siblings and restores focus to `LandmarkNav` when triggered via 3D.
  5. Add `occlude` and distance-based fading to Drei `<Html>` beacons.
