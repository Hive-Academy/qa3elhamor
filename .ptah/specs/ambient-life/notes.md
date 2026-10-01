# ambient-life — implementation notes

Roadmap item **ambient-life**, plus the quality-tiers follow-up (single stall → permanent downgrade).

## Files

Created (libs/world/feature/src/lib):

- `ambient-config.ts` (+ spec): `AmbientLifeConfig` (forkable data: schools, Hamour, kelp, characters, reducedMotionScale, seed), `AMBIENT_LIFE_DEFAULTS`, `resolveAmbientLife(config, budget)` (cut to tier, sanitise, warn).
- `ambient-life.tsx`: `<AmbientLife>`: owns the ambient shader clock; renders schools / Hamour / kelp / optional character models.
- `ambient-clock.ts`: shared `uAmbientTime` uniform, wraps at 100π s (all angular frequencies are multiples of 0.02 rad/s, so the wrap is seamless).
- `fish-school.ts` (+ spec): boids-lite simulation and allocation-free instance-matrix writer.
- `fish-mesh.ts`, `fish-school-mesh.tsx`: 14-triangle fish, Lambert + tail-beat vertex patch, one `InstancedMesh` per school.
- `hamour-model.ts` (+ spec, with fish tests): the procedural grouper geometry and its swim material.
- `hamour-patrol.ts` (+ spec): closed CatmullRom patrol loop, camera-following speed, unseen snapping, view-clearance cone.
- `hamour.tsx`: the Hamour component.
- `kelp-bed.ts` (+ spec), `kelp-forest.tsx`: bed layout, seabed ray probe, stalk geometry, sway material, one `InstancedMesh`.
- `low-poly-builder.ts`: flat-coloured, non-indexed triangle builder.
- `vertex-motion.ts`: `onBeforeCompile` patch helper for built-in materials (keeps fog, lights, instancing).

Modified:

- `libs/world/domain/src/lib/quality-profile.ts` (+ spec): new `QualityProfile.ambientLife: AmbientLifeBudget`.
- `libs/world/domain/src/lib/quality-governor.ts` (+ spec): stall fix (below).
- `libs/world/feature/src/lib/ocean-world.tsx`: new props `ambientLife` (default `AMBIENT_LIFE_DEFAULTS`, `null` = none) and `assetBaseUrl`; tracks the loaded floor as the ground for kelp.
- `libs/world/feature/src/lib/ocean-floor.tsx`: `onLoad(root | null)` callback.
- `libs/world/feature/src/lib/quality-monitor.tsx`: comment only (ties `STALL_FRAME_MS` to `stallFrameMs`).
- `libs/world/feature/src/index.ts`: exports.
- `apps/web/src/app/app.tsx`: `AMBIENT_LIFE = buildAmbientLife(DIVE_PATH)` passed to `<OceanWorld>`.

Created (apps/web/src/app): `ambient.config.ts` (+ spec): everything positional is derived from the runtime `DivePath` (`pointAt`, `tangentAt`, `waypoints[].focus/position`, `controlPoints`). Nothing is hard-coded to the current route, so the concurrent dive re-tune moves the life with it. `characters: []` (SpongeBob/Patrick unplaced, with an IP comment showing how a fork could place them).

Throwaway tooling in this folder: `capture.mjs` (scene screenshots + draw calls/fps, with env `PORT`, `EXTRA`, `THROTTLE`, `SETTLE`, `WAIT`), `viewer.html`/`viewer.ts`/`viewer-capture.mjs` (creature close-ups served through the dev server's `/@fs`), `bench-boids.ts` (bundle with esbuild, then run).

## Design

**Hamour (grouper).** Authored in code, no asset (asset budget untouched). It is a loft of 11 elliptical rings (12 segments) from the nose to the tail root, using a profile table: deep, slightly compressed body; back rising behind the head; flattened belly. The lower-side vertices of the first two rings are pushed forward, which gives the underbite, and a dark gape runs along the lower head (big mouth). There are two domed eye discs (gold ring, dark pupil). The dorsal fin is spiny at the front, with alternating spine heights, and soft and rounded at the rear. Also: a rounded anal fin, a rounded fan tail, and paddle pectoral and pelvic fins. Colouring is per face (flat): low-frequency brown/olive/tan blotches, a darker back, a pale belly, and 44 small raised pale-spot discs. About 560 triangles, one draw call. Material: `MeshStandardMaterial`, flat-shaded and double-sided, with a faint warm emissive (0.45 × #3b2612) so it stays brown under the blue rig. Swim: a bone-free vertex wave. Amplitude grows (squared) toward the tail, the head counter-sways slightly, and the jaw "breathes" slowly. `uHamourSwim` scales the beat with its current speed. Flat shading derives normals from screen derivatives, so lighting follows the deformed shape for free.

**Patrol.** `buildHamourPatrol` turns the dive into a closed loop. The near leg runs down the route 8.5 u to the right of travel. The far leg returns 22 u to the left and 7 u higher, deep in the fog. Every point is moved to the nearest spot (ring search) that is ≥ 7 u (xz) from each landmark and ≥ 5 u from the camera line. At runtime it cruises at 1.6 u/s but leans toward the camera's stretch of loop (lead 6 u, speed band 0.3–3.2×), so it is never far from the visitor at any depth. The nearest-loop lookup has hysteresis, so a camera between the two legs doesn't flip-flop. A big gap (> 70 u, e.g. a long scroll jump) is closed by moving the Hamour 45 u behind the camera, but only while it is unseen: > 34 u away or behind the camera. Otherwise it swims there at top speed. **Never blocks a landmark:** each frame it is eased out of a cone in front of the camera (radius 2.5 u + 0.32 per unit ahead, out to 26 u) and kept ≥ 8 u from the camera. The cone narrows with aspect on portrait screens (down to 0.45×), otherwise a phone's narrow horizontal field of view would hide it entirely. `minY` 4.5 keeps it off the seabed. Nothing is allocated per frame.

**Fish schools.** One `InstancedMesh` per school (one draw call; frustum-culled using a bounding sphere over the school's whole roaming region). Boids-lite per fish, per frame:
- cohesion, alignment and separation against `neighbourSamples` school-mates, spread across the school by a stride and rotated every frame, so the cost is O(n·k), never O(n²);
- a per-fish sine wander;
- a soft pull toward a goal drifting on a slow Lissajous around the school's home (vertical distance counts double, which keeps schools flat);
- a speed band of 0.55–1.45× cruise, and climb capped at 0.3 of horizontal speed.

State lives in preallocated `Float32Array`s. Matrices are written directly, column-major, into `instanceMatrix.array` (no trig, no allocation). The seed comes from `seeded-random.ts`. The tail beat is in the vertex shader, phased by `gl_InstanceID`. School homes are derived from the dive at fixed progress values, offset 8 u sideways, in priority order: the low tier's two schools sit at the town (0.5) and early in the descent (0.14).

**Kelp.** One `InstancedMesh`. `planKelpBed` lays out clumps of 6 stalks, 65% of them grown next to an earlier clump so they read as beds. Clumps stay inside the route's footprint plus a 22 u margin and outside every clearing: landmark footprints (7 u), the camera line wherever the camera is below y 12 (4.5 u, plus a point 6 u ahead of it), the sight line from each stop to its landmark, and the view ahead of the final camera position. Each clump is rooted by one downward ray onto the loaded seabed GLB, so heights come from the real terrain. A miss or a steep face (normal.y < 0.45) drops the clump. A stalk is two crossed lobed ribbons (32 triangles), shaded dark-to-bright green, with per-instance shade variation. Sway is entirely in the vertex shader: height² × two detuned sines, phased by root position. CPU cost per frame is nil. Kelp appears only once the floor has loaded; if the load fails there is no kelp.

**Fog and reduced motion.** Every material is a built-in three material with `fog: true`, so everything fades into the scene fog. Reduced motion scales all ambient motion by `reducedMotionScale` (default 0.25: slow, not frozen; 0 freezes). The Hamour still follows camera jumps unseen.

**Disposal.** Geometries and materials are created in `useMemo` and disposed by effects keyed to them, the same pattern as `OceanParticles`.

**Characters.** `config.characters` places manifested models in scene-world units. Each is gated by `assetAllowed(asset, tier)` and wrapped in `ModelErrorBoundary` + `Suspense`, and unknown ids are warned and skipped. Empty by default, and `apps/web` passes `[]`.

## Per-tier budgets (`QUALITY_PROFILES[tier].ambientLife`)

| tier | schools × fish | neighbours | kelp stalks | Hamour | extra draw calls (max) | ambient tris (approx.) |
|---|---|---|---|---|---|---|
| low | 2 × 12 | 3 | 36 | yes | 4 | 0.3k fish + 1.2k kelp + 0.56k Hamour ≈ 2.1k |
| medium | 4 × 22 | 4 | 96 | yes | 6 | 1.2k + 3.1k + 0.56k ≈ 4.9k |
| high | 6 × 36 | 6 | 180 | yes | 8 | 3.0k + 5.8k + 0.56k ≈ 9.4k |

(The environment map alone is about 65k triangles.)

## Measured cost

- **Boids CPU**, steps plus matrix writes for all schools (`bench-boids.ts`, Node 24, this desktop): low **10.5 µs/frame**, medium **43 µs**, high **94 µs**. Even at 6× CPU slowdown that is ≤ 0.6 ms at high and ≤ 0.07 ms at low. Kelp and the Hamour's body wave cost no per-frame CPU. The Hamour's own logic is a 96-sample nearest search plus two curve evaluations.
- **Draw calls**, counted per frame by wrapping `draw*` on the WebGL context, same route and positions, ambient off vs on (Vite dev server, headless Chromium on the GPU via ANGLE/D3D11; draw counts don't depend on dev vs prod):
  - high: p20 96 → 100, p40 58 → 62, p60 101 → 104, p95 114 → 119;
  - low: p20 96 → 98, p40 59 → 62, p60 101 → 102, p95 115 → 118.

  That is +1 to +5, varying with which schools are in view.
- **fps.** Unthrottled, every tier and both viewports render at the 60 fps vsync cap with ambient life on. Under CPU×4 throttling (production build via `vite preview`) the A/B was **inconclusive**: the same configuration swung between 5 and 30 fps from run to run, vsync-quantised, with other agents loading the machine. No systematic difference between on and off could be separated from that noise. A clean throttled A/B on a quiet machine is still owed (see open issues).

## Governor fix (quality-tiers follow-up)

`quality-governor.ts`: a window whose median frame is ≥ `stallFrameMs` (2000, matching the monitor's `STALL_FRAME_MS`) is a **stall**. A stall no longer counts as slow time, so one multi-second frame can't fill `downgradeAfterMs` by itself. Stalls are counted per tier after warm-up (a stall that *began* in warm-up is ignored). A downgrade happens when `stalls ≥ downgradeAfterStalls` (2), consecutive or not, or on the existing sustained-slow rule. A stall breaks a fast streak and leaves a slow streak unchanged. The counter resets on every tier change. New policy fields: `stallFrameMs` and `downgradeAfterStalls`. New state field: `stalls`. New specs: a single isolated stall does not downgrade, and the tier settles at high. A single stall can't complete a slow streak. Repeated stalls downgrade (back to back, or spread out). A stall during warm-up is ignored. A stall breaks an upgrade streak. Stalls are counted afresh after a change. All existing specs pass unchanged; the persistent-stall spec still steps high → low and settles by 30 s.

## Verification

- `npx nx run-many -t lint,typecheck,test -p world-domain world-feature web --skipSync`:
  - world-domain: 73 tests pass;
  - world-feature: 86 tests pass;
  - typecheck: all three projects clean;
  - lint: clean for every file in this item;
  - web: all ambient specs pass.
- At the final run, the web project showed 1 failing test (`src/app/in-world/in-world.spec.ts`, "holds perfectly still when calmed", a `-0` vs `+0` deep-equal) and 1 lint warning (`in-world-card.tsx`, unused `useThree`). Both are in another lane's in-progress `apps/web/src/app/in-world/` (diegetic overlays), not in this item's files.
- Earlier, one medium-tier capture hit a transient missing `LandmarkReturnBar` export from that lane's `libs/landmarks/ui` edit; the re-run was clean.

## Screenshots (`shots/`)

- `before-*`: baseline before this item (older dive route).
- `final-{high,medium,low}-{p15,p40,p70,p95}-{desktop,phone}.jpg`: the final set.
  - Hamour clearly visible: `r3-high-p40-desktop.jpg` (the hero shot: Hamour with a yellow school above the Tiki and the Pineapple, kelp behind, neither landmark covered) and `final-low-p95-phone.jpg` (low tier, phone, end of dive, beside the Krusty Krab).
  - Fish and kelp at low tier: `final-low-p15-desktop.jpg`, `r3-low-p40-phone.jpg`.
- `view2-side.jpg`, `view2-three-quarter.jpg`, `view2-front.jpg`: Hamour close-ups. `view3-fish.jpg`, `view3-kelp.jpg`: fish and kelp close-ups.
- `r1-*`, `r2-*`, `r3-*`: iteration history. The first Hamour pass had a harsh checkerboard and was too dark; then the per-face spots were replaced by spot discs; the kelp was widened; the fish got an emissive lift; and the camera-distance and portrait clearance were added.

## Open issues

1. A throttled-CPU fps A/B on a quiet machine (or a real mid-range phone) is still owed; this machine's headless numbers were too noisy.
2. Kelp needs the floor GLB loaded. If the environment fails to load there is no kelp; that is intended, since there is nothing to root on.
3. The kelp ray probe runs once on the main thread when the floor loads: ≤ 30 rays against the ~65k-triangle map at high. It was not separately timed. It is a one-off, and a BVH would make it trivial if it ever shows up in a profile.
4. Fish don't avoid terrain. Schools are homed ≥ y 4 and 8 u off the camera line, and the soft bounds keep them near home, but a school homed beside a tall rock could clip it.
5. The Hamour's patrol avoids landmarks and the camera line, but not other map geometry (rocks, buildings). `minY` 4.5 plus the 7 u landmark clearance kept it clear in every capture.
6. The dive route was being re-tuned concurrently, so the before/after screenshots are at different routes. The draw-call A/B above was taken on one route.
7. Not touched (out of scope): the roadmap entry should be ticked, and its quality-tiers "Known gaps" line updated, by whoever owns `.ptah/roadmap.md`.
