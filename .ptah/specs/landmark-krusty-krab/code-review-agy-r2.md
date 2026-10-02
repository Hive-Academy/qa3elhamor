# Code Logic Review (Revision 2) — Krusty Krab Narrated Landmark & Kit Visibility Clamp

## Summary

| Metric              | Value    |
| ------------------- | -------- |
| Overall score       | 9/10     |
| Assessment          | APPROVED |
| Blocking issues     | 0        |
| Serious issues      | 0        |
| Moderate issues     | 0        |
| Minor issues        | 0        |
| Failure modes found | 0        |

Revision 1 comprehensively and cleanly resolves all 6 findings from the initial review (`code-review-agy.md`). The fixes are accompanied by targeted unit test coverage, correct mathematical derivations, and clean lifecycle management.

---

## Status of Revision 1 Fixes

| Issue from R1 | Severity | Resolution Status | File & Line Verification |
| ------------- | -------- | ----------------- | ------------------------ |
| **Defect 1**: Inverted speech bubble tail skew angle | Serious | **FIXED** | [`apps/web/src/app/narrators/screen-placement.ts:60-64`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/screen-placement.ts#L60-L64), [`apps/web/src/app/narrators/narrated-visit.tsx:522-524`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/narrated-visit.tsx#L522-L524), [`apps/web/src/app/narrators/narrator-post.spec.ts:213-240`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/narrator-post.spec.ts#L213-L240) |
| **Defect 2**: Per-frame forced synchronous layout (`getBoundingClientRect()`) in `useFrame` | Serious | **FIXED** | [`apps/web/src/app/narrators/narrated-visit.tsx:415-475`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/narrated-visit.tsx#L415-L475), [`apps/web/src/app/narrators/narrated-visit.tsx:489-502`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/narrated-visit.tsx#L489-L502) |
| **Defect 3**: WebGLRenderer global state pollution (`gl.localClippingEnabled = true`) | Moderate | **FIXED** | [`apps/web/src/app/krusty-krab/menu-board.tsx:95-102`](file:///D:/projects/qa3elhamor/apps/web/src/app/krusty-krab/menu-board.tsx#L95-L102), [`apps/web/src/app/tiki/stone-tablets.tsx:70-77`](file:///D:/projects/qa3elhamor/apps/web/src/app/tiki/stone-tablets.tsx#L70-L77) |
| **Defect 4**: Stale occlusion evaluation during asynchronous model streaming | Moderate | **FIXED** | [`apps/web/src/app/narrators/narrated-visit.tsx:352-395`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/narrated-visit.tsx#L352-L395), [`apps/web/src/app/narrators/narrated-visit.tsx:172-178`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/narrated-visit.tsx#L172-L178) |
| **Defect 5**: Unhandled bottom edge in `windowSafeInsets` | Minor | **FIXED** | [`apps/web/src/app/narrators/screen-placement.ts:50`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/screen-placement.ts#L50), [`apps/web/src/app/narrators/narrator-post.spec.ts:189-195`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/narrator-post.spec.ts#L189-L195) |
| **Defect 6**: Missing Unicode bidi isolation in Arabic pricing / dish tags | Minor | **FIXED** | [`apps/web/src/app/krusty-krab/menu-objects.ts:16`](file:///D:/projects/qa3elhamor/apps/web/src/app/krusty-krab/menu-objects.ts#L16), [`apps/web/src/app/krusty-krab/menu-objects.ts:52,60,62`](file:///D:/projects/qa3elhamor/apps/web/src/app/krusty-krab/menu-objects.ts#L52), [`apps/web/src/app/krusty-krab/menu-objects.spec.ts:38-47`](file:///D:/projects/qa3elhamor/apps/web/src/app/krusty-krab/menu-objects.spec.ts#L38-L47) |
| **Telemetry flake**: `telemetry.spec.ts` 15s timeout from heavy 3D loader import | Pre-existing Flake | **FIXED** | [`apps/web/src/app/telemetry.spec.ts:25-30`](file:///D:/projects/qa3elhamor/apps/web/src/app/telemetry.spec.ts#L25-L30) |

---

## Detailed Audit of Revision 1 Changes

### 1. Tail Skew Angle & Math Derivation
- **Implementation**: `tailSkewDegrees` in [`apps/web/src/app/narrators/screen-placement.ts:60-64`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/screen-placement.ts#L60-L64) calculates:
  $$\text{degrees} = \frac{\text{atan2}(\text{tailLean}, \max(\text{tailLength}, 1)) \times 180}{\pi}$$
  In [`apps/web/src/app/narrators/narrated-visit.tsx:522-524`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/narrated-visit.tsx#L522-L524), `--tail-skew` is set directly to `${tailSkewDegrees(place).toFixed(2)}deg` without negation.
- **Mathematical proof**: CSS `skewX(a)` with origin at `y = 0` shifts points at depth `y > 0` by $\Delta x = y \times \tan(a)$. For $y = \text{tailLength}$, $\Delta x = \text{tailLength} \times \frac{\text{tailLean}}{\text{tailLength}} = \text{tailLean}$. A positive lean (anchor to the right) produces a positive skew that moves the bottom tip rightwards toward the speaker.
- **Verification**: `narrator-post.spec.ts:213-221` confirms $\text{length} \times \tan(\text{degrees}) = \text{lean}$ across leans $\in \{-26, -8, 0, 8, 26\}$ and verifies positive/negative signs for clamped edge anchors.

### 2. Layout Caching & Zero Frame-Loop Layout Reads
- **Implementation**: [`useBubbleGeometry`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/narrated-visit.tsx#L415-L475) measures `offsetWidth`, `offsetHeight`, and `getBoundingClientRect()` of the stage layer strictly off the render loop:
  - On element mount/change (`track(box)`).
  - Inside a `ResizeObserver` callback observing both the bubble box and the layer element.
  - On `window.addEventListener('resize', measure)` and `window.addEventListener('scroll', measure, { capture: true, passive: true })`.
- **Render loop purity**: [`useSpeechBubblePlacement`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/narrated-visit.tsx#L489-L502) in `useFrame` only reads cached numeric dimensions (`const { width, height, layer } = geometry.current;`) and mutates styles. Zero layout thrashing or forced reflows.
- **Lifecycle cleanup**:
  - `window.removeEventListener('resize', measure)` and `window.removeEventListener('scroll', measure, { capture: true })` on unmount.
  - `g.observer?.disconnect(); g.observer = null;` on both element unmount and component unmount.
  - Guarded against missing environments (`typeof ResizeObserver === 'undefined'`).

### 3. Asynchronous Model Streaming & Jump-Free Settle
- **Implementation**: [`useNarratorPost`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/narrated-visit.tsx#L352-L395) receives `settled = dialogue.stage !== 'waiting'`.
- **Pre-settle adaptation**: While the narrator is swimming in (`stage === 'waiting'`), `useFrame` tracks time via `sinceCheck.current += delta`. Every 0.5 s (`RECHECK_SECONDS`), it counts `sceneOccluders(scene, visitRoot.current).length`. If new occluders appear (e.g. Chum Bucket GLB finishes streaming in), `choose()` recomputes placement before the narrator settles into its final position.
- **Post-settle stability**: Once `dialogue.stage !== 'waiting'` (`settled = true`), line 387 (`if (!mounted || settled) return;`) immediately bypasses all checks. The placement is locked and will never jump while the narrator is talking to the visitor.
- **No timer leaks**: Driven by Three.js `useFrame` delta accumulation, avoiding `setInterval`/`setTimeout` handles.

### 4. Shared WebGLRenderer State Restoration
- **Implementation**:
  - `MenuBoard` ([`apps/web/src/app/krusty-krab/menu-board.tsx:95-102`](file:///D:/projects/qa3elhamor/apps/web/src/app/krusty-krab/menu-board.tsx#L95-L102)): Captures `const before = gl.localClippingEnabled;` and restores it in the `useEffect` cleanup return.
  - `StoneTablets` ([`apps/web/src/app/tiki/stone-tablets.tsx:70-77`](file:///D:/projects/qa3elhamor/apps/web/src/app/tiki/stone-tablets.tsx#L70-L77)): Implemented identical restoration.

### 5. Safe Bottom Inset Calculation
- **Implementation**: [`apps/web/src/app/narrators/screen-placement.ts:50`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/screen-placement.ts#L50) computes:
  `bottom: Math.max(insets.bottom, layer.bottom - window.height + margin)`
- **Verification**: Tested in `narrator-post.spec.ts:189-195`. Layers extending below the window boundary (e.g. `layer.bottom = 1000` on a 900px window) now correctly expand bottom safe insets (to 112px).

### 6. Bidirectional Text Isolation
- **Implementation**: [`apps/web/src/app/krusty-krab/menu-objects.ts:16`](file:///D:/projects/qa3elhamor/apps/web/src/app/krusty-krab/menu-objects.ts#L16) wraps dynamic terms in Unicode First-Strong Isolate (`\u2068`) and Pop Directional Isolate (`\u2069`):
  `const isolate = (text: string): string => \`⁨\${text}⁩\`;`
- **Verification**: Applied to `{price}`, `{dish}`, and `{service}` in `priceOf`, `detailOf`, and `priceNote`. `menu-objects.spec.ts:46` tests that the middle dot separator `·` in `السعر · {dish}` maintains correct visual ordering regardless of LTR/RTL language mixing.

### 7. Telemetry Spec Runtime Isolation
- **Implementation**: [`apps/web/src/app/telemetry.spec.ts:25-30`](file:///D:/projects/qa3elhamor/apps/web/src/app/telemetry.spec.ts#L25-L30) mocks `@qa3elhamor/world-feature`, preventing the test from pulling in Three.js loaders, Meshopt, and R3F.
- **Verification**: Executed in isolation (`npx vitest run apps/web/src/app/telemetry.spec.ts --root apps/web`). Test duration dropped from >10s to **478 ms**, eliminating the 15s timeout flake with zero warnings.

---

## Verification Evidence

1. **Nx Typecheck**:
   - Command: `npx nx run web:typecheck --skipSync`
   - Output: `Successfully ran target typecheck for project web and 16 tasks it depends on` (17/17 tasks passed clean).
2. **Unit Test Suites**:
   - `telemetry.spec.ts`: 5 passed (478 ms).
   - `narrators/`: `screen-placement.spec.ts` (9 tests), `narrator-post.spec.ts` (8 tests), `object-selection.spec.ts` (8 tests), `dialogue.spec.ts` (13 tests), `visit-hooks.spec.ts` (7 tests), `visit-layout.spec.ts` (5 tests), `visit-hud.spec.tsx` (7 tests), `visit-script.spec.ts` (3 tests), `landmark-narrator.spec.ts` (4 tests), `view-layout.spec.ts` (11 tests).
   - `krusty-krab/`: `menu-objects.spec.ts` (4 tests), `krusty-layout.spec.ts` (21 tests), `services-menu.spec.tsx` (2 tests).
   - `landmarks.config.spec.ts`: 7 tests passed.
   - All tests passing with 0 failures.

---

## Verdict

- **Recommendation**: APPROVE
- **Confidence**: HIGH
- **Assessment**: The implementation is exemplary. All edge cases (asynchronous asset streaming, window layer offsets, layout thrashing, WebGL state hygiene, bidi punctuation, and test performance) are addressed rigorously with robust mathematical and architectural foundations.
