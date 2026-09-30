# Code Logic Review (Round 2) — `landmark-kernel`

## Summary

| Metric              | Value      |
| ------------------- | ---------- |
| Overall score       | 9/10       |
| Assessment          | APPROVED   |
| Blocking issues     | 0          |
| Serious issues      | 0          |
| Moderate issues     | 0          |
| Minor issues        | 2          |
| Regressions found   | 0          |

---

## Status of Round 1 Findings

| # | Finding from Round 1 | Previous Severity | Status | Verification (file:line) |
|---|----------------------|-------------------|--------|--------------------------|
| **B1** | Mandatory 2D dialog shell blocks in-world landmarks | Blocking | **RESOLVED** | Added `presentation: 'dialog' \| 'in-world' \| 'none'` in [`landmark-definition.ts:39`](file:///D:/projects/qa3elhamor/libs/landmarks/domain/src/lib/landmark-definition.ts#L39); in-scene children rendered via `<LandmarkLayer scenes={...}>` in [`landmark-layer.tsx:294-312`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-layer.tsx#L294-L312); hit target disables raycast while open ([`landmark-layer.tsx:275`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-layer.tsx#L275)); non-modal `LandmarkReturnBar` provided for `in-world`/`none` in [`landmark-dom.tsx:93-106`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-dom.tsx#L93-L106); validation enforces `overlay` for dialogs and `scene` for in-world ([`landmark-registry.ts:106-121`](file:///D:/projects/qa3elhamor/libs/landmarks/domain/src/lib/landmark-registry.ts#L106-L121)). |
| **S2** | Missing background `inert` and focus trap boundary | Serious | **RESOLVED** | Implemented `inertOutside` in [`focus-management.ts:41-64`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/focus-management.ts#L41-L64); applied in `LandmarkOverlayHost` layout effect ([`landmark-overlay-host.tsx:82-95`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-overlay-host.tsx#L82-L95)); trap recovery re-captures escaped focus in [`landmark-overlay-host.tsx:131-143`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-overlay-host.tsx#L131-L143). |
| **S3** | Focus drop to `body` on closing 3D-activated overlay | Serious | **RESOLVED** | `isReturnableFocus` checks if opener is valid, connected, and not in `aria-hidden` or `inert` containers ([`focus-management.ts:24-34`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/focus-management.ts#L24-L34)); `returnFocus` routes to matching `landmarkIndexButton(lastId.current)` ([`landmark-dom.tsx:66-69`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-dom.tsx#L66-L69)); visually verified in screenshot `4-focus-returned-to-nav.png`. |
| **S4** | Direct state machine lock-out between landmarks | Serious | **RESOLVED** | `transition()` now transitions from `focused(A)` to `focused(B)` when `event.id !== state.id` ([`landmark-interaction.ts:89-91`](file:///D:/projects/qa3elhamor/libs/landmarks/domain/src/lib/landmark-interaction.ts#L89-L91)); `effectsOf` emits `close` with reason `'switch'` then `open` ([`landmark-interaction.ts:110-112`](file:///D:/projects/qa3elhamor/libs/landmarks/domain/src/lib/landmark-interaction.ts#L110-L112)); `LandmarkProvider` skips `camera.release()` on `'switch'` so camera travels directly to next stop ([`landmark-context.tsx:132`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-context.tsx#L132)). |
| **S5** | Scroll lock desynchronization with dive release | Serious | **RESOLVED** | `LandmarkOverlays` sets `lockScroll={false}` on `LandmarkOverlayHost` ([`landmark-dom.tsx:80`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-dom.tsx#L80)); dive controller's native `heldScroll` management governs scroll restoration without browser overflow race conditions. |
| **FM4** | Single-instance scene graph constraint in `useCompressedModel` | Serious | **RESOLVED** | `useCompressedModel` returns `gltf.scene.clone(true)` per consumer ([`use-compressed-model.ts:39`](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/use-compressed-model.ts#L39)); `useInstanceMaterials` clones materials locally per landmark for hover tinting ([`landmark-materials.ts:23-47`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-materials.ts#L23-L47)), preventing cross-landmark mutation while keeping underlying geometries/textures refcounted. |
| **FM5** | Beacon bleed-through across world geometry | Moderate | **RESOLVED** | `useBeaconVisibility` implements distance attenuation (`beaconRange: [45, 80]`) and throttled raycast occlusion against scene geometry ([`beacon-visibility.ts:81-126`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/beacon-visibility.ts#L81-L126)); sets `data-hidden` and `pointer-events: none` when obstructed or out of range ([`landmark-beacon.css:32-34`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-beacon.css#L32-L34)). |
| **M1** | Shared texture multi-disposal in `disposeObjectTree` | Moderate | **RESOLVED** | `disposeObjectTree` collects unique textures into `const textures = new Set<Texture>()` before disposing ([`ocean-floor.tsx:51-58`](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/ocean-floor.tsx#L51-L58)). |
| **M4** | Z-index collision between beacons and `LandmarkNav` | Moderate | **RESOLVED** | Beacon anchor lowered to `zIndexRange={[9, 1]}` ([`landmark-layer.tsx:324`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/landmark-layer.tsx#L324)); `LandmarkNav` elevated to `z-index: 30` ([`landmark-index.css:5`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-index.css#L5)); beacons cannot occlude or intercept clicks on nav items. |
| **M5** | No data payload passed to overlays | Moderate | **JUSTIFIED** | Documented design decision in [`README.md:86-89`](file:///D:/projects/qa3elhamor/libs/landmarks/README.md#L86-L89): content binding is handled via React closure/HOC at registration in `apps/web`. Evaluated below; confirmed sound. |
| **--** | Per-landmark camera framing customization | Moderate | **JUSTIFIED** | Documented design decision in [`README.md`](file:///D:/projects/qa3elhamor/libs/landmarks/README.md) and [`landmark-definition.ts:73-75`](file:///D:/projects/qa3elhamor/libs/landmarks/domain/src/lib/landmark-definition.ts#L73-L75): camera positioning, view offsets, and look-at targets belong to dive waypoints. Evaluated below; confirmed sound. |

---

## Evaluation of "Documented Instead" Decisions

### 1. Overlay Content Props (Currying at Registration vs Generic Prop Bag)
- **Author's decision**: Overlays receive only `{ landmarkId, title, locale, dir, onClose }`. Specific domain content (bio text, contact submission handlers, menu items) is bound where the overlay is registered in `apps/web`:
  ```tsx
  export const LANDMARK_OVERLAYS = {
    pineapple: (props) => <PineappleOverlay {...props} bio={content.profile} />
  };
  ```
- **Reviewer evaluation**: **Sound and Approved**.
  Injecting content via HOC or currying at the composition root (`apps/web`) is standard React architecture. It keeps `libs/landmarks` generic and strictly decoupled from any content schema. It avoids an untyped `data?: unknown` bag and preserves single responsibility.

### 2. Per-Landmark Camera Framing (Owned by Dive Waypoint vs Landmark Definition)
- **Author's decision**: Camera framing parameters (offsets, look-at targets, distance) belong to the dive's waypoint definition (`libs/dive/domain` and `dive.config.ts`), rather than duplicating camera kinematics in `LandmarkDefinition`.
- **Reviewer evaluation**: **Sound and Approved**.
  The dive waypoint already defines camera positions, tangent calculations, and look-at targets along the Catmull-Rom spline. Duplicating camera offset or FOV in `LandmarkDefinition` would create two competing sources of truth and leak camera controller concerns into the landmark definition.

---

## Regression & Edge Case Hunting

### 1. Can `krusty-krab` (3D Menu with Hover-Zoom) and `complaints-wall` (In-World Board) be built with ZERO kernel changes?
- **Verified**:
  - `krusty-krab`: Declared with `presentation: 'in-world'`, `scene: 'krusty-krab-menu'`. `KrustyKrabMenuScene` receives `phase`, `bounds`, `locale`, `activate`, `close`. When focused, `landmark-layer.tsx:275` disables raycasting on the landmark hit box (`raycast={phase === 'focused' ? NO_RAYCAST : Mesh.prototype.raycast}`), allowing child meshes to handle hover-zoom pointer events without interference. `LandmarkReturnBar` provides non-modal return controls without dimming the 3D scene.
  - `complaints-wall`: Declared with `presentation: 'in-world'`, `scene: 'complaints-board'`. The 3D board renders notes directly in scene coordinates. No modal dialog is created; accessible return navigation is provided via `LandmarkReturnBar`.
  - **Verdict**: Both roadmap items can now be implemented as pure content/feature additions with zero kernel modifications.

### 2. Memory & Instance Isolation with Model Cloning
- **Verified**: `useCompressedModel` calls `gltf.scene.clone(true)`, ensuring each landmark has an isolated `Object3D` node hierarchy. Reusing a model URL across multiple landmarks no longer steals meshes from earlier instances. `useInstanceMaterials` clones materials on mount and disposes them on unmount, ensuring hover tints on one landmark do not bleed into sibling landmarks sharing the same base model. Shared GPU geometries and textures are properly retained and disposed via refcount in `retainModel`.

### 3. Focus & Inert Interactions during Direct Switching
- **Verified**: When transitioning from dialog to dialog, background remains `inert`. When transitioning from dialog to in-world, `restoreBackground()` properly removes `inert` before `LandmarkReturnBar` mounts and focuses its return button. When closing, focus consistently returns to the landmark's navigation item in `LandmarkNav`.

### 4. Occlusion Raycast Performance
- **Verified**: Occluder search is cached across a 2-second window ([`beacon-visibility.ts:44`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/beacon-visibility.ts#L44)). Raycast intersection checks are throttled to 4 Hz (every 250ms) per beacon and phase-staggered across frames using randomized start offsets ([`beacon-visibility.ts:89`](file:///D:/projects/qa3elhamor/libs/landmarks/feature/src/lib/beacon-visibility.ts#L89)). Rays only test against opaque, non-instanced meshes, bypassing transparent water and particles. Frame impact is negligible.

---

## New Findings

### Minor issues

1. **Autofocus re-targeting on direct dialog-to-dialog switch**
   - **File**: [`libs/landmarks/ui/src/lib/landmark-overlay-host.tsx:79-101`](file:///D:/projects/qa3elhamor/libs/landmarks/ui/src/lib/landmark-overlay-host.tsx#L79-L101)
   - **Observation**: The layout effect in `LandmarkOverlayHost` that moves focus to the first interactive element inside the dialog depends only on `[open]`. If an overlay programmatically invokes `activate()` for another `dialog` landmark, `open` remains `true`. While the title and children update, focus is not automatically re-targeted to the new overlay's first control.
   - **Impact**: Minor. Direct dialog-to-dialog programmatic switches are uncommon, but adding `title` or a key to the dependency array would ensure autofocus runs whenever the active dialog changes.

2. **Vitest build warning for `__dirname` in configs**
   - **File**: `libs/landmarks/domain/vitest.config.mts:4:9`, `libs/landmarks/ui/vitest.config.mts:5:9`, `libs/landmarks/feature/vitest.config.mts:5:9`
   - **Observation**: Vite emits deprecation warnings regarding `__dirname`.
   - **Recommendation**: Replace `__dirname` with `import.meta.dirname`.

---

## Verdict

- **Recommendation**: APPROVE
- **Confidence**: HIGH
- **Top risk**: None remaining at the kernel level.
- **Summary**: All 5 serious/blocking architectural issues, failure modes, and accessibility gaps from Round 1 have been completely resolved with clean, well-tested code. The kernel now fully supports in-world 3D scenes (Krusty Krab menu, Complaints Wall), prevents focus trapping and leaks, isolates cloned model instances, and handles direct landmark switching seamlessly.
