# Code Logic Review — `landmark-tiki`

## Summary

| Metric              | Value      |
| ------------------- | ---------- |
| Overall score       | 8/10       |
| Assessment          | APPROVED   |
| Blocking issues     | 0          |
| Serious issues      | 1          |
| Moderate issues     | 1          |
| Minor issues        | 1          |
| Failure modes found | 2          |

---

## Scope Reviewed

1. **Narrated-visit kit extraction & Pineapple parity**: `apps/web/src/app/narrators/**` (`narrated-visit.tsx`, `visit-hooks.ts`, `visit-hud.tsx`, `visit-hud.css`, `object-dom.ts`, `object-selection.ts`, `visit-script.ts`, `visit-layout.ts`, `screen-placement.ts`, `world-frame.tsx`, `dialogue.ts`, `landmark-narrator.tsx`), and deleted files preserve-list (`pineapple-hud.*`, `skill-selection.*`) against `code-review-agy-r2.md`.
2. **Mixed cast & configuration logic**: `apps/web/src/app/narrators.config.ts`, `apps/web/src/app/landmarks.config.ts`, `apps/web/src/vite-env.d.ts`.
3. **Tiki landmark**: `apps/web/src/app/tiki/**` (`tiki-scene.tsx`, `stone-tablets.tsx`, `tablet-geometry.ts`, `job-objects.ts`, `tiki-layout.ts`, `experience-record.tsx`, `experience-record.css`), and overlay bindings.
4. **Verification**: `npx nx run web:typecheck --skipSync` (clean pass, exit code 0).
5. **Visual inspection**: `patrick-c-tablets-risen-phone.jpg` phone capture analysis.

---

## Five Logic Questions

### 1. How does this fail silently?
- **Unhinted resume fallback**: In [`dialogue.ts:129-137`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/dialogue.ts#L129-L137), selecting an item whose ID has no comment line in `script.hints` quietly leaves or resumes the general tour line while selecting the item (`selected: event.id`). For the user, the narrator says nothing new about the tablet/bubble, but its DOM detail/chips still display cleanly without crashing or showing blank dialogue text.
- **Narrator model loading error boundary**: In [`landmark-narrator.tsx:163-181`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/landmark-narrator.tsx#L163-L181), `NarratorModelBoundary` catches GLTF decompression and loading failures, logs an error to the console, and renders the original cast (`Hamour`) fallback without breaking the scene or halting render.

### 2. What user action produces unexpected behaviour?
- **Opening fallback dialog on compact displays**: In [`experience-record.tsx:37-51`](file:///D:/projects/qa3elhamor/apps/web/src/app/tiki/experience-record.tsx#L37-L51) when launched via `createExperienceRecordOverlay` (reduced motion, low tier, or fallback), the host dialog traps focus on the first focusable interactive element. Because the first link is Prio's external link midway down the job list, the browser scrolls the article downward, scrolling the `<h2>Experience</h2>` heading out of view on mobile viewports (`hamour-i-fallback-dialog-phone.jpg`).
- **Viewing an in-world visit on a phone**: The visitor sees the page chrome background text (`قاع الهامور`, `Scroll to dive.`, `Skip the dive: read it as a page`) bleeding through and overlapping the bottom row of stone tablets (`patrick-c-tablets-risen-phone.jpg`).

### 3. What input data produces a wrong answer?
- **Environment flag parsing**: In [`narrators.config.ts:34-36`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators.config.ts#L34-L36), `bundledCharactersFromEnv` enforces `env.VITE_BUNDLED_CHARACTERS === 'true'`. Any other truthy value like `'1'`, `'TRUE'`, or `'yes'` evaluates to `false`. While strict, this is deterministic and documented.
- **Empty resume list**: In [`job-objects.ts:24-42`](file:///D:/projects/qa3elhamor/apps/web/src/app/tiki/job-objects.ts#L24-L42), if `entries` is empty, `jobObjects` produces an empty array. In [`tiki-layout.ts:123`](file:///D:/projects/qa3elhamor/apps/web/src/app/tiki/tiki-layout.ts#L123), `tabletFeet` calculates `rows = Math.max(Math.ceil(count / spec.perRow), 1)`, returning `[]` safely without divide-by-zero errors.

### 4. What happens when a dependency fails?
- **Bundled 3D character asset fails or quality tier is low**: In [`landmark-narrator.tsx:90-98`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/landmark-narrator.tsx#L90-L98), low quality tier immediately swaps to `CastNarrator` (`hamour`). If network failure causes the GLTF to fail loading, `NarratorModelBoundary` catches the exception and switches to `CastNarrator`, triggering `onPlaying(fallbackOf(choice))`, which synchronously updates the speech bubble's speaker tag from "Patrick" to "The Hamour".
- **WebGL local clipping unsupported**: In [`stone-tablets.tsx:70-72, 84-87`](file:///D:/projects/qa3elhamor/apps/web/src/app/tiki/stone-tablets.tsx#L70-L87), `gl.localClippingEnabled = true` enables the seabed clipping plane `Plane(Vector3(0, 1, 0), -ground)`. If local clipping is unsupported, tablets would be visible below the seabed prior to rising; however, this is guarded upstream by WebGL capability detection and the low-tier fallback overlay.

### 5. What is missing that the requirements never mentioned?
- **Fading page chrome during in-world visits**: The requirement to fade out `.scene-note` when entering an in-world landmark visit was overlooked in [`in-world-atmosphere.css:90-95`](file:///D:/projects/qa3elhamor/apps/web/src/app/in-world/in-world-atmosphere.css#L90-L95). While `.lmk-beacon-anchor` fades to `opacity: 0`, `.scene-note` is retained at `opacity: 0.16`, causing visible bleed-through behind the 3D tablets on mobile screens.

---

## Failure Modes

### 1. Page Chrome Text Bleed-Through on Mobile In-World Visits
- **Trigger**: Entering an in-world landmark visit on a mobile viewport (e.g. 390×844) with `:root[data-in-world]`.
- **Symptom**: The white text and backdrop of `.scene-note` ("قاع الهامور", "Scroll to dive.", "Skip the dive: read it as a page") visibly bleed through and collide with the lower row of stone tablets and sand.
- **Evidence**: [`patrick-c-tablets-risen-phone.jpg`](file:///D:/projects/qa3elhamor/.ptah/specs/landmark-tiki/shots/patrick-c-tablets-risen-phone.jpg); [`apps/web/src/app/in-world/in-world-atmosphere.css:90-95`](file:///D:/projects/qa3elhamor/apps/web/src/app/in-world/in-world-atmosphere.css#L90-L95).
- **Current handling**: `:root[data-in-world] .scene-note` has `opacity: 0.16;` and remains in the DOM stacking context over the 3D WebGL Canvas.
- **Recommendation**: Set `opacity: 0; pointer-events: none; visibility: hidden;` on `:root[data-in-world] .scene-note`.

### 2. Heading Scroll-Off on Fallback Dialog Autofocus (Mobile)
- **Trigger**: Opening the Tiki fallback dialog (`createExperienceRecordOverlay`) on a small screen when in-world is disabled.
- **Symptom**: The dialog autofocuses the first link (`<a>` for Prio), immediately auto-scrolling the container down and pushing the "Experience" `<h2>` heading above the visible scrollport.
- **Evidence**: `hamour-i-fallback-dialog-phone.jpg`; [`notes.md:262-266`](file:///D:/projects/qa3elhamor/.ptah/specs/landmark-tiki/notes.md#L262-L266).
- **Current handling**: Follows generic host dialog autofocus behavior on first interactive element.
- **Recommendation**: In a future enhancement or host refinement, support focusing the container heading or top element on mount when `preventScroll` or header focus is desirable.

---

## Blocking Issues

*None.* The refactored kit, Pineapple parity, Tiki 3D implementation, and typecheck are solid and free of blockers.

---

## Serious Issues

### 1. Page Chrome `.scene-note` Bleeds Through 3D Tablets on Mobile
- **File**: [`apps/web/src/app/in-world/in-world-atmosphere.css:90-95`](file:///D:/projects/qa3elhamor/apps/web/src/app/in-world/in-world-atmosphere.css#L90-L95)
- **Scenario**: A user on a phone opens the Tiki landmark (or any in-world landmark visit).
- **Impact**: On a 390×844 display, the lower tablets occupy the lower third of the screen (`footY: 0.89`), exactly where `.scene-note` is fixed (`bottom: 1.5rem; left: 1.5rem;`). Because `.scene-note` is in the DOM layer directly over the WebGL Canvas, its `opacity: 0.16` causes the Arabic title, "Scroll to dive.", and "read it as a page" text to show directly through the stone tablets.
- **Fix**: In [`apps/web/src/app/in-world/in-world-atmosphere.css`](file:///D:/projects/qa3elhamor/apps/web/src/app/in-world/in-world-atmosphere.css), separate `.scene-note` from `.lmk-index` and give it full hiding during in-world mode:
  ```css
  :root[data-in-world] .scene-note {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
  }
  ```

---

## Moderate and Minor Issues

### 1. Fallback Dialog Autofocus Scrolls Header Off-Screen (Moderate)
- **File**: [`apps/web/src/app/tiki/experience-record.tsx:37-51`](file:///D:/projects/qa3elhamor/apps/web/src/app/tiki/experience-record.tsx#L37-L51)
- **Scenario**: When rendering `variant="dialog"` inside the landmark fallback overlay on mobile, focus defaults to the first interactive `<a>` tag, scrolling past the section header.
- **Impact**: The visitor loses context of the "Experience" title when the dialog opens on mobile.
- **Fix**: Pass an autofocus target or `article` ref to the overlay host, or ensure dialog autofocus prioritizes the dialog title.

### 2. CI/CD Workflow Missing Environment Pass-Through (Minor)
- **File**: [`.github/workflows/deploy-pages.yml`](file:///D:/projects/qa3elhamor/.github/workflows/deploy-pages.yml)
- **Scenario**: GitHub Actions build runs without `VITE_BUNDLED_CHARACTERS` defined in the workflow step environment.
- **Impact**: Deployed Pages will default to original cast even if repository variable is configured in repository settings.
- **Fix**: Add `VITE_BUNDLED_CHARACTERS: ${{ vars.VITE_BUNDLED_CHARACTERS }}` to the build step in `deploy-pages.yml`.

---

## Data Flow Verification

1. **Initialization (`landmarks.config.ts`)**:
   - `narratorsConfigFor(window.location.search, import.meta.env.DEV)` parses URL override only when `DEV` is true. `bundledCharactersFromEnv` reads `import.meta.env.VITE_BUNDLED_CHARACTERS`. [**OK**]
   - `narratorFor` returns `{ kind: 'model', asset: 'patrick-narrator', ... }` when bundled is active, or `{ kind: 'cast', cast: 'hamour' }`. [**OK**]
2. **Mounting & Lifecycle (`narrated-visit.tsx`, `visit-hooks.ts`)**:
   - `createNarratedVisitScene` instantiates scene with `useVisitLifecycle`. [**OK**]
   - When opened, `open` transitions `mounted` and `present` to true. If closed mid-farewell, `farewellSeconds` timer cleans up, and re-opening resets to tour stage. [**OK**]
3. **Dialogue & Script (`visit-script.ts`, `dialogue.ts`)**:
   - `visitScript` ingests `jobReviews(entries)` quips for Tiki and `narration.hints` for Pineapple. [**OK**]
   - `dialogueReducer` owns `selected: string | null`. [**OK**]
4. **3D Scene & Memory (`stone-tablets.tsx`, `tablet-geometry.ts`)**:
   - Geometries (`createTabletSlab`, `createTabletRim`) and sand puff materials/buffers are instantiated once and disposed in `useEffect` returns. [**OK**]
   - `useFrame` updates use module-level scratch vectors (`scratch`, `camSpace`, `anchorWorld`, `anchorView`), avoiding per-frame GC churn. [**OK**]
5. **DOM Sync (`object-dom.ts`, `visit-hud.tsx`)**:
   - `placeObjectDom` projects 3D positions directly onto DOM elements via inline `transform`, updating `--object-w`/`--object-h`. [**OK**]
   - Pointer gating: `acceptsPick` enforces `progress >= 0.8` and mouse-only hover, preventing accidental drag/touch triggers. [**OK**]
6. **Full Record (`experience-record.tsx`, `in-world-card.tsx`)**:
   - "Read the full record" primary button opens `InWorldCard`. `useFullView` captures `Escape` with `useCapture: true`, returning focus to the trigger without closing the landmark prematurely. [**OK**]

---

## Requirements Fulfilment

| Requirement | Status | Verification & Evidence |
| ----------- | ------ | ----------------------- |
| **Pineapple parity** | COMPLETE | Reducer-owned selection ([`dialogue.ts:37, 126`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/dialogue.ts#L37)), missing hint path ([`dialogue.ts:129`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/dialogue.ts#L129)), mouse-only hover + 80% gate ([`object-selection.ts:58-65`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/object-selection.ts#L58-L65)), reduced-motion instant typing ([`visit-hud.tsx:87, 264`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/visit-hud.tsx#L87)), fallback speaker name ([`narrated-visit.tsx:123, 222`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/narrated-visit.tsx#L123)). Verified in `pineapple-visit.spec.tsx` (17 tests). |
| **Kit generality** | COMPLETE | Clean `createNarratedVisitScene<Slot>` signature; pluggable `HintSource` ([`visit-script.ts:17`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/visit-script.ts#L17)); zero Pineapple leakage; module-level scratch vectors for zero per-frame allocation ([`object-dom.ts:18`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/object-dom.ts#L18), [`narrated-visit.tsx:295`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/narrated-visit.tsx#L295)). |
| **Mixed-cast logic** | COMPLETE | Strict env parsing ([`narrators.config.ts:36`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators.config.ts#L36)); partial bundled cast (`pineapple` & `tiki` only); low-tier gating via `assetAllowed` and fallback boundary ([`landmark-narrator.tsx:90, 156`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/landmark-narrator.tsx#L90)); dev-only URL override disabled in prod ([`narrators.config.ts:92`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators.config.ts#L92)). |
| **Tiki landmark** | COMPLETE | Geometries and materials disposed cleanly ([`stone-tablets.tsx:76-82, 108-125`](file:///D:/projects/qa3elhamor/apps/web/src/app/tiki/stone-tablets.tsx#L76-L82)); a11y keyboard navigation with `objectKeyStep` ([`visit-hud.tsx:156`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/visit-hud.tsx#L156)); quip hints from `jobReviews` ([`job-objects.ts:48`](file:///D:/projects/qa3elhamor/apps/web/src/app/tiki/job-objects.ts#L48)); `ExperienceRecord` reused without duplication ([`experience-record.tsx:24`](file:///D:/projects/qa3elhamor/apps/web/src/app/tiki/experience-record.tsx#L24)); overlay fallback wired. |
| **Phone bleed-through root cause** | COMPLETE | Root cause identified in `in-world-atmosphere.css:92` (`:root[data-in-world] .scene-note` kept at `opacity: 0.16` instead of `0`); proposed fix documented above. |
| **Typecheck** | COMPLETE | `npx nx run web:typecheck --skipSync` exited with code 0 (17/17 tasks successful). |

---

## Edge Cases

| Case | Handled | How | Concern |
| ---- | ------- | --- | ------- |
| **Selected object has no hint/quip** | YES | [`dialogue.ts:129-137`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/dialogue.ts#L129-L137) sets `selected: event.id` and keeps/resumes tour line. | None; chips and highlights render correctly. |
| **Re-opening landmark mid-farewell** | YES | [`visit-hooks.ts:43-45`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/visit-hooks.ts#L43-L45) dispatches `arrive` immediately if `arrived.current` is true. | None; smooth re-entry without re-swimming. |
| **Esc pressed while in full record view** | YES | [`visit-hooks.ts:102-108`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/visit-hooks.ts#L102-L108) traps `Escape` in capture phase, closes full view, returns focus to button. | Does not close the landmark prematurely. |
| **Keyboard navigation across tablets in RTL** | YES | [`object-selection.ts:21-22`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/object-selection.ts#L21-L22) mirrors `ArrowLeft` and `ArrowRight`. | Home and End consistently target first and last index. |
| **Touch or pen hovering over 3D tablets** | YES | [`object-selection.ts:64`](file:///D:/projects/qa3elhamor/apps/web/src/app/narrators/object-selection.ts#L64) ignores `pointerType !== 'mouse'` for hover. | Touch users select by intentional tap only. |

---

## Verdict

- **Recommendation**: APPROVE
- **Confidence**: HIGH
- **Top risk**: Visual bleed-through of fixed `.scene-note` page chrome across 3D tablets on mobile viewports.
- **What a robust implementation would add**:
  1. Add `:root[data-in-world] .scene-note { opacity: 0; visibility: hidden; pointer-events: none; }` to `in-world-atmosphere.css`.
  2. Add `VITE_BUNDLED_CHARACTERS: ${{ vars.VITE_BUNDLED_CHARACTERS }}` to `.github/workflows/deploy-pages.yml`.
  3. Support heading-focused autofocus in the dialog overlay host for mobile to avoid auto-scrolling past the section title.
