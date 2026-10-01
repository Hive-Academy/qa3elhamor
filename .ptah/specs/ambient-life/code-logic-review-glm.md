# Code Logic Review — `ambient-life` (+ quality-governor stall fix)

Independent code-logic review of the uncommitted working tree for roadmap item **ambient-life**
(instanced fish schools, procedural Hamour patrol, kelp bed, character placements) and the
quality-governor follow-up (single stall must no longer permanently downgrade the tier).

## Summary

| Metric              | Value    |
| ------------------- | -------- |
| Overall score       | 8/10     |
| Assessment          | APPROVED |
| Blocking issues     | 0        |
| Serious issues      | 0        |
| Moderate issues    | 2        |
| Failure modes found | 8        |

Scope reviewed: every file under `libs/world/feature/src/lib/ambient-*`, `fish-*`, `hamour*`,
`kelp-*`, `low-poly-builder.ts`, `vertex-motion.ts`; `libs/world/domain/src/lib/quality-governor.ts`
(+spec), `quality-profile.ts` (+spec); the `ocean-world.tsx` / `ocean-floor.tsx` / `quality-monitor.tsx`
/ `index.ts` diffs; `apps/web/src/app/ambient.config.ts` (+spec) and the `app.tsx` ambient wiring.
Out of scope per the brief (`libs/dive`, `libs/landmarks`, `apps/web` overlays/in-world/dive.config) was
not reviewed. `npx nx run-many -t test,typecheck,lint -p world-domain world-feature --skipSync` exits 0
(all 7 tasks pass; Nx served them from cache, which is input-hashed, so the passing run corresponds to
the current file state).

What was verified rather than trusted:

- **Instance matrices** — the column-major writer in `fish-school.ts:254-289` was recomputed by hand:
  R = Ry(yaw)·Rx(pitch) with uniform scale `s`; column 2 is `(vx, vy, vz)/|v|`, so the +Z nose
  (geometry nose is at +Z, `fish-mesh.ts:18`) points exactly along the velocity. Covered by spec
  ("nose-first along its velocity without roll").
- **Frustum culling of instanced fish** — the classic vanishing-fish bug is *not* present.
  `fish-school-mesh.tsx:51` sets `instanced.boundingSphere` to a sphere over the school's whole
  roaming region, and three r185's `Frustum.intersectsObject` (node_modules/three/src/math/Frustum.js:148-152)
  prefers `object.boundingSphere` over the geometry's for `InstancedMesh`. `frustumCulled` stays at its
  default true.
- **No allocation in frame loops** — `stepSchool`/`writeSchoolMatrices` write only into preallocated
  typed arrays; the Hamour's `useFrame` (`hamour.tsx:91-153`) reuses ref vectors and passes targets into
  `getPointAt`; kelp costs nothing per frame. `camera.getWorldDirection(r.forward)` writes into the ref.
- **Ambient-clock wrap is genuinely seamless** — every shader/CPU angular frequency was checked against
  the claimed "multiple of 0.02 rad/s" (period 100π): fish 9.0 (`fish-mesh.ts:74`), kelp 0.7/1.9/0.56
  (`kelp-bed.ts:219-220`), Hamour 3.2/1.2 (`hamour-model.ts:303,306`), CPU bob 0.4 (`hamour.tsx:131`).
  All × 50 are integers, so each is a whole number of cycles per wrap.
- **Disposal** — geometry/material are `useMemo`-created and disposed by effects keyed to them in
  `ambient-life.tsx:43-44`, `fish-school-mesh.tsx:45`, `hamour.tsx:88-89`, `kelp-forest.tsx:65-66`.
  The shared fish geometry is owned by `AmbientLife` (not by the meshes that receive it via `args`), so
  sibling schools can't double-dispose it. R3F calls `InstancedMesh.dispose()` on declarative unmount,
  releasing `instanceMatrix`/`instanceColor` GPU buffers.
- **Governor regression hunt** — no path found where a genuinely slow device stops downgrading:
  p50 < 2000 ms stays on the sustained-slow rule; p50 ≥ 2000 ms windows accumulate as stalls and step
  down after 2 per tier (e.g. two back-to-back 3 s stall windows downgrade high→medium at 9 s, matching
  the spec comment). Warm-up stalls don't count, stall windows reset the fast streak but never add slow
  time, `changeTo` resets `stalls` on every tier change (`quality-governor.ts:112-121`).

## Five logic questions

### 1. How does this fail silently?

- **The Hamour can vanish without a trace.** `resolveAmbientLife` warns when the patrol has fewer than
  3 finite points (`ambient-config.ts:171`), but patrol points are additionally clamped into the water
  volume (`ambient-config.ts:166-169`); if clamping collapses the points so the closed curve's length is
  ~0, `createPatrolLoop` returns null (`hamour-patrol.ts:34`) and `Hamour` renders nothing, silently
  (`hamour.tsx:155`). A fork with a badly-placed route loses the hero creature with no console message.
- **Kelp silently roots on non-seabed surfaces** (moderate, FM-3 below): `probeSeabed` accepts any
  upward-facing surface in the loaded floor model; the only rejection is steepness.
- **Dropped ambient parts are silent by design in one spot and warned in another**: a school with a
  non-finite home warns (`ambient-config.ts:152`); a character with a non-finite position is dropped
  without a warning (`ambient-config.ts:185`).

### 2. What user action produces unexpected behaviour?

- **A mid-dive governor downgrade/upgrade pops all the life.** The school mesh key embeds
  `fishPerSchool` (`ambient-life.tsx:53`), so a tier change remounts every school: fish respawn in
  their seeded scatter, not where they were. Kelp re-probes the seabed and adds/removes stalks
  (`kelp-forest.tsx:32-45,68-87`). One visible world-wide pop per tier change, coinciding with a frame
  the device is already struggling on.
- **Scrolling very fast (long dive jump) while the Hamour is in view**: the snap path is gated on
  `hidden` (`hamour.tsx:117-122`), so it instead sprints at 3.2× cruise (~5 u/s) — correct behaviour, but
  for a >70 u gap the visitor is without the Hamour for ~15 s.
- **Forker places a character with `rotationY: NaN` or non-finite `scale`**: `resolveAmbientLife` filters
  only `position` (`ambient-config.ts:185`); a NaN rotation renders the model invisible with no error.

### 3. What input data produces a wrong answer?

- **A route whose camera-line/landmark clearances are unsatisfiable**: `clearSpot`'s ring search gives up
  after 24 u and falls back to `awayFromLandmarks`, which enforces only landmark clearance — the point
  can then sit inside the 5 u camera-line clearance (`apps/web/src/app/ambient.config.ts:108`). The
  current route does not hit this (specs assert clearance), but a re-tuned dive could place a patrol
  point on the camera line, where the runtime cone-easing then visibly shoves the Hamour sideways every
  frame.
- **An `AmbientLifeConfig` whose kelp `area` is tiny or fully covered by clearings**: legal
  `planKelpBed` drops clumps one by one and can return zero stalks — no kelp, no warning. Acceptable
  per the documented "crowded map yields fewer stalks" contract.
- **A school spec with `radius` at the 40 limit**: the manual bounding sphere is `2r + 2·size`
  (`fish-school-mesh.tsx:51`) and the goal drifts to `0.55r` with a soft pull beyond `0.5r` — the
  margin holds for the shipped configurations (verified against the steering constants in
  `fish-school.ts:199-205`).

### 4. What happens when a dependency fails?

- **Floor GLB fails to load**: `onError` fires, `ground` stays null, kelp renders nothing
  (`kelp-forest.tsx:89`) — intended and documented (notes open issue 2). Schools and the Hamour
  continue; they don't depend on the floor.
- **Character model fails to load**: per-character `ModelErrorBoundary` + `Suspense`
  (`ambient-life.tsx:100-105`) hides only that character.
- **A long frame (tab switch, GC)**: every consumer clamps delta — clock `MAX_FRAME_SECONDS`
  (`ambient-life.tsx:18,46`), boids `MAX_SCHOOL_STEP` (`fish-school.ts:70,119`), Hamour `MAX_FRAME`
  (`hamour.tsx:23,95`). The governor now treats a ≥2 s frame as a counted stall rather than slow time,
  so one GC pause can no longer fill `downgradeAfterMs` by itself (`quality-governor.ts:157-161`).
- **Frames stop entirely (hidden tab)**: windows are unusable and `adaptTier` returns the state
  unchanged; the wall-clock `settleGovernor` backstop still applies. Kelp's probe effect re-runs only
  on `ground`/`plan` change, not per frame.

### 5. What is missing that the requirements never mentioned?

- No kelp density/skip for the region *ahead* of the camera mid-dive (only sampled path points below
  y 12 and the final view are cleared); a tall clump in front of the camera between stops is possible
  if the path there runs above `cameraClearanceBelowY`. Latent, not observed in captures.
- Fish don't avoid terrain (acknowledged in notes open issue 4) and the Hamour avoids only landmarks
  and the camera line, not other map geometry (open issue 5). Recorded as accepted limitations.
- The throttled fps A/B on a quiet machine is still owed (notes open issue 1) — the "dive feels
  inhabited without breaking the frame-rate budget" success criterion is supported by draw-call counts
  and µs-level CPU benchmarks, not by a clean fps measurement.

## Failure modes

### FM-1 — A warm-up stall breaks the fast streak it was supposed to be exempt from

- Trigger: a stall window whose `state.sinceChangeMs < warmupMs` (it straddled the end of warm-up).
- Symptom: `stalls` is not incremented (correct, "a stall that began in warm-up is ignored") but
  `fastMs` is still reset to 0 (`quality-governor.ts:161` resets it unconditionally).
- Evidence: `quality-governor.ts:156-161`; the spec
  (`quality-governor.spec.ts`, "ignores a stall that began during warm-up") asserts only the stall
  count, not the fast streak.
- Current handling: the upgrade path is delayed by up to `upgradeAfterMs` of extra fast time.
- Recommendation: `fastMs: counted ? 0 : state.fastMs` — or state in the docs that warm-up stalls
  break fast streaks too. Impact is a slower upgrade at worst; no tier safety involved.

### FM-2 — Degenerate patrol silently drops the Hamour

- Trigger: patrol points that survive the finite filter but collapse after `insideWater` clamping
  (or a fork config with coincident points), making the closed curve length ~0.
- Symptom: no Hamour anywhere; nothing in the console.
- Evidence: `ambient-config.ts:166-171` (clamps, then checks only `length >= 3`), `hamour-patrol.ts:34`
  (`!(length > 0) return null`), `hamour.tsx:155` (`if (!loop) return null`).
- Current handling: silent skip.
- Recommendation: `console.warn` in `createPatrolLoop` (or in `Hamour`) when a non-null `config.hamour`
  produces no loop — the school path already warns for comparable breakage.

### FM-3 — Kelp probe accepts any upward surface of the floor model, not only the seabed

- Trigger: the loaded GLB contains flat, upward-facing geometry that is not ground — a rooftop, a
  platform, a hull — outside the landmark-focus clearings.
- Symptom: kelp stalks rooted on man-made surfaces. The slope filter only rejects walls
  (`normal.y < 0.45`, `kelp-bed.ts:154-155`); a flat roof passes with `normal.y ≈ 1`.
- Evidence: `kelp-bed.ts:140-158` — one downward ray per clump against `intersectObject(ground, true)`,
  first hit wins, only steepness is checked.
- Current handling: the current town's landmark clearings cover the named buildings, and the author's
  captures show no kelp-on-roof; latent for any future environment or fork asset.
- Recommendation: tag seabed meshes at load (name/userData convention) and filter the raycast, or at
  least reject hits above the water-volume-relative ground band. This is the one finding I'd fix before
  the next environment swap.

### FM-4 — `clearSpot` fallback ignores camera-line clearance

- Trigger: no candidate within the 24-ring search satisfies both landmark and camera-line clearance
  (heavily constrained route).
- Symptom: a patrol point inside the 5 u camera-line clearance; the runtime view cone then eases the
  Hamour out every frame, producing constant visible steering.
- Evidence: `apps/web/src/app/ambient.config.ts:96-109` — fallback is `awayFromLandmarks`, which
  enforces only `landmarkClearance`.
- Current handling: does not trigger on the shipped route (specs assert the near leg keeps clear).
- Recommendation: after the fallback, also push the point perpendicular away from the nearest path
  sample until `distanceToCameraLine` is met (bounded loop), or warn.

### FM-5 — Sight-line kelp clearings have uncovered mid-line gaps for long sight lines

- Trigger: a waypoint whose focus is far away (sight-line length ≳ 55 u).
- Symptom: kelp can root on the sight line between the camera stop and the landmark, in the stretches
  not covered by the endpoint clearings.
- Evidence: `apps/web/src/app/ambient.config.ts:155-164` clears only the 33 %/66 % points (radius 4.5);
  endpoint coverage is the camera-line clearing (≤ 10.5 u ahead via the 6 u-ahead disc) and the 7 u
  landmark clearing. For L = 60 u the stretch 10.5–15.3 u along the line is covered by neither.
- Current handling: the town's landmarks sit ~8–15 u off the path, so L is small and the discs overlap.
- Recommendation: walk the sight line in ≤ 4 u steps (the same sampling used for the camera line)
  instead of two fixed fractions.

### FM-6 — Synchronous main-thread seabed probe at floor load

- Trigger: `ground` becomes non-null; up to 30 patch rays against the ~65 k-triangle model, no BVH.
- Symptom: a one-off frame hitch (~2 M triangle tests; likely tens to low hundreds of ms on a mid
  device) right after the model decode, which is itself the busiest moment of the page.
- Evidence: `kelp-forest.tsx:48-61` runs `probeSeabed` synchronously in `useEffect`; acknowledged
  untimed in notes open issue 3.
- Current handling: once per load, not per frame; a sub-second hitch is a slow window at worst, and
  the new governor semantics mean it cannot alone downgrade (it is not a ≥2 s stall).
- Recommendation: acceptable as shipped; add a BVH or defer one frame if it ever shows up in a profile.

### FM-7 — Tier change remounts schools and re-probes kelp

- Trigger: the governor steps the tier mid-dive.
- Symptom: all fish teleport to their seeded scatter and the kelp count jumps (one visible pop per
  change); the kelp re-probe re-runs the ray batch.
- Evidence: `ambient-life.tsx:53` (key embeds `fishPerSchool`), `kelp-forest.tsx:32-45` (plan memo keyed
  on the per-tier `kelp` object), `ambient-config.ts:148-188` (resolve rebuilds all objects per budget).
- Current handling: deterministic seed keeps kelp layout identical, so only the count changes;
  particles already behaved this way across tiers.
- Recommendation: acceptable; if it ever reads as jarring, key on `index` only and let `writeSchool`
  matrices absorb count changes, or fade schools in on remount.

### FM-8 — Character placement validation is thinner than the school/kelp validation

- Trigger: a fork supplies a character with non-finite `rotationY`/`scale`, or a non-finite position.
- Symptom: NaN rotation/scale silently renders the model invisible; a bad position is dropped with no
  warning (schools warn in the equivalent case).
- Evidence: `ambient-config.ts:185` filters `characters` on `finiteVec(c.position)` only, no warn;
  `ambient-life.tsx:111-116` passes `rotationY ?? 0` and `scale ?? 1` straight to `<primitive>`.
- Current handling: the default and shipped config is `characters: []`, so no user of this site can
  hit it; it is a fork-config boundary.
- Recommendation: clamp/warn `rotationY`/`scale` the way `AMBIENT_LIMITS` clamps fish size/speed.

### Governor residual (not a defect, recorded for the audit trail)

Stalls never decay on good performance within one tier visit: two stalls minutes apart, with perfect
frames between, still downgrade. This matches the stated design ("consecutive or not") and the charter
("repeated stall windows"), and exposure is bounded by the settle window (~10.5 s past warm-up).
`downgraded` also permanently blocks upgrades (pre-existing rule), which is the intended one-way door.

## Blocking issues

None.

## Serious issues

None.

## Moderate and minor issues

1. **Moderate** — FM-3: kelp roots on any upward floor surface, not only seabed (`kelp-bed.ts:150-158`).
2. **Moderate** — FM-1: warm-up stall still resets the fast streak, contradicting "ignored"
   (`quality-governor.ts:161`).
3. **Minor** — FM-2: silent Hamour drop on a degenerate/clamped patrol (`hamour.tsx:155`).
4. **Minor** — FM-4: `clearSpot` fallback ignores camera-line clearance
   (`apps/web/src/app/ambient.config.ts:108`).
5. **Minor** — FM-5: sight-line clearings cover only the 33 %/66 % points (`apps/web/src/app/ambient.config.ts:155-164`).
6. **Minor** — FM-6: synchronous seabed probe at load (`kelp-forest.tsx:48-61`).
7. **Minor** — FM-7: tier change pops schools/kelp (`ambient-life.tsx:53`).
8. **Minor** — FM-8: character `rotationY`/`scale` unvalidated (`ambient-config.ts:185`).

## Data flow

Dive path → `buildAmbientLife(DIVE_PATH)` (module scope, once per load — `app.tsx` diff) →
`OceanWorld` → `AmbientLife` → `resolveAmbientLife(config, budget)` → rendered parts.

1. `AMBIENT_LIFE` config identity is stable (module constant) — OK, `useMemo`/effects don't churn.
2. `quality.profile.ambientLife` is a constant per tier — OK, resolve re-runs only on tier change.
3. Clock: `tickAmbientClock` advances a shared uniform once per frame, wrap-verified — OK.
4. Fish: `stepSchool` (O(n·k), allocation-free) → `writeSchoolMatrices` → `needsUpdate` — OK.
5. Hamour: nearest-loop (96 samples + hysteresis) → `advancePatrol` (dt clamped, snap only when
   unseen) → `viewClearanceOffset` (NaN-safe at dead centre) → eased position/heading — OK.
6. Kelp: `planKelpBed` (deterministic, clearings respected) → `probeSeabed` once on floor load →
   instance matrices + `computeBoundingSphere` + sway margin — OK, with FM-3's surface-class gap.
7. Characters: `findAsset` → `assetAllowed(asset, tier)` (`quality-assets.ts:19-26` — manifest
   `minimumTier` enforced) → boundary + suspense per model — OK.
8. Governor: window → usable? → warm-up? → stall? (count/break-fast) : slow/fast streaks →
   downgrade on `slowMs ≥ 3000 || stalls ≥ 2` → upgrade → settle — OK, regression-checked.

## Requirements fulfilment

| Requirement                                             | Status    | Gap                                                                  |
| ------------------------------------------------------- | --------- | -------------------------------------------------------------------- |
| Instanced procedural fish schools, cheap boids          | COMPLETE  | —                                                                    |
| One original hero creature patrolling the dive path     | COMPLETE  | Silent drop on degenerate config (FM-2)                              |
| Swaying kelp, tier-gated                                | COMPLETE  | Roots on any upward surface (FM-3)                                   |
| All gated by quality tier; inhabited at every tier      | COMPLETE  | Ambient budgets > 0 at all three tiers (`quality-profile.ts:64,78,90`)|
| SpongeBob/Patrick unplaced by default; fork placeable    | COMPLETE  | `characters: []` (`apps/web/ambient.config.ts:195`), gated by `minimumTier` |
| Forker can configure counts / disable parts             | COMPLETE  | Counts are the tier's budget by design; disable via `null` parts / `ambientLife={null}` |
| Governor: single ≥2 s stall no longer downgrades        | COMPLETE  | Warm-up stall still breaks fast streaks (FM-1, minor)                |
| Governor: repeated stalls downgrade; warm-up ignored     | COMPLETE  | Verified by 6 new spec cases + persistent-stall spec                  |

Implicit requirements not addressed: none material — reduced motion (scale 0 freezes life; Hamour
still follows jumps unseen, `hamour-patrol.ts:141-143`), fog compatibility (built-in materials,
`fog` default true, patches leave fog chunks intact), mobile precision (patches are vertex-only,
default highp), and per-frame allocation were all checked and hold.

## Edge cases

| Case                                       | Handled | How                                                                   | Concern |
| ------------------------------------------ | ------- | --------------------------------------------------------------------- | ------- |
| Empty/zero-budget ambient config           | YES     | `resolveAmbientLife` clamps, `fishPerSchool` 0, parts null            | — |
| School of 1 fish / oversized `neighbourSamples` | YES | `k = min(k, n-1)`; self-exclusion `(i+1+…) % n` (`fish-school.ts:131-164`) | Spec-tested |
| Frames > 100 ms (tab switch, GC)           | YES     | Clock/boids/Hamour each clamp delta                                  | — |
| Camera exactly on the patrol path / dead-centre of view axis | YES | `viewClearanceOffset` up-push fallbacks, no NaN (`hamour-patrol.ts:196-231`) | Spec-tested |
| Portrait screens                           | YES     | `fitClearance` narrows the cone by aspect, floor 0.45 (`hamour.tsx:37-44`) | — |
| Reduced motion, scale 0                    | YES     | Clock frozen, matrices written once at layout, snap still follows     | Freeze-frame look is intended |
| Floor not loaded / ray miss / steep face   | YES     | No kelp until ground; miss or `normal.y < 0.45` drops the clump       | FM-3 surface class |
| Hidden tab                                 | YES     | Unusable windows leave governor state unchanged (pre-existing)        | — |
| Unknown character id / below minimumTier   | YES     | Warn+skip / `assetAllowed` false → nothing fetched                    | FM-8 fields |
| Tier change mid-dive                       | PARTIAL | Clean remount, no leaks/stale counts                                 | FM-7 visible pop |
| Clock wrap after days open                 | YES     | 100π wrap, all frequencies verified as whole cycles                  | — |
| Long dive jump with Hamour visible         | YES     | Sprints at 3.2× instead of snapping                                  | ~15 s absence for a 70+ u jump |

## Verdict

- Recommendation: **APPROVE** (fix FM-3 before the next environment asset swap; the rest are small
  follow-ups that don't gate this item)
- Confidence: HIGH
- Top risk: kelp silently rooting on non-seabed upward surfaces of a future/forked environment model,
  because `probeSeabed` cannot tell seabed from a flat roof.
- What a robust implementation would add: (1) seabed tagging for the kelp probe; (2) a warning path
  for the degenerate-patrol Hamour drop; (3) `fastMs`-preserving warm-up stalls; (4) full-length
  sight-line sampling for kelp clearings; (5) the owed quiet-machine throttled fps A/B.