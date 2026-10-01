# Code Logic Review — Narrator Cast & Animator (Roadmap Item: narrators, Part 1)

## Summary

| Metric              | Value                                |
| ------------------- | ------------------------------------ |
| Overall score       | 7.5/10                               |
| Assessment          | NEEDS_REVISION                       |
| Blocking issues     | 0                                    |
| Serious issues      | 1                                    |
| Moderate issues     | 2                                    |
| Failure modes found | 3                                    |

The narrator character models and procedural animator in `libs/world/feature` demonstrate high mathematical rigor: exact analytical spring evaluation (critically damped, frame-rate independent), zero per-frame garbage collection allocations in `useFrame`, robust heading angle-wrapping without $360^\circ$ spins, flawless mid-way entrance/exit reversals, single-fire event latches, and compliant WCAG reduced-motion fallbacks. All 15 Vitest suites (127 tests), TypeScript typecheck, and ESLint pass cleanly.

However, the API has a critical fragility under real-world async loading and dynamic prop binding: passing an unrecognized cast string or an unready (`null`/`undefined`) `Object3D` triggers an unhandled `TypeError` that crashes the entire R3F render tree. Furthermore, placing `<Narrator>` inside `<WorldSpace>` (scale 20) without manual downscaling scales procedural characters to gigantic proportions (7.2–11 units tall against a 2.6-unit pineapple), and `NarratorBounds` discards width and depth needed for framing T-posed models like SpongeBob. Addressing these 3 issues will make the API completely robust for the consuming dialogue and landmark lanes.

---

## Five logic questions

### 1. How does this fail silently?

- **Unrecognized / misspelled cast ID**: In [narrator.tsx:107-110](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/narrator.tsx#L107-L110) and [narrator-cast.ts:158-169](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/narrator-cast.ts#L158-L169), `castId` is checked only with `typeof cast === 'string'`. If an invalid ID (e.g. `'spongebob'`, `'patrick'`, or a case typo) is passed, `NARRATOR_CAST[castId]` is `undefined`. Rather than logging a diagnostic and falling back, execution immediately throws `TypeError: Cannot read properties of undefined (reading 'create')` during render.
- **Camera gimbal singularity above character**: In [narrator.tsx:145](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/narrator.tsx#L145), if the camera sits directly above the character ($dx^2 + dz^2 \le 10^{-10}$), `cameraYaw` evaluates to `NaN`. In [narrator-motion.ts:280-282](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/narrator-motion.ts#L280-L282), `cameraKnown` becomes `false` and silently falls back to `restYaw + facingOffset`. This is a deliberate, silent mathematical safeguard that avoids angular spin.
- **Off-axis authored models**: In [narrator-cast.ts:19-25](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/narrator-cast.ts#L19-L25), `NarratorModel` assumes static models are authored facing $+Z$. If an asset was exported with $+X$ forward, it silently faces sideways during swimming and talking without warning unless the consumer manually supplies `motion: { facingOffset: Math.PI / 2 }`.

### 2. What user action produces unexpected behaviour?

- **Reusing the same `Object3D` across multiple `<Narrator>` components**: In [narrator.tsx:172](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/narrator.tsx#L172), `model` is mounted directly via `<primitive object={model} />`. Because Three.js enforces single-parent hierarchy, mounting two narrators with the same `Object3D` reference causes the second narrator to steal the mesh from the first, leaving the first narrator completely invisible without any error.
- **Placing `<Narrator>` inside `<WorldSpace>` (scale 20) with default scale**: In [world-space.tsx:25,78](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/world-space.tsx#L25) and [narrator.tsx:124](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/narrator.tsx#L124), `<WorldSpace>` scales child coordinates by 20. The default cast heights (Hamour: 0.55, Crab: 0.42, Sardine: 0.36) were calibrated for world units (beside a 2.6-unit pineapple). When mounted as a child of a landmark inside `<WorldSpace>`, the narrator expands to $0.55 \times 20 = 11$ world units tall (more than $4\times$ taller than the pineapple house).
- **Evaluating `narratorSpeechAnchor` in a differing coordinate space**: In [narrator-cast.ts:179-183](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/narrator-cast.ts#L179-L183), `narratorSpeechAnchor` returns coordinates in the parent group's space. If dialogue bubbles are rendered at the scene root or via screen-space HTML overlays, bubbles will detach from characters unless converted using `parent.localToWorld()`.

### 3. What input data produces a wrong answer?

- **Passing unmeasured T-pose models for framing**: In [narrator-cast.ts:143-152](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/narrator-cast.ts#L143-L152), `boundsFromBox` computes `minY`, `centreX`, `centreZ`, and `height`, completely discarding `width` ($box.max.x - box.min.x$) and `depth`. For T-posed characters like SpongeBob where arm span exceeds height, camera framing and dialogue bubble positioning cannot measure horizontal clearance, leading to cropped arms or clipping props.
- **Zero or negative `scale` input**: In [narrator-cast.ts:154,163](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/narrator-cast.ts#L154), `positiveOr(scale, 1)` falls back to `1` when `scale <= 0`. If a consumer attempts to hide a character by setting `scale={0}`, the component ignores it and renders at full scale ($1.0$).

### 4. What happens when a dependency fails?

- **Asynchronous GLTF model is pending or failed**: If a caller loads a model via `useCompressedModel(url)` and passes `cast={{ object: scene }}` before the asset resolves (or if load fails and `scene` is `null`/`undefined`), [narrator-cast.ts:128](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/narrator-cast.ts#L128) executes `modelBounds.get(object)`. Passing `null`/`undefined` to `WeakMap.get` throws `TypeError: Invalid value used as weak map key`, crashing the R3F canvas.
- **Extreme frame drops / background tab switches**: In [narrator-motion.ts:14,275](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/narrator-motion.ts#L14), `NARRATOR_MAX_FRAME = 0.1` clamps `dt`. If the browser tab pauses for 30 seconds and resumes, the animation advances by at most 0.1 seconds, preventing spring explosion or positional teleportation.

### 5. What is missing that the requirements never mentioned?

- **`width` and `depth` in `NarratorBounds`**: Crucial for camera framing of characters with wide proportions or props (Crab Clerk with claws, SpongeBob with T-pose arms).
- **Graceful fallback for unknown cast IDs**: `isNarratorCastId` is exported from `narrator-cast.ts`, but neither `narrator.tsx` nor `narrator-cast.ts` uses it. Unknown cast strings should warn and fall back to `'hamour'` instead of crashing.
- **Scene-world scale preset**: Clear helper or automatic scaling context for landmarks inside `<WorldSpace>`.

---

## Failure modes

### 1. Crash on Async Model Loading / Null Object Reference

- **Trigger**: Caller passes `cast={{ object: model }}` where `model` is initially `null` or `undefined` while loading from network.
- **Symptom**: Uncaught `TypeError: Invalid value used as weak map key` in `modelBounds.get(object)`. The entire 3D canvas unmounts.
- **Evidence**: [narrator-cast.ts:128](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/narrator-cast.ts#L128), [narrator.tsx:124](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/narrator.tsx#L124).
- **Current handling**: No null-check in `measureNarratorModel(object: Object3D)`.
- **Recommendation**: Guard `if (!object || typeof object !== 'object') return { centreX: 0, centreZ: 0, minY: 0, height: 1 };`.

### 2. Crash on Unrecognized Cast String

- **Trigger**: Caller passes a string that is not `'hamour' | 'sardine-president' | 'crab-clerk'` (e.g. `'spongebob'` or a typo).
- **Symptom**: Uncaught `TypeError: Cannot read properties of undefined (reading 'create')` or `(reading 'height')`.
- **Evidence**: [narrator.tsx:110](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/narrator.tsx#L110), [narrator-cast.ts:161,168](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/narrator-cast.ts#L161).
- **Current handling**: Assumes any string is a valid key of `NARRATOR_CAST`.
- **Recommendation**: Use `isNarratorCastId(cast)` and fall back to `'hamour'` with `console.warn`.

### 3. Landmark Scale Explosion Inside `<WorldSpace>`

- **Trigger**: Caller mounts `<Narrator cast="crab-clerk" position={[...]} />` inside a landmark component under `<WorldSpace>`.
- **Symptom**: Character renders 20x larger than intended (11 units tall, towering over the entire landmark).
- **Evidence**: [world-space.tsx:25,78](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/world-space.tsx#L25), [narrator.tsx:124](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/narrator.tsx#L124).
- **Current handling**: Documented in README line 28, but no runtime assistance or scaling constant is exported.
- **Recommendation**: Export `NARRATOR_SCENE_WORLD_SCALE = 1 / WORLD_SCALE` (0.05) or optionally read `useWorldScale()` when inside a `WorldSpaceContext`.

---

## Blocking issues

*None.* The fundamental physics, geometry construction, shader patching, and memory lifecycle are sound.

---

## Serious issues

### Unchecked Cast ID and Null Model Reference Triggering Fatal Render Crash

- **File**: [libs/world/feature/src/lib/narrator-cast.ts:128,160-169](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/narrator-cast.ts#L128) and [libs/world/feature/src/lib/narrator.tsx:110,124](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/narrator.tsx#L110)
- **Scenario**: When loading models dynamically (e.g. SpongeBob LODs via `useCompressedModel`) or switching cast via dynamic configuration, `cast.object` can be `null`/`undefined`, or `cast` may be an unrecognized string.
- **Impact**: Any null or invalid prop crashes the React Three Fiber tree completely.
- **Fix**:
  1. In `narrator-cast.ts`:
     ```ts
     export function measureNarratorModel(object: Object3D | null | undefined): NarratorBounds {
       if (!object || typeof object !== 'object') return { centreX: 0, centreZ: 0, minY: 0, height: 1 };
       const cached = modelBounds.get(object);
       if (cached) return cached;
       ...
     }

     export function narratorHeight(cast: NarratorCast, scale = 1): number {
       const base =
         typeof cast === 'string'
           ? (isNarratorCastId(cast) ? NARRATOR_CAST[cast].height : NARRATOR_CAST.hamour.height)
           : positiveOr(cast.height, cast.object ? measureNarratorModel(cast.object).height : 1);
       return base * positiveOr(scale, 1);
     }

     export function narratorMotion(cast: NarratorCast): NarratorMotionTuning {
       return typeof cast === 'string'
         ? (isNarratorCastId(cast) ? NARRATOR_CAST[cast].motion : DEFAULT_NARRATOR_MOTION)
         : { ...DEFAULT_NARRATOR_MOTION, ...cast.motion };
     }
     ```
  2. In `narrator.tsx`:
     ```ts
     const mesh = useMemo(
       () => (castId && isNarratorCastId(castId) ? NARRATOR_CAST[castId].create(uniforms) : null),
       [castId, uniforms]
     );
     ```

---

## Moderate and minor issues

- **`NarratorBounds` omits `width` and `depth`**: [narrator-cast.ts:114-120,143-152](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/narrator-cast.ts#L114). Add `width: box.max.x - box.min.x` and `depth: box.max.z - box.min.z` to `NarratorBounds` for downstream camera framing of T-posed characters.
- **Scale mismatch in `<WorldSpace>`**: [world-space.tsx:25](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/world-space.tsx#L25). Export `NARRATOR_SCENE_WORLD_SCALE = 1 / WORLD_SCALE` to give downstream landmark developers an explicit, named scale constant when nesting `<Narrator>` inside landmarks.
- **Direct `<primitive object={model} />` mount prevents multi-instance sharing**: [narrator.tsx:172](file:///D:/projects/qa3elhamor/libs/world/feature/src/lib/narrator.tsx#L172). Document that consumers must pass `model.clone()` if the same static asset is passed to more than one `<Narrator>` concurrently.

---

## Data flow

1. **Mount (`Narrator`)**: [OK] Evaluates `present`. If initially `false`, returns `null` immediately. If `true`, mounts `NarratorBody`.
2. **Setup (`NarratorBody`)**: [GAP] Creates `uniforms`, evaluates `mesh` and `bounds`. If `cast` is invalid string or `cast.object` is null, crashes before render.
3. **Loop (`useFrame`)**: [OK] Allocates zero objects. Transforms camera position into `anchor.parent` local space. Calculates `dx, dz` and `cameraYaw`.
4. **Motion step (`stepNarrator`)**: [OK] Clamps `dt` to 0.1s. Steps presence, yaw spring, talk spring, swim spring. Generates exact analytical pose. Latches `settled` / `exited`.
5. **Pose update**: [OK] Applies position, Euler `'YXZ'` rotation, and scale to `animated` group. Updates uniforms.
6. **Departure & unmount**: [OK] On exit completion, `stepNarrator` emits `exited`. `NarratorBody` invokes `onExited`, triggering `Narrator` to set `exited=true` and return `null`. Procedural mesh and material are disposed.

---

## Requirements fulfilment

| Requirement | Status | Gap |
| ----------- | ------ | --- |
| Frame-rate independence & springs | COMPLETE | None. Exact critically damped analytical decay. |
| Angle wrapping & yaw limits | COMPLETE | Shortest angular path; no $360^\circ$ spins. |
| Mid-way reversal & single-fire events | COMPLETE | Reversal preserves side vector; settled/exited latch once. |
| NaN guards everywhere | COMPLETE | Comprehensive finite fallbacks across all motion scalars. |
| Zero per-frame allocations | COMPLETE | Reuses refs, vectors, and poses; no GC churn in `useFrame`. |
| Per-instance shader uniforms | COMPLETE | Each narrator instance instantiates its own uniforms ref. |
| Lifecycle & disposal | COMPLETE | Procedural meshes disposed on departure; models preserved. |
| Backward compatibility | COMPLETE | Ambient fish and builder unchanged; all existing tests pass. |
| Reduced motion | COMPLETE | Snaps arrival, locks heading, freezes clock, gentle scale pulse. |
| Speech-bubble anchor stability | COMPLETE | Fixed at $1.22 \times \text{height}$ in parent space; no jitter. |
| SpongeBob T-pose framing | PARTIAL | `NarratorBounds` omits width; bounds only measures height. |
| `<WorldSpace>` placement | PARTIAL | Default heights tuned for world space; needs $1/20$ inside `WorldSpace`. |

---

## Edge cases

| Case | Handled | How | Concern |
| ---- | ------- | --- | ------- |
| Mid-way entry/exit flip | YES | Reverses presence rate along existing side vector | None; smooth and tested |
| Camera directly above post | YES | Returns `NaN` cameraYaw, falls back to restYaw | None; avoids singularity |
| Tab switched / 30s frame drop | YES | Clamps `dt` to 0.1s (`NARRATOR_MAX_FRAME`) | None; no teleportation |
| Corrupt spring state (`NaN`) | YES | Snaps state to target cleanly | None; verified by spec |
| Dynamic `scale` or `position` change | YES | Re-evaluates `fit` and `height`; smoothly updates | None |
| Unrecognized cast string | NO | Throws TypeError reading property of undefined | Serious; crashes tree |
| Null `Object3D` during async load | NO | Throws TypeError in `WeakMap.get` | Serious; crashes tree |
| Multi-instance model reuse | NO | Three.js reparenting steals node from first instance | Minor; requires cloning |

---

## Verdict

- **Recommendation**: REVISE (Score: 7.5/10)
- **Confidence**: HIGH
- **Top risk**: Unhandled null model or invalid cast ID causes fatal runtime crash during async asset loading or landmark integration.
- **What a robust implementation would add**:
  1. Add null/undefined checks to `measureNarratorModel` and `narratorHeight`.
  2. Guard `NARRATOR_CAST[castId]` with `isNarratorCastId` and fallback in `narrator.tsx` and `narrator-cast.ts`.
  3. Include `width` and `depth` in `NarratorBounds`.
  4. Export `NARRATOR_SCENE_WORLD_SCALE = 1 / WORLD_SCALE` to simplify landmark integration.
