# Code Logic Review — Krusty Krab Narrated Landmark & Kit Visibility Clamp

## Summary

| Metric              | Value          |
| ------------------- | -------------- |
| Overall score       | 7/10           |
| Assessment          | REVISE         |
| Blocking issues     | 0              |
| Serious issues      | 2              |
| Moderate issues     | 2              |
| Minor issues        | 2              |
| Failure modes found | 4              |

The Krusty Krab landmark and the narrated-visit kit extension show strong architectural discipline: procedural 3D primitives with deterministic geometry/material disposal on unmount, accessible mirroring of 3D rows into interactive DOM with full keyboard arrow navigation, unified reuse of the page view's `ServicesSection` across both fallback dialog and in-world overlay, and deterministic candidate selection for narrator visibility.

However, two serious defects require revision:
1. **Inverted speech bubble tail skew**: the tail's skew angle is negated in `narrated-visit.tsx:393`, causing the bubble tail to lean in the *opposite* direction of the speaker. This is visible in the author's own capture screenshots (`shots/c-crab-talking-phone.jpg` and `shots/d-service-selected-desktop.jpg`).
2. **Forced synchronous layout (layout thrashing) in `useFrame`**: `useSpeechBubblePlacement` invokes `getBoundingClientRect()` on an offset parent element at 60 fps inside the render loop immediately around DOM style mutations, inducing layout thrashing on every frame.

---

## Five Logic Questions

### 1. How does this fail silently?
- **Stale occlusion evaluation during asset streaming** (`apps/web/src/app/narrators/narrated-visit.tsx:334-342`):
  `useNarratorPost` runs `sceneOccluders(scene, visitRoot.current)` inside a `useLayoutEffect` on initial mount. If external scene models (e.g. the Chum Bucket building GLB) are still streaming asynchronously over the network, `sceneOccluders` traverses an incomplete scene graph. `inSight` evaluates to `true` for candidate spot 0 (`primary`), placing the crab at an occluded spot. When the building finishes loading moments later, `useNarratorPost` does not re-run because `scene` object identity does not change.
- **Inverted tail lean** (`apps/web/src/app/narrators/narrated-visit.tsx:393`):
  The tail renders cleanly without error or warning, but points away from the narrator towards open water or the awning.

### 2. What user action produces unexpected behaviour?
- **Viewing on mobile or near viewport edges**:
  When the narrator floats to one side and the speech bubble is clamped to the 12 px margin, the tail leans away from the narrator instead of pointing toward its head.
- **Scrolling or resizing during narration**:
  Because `getBoundingClientRect()` is polled every frame in `useFrame`, any layout query during active frame execution causes micro-stutter and frame spikes.
- **Early interaction during board rise**:
  Clicking or hovering rows while the board is rising (`progress < 0.8`) is ignored by `acceptsPick` without visual indication, making the board feel unresponsive until row pop completion.

### 3. What input data produces a wrong answer?
- **Degenerate or negative layer offsets** in `windowSafeInsets` (`apps/web/src/app/narrators/screen-placement.ts:36-48`):
  `windowSafeInsets` only grows `top`, `left`, and `right`, leaving `bottom: insets.bottom`. If a host layer is offset vertically from the window bottom, the bubble does not respect bottom window margins.
- **BiDi punctuation in Arabic pricing**:
  In `krusty-copy.ts`, Arabic copy defines `priceOf: 'السعر · {dish}'`. When `{dish}` contains LTR alphanumeric text or numbers without `<bdi>` wrapping (unlike the chips in `visit-panel`), browser BiDi reordering can flip the dot and price position.

### 4. What happens when a dependency fails?
- **`telemetry.spec.ts` 15 s timeout**:
  `telemetry.spec.ts:43` dynamically imports `./landmark-ports`. `landmark-ports.ts` statically imports `@qa3elhamor/world-feature` and `@qa3elhamor/dive-feature`, pulling the entire Three.js runtime, GLTFLoader, MeshoptDecoder, and R3F into what should be a lightweight telemetry test. In our single run, this import took 4,134 ms; on a loaded system or parallel test worker, this easily exceeds Vitest's 15 s timeout.
- **Missing services data**:
  `menuObjects` gracefully handles undefined service fields (omits price note if missing, falls back to dish name as topic).

### 5. What is missing that the requirements never mentioned?
- **Disposal of global WebGL renderer state**: `MenuBoard` sets `gl.localClippingEnabled = true` in `useEffect`, but never restores previous state on unmount.
- **Tail skew coordinate transformation test**: `narrator-post.spec.ts` and `screen-placement.spec.ts` test `tailLean`, but never test the final CSS `--tail-skew` property in DOM.

---

## Numbered Defects

### Defect 1: Inverted Speech Bubble Tail Skew Angle (Serious)
- **File**: [`apps/web/src/app/narrators/narrated-visit.tsx:390-394`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/narrated-visit.tsx#L390-L394)
- **Scenario**: When the narrator anchor sits horizontally offset from the bubble's tail position (`tailX`), `placeSpeechBubble` computes `place.tailLean` as `clamp(ax - left - tailX, ...)`. When the anchor is to the right of the tail root (`ax > left + tailX`), `tailLean` is positive. In CSS, `transform: skewX(a)` with `transform-origin: 50% 0` shifts points below the origin (`y > 0`) by `y * tan(a)`. Because `y` increases downwards, a positive angle `a > 0` shifts the bottom tip to the right (+X), and a negative angle shifts it to the left (-X).
- **Impact**: Line 393 negates `skew`:
  ```ts
  const skew =
    (Math.atan2(place.tailLean, Math.max(place.tailLength, 1)) * 180) /
    Math.PI;
  box.style.setProperty('--tail-skew', `${(-skew).toFixed(2)}deg`);
  ```
  This inverts the angle. When `tailLean > 0` (anchor to the right), `--tail-skew` is set negative, making the tip lean left (away from anchor). When `tailLean < 0` (anchor to the left), `--tail-skew` is set positive, making the tip lean right (away from anchor).
  - Photographic proof in `.ptah/specs/landmark-krusty-krab/shots/`:
    - `c-crab-talking-phone.jpg`: crab eyes are at ~45% screen width, tail root at ~20%; tail leans sharply to the left away from the crab.
    - `d-service-selected-desktop.jpg`: crab is to the left of the speech box; tail leans sharply rightward towards the awning.
- **Fix**: Remove the negation on line 393:
  ```ts
  box.style.setProperty('--tail-skew', `${skew.toFixed(2)}deg`);
  ```

---

### Defect 2: Per-Frame Forced Synchronous Layout / Layout Thrashing (Serious)
- **File**: [`apps/web/src/app/narrators/narrated-visit.tsx:371`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/narrated-visit.tsx#L371)
- **Scenario**: In `useSpeechBubblePlacement`:
  ```ts
  useFrame(({ camera, size }) => {
    ...
    const layer = (box.offsetParent ?? box.parentElement)?.getBoundingClientRect();
  ```
- **Impact**: `getBoundingClientRect()` forces a synchronous browser layout calculation if any DOM style was invalidated. In every frame of `useFrame`, `box.style.transform`, `box.style.opacity`, and `--tail-*` properties are mutated, alongside label positions in `placeObjectDom`. Polling `getBoundingClientRect()` on an offset parent at 60 fps causes layout thrashing, hurting frame rates especially on mobile devices.
- **Fix**: Cache the parent layer geometry and only recalculate on window resize / orientation change, or pass the parent bounding box from a ResizeObserver/hook rather than querying layout per-frame.

---

### Defect 3: WebGLRenderer Global State Pollution Without Cleanup (Moderate)
- **File**: [`apps/web/src/app/krusty-krab/menu-board.tsx:95-97`](file:///D:/projects/qa3elhamor/apps/web/src/app/krusty-krab/menu-board.tsx#L95-L97)
- **Scenario**:
  ```ts
  useEffect(() => {
    gl.localClippingEnabled = true;
  }, [gl]);
  ```
- **Impact**: Mutates `gl.localClippingEnabled` on the shared Three.js `WebGLRenderer` instance without restoring it when the component unmounts. If future landmarks rely on default renderer state or separate clipping pipelines, this leaked state can cause unexpected rendering side effects.
- **Fix**: Restore the previous value on unmount:
  ```ts
  useEffect(() => {
    const prev = gl.localClippingEnabled;
    gl.localClippingEnabled = true;
    return () => {
      gl.localClippingEnabled = prev;
    };
  }, [gl]);
  ```

---

### Defect 4: Race Condition on Occlusion Check During Lazy Model Streaming (Moderate)
- **File**: [`apps/web/src/app/narrators/narrated-visit.tsx:334-342`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/narrated-visit.tsx#L334-L342)
- **Scenario**:
  ```ts
  useLayoutEffect(() => {
    if (!mounted) return;
    const occluders = sceneOccluders(scene, visitRoot.current);
    const { placement } = chooseNarratorPlacement(candidates, { ... });
    setPost(placement);
  }, [candidates, mounted, scene, view, visitRoot]);
  ```
- **Impact**: If background meshes (e.g. Chum Bucket) are loaded asynchronously via GLTF loaders, they may not be attached to `scene` when `useLayoutEffect` fires. The raycast sees open water and permanently selects candidate 0.
- **Fix**: Allow re-running the check when scene mesh count changes or upon landmark model load completion event.

---

### Defect 5: Unhandled Bottom Edge in `windowSafeInsets` (Minor)
- **File**: [`apps/web/src/app/narrators/screen-placement.ts:36-48`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/screen-placement.ts#L36-L48)
- **Scenario**: `windowSafeInsets` computes safe insets for top, left, right, but sets `bottom: insets.bottom`.
- **Impact**: If the stage layer container is shifted vertically or smaller than window height, bottom clearance cannot be guaranteed by `windowSafeInsets`.
- **Fix**: Compute `bottom: Math.max(insets.bottom, (layer.top + (layer.height ?? size.height)) - window.height + margin)`.

---

### Defect 6: Missing `<bdi>` Isolation on Arabic Price Tag (Minor)
- **File**: [`apps/web/src/app/krusty-krab/krusty-copy.ts:19-21`](file:///D:/projects/qa3elhamor/apps/web/src/app/krusty-krab/krusty-copy.ts#L19-L21)
- **Scenario**: `priceOf: 'السعر · {dish}'` renders in RTL. When `{dish}` is English or contains numbers, the dot separator and words can reorder according to Unicode Bidirectional Algorithm without explicit isolation.
- **Fix**: Use Unicode isolate formatting or `<bdi>` in `SpeechBubble` topic tag.

---

## Detailed Check Verification

### 1. Visibility Test
- **Occlusion computation**: `sceneOccluders` scans `root` (Three.js `Scene`), excluding `visitRoot`. It filters for `mesh.isMesh`, `!(object instanceof InstancedMesh)`, `mesh.visible`, and `isOpaque(mesh.material)`. It tests 4 probe points per placement (`narratorProbePoints`: middle, head at 0.9h, and both sides at `h * 0.48`).
- **Raycast frequency & cost**: Executed in `useLayoutEffect` on mount and resize, **NOT per-frame in `useFrame`**. Cost is 4 raycasts per candidate (8-12 total raycasts per visit opening), which is negligible.
- **Deterministic choice & stability**: Evaluates candidates in strict order `[primary, ...alternatives, nearer]`. First candidate both on-screen and in-sight wins; fallback to first in-sight, then nearer spot. No oscillation or flickering between frames.
- **Pineapple & Tiki compatibility**: Unaffected. Neither defines `narratorAlternatives`, and both have clear lines of sight from resting stops. Candidate 0 passes both checks; all existing specs pass (16 test files, 121 tests pass).

### 2. Bubble Clamp Maths
- **Offset stage layer**: `windowSafeInsets` compensates for layers whose bounding boxes deviate from the window edges (`margin - layer.left`, `layer.right - window.width + margin`), ensuring at least 12 px margin inside the browser window.
- **Clamp & orientation**: Clamps `left` to `[insets.left, viewport.width - insets.right - size.width]`. Re-calculates `tailX` along the bubble width clamped to corners (`[30, size.width - 30]`).
- **Tail re-aim**: Defect 1 identified above: the lean math `tailLean` is calculated correctly in `screen-placement.ts`, but inverted by `-skew` in `narrated-visit.tsx:393`.
- **RTL**: Handled with `bias: dir === 'rtl' ? 0.4 : 0.6`. Tail X is measured from the left edge of the CSS transform box, matching the CSS `left: calc(var(--tail-x) - 16px)` rule.

### 3. Menu Board
- **Disposal**:
  - `MenuBoard` (`menu-board.tsx:150-161`): properly disposes `box`, `scallop`, and all `parts` / `rowMaterials` in a `useEffect` cleanup.
  - `MenuDishes` (`menu-dish.tsx:95-101`): properly disposes all 14 cylinder/box/sphere geometries and 11 `MeshStandardMaterial` instances.
  - Textures: None used (procedural flat-shaded materials).
- **Reduced motion**: Handled comprehensively in `menu-board.tsx`:
  - `opening.current` instantly evaluates to 1 when `out=true` and 0 when `out=false`.
  - Rise, flip overshoot, sway, and dish spin animations are disabled (`sway = 0`, `rotation.y = 0.5`).
  - Landmark dialog fallback (`ServicesMenuOverlay`) is bound in `landmarks.config.ts` for users without WebGL or with reduced motion preference.
- **Selection**: Gated by `acceptsPick(source, pointerType, progress)`:
  - Mouse hover requires 140 ms rest (`HOVER_INTENT_MS`), ignored while rising (`progress < 0.8`).
  - Touch and pen require tap (`onClick`).
  - Keyboard arrow navigation (`ArrowDown`, `ArrowUp`, `ArrowLeft`, `ArrowRight`, `Home`, `End`) operates on label buttons with focus synchronization to 3D rows.
- **Per-frame allocation**: Reuses module-level `glow = new Color()`. No `new Vector3()` or `new Matrix4()` allocated inside `useFrame`. Minor allocations from array destructuring in `rowCentre` and `ids.forEach` closures.

### 4. Hint Source & Menu Reuse
- **Precedence**: `menuComments` evaluates `narration.hints?.[service.id] ?? service.price`.
  - When `hints[service.id]` exists: clerk speaks the narration hint; price is relegated to a note (`words.priceNote`).
  - When no narration hint exists: clerk quotes the joke price; topic is `Price · {dish}`.
  - When neither exists: row remains selectable and silent.
- **ServicesSection reuse**: Both in-world card (`ServicesMenu` with `variant="in-world"`) and dialog overlay (`createServicesMenuOverlay` with `variant="dialog"`) render the canonical `<ServicesSection>` from `page-view/work-sections.tsx`. Zero copy duplication or content divergence.

### 5. Telemetry Spec Flake Analysis
- **Command executed**: `npx vitest run apps/web/src/app/telemetry.spec.ts --root apps/web`
- **Result**: Passed (5 tests, 10.11s total duration, test `receives opens through the production landmark port` alone took 4,134 ms).
- **Warning observed**: `THREE.WARNING: Multiple instances of Three.js being imported.`
- **Root cause**: `telemetry.spec.ts:43` dynamically imports `./landmark-ports`. `landmark-ports.ts` imports `@qa3elhamor/world-feature` and `@qa3elhamor/dive-feature`, pulling in the entire 3D world pipeline (Three.js, GLTFLoader, MeshoptDecoder, R3F). Under high CPU load or concurrent test execution, transforming and initializing this dependency tree takes >15 s, triggering Vitest's timeout. The flake is real and caused by cross-domain architectural coupling in `landmark-ports.ts`.

### 6. NX Typecheck Verification
- **Command executed**: `npx nx run web:typecheck --skipSync`
- **Result**: 17 of 17 projects succeeded with 0 TypeScript diagnostics or compilation errors.

---

## Data Flow

1. **Visit Open**: `createNarratedVisitScene` receives `KrustySceneContent` -> `useNarratorPost` evaluates candidate spots against scene occluders -> sets `post` placement. *(Gap: occluders may be empty if building GLBs are still streaming)*
2. **Animation Timeline**: `useFrame` in `MenuBoard` drives `opening.current` from 0 to 1 over 2.6s (rise -> flip -> stagger rows). *(OK, properly disabled under reducedMotion)*
3. **Speech Bubble Placement**: `useSpeechBubblePlacement` projects narrator mouth/anchor to screen coords -> calls `placeSpeechBubble` -> sets CSS variables `--tail-x`, `--tail-len`, `--tail-skew`. *(Gap: `--tail-skew` negated, causing inverted tail aim; `getBoundingClientRect` called per frame)*
4. **Row Selection**: Pointer hover / tap / keyboard arrow -> `onPick(id, source)` -> `dialogueReducer` updates `state.selected` -> `MenuBoard` zooms selected row along line of sight, warms material, and spins corresponding low-poly dish (`MenuDishes`). *(OK)*
5. **Full Menu Activation**: Last line button "See the full menu" opens `InWorldCard` rendering `<ServicesMenu variant="in-world">`. *(OK, cleanly returns focus to open button on close)*

---

## Requirements Fulfilment

| Requirement | Status | Gap |
| ----------- | ------ | --- |
| 3D wooden menu board with rising & flipping chalkboard | COMPLETE | None |
| Services from `services.json` mapped as menu rows | COMPLETE | None |
| Low-poly dish models (patty, shake, formula) spinning on awning | COMPLETE | None |
| Narrator visibility testing against scene occluders | COMPLETE | Stale evaluation if meshes stream late |
| Speech bubble clamping >=12 px inside viewport | COMPLETE | None |
| Bubble tail re-aimed at narrator | PARTIAL | Skew angle inverted in CSS transform |
| Fallback dialog overlay for reduced motion / low tier | COMPLETE | None |
| Keyboard accessibility (arrows, Home, End, tab order) | COMPLETE | None |
| Full menu reuse of page-view `ServicesSection` | COMPLETE | None |

---

## Verdict

- **Recommendation**: REVISE
- **Confidence**: HIGH
- **Top Risk**: The speech bubble tail pointing away from the crab narrator is an obvious visual regression visible in both desktop and mobile screenshots.
- **What a robust implementation would add**:
  1. Fix the tail skew sign in `narrated-visit.tsx:393` (`${skew.toFixed(2)}deg`).
  2. Cache the stage layer rect outside `useFrame` to eliminate per-frame layout thrashing.
  3. Clean up `gl.localClippingEnabled` in `menu-board.tsx`.
  4. Isolate `./landmark-ports` imports or decouple `telemetry.ts` from full 3D world loaders to permanently resolve the 15s test flake.
