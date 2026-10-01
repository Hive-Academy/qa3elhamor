# narrators: the cast and the `<Narrator>` animator

This covers the characters and their animation, all in `libs/world/feature`. The dialogue bubble and the landmark wiring belong to other lanes and consume this API.

## Exported API (`@qa3elhamor/world-feature`)

```ts
// narrator.tsx
export const NARRATOR_DEFAULT_MAX_TURN = 1.2; // rad, about 70 degrees
export interface NarratorProps {
  readonly cast: NarratorCast;            // 'hamour' | 'sardine-president' | 'crab-clerk' | NarratorModel
  readonly position: Vec3;                // its post (feet / belly), parent space
  readonly talking: boolean;
  readonly present: boolean;              // false: swims away, then renders nothing
  readonly reducedMotion?: boolean;       // default: prefers-reduced-motion
  readonly scale?: number;                // x cast height (default 1)
  readonly restYaw?: number;              // facing is limited around this (0 = +Z)
  readonly maxTurn?: number;              // default NARRATOR_DEFAULT_MAX_TURN
  readonly enterFrom?: Vec3;              // x rendered height, parent axes (default per cast)
  readonly exitTo?: Vec3;                 // x rendered height, parent axes (default per cast)
  readonly onSettled?: () => void;        // once per arrival (at once under reduced motion)
  readonly onExited?: () => void;         // once per departure
}
export function Narrator(props: NarratorProps): JSX.Element | null;

// narrator-cast.ts
export type NarratorCastId = 'hamour' | 'sardine-president' | 'crab-clerk';
export const NARRATOR_CAST_IDS: readonly NarratorCastId[];
export interface NarratorModel {               // SpongeBob / Patrick LODs, any static mesh facing +Z
  readonly object: Object3D;                   // caller-owned, never disposed here
  readonly height?: number;                    // rendered height at scale 1; omitted = measured
  readonly motion?: Partial<NarratorMotionTuning>;
}
export type NarratorCast = NarratorCastId | NarratorModel;
export interface NarratorCastSpec { label; height; motion: NarratorMotionTuning; create(uniforms): { geometry; material } }
export const NARRATOR_CAST: Readonly<Record<NarratorCastId, NarratorCastSpec>>;
export const isNarratorCastId: (value: unknown) => value is NarratorCastId;
export function narratorHeight(cast: NarratorCast, scale?: number): number;
export function narratorMotion(cast: NarratorCast): NarratorMotionTuning;
export const NARRATOR_SPEECH_HEADROOM = 0.22;
export function narratorSpeechAnchor(cast: NarratorCast, position: Vec3, scale?: number): Vec3;
export function measureNarratorModel(object: Object3D): NarratorBounds;      // cached per object
export function measureNarratorGeometry(geometry: BufferGeometry): NarratorBounds;
export interface NarratorBounds { centreX; centreZ; minY; height }

// narrator-motion.ts (only these two are public)
export interface NarratorMotionTuning { bob; sway; talkStretch; talkBounce; facingOffset; travelYawOffset; enterSeconds; exitSeconds; enterFrom; exitTo }
export const DEFAULT_NARRATOR_MOTION: NarratorMotionTuning;
```

**Speech anchor.** `narratorSpeechAnchor` returns the point `height × 1.22` above the post, in the same space as `position`. That is the parent's space, and world space when the narrator is mounted at the scene root. The point is deliberately stable: it ignores the bob, the talk hop and the swim, so the bubble doesn't jitter. Show the bubble from `onSettled` and hide it once `present` turns false.

**Swapping the cast.** Change only the value of `cast`. A SpongeBob or Patrick LOD loaded with `useCompressedModel(url)` is passed as `{ object: model, height: 0.6 }`. It gets the same bob, facing, squash-and-stretch, swim in and swim away. Its materials are left alone, so it has no mouth or limb motion, since it isn't rigged.

## Files (all new unless marked)

`libs/world/feature/src/lib/`:

- `narrator.tsx`: the component. `Narrator` wraps `NarratorBody` and stops rendering once a departure completes. Re-entering remounts the body, which recreates and later disposes its geometry and material.
- `narrator-motion.ts` (+ spec): pure frame step `stepNarrator(state, input, tuning, pose)`, springs, facing, talk curves.
- `narrator-cast.ts` (+ spec): registry, heights, model measuring, speech anchor.
- `narrator-material.ts`: the cast material, a standard flat-shaded fogged material with the vertex patch and a vertex-colour glow.
- `narrator-shapes.ts`: build-time low-poly primitives: ellipsoid, tube, ring, disc, cartoon eye.
- `narrator-uniforms.ts`: per-narrator `time` / `talk` / `swim` uniforms.
- `sardine-president-model.ts`, `crab-clerk-model.ts`: geometry and material.
- `low-poly-builder.ts` (modified): optional per-triangle `part` id (`builder.part`, `withPart`). It emits a `part` float attribute only when some triangle uses a non-zero id, so the ambient fish, Hamour and kelp are byte-for-byte unchanged.
- `hamour-model.ts` (modified): `HamourMaterialOptions.talk?`, a uniform `uHamourTalk` that opens the jaw. It defaults to a constant 0, so the ambient Hamour is unchanged. The existing spec still passes.
- `index.ts` (modified): exports. `README.md` (new; the lib had none): Narrators section.

`.ptah/specs/narrators/preview/`: throwaway `preview.html`, `preview.tsx` and `capture.mjs` (JPEG screenshots), plus `shots/`.

## Design

**Shared language.** All three are code-built, faceted, flat-shaded and vertex-coloured. They use `MeshStandardMaterial` with fog on, render double-sided and take one draw call each. Limb motion is a bone-free vertex patch (`applyVertexMotion`) driven by the narrator's own clock, which wraps at `AMBIENT_TIME_PERIOD`. Every angular frequency is a multiple of 0.02 rad/s, so the wrap is seamless.

The sardine and the crab use `createNarratorMaterial`. Its emissive is white × `glow` (about 0.4), multiplied in the fragment shader by each face's vertex colour. Without it, the blue light rig turned the sash red, the gold medal and the pink cheeks to murk (see `shots/r2-*`). With it, every face keeps its own hue, and fog still applies on top.

**Hamour (guide), 628 triangles.** This is the ambient grouper geometry unchanged, with a presenter material. The presenter gets a stronger warm emissive (#5a3a1c × 0.75) so it holds up beside the brighter cast; the ambient fish keeps #3b2612 × 0.45. Its jaw drops on each talk beat (`uHamourTalk`). It hovers in place: low swim effort when idle, a full tail beat while travelling. Its `facingOffset` is 0.7 rad, so it presents three-quarter on, with its eye and underbite toward the visitor. Rendered height is 0.55, about 1.1 units long.

**Sardine President, 734 triangles.** A chubby silver sardine about 1.04 units long:
- Colouring: a steel-blue back, a silver-white flank and belly, and the species' row of dark lateral dots.
- Face: big forward-looking cartoon eyes (white ball, large pupil, glint) under short, slightly stern brows; pink cheeks; a small smile.
- Regalia: a tilted three-stripe sash in red, white and black, the flag's colours, with no emblem and no likeness. A domed gold medal with a ribbon hangs on the +X flank.
- Motion: the pectoral fins (parts 2 and 3) flap, wider on each beat, so it gestures as it speaks, and the tail waves.
- Facing: `facingOffset` -0.55 turns the sash-and-medal flank to the visitor.
- Rendered height 0.36, the smallest of the three.

**Crab Clerk, 1164 triangles.** A red-orange crab about 1.04 units wide, standing on y = 0:
- Body: a round shell with pale freckles, a smile and pink cheeks.
- Head: eyes on stalks behind round dark reading glasses, under a green accountant's eyeshade on a band. Part 4, the eyes, wobble together.
- Claws: oversized. The left claw's moving finger (part 2) clacks open on each beat. The right arm (part 3) holds a rubber stamp (knob, handle, block, red rubber) and lifts it on the beat, thumping it down between beats.
- Legs: three a side with pointed feet (part 1). They shuffle at idle and scuttle while it travels.
- Travel: it enters and exits walking sideways along the floor (`travelYawOffset` -π/2, with travel offsets at y 0).
- Rendered height 0.42.

**Animation** (`stepNarrator`, all in parent units scaled by the rendered height):
- **Presence** runs 0..1 at 1 / `enterSeconds` or 1 / `exitSeconds`. The offset is `side × (1 − easeOutCubic(p))`. That gives a fast start and a gentle arrival on the way in, and a slow start that accelerates on the way out. The scale grows over the first 35%, so it never pops.
- **`side`** changes only at the ends: `enterFrom` when fully away, `exitTo` when fully present. Flipping `present` mid-way therefore just reverses, with no jump (tested).
- **Heading.** While travelling it faces along the travel direction, plus `travelYawOffset`. From 72% of the way in, it turns to face the camera on an angle spring (ω 4.2, short way round). The camera heading comes from the camera's position in the parent's space, limited to `maxTurn` around `restYaw`, plus the cast's `facingOffset`.
- **Idle**: a bob (`bob × h`, 1.6 rad/s), roll sway, and half that as pitch.
- **Talk.** An envelope spring (ω 11) eases the talk in and out. `talkPulse(t)` is a raised-cosine syllable beat at 27.6 rad/s, scaled by two detuned accents. Squash-and-stretch is `y = 1 + k(2p − 1)·env` with `x = z = 1/√y`, so volume is kept. Each beat adds a hop and a small nod. The beat is also written to the `talk` uniform for the jaw, claw and fins.
- **Robustness.** `dt` is clamped to [0, 0.1]. Every input is guarded: NaN `dt`, camera, rest, limit, height, offsets or tuning, and a corrupt spring state all give a finite pose (tested). The state, pose and scratch vector are refs, so nothing is allocated per frame.
- **Reduced motion.** Presence snaps, and `onSettled` fires on the first frame. It takes no travel, bob, sway, nod or turning. One heading is chosen on arrival and then held while the camera moves. The shader clock is frozen and shader talk is 0. While talking, the only motion is a uniform scale pulse of at most +3.5% at 3.2 rad/s (tested).

## Verification

`npx nx run-many -t lint,typecheck,test -p world-feature --skipSync`: **all three targets succeed.** There are 15 test files and 127 tests. The new specs are `narrator-motion.spec.ts` (springs, angles and facing limits, talk curves, the clock wrap, the frame step, reversal, frame-rate independence, the long-frame clamp, NaN, reduced motion) and `narrator-cast.spec.ts` (300–1500 triangles, finite and deterministic, fog and flat shading, uniforms wired, part tags, the crab on y = 0, the glow patch, model measuring and caching, heights, speech anchors). The existing Hamour spec passes unchanged.

## Screenshots (`preview/shots/`, 960×600, headless Chromium on ANGLE/D3D11)

Final set:

- `final-lineup-idle.jpg`: all three, idle, front.
- `final-lineup-talking-three-quarter-anchors-1.jpg`: talking, three-quarter camera. The yellow dots are `narratorSpeechAnchor`.
- `final-lineup-idle-high.jpg`: from above (sash, eyeshade, claws, legs).
- `final-lineup-reduced-talking.jpg`: reduced motion, talking (static pose).
- `final-hamour-talking-three-quarter.jpg`, `final-sardine-president-talking.jpg`, `final-sardine-president-idle-side.jpg`, `final-crab-clerk-talking.jpg` (claw open, stamp raised), `final-crab-clerk-idle-side.jpg` (turn limited by `maxTurn`).
- `final-enter-lineup-cycle.jpg`: mid swim-in. The fish face their travel; the crab walks in sideways.
- `final-exit-lineup-cycle.jpg`: mid swim-away.

Iteration history:

- `r1-*`: the sardine read as a blue pufferfish, and its sash was hidden.
- `r2-*`: elongated and silver, but the red, gold and pink were murky under the blue rig.
- `r3-*`: the vertex-colour glow fixed that.
- `r4-*`: the Hamour presenter lift and the seated eyeshade. `r4-lineup-talking-anchors-1-reference-1.jpg` shows the ambient Hamour (top) beside the cast for style.

The preview loads through any web dev server's `/@fs`: `npx vite --config apps/web/vite.config.mts --port 4417`, then `node capture.mjs shots/x "view=lineup&mode=talking"`. The query parameters are documented in `preview.tsx`. The HTML installs the React refresh preamble by hand, because `/@fs` pages skip the plugin's index transform.

## Open issues

1. **Model narrators untested with the real LODs.** The decimated SpongeBob and Patrick assets are another lane's work in `libs/world/domain` and weren't available. `{ object, height }` is covered with a synthetic mesh. The real models may need `motion.facingOffset` if they weren't authored facing +Z.
2. **Static models squash as a whole.** There is no mouth motion for unrigged models. Squash-and-stretch and the hop carry the talk.
3. **Facing uses the camera's position, not its view direction.** A narrator mounted under a rotated parent (a landmark group) gets correct limits only if `restYaw` is given in that parent's frame. That is the natural frame for the landmark wiring.
4. **The speech anchor is in parent space.** A bubble rendered in a different space (for example a screen-space HTML overlay) should transform it with the narrator parent's `localToWorld`.
5. **Hamour presenter emissive.** It is set in the cast factory rather than through a new `createHamourMaterial` option, to keep the ambient material's API minimal. Change it there if the guide needs retuning.
6. **Preview only.** No in-app scene was checked: wiring narrators into landmarks is the next lane's job. All screenshots come from the standalone preview, with the same light rig and fog colour as the ambient viewer.
7. **Unrelated preview warnings.** `THREE.Clock` deprecation comes from R3F, and the `createRoot` warning comes from HMR re-running the preview module.

## Revision 1 (response to `cast-review-agy.md`, REVISE 7.5/10)

All changes add to the API and keep existing call sites compiling and behaving the same. The only type change is `NarratorModel.object`, which is widened.

1. **The config boundary is hardened (serious).**
   - New `resolveNarratorCast(cast: unknown): NarratorCast` and `NARRATOR_FALLBACK_CAST = 'hamour'`.
   - An unknown id, `null`, `undefined` or any other non-cast value plays the Hamour, with one `console.warn` per distinct bad value. Nothing throws.
   - `narratorHeight`, `narratorMotion`, `narratorSpeechAnchor` and `<Narrator>` all resolve the cast through it.
   - `NarratorModel.object` is now `Object3D | null | undefined`. While it is null, `<Narrator>` renders nothing (no throw). When the object arrives, the body mounts fresh and swims in from `enterFrom`, then fires `onSettled`.
   - `measureNarratorModel(null | undefined)` returns unit bounds and caches nothing.
   - Specs: unknown-id fallback, warn-once and per-id warnings, null/undefined cast, null/undefined object for height and anchor, and a component spec (`narrator.spec.tsx`, frame loop stubbed) covering null object → nothing → mounts on arrival, unknown id → fallback mesh plus one warning, and starting away → nothing.
2. **`NarratorBounds` gains `width` (x) and `depth` (z)**, for framing a T-posed model. Specs cover a 3 × 1.5 × 0.4 box and the crab being wider than it is tall.
3. **Placing narrators inside `<WorldSpace>`**: `narratorScaleIn(worldScale = WORLD_SCALE)` returns 1 / worldScale, with non-finite or non-positive input falling back to the default, and `NARRATOR_SCENE_WORLD_SCALE` is 0.05. The README has a `useWorldScale()` example that also shows the speech anchor in the same space. A spec checks that the world-unit height is unchanged inside a scale-20 group.
4. **Sharing a model**: JSDoc on `NarratorModel` and `NarratorProps.cast`, plus a README note, say the object is mounted directly and must not go to two narrators at once. A new `clone?: boolean` mounts `object.clone(true)`, which has its own nodes and shared geometry and materials; the cached object is never parented, mutated or disposed, and the clone is measured through its source's cached bounds. A spec checks the clone is made and the cached object stays unparented.

Not changed, by design: `scale={0}` still falls back to 1, because a narrator is hidden with `present={false}`.

Verification: `npx nx run-many -t lint,typecheck,test -p world-feature --skipSync --skip-nx-cache` → lint, typecheck and test all succeed: 16 test files, 137 tests.
