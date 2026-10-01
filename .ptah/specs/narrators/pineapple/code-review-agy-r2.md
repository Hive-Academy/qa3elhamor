# Code Logic Review (Revision 2) — Narrated Pineapple Prototype

## Summary

| Metric              | Value      |
| ------------------- | ---------- |
| Overall score       | 9/10       |
| Assessment          | APPROVED   |
| Blocking issues     | 0          |
| Serious issues      | 0          |
| Moderate issues     | 0          |
| Minor issues        | 0          |
| Failure modes found | 0          |

---

## Status of Previous Findings (Revision 1 Fix Verification)

| # | Previous Finding | Severity in R1 | Status | Verification & Evidence |
| - | ---------------- | -------------- | ------ | ----------------------- |
| 1 | **State de-synchronization on hint advance**: Advancing via Space/Enter or bubble click did not clear `selected` state, leaving 3D bubble highlighted and desktop panel open. | Serious | **FIXED** | `selected: string \| null` is now a first-class property in `DialogueState` (`dialogue.ts:37`). `resume`, `skip`, `farewell`, and `reset` all clear `selected` (`dialogue.ts:119, 155, 165, 168`). `advance` out of a hint delegates to `resume` (`dialogue.ts:107-108`). `PineappleVisit` consumes `const selected = dialogue.selected` (`pineapple-scene.tsx:145`) with no separate `useState`. Verified in `dialogue.spec.ts:131-141`. |
| 2 | **Silent omission of skills panel on compact displays for groups lacking hints**: Groups in `profile.skills` without hints in `narration.hints` dropped skill chips entirely on mobile. | Serious | **FIXED** | `dialogue.ts:129-137` handles `select` on an unhinted ID by keeping/returning to the tour line while setting `selected: event.id`. `pineapple-hud.tsx:117-137` derives `panelShown` and `chips` directly from `selectedGroup !== null`. On compact screens (<640px), `{chips}` renders inside the speech bubble in both normal and action footers (`pineapple-hud.tsx:171, 215`). Verified in `pineapple-hud.spec.tsx:290-302`. |
| 3 | **Unfiltered touch and stationary hover on fallback 3D meshes**: R3F `<mesh>` `pointerPick` lacked `pointerType` check and fly-out readiness gating. | Serious | **FIXED** | Introduced `acceptsPick(source, pointerType, progress)` in `skill-selection.ts:53-60` requiring `progress >= PICKABLE_FROM` (0.8) and `pointerType === 'mouse'` for hovers. In `skill-bubbles.tsx:188`, DOM labels set `pointerEvents = p >= PICKABLE_FROM ? '' : 'none'`. Mesh `pointerPick` (`skill-bubbles.tsx:210-219`) passes `event.nativeEvent.pointerType` to `acceptsPick`. Verified in `skill-selection.spec.ts:39-58`. |
| 4 | **Missing reduced motion support in `useTypewriter`**: Typewriter always ran 42 cps interval even when reduced motion was flagged. | Moderate | **FIXED** | `useTypewriter` (`typewriter.ts:67-108`) now accepts `{ instant?: boolean }`. When `instant: true`, full text displays immediately and `done.current()` (`onTyped`) is invoked exactly once per take without timers. `SpeechBubble` (`speech-bubble.tsx:63-65`) and `PineappleHud` (`pineapple-hud.tsx:85, 269`) thread `reducedMotion` from `PineappleVisit` (`pineapple-scene.tsx:322`). Caret and animations suppressed via `speech-bubble.css:287-290`. Verified in `typewriter.spec.ts:53-66` and `pineapple-hud.spec.tsx:123-130`. |
| 5 | **TalkBubbles mouth position and size de-synchronized from bundled `heightFactor`**: Breath bubbles emitted from lower abdomen on SpongeBob/Patrick. | Moderate | **FIXED** | Added `mouthOf(choice, post, height, restYaw)` in `landmark-narrator.tsx:59-71` differentiating standing models (`[0.78, 0.22]`) from fish (`[0.55, 0.7]`). In `pineapple-scene.tsx:236-249`, `renderedHeight = narratorRenderedHeight(playing, layout.narrator.height)` is computed and passed to both `mouthOf` and `<TalkBubbles size={renderedHeight} />`. Verified in `landmark-narrator.spec.ts:24-34`. |
| 6 | **Stale speaker name on bundled model load failure**: Speech bubble tag still displayed "SpongeBob" if model failed and Hamour fallback played. | Minor | **FIXED** | Added `onPlaying?: (playing: NarratorChoice) => void` and `fallbackOf(choice)` in `landmark-narrator.tsx:26, 30-31, 80-93`. `NarratorModelBoundary` notifies `onFallback` on error, and `ModelNarrator` notifies `onLoaded` on success. `PineappleVisit` (`pineapple-scene.tsx:147, 273, 321`) tracks `playing` and feeds `speaker={narratorName(playing, lang)}`. Verified in `landmark-narrator.spec.ts:36-39`. |

---

## Analysis of Revision 1 Changes for Secondary Defects

### 1. Reducer-Owned Selection Lifecycle
- **Check**: When an item with no hint is selected, what happens on subsequent navigation events?
- **Finding**:
  - Advancing with `skip`: Sets `selected: null` (`dialogue.ts:119`).
  - Leaving with `farewell`: Sets `selected: null` (`dialogue.ts:165`).
  - Switching to another item: `select` sets `selected: event.id` cleanly (`dialogue.ts:128-144`).
  - Advancing with `advance` while on a hint: Calls `resume`, which sets `selected: null` (`dialogue.ts:107-108, 155`).
  - Single source of truth is maintained across all UI projections (DOM labels, floating tray, in-bubble chips, 3D bubble scale/opacity).

### 2. Missing-Hint Fallback
- **Check**: Does selecting an item without a hint break accessibility attributes or layout?
- **Finding**:
  - `panelId = "${ids}-skills"` is shared between the desktop panel and mobile chips list.
  - When unhinted item is selected, `panelShown` evaluates to `true` while open and not in farewell (`pineapple-hud.tsx:118-123`).
  - `aria-controls` on the button resolves to `panelId` (`pineapple-hud.tsx:291-293`).
  - No broken DOM references, no orphan live regions, and no missing chips.

### 3. Pointer Gate (`PICKABLE_FROM = 0.8`)
- **Check**: Does gating pointer events at 80% progress trap or drop focus?
- **Finding**:
  - Keyboard users navigate via DOM focus (`onFocus={() => onPick(group.id, 'focus')}` and `onLabelKeyDown`). Focus is unaffected by `pointerEvents = 'none'` CSS.
  - When bubbles are inside or leaving the door, the entire list is `inert={!open || cardOpen || !bubblesOut}` (`pineapple-hud.tsx:278`), preventing keyboard focus until bubbles are released.
  - Once out, `p >= 0.8` enables mouse hover/tap on both DOM and 3D layers in unison.

### 4. Reduced-Motion Instant Mode
- **Check**: Does instant typing trigger race conditions or multiple `onTyped` dispatches?
- **Finding**:
  - In `useTypewriter` (`typewriter.ts:89-93`), `done.current()` is called inside the `useEffect` branch for `instant`.
  - Calling `done.current()` triggers `onTyped()`, which dispatches `{ type: 'typed' }` to `dialogueReducer`, setting `typing: false`.
  - On re-render with `typing: false`, the effect hits `if (!typing) return undefined;`, ensuring `onTyped` is never called more than once per `take`.
  - Tested and confirmed in `typewriter.spec.ts:53-66`.

### 5. Fallback Speaker Name Synchronization
- **Check**: Does `onPlaying` cause unnecessary re-renders or feedback loops?
- **Finding**:
  - `onPlaying` is invoked during initial mount and upon model load/error transitions only.
  - Sizing, anchor projection, mouth position, and bubble title remain in sync.

---

## Verification Evidence

- **Lint, Typecheck & Unit Tests**:
  Command executed:
  `npx nx run-many -t lint,typecheck,test -p landmarks-domain landmarks-feature landmarks-ui web --skipSync --skip-nx-cache`
  Result: **All 13 tasks succeeded.**
  - `landmarks-domain`: 3 test files, 25 passed.
  - `landmarks-ui`: 1 test file, 18 passed.
  - `landmarks-feature`: 3 test files, 22 passed.
  - `web`: 24 test files, 246 passed (0 failures).

---

## Verdict

- **Recommendation**: APPROVE
- **Confidence**: HIGH
- **Assessment**: The author addressed all 6 findings from Revision 1 thoroughly, fixing the root causes in the domain models (reducer-owned selection, pointer filtering in domain helper, instant mode in typewriter hook, and reactive playing state) with complete test coverage. No regressions or secondary defects were found.
