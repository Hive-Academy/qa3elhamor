# Code Logic Review — Narrated Pineapple Prototype

## Summary

| Metric              | Value                                |
| ------------------- | ------------------------------------ |
| Overall score       | 6/10                                 |
| Assessment          | NEEDS_REVISION                       |
| Blocking issues     | 0                                    |
| Serious issues      | 3                                    |
| Moderate issues     | 2                                    |
| Minor issues        | 1                                    |
| Failure modes found | 4                                    |

---

## Five logic questions

### 1. How does this fail silently?

- **Stuck bubble selection and floating chips on advance from hint**:
  In [`pineapple-scene.tsx#L305`](file:///D:/projects/qa3elhamor/apps/web/src/app/pineapple/pineapple-scene.tsx#L305), `onAdvance` invokes `dispatch({ type: 'advance' })`. In [`dialogue.ts#L96`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/dialogue.ts#L96), `dialogueReducer` handles `advance` while in `hint` stage by delegating to `resume` (`return dialogueReducer(state, { type: 'resume' }, script)`). `dialogue.stage` transitions back to `'tour'` and `dialogue.hint` resets to `null`. However, `selected` is stored as separate component state in [`pineapple-scene.tsx#L134`](file:///D:/projects/qa3elhamor/apps/web/src/app/pineapple/pineapple-scene.tsx#L134). While the dedicated "Back to the tour" button calls `onResume` which invokes `setSelected(null)` ([`pineapple-scene.tsx#L310-L313`](file:///D:/projects/qa3elhamor/apps/web/src/app/pineapple/pineapple-scene.tsx#L310-L313)), advancing via clicking the bubble or pressing `Space`/`Enter` does not clear `selected`. As a result, the 3D bubble remains scaled up 1.24x, brightened, and other bubbles remain dimmed (0.55 opacity) in [`skill-bubbles.tsx#L134-L163`](file:///D:/projects/qa3elhamor/apps/web/src/app/pineapple/skill-bubbles.tsx#L134-L163). Furthermore, on desktop the floating chips tray remains visible ([`pineapple-hud.tsx#L117`](file:///D:/projects/qa3elhamor/apps/web/src/app/pineapple/pineapple-hud.tsx#L117)), silently de-synchronizing the visual world from the dialogue state.
- **Silent drop of skills panel on compact viewports for groups lacking hints**:
  In [`pineapple-hud.tsx#L115-L117`](file:///D:/projects/qa3elhamor/apps/web/src/app/pineapple/pineapple-hud.tsx#L115-L117), `panelShown` on compact viewports (`compact === true`) requires `hintGroup !== null && hintGroup.id === selected`. If content adds a skill group in `profile.skills` without an accompanying hint in `narration.hints`, `dialogueReducer` ignores `{ type: 'hint', id }` ([`dialogue.ts#L114`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/dialogue.ts#L114)). On mobile, the in-bubble chips list ([`pineapple-hud.tsx#L191-L203`](file:///D:/projects/qa3elhamor/apps/web/src/app/pineapple/pineapple-hud.tsx#L191-L203)) is guarded by `{compact && hintGroup && ...}`. Because `hintGroup` is null, the skills chips are omitted completely from both the speech bubble and the screen, with no error or user feedback.

### 2. What user action produces unexpected behaviour?

- **Advancing dialogue via Space/Enter or bubble click while reading a hint**:
  When a visitor presses Space or Enter on the speech bubble (or taps the bubble body) to advance past an interrupted hint, the speech bubble resumes the tour line, but the 3D bubble remains picked and highlighted indefinitely.
- **Touch scrolling/swiping over 3D fallback bubbles**:
  In [`skill-bubbles.tsx#L221`](file:///D:/projects/qa3elhamor/apps/web/src/app/pineapple/skill-bubbles.tsx#L221), `onPointerOver={pointerPick(id, i, 'hover')}` on the R3F `<mesh>` does not inspect `event.pointerType`. Swiping across the canvas on touch triggers R3F `pointerover`, initiating an unintended 140ms hover selection contrary to the DOM label guard (`event.pointerType !== 'mouse'`).

### 3. What input data produces a wrong answer?

- **Bundled model heightFactor in TalkBubbles mouth position**:
  In [`pineapple-scene.tsx#L225-L230`](file:///D:/projects/qa3elhamor/apps/web/src/app/pineapple/pineapple-scene.tsx#L225-L230), `mouth` is computed using `layout.narrator.height` directly:
  `[px + Math.sin(yaw) * h * 0.7, py + h * 0.55, pz + Math.cos(yaw) * h * 0.7]`.
  When bundled models are activated (`heightFactor: 1.9`), the character model is rendered at `height * 1.9` ([`landmark-narrator.tsx#L58`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/landmark-narrator.tsx#L58)). Because `mouth` calculation ignores `heightFactor` (unlike `speechAnchorOf`), breath bubbles emerge from the lower abdomen/crotch of SpongeBob or Patrick, and `TalkBubbles size` is half the expected scale.

### 4. What happens when a dependency fails?

- **Bundled GLB model load failure produces speaker name mismatch**:
  If the bundled character model fails to load (network failure, 404), `NarratorModelBoundary` in [`landmark-narrator.tsx#L54-L62`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/landmark-narrator.tsx#L54-L62) catches the error and renders `<CastNarrator cast={choice.fallback} ... />` (the procedural Hamour). However, the HUD speaker name in [`pineapple-scene.tsx#L301`](file:///D:/projects/qa3elhamor/apps/web/src/app/pineapple/pineapple-scene.tsx#L301) was pre-computed from `choice.asset` via `narratorName(choice, lang)`. The speech bubble displays "SpongeBob" while the Hamour fish model is visually rendered.

### 5. What is missing that the requirements never mentioned?

- **`reducedMotion` support in `useTypewriter` and `SpeechBubble`**:
  While `LandmarkProvider` uses `inWorldAvailable` to divert to the dialog card under global reduced motion, `LandmarkSceneProps` provides `reducedMotion: boolean` to scene implementations. `PineappleVisit` forwards `reducedMotion` to `LandmarkNarrator`, `TalkBubbles`, and `SkillBubbles`, but completely omits it from `PineappleHudProps` and `SpeechBubbleProps`. `useTypewriter` ([`typewriter.ts#L65-L98`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/typewriter.ts#L65-L98)) has no reduced motion support, continuously ticking an interval to type characters out letter-by-letter.

---

## Failure modes

### Failure Mode 1: Stuck Selection on Bubble Advance
- **Trigger**: Visitor triggers `advance` (Space, Enter, or clicking the bubble body) while reading a hint line.
- **Symptom**: Dialogue returns to the tour, but the previously inspected skill bubble remains magnified by 24%, illuminated, other bubbles remain dimmed to 55%, and the desktop chips panel remains pinned.
- **Evidence**: [`pineapple-scene.tsx#L305`](file:///D:/projects/qa3elhamor/apps/web/src/app/pineapple/pineapple-scene.tsx#L305), [`dialogue.ts#L96`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/dialogue.ts#L96), [`pineapple-hud.tsx#L115-L117`](file:///D:/projects/qa3elhamor/apps/web/src/app/pineapple/pineapple-hud.tsx#L115-L117).
- **Current handling**: `dialogueReducer` resets `state.hint = null`, but `PineappleVisit` state `selected` is never updated.
- **Recommendation**: In `PineappleVisit`, clear `selected` on `onAdvance` whenever `dialogue.stage === 'hint' && !dialogue.typing`, or derive/sync `selected` directly with hint state.

### Failure Mode 2: Missing Hint Hides Skill Chips on Mobile
- **Trigger**: Content defines a skill group in `site.json` that lacks a hint key in `narration.hints`. Visitor taps that bubble on a mobile screen (<640px).
- **Symptom**: The 3D bubble grows, but neither dialogue nor skill chips appear in the speech bubble; the floating chips panel is hidden due to `compact === true`.
- **Evidence**: [`pineapple-hud.tsx#L115-L117, L191-L203`](file:///D:/projects/qa3elhamor/apps/web/src/app/pineapple/pineapple-hud.tsx#L115-L117).
- **Current handling**: Chips list requires `hintGroup !== null`, which is null because `dialogue.stage !== 'hint'`.
- **Recommendation**: Fallback to `selectedGroup` on compact viewports when `hintGroup` is null, rendering the chips list in the bubble even if no spoken hint exists.

### Failure Mode 3: Touch Raycast Triggers Hover Intent in 3D Mesh Fallback
- **Trigger**: Visitor on a touch device drags or touches near the 3D bubble meshes outside the DOM label hit area.
- **Symptom**: R3F raycaster emits `pointerover` on the `<mesh>`, which schedules a hover selection after 140ms.
- **Evidence**: [`skill-bubbles.tsx#L199-L206, L221`](file:///D:/projects/qa3elhamor/apps/web/src/app/pineapple/skill-bubbles.tsx#L199-L206).
- **Current handling**: `pointerPick` filters only `progress < 0.8`.
- **Recommendation**: Verify `event.pointerType === 'mouse'` before accepting hover events on the 3D mesh.

### Failure Mode 4: TalkBubbles Misaligned for Bundled Models
- **Trigger**: `useBundledCharacters: true` with SpongeBob or Patrick.
- **Symptom**: Breath bubbles rise from the narrator's pelvis/stomach instead of the face/mouth, and bubbles are rendered at half size.
- **Evidence**: [`pineapple-scene.tsx#L225-L230, L266`](file:///D:/projects/qa3elhamor/apps/web/src/app/pineapple/pineapple-scene.tsx#L225-L230).
- **Current handling**: Calculates `mouth` with raw unscaled `layout.narrator.height`.
- **Recommendation**: Multiply `layout.narrator.height` by `choice.heightFactor` when `choice.kind === 'model'`.

---

## Serious issues

### 1. State De-synchronization Between `selected` and `dialogue` on Advance
- **File**: [`apps/web/src/app/pineapple/pineapple-scene.tsx#L305`](file:///D:/projects/qa3elhamor/apps/web/src/app/pineapple/pineapple-scene.tsx#L305)
- **Scenario**: When a hint is displayed, `dialogue.stage === 'hint'` and `selected === group.id`. Pressing Space/Enter on the bubble or clicking the bubble triggers `onAdvance`. In `dialogueReducer`, `advance` resumes the tour:
  ```ts
  if (state.stage === 'hint') return dialogueReducer(state, { type: 'resume' }, script);
  ```
  `dialogue.stage` transitions to `'tour'` and `dialogue.hint` becomes `null`. But `PineappleVisit`'s `onAdvance` does not invoke `setSelected(null)`.
- **Impact**: The 3D scene leaves the bubble highlighted and other bubbles dimmed, and desktop continues displaying the skills panel, despite the narrator returning to the main tour.
- **Fix**:
  ```tsx
  // apps/web/src/app/pineapple/pineapple-scene.tsx
  onAdvance={() => {
    if (dialogue.stage === 'hint' && !dialogue.typing) {
      setSelected(null);
    }
    dispatch({ type: 'advance' });
  }}
  ```

### 2. Missing Hint Omission of Skill Chips on Compact Displays
- **File**: [`apps/web/src/app/pineapple/pineapple-hud.tsx#L115-L117, L191-L203`](file:///D:/projects/qa3elhamor/apps/web/src/app/pineapple/pineapple-hud.tsx#L115-L117)
- **Scenario**: A skill group without a hint entry in `narration.hints` is tapped on mobile (`compact: true`).
- **Impact**: On desktop, the floating panel renders because `selectedGroup !== null`. On phone (`compact: true`), the floating panel is suppressed (`!compact`), and the in-bubble list is guarded by `hintGroup !== null`. Because `dialogue.stage` remained `'tour'`, `hintGroup` is `null`. The visitor taps the bubble, but the skills are never displayed.
- **Fix**:
  ```tsx
  // apps/web/src/app/pineapple/pineapple-hud.tsx
  const compactGroup = hintGroup ?? (compact && selectedGroup ? selectedGroup : null);
  // ...
  {compact && compactGroup && (
    <ul id={panelId} className="speech__chips" ...>
      {compactGroup.skills.map((skill) => (
        <li key={skill} className="speech__chip">{skill}</li>
      ))}
    </ul>
  )}
  ```

### 3. Unfiltered Touch and Stationary Hover in Mesh `pointerPick`
- **File**: [`apps/web/src/app/pineapple/skill-bubbles.tsx#L199-L206`](file:///D:/projects/qa3elhamor/apps/web/src/app/pineapple/skill-bubbles.tsx#L199-L206)
- **Scenario**: The R3F fallback mesh receives pointer events when pointer moves over the 3D sphere.
- **Impact**: Touch interactions and stationary cursor crossings trigger `onPointerOver` and schedule unwanted `hover` selections.
- **Fix**:
  ```ts
  const pointerPick =
    (id: string, i: number, source: SelectSource) =>
    (event: ThreeEvent<PointerEvent | MouseEvent>) => {
      if ((motion.current[i]?.progress ?? 0) < 0.8) return;
      if (source === 'hover' && event.pointerType !== 'mouse') return;
      event.stopPropagation();
      onPick(id, source);
    };
  ```

---

## Moderate and minor issues

### 1. `useTypewriter` Does Not Support Reduced Motion (Moderate)
- **File**: [`apps/web/src/app/narrators/typewriter.ts#L65-L98`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/typewriter.ts#L65-L98), [`apps/web/src/app/pineapple/pineapple-scene.tsx#L291-L324`](file:///D:/projects/qa3elhamor/apps/web/src/app/pineapple/pineapple-scene.tsx#L291-L324)
- **Detail**: When `reducedMotion: true` is passed to `PineappleVisit`, `LandmarkNarrator`, `TalkBubbles`, and `SkillBubbles` adapt, but `useTypewriter` lacks a `reducedMotion` parameter or `prefers-reduced-motion` check. It always runs the typing interval.
- **Fix**: Accept `reducedMotion?: boolean` in `useTypewriter` and `SpeechBubble`. When true, set `shown = total`, bypass interval, and call `onTyped()` immediately.

### 2. `mouth` and `TalkBubbles` Size Ignores Bundled `heightFactor` (Moderate)
- **File**: [`apps/web/src/app/pineapple/pineapple-scene.tsx#L225-L230, L266`](file:///D:/projects/qa3elhamor/apps/web/src/app/pineapple/pineapple-scene.tsx#L225-L230)
- **Detail**: `layout.narrator.height` is unscaled by `choice.heightFactor`, causing breath bubbles to emit from the lower torso on SpongeBob/Patrick.
- **Fix**: Compute `renderedHeight = narratorRenderedHeight(choice, layout.narrator.height)` and use it for `mouth` offset and `TalkBubbles` `size`.

### 3. Stale Speaker Name Tag on Model Load Failure (Minor)
- **File**: [`apps/web/src/app/pineapple/pineapple-scene.tsx#L301`](file:///D:/projects/qa3elhamor/apps/web/src/app/pineapple/pineapple-scene.tsx#L301), [`apps/web/src/app/narrators/landmark-narrator.tsx#L82-L96`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/landmark-narrator.tsx#L82-L96)
- **Detail**: When a bundled character fails to load, `NarratorModelBoundary` displays the Hamour fallback, but `PineappleHud` continues displaying the bundled character's name tag (e.g., "SpongeBob").
- **Fix**: Notify `PineappleVisit` via an `onFallback` callback from `NarratorModelBoundary` to switch `speaker` to `narratorName({ kind: 'cast', cast: choice.fallback }, lang)`.

---

## Data flow

1. **Entry (`landmarks.config.ts`)**: `createPineappleScene` configures `profile`, `siteCopy`, `narration.landmarks.pineapple`, `narratorFor('pineapple', NARRATORS)`, and `stopView('landmark-pineapple')`. **[OK]**
2. **Mount (`LandmarkLayer.tsx` -> `PineappleVisit`)**: Receives `phase`, `bounds`, `sceneLayer`, `reducedMotion`, `close`. When `inWorld: false` (low tier / reduced motion / no WebGL), `sceneRuns` is false and `PineappleVisit` is omitted; dialog overlay runs instead. **[OK]**
3. **Arrival**: `phase === 'focused'` sets `open: true`. `LandmarkNarrator` swims in; upon settling, `onSettled` calls `dispatch({ type: 'arrive' })`. **[OK]**
4. **Typing & Bubble Display**: `useTypewriter` steps through code points at 42 cps with punctuation pauses. Progress announced once to screen readers via `<p className="speech__spoken" aria-live="polite">`. **[OK]**
5. **Bubble Selection**:
   - DOM label: Mouse movement with `movementX !== 0 || movementY !== 0` or keyboard focus triggers `onPick(id)`. **[OK]**
   - 3D mesh fallback: Missing pointerType check allows touch drag to trigger hover. **[GAP: Defect 2]**
6. **Hint Display & Resume**:
   - Resuming via "Back to the tour" button clears `selected` and dispatches `resume`. **[OK]**
   - Advancing via bubble Space/Enter/click resumes dialogue but leaks `selected`. **[GAP: Defect 1]**
7. **End of Tour & Full Card**: Last line hides "Next", displays "Open the full Citizenship Card" and "Back to the dive". Esc on card closes card first via capture-phase `preventDefault()`; focus returns to "Open the full Citizenship Card". **[OK]**
8. **Exit & Farewell**: Scroll (64px), Esc, or "Back to the dive" button triggers `close()`. `open` becomes false. Bubbles drift into door; narrator speaks farewell, lingers 1.2s, swims off. `onExited` resets dialogue and unmounts. **[OK]**

---

## Requirements fulfilment

| Requirement | Status | Gap |
| ----------- | ------ | --- |
| Dialogue state machine (typing, cleanup, advance, skip, interrupt, resume, double-advance) | PARTIAL | `onAdvance` does not clear `selected` state when resuming from hint; `useTypewriter` does not support reduced motion. |
| Missing hint graceful degradation | PARTIAL | Content missing a hint degrades on desktop, but silently drops the skills chips on compact mobile screens. |
| A11y (focus placement, polite announcement, bubble cycling, mirror list, focus retention) | COMPLETE | Fully verified; focus never falls to `<body>`, autofocus attribute hooked to stage, single polite announcement per line. |
| 3D (disposal, zero per-frame alloc, label crispness, 390×844 layout) | PARTIAL | Geometry/materials disposed cleanly, zero allocations in `useFrame`, crisp DOM text; 3D mesh hover check lacks touch filtering. |
| Cast switch (lazy load, tier gate, dev-only override, clone usage) | PARTIAL | Clean tier gating, URL param dev-only, model cloned; mouth position and size de-synchronized from `heightFactor`. |
| Leave flows (scroll leave, Esc precedence on card, switch mid-dialogue) | COMPLETE | Capture-phase Esc on card works cleanly; scroll leave (64px) verified; stage generation protects focus. |
| Telemetry | COMPLETE | `trackLandmarkEvent` fires `landmark_open` and `landmark_close` as required. |

---

## Edge cases

| Case | Handled | How | Concern |
| ---- | ------- | --- | ------- |
| Missing hint for skill group | PARTIAL | `dialogueReducer` ignores unknown hint ID | On mobile, skills chips are omitted completely from UI. |
| Advance via bubble click while on hint | NO | Delegates to `resume` in reducer | `selected` state in `PineappleVisit` is not cleared; 3D scene remains in highlighted state. |
| Esc pressed while full card open | YES | Capture-phase keydown calls `event.preventDefault()` | Stage respects `defaultPrevented` and keeps landmark open. |
| Bundled model load failure | PARTIAL | `NarratorModelBoundary` renders `fallback` | Speech bubble name tag still reads bundled name ("SpongeBob"). |
| Rapid re-open while departing | YES | `arrived.current` re-triggers `arrive`, aborts farewell | Seamless restart without re-swimming in. |
| 390×844 viewport | YES | Portrait layout spec with ring slots above seabed | Confirmed clear of bottom return bar and within screen margins. |
| Zero or single bubble count | YES | `bubbleKeyStep` checks `count <= 0`, `ringSlots` clamps | Graceful bounds handling. |

---

## Verdict

- **Recommendation**: REVISE
- **Confidence**: HIGH
- **Top risk**: State de-synchronization between dialogue stage and 3D visual selection when advancing from hints via primary keyboard/tap controls, coupled with skill panel dropping on mobile for groups without hints.
- **What a robust implementation would add**:
  1. Synchronize `selected` directly with hint lifecycle so advancing via any input method clears the bubble highlight.
  2. Fallback to `selectedGroup` on compact viewports when `hintGroup` is null so mobile users always see skills.
  3. Filter `pointerType === 'mouse'` in `SkillBubbles` R3F `pointerPick`.
  4. Respect `reducedMotion` in `useTypewriter` by skipping typing delay.
  5. Multiply `layout.narrator.height` by `heightFactor` in `mouth` and `TalkBubbles` size.
