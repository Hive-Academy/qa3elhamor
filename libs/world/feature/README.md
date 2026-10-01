# world-feature

The underwater world for the dive: ocean, light rig, particles, seabed, ambient life, quality tiers and the narrator cast. Everything is React Three Fiber, fog-compatible, and disposed on unmount.

## Narrators

A narrator is a character that swims in to a landmark, turns to the visitor and talks. It renders the character only. The speech bubble and the landmark wiring are separate.

```tsx
import { Narrator, narratorSpeechAnchor } from '@qa3elhamor/world-feature';

<Narrator
  cast="crab-clerk"            // or 'hamour' | 'sardine-president' | { object, height?, motion? }
  position={[4, 0, -2]}        // its post (feet / belly), parent space
  talking={lineIsTyping}       // squash-and-stretch, hop, mouth / claws
  present={landmarkIsOpen}     // false: swims away, then renders nothing
  scale={2}                    // x the cast's rendered height
  onSettled={startTyping}      // arrived (immediately under reduced motion)
  onExited={unmount}           // fully gone
/>;

const bubbleAt = narratorSpeechAnchor('crab-clerk', [4, 0, -2], 2); // just above the head, same space
```

- **Cast** (`NARRATOR_CAST`): original, procedural, flat-shaded and low-poly, with no asset files. The **hamour** guide reuses the ambient Hamour's geometry, and its jaw opens on each beat. The **sardine-president** is a silver sardine with a red/white/black sash and a gold medal, and its fins gesture. The **crab-clerk** wears reading glasses and an eyeshade, clacks its claw and thumps a rubber stamp. Each is 600 to 1,200 triangles and one draw call.
- **Model narrators**: pass `{ object, height?, motion?, clone? }` for a loaded static mesh, such as a decimated SpongeBob or Patrick LOD. It should face +Z. It is measured once to find its base pivot, then animated the same way as the cast. The caller owns the object; it is never disposed here.
  - While `object` is still `null`/`undefined` (loading), nothing renders. Once it arrives, the narrator swims in.
  - The object is mounted directly, and a three object has only one parent. **Never give the same loaded object to two narrators at once**: the second steals it and the first goes blank. Pass `clone: true` instead. That mounts `object.clone(true)`, which has its own nodes but shares geometry and materials, so nothing is mutated or disposed. Or pass your own clone.
  - `measureNarratorModel(object)` returns `{ centreX, centreZ, minY, height, width, depth }`; frame wide, T-posed models on `width`.
- **Config boundary**: an unknown cast id (a typo in content) plays `NARRATOR_FALLBACK_CAST` (`'hamour'`), with one `console.warn` per distinct id. It never throws.
- **Motion** (`narrator-motion.ts`, pure and tested): critically damped springs, solved exactly, so the motion doesn't depend on frame rate. The narrator faces the camera within `maxTurn` of `restYaw`. Its swim in from `enterFrom` and away to `exitTo` is measured in multiples of its height, and crabs walk sideways. Its speech rhythm is about 4.4 syllables a second. Nothing is allocated per frame. Under reduced motion it holds a static pose with one heading, and its only movement is a gentle scale pulse while it talks.
- **Sizes**: `height` is the rendered height at `scale` 1, in parent units: Hamour 0.55, crab 0.42, sardine 0.36. The heights are tuned for world units, and at the scene root they sit beside a 2.6-unit pineapple. `<WorldSpace>` multiplies everything by the world scale (20), so a narrator inside it needs `narratorScaleIn(worldScale)`, which is 1 / worldScale (`NARRATOR_SCENE_WORLD_SCALE` = 0.05 at the default):

```tsx
import { Narrator, WorldSpace, narratorScaleIn, narratorSpeechAnchor, useWorldScale } from '@qa3elhamor/world-feature';

function PineappleNarrator({ post, talking, present }: { post: Vec3; talking: boolean; present: boolean }) {
  const scale = narratorScaleIn(useWorldScale()) * 1.5; // 1.5x its world-unit size
  const bubbleAt = narratorSpeechAnchor('sardine-president', post, scale); // scene-world units, like post
  return <Narrator cast="sardine-president" position={post} scale={scale} talking={talking} present={present} />;
}
// rendered as <WorldSpace><PineappleNarrator post={placements.pineapple.offset} ... /></WorldSpace>
```
