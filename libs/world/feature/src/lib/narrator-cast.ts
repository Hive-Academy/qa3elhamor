import { Box3, Matrix4, type BufferGeometry, type Material, type Object3D } from 'three';
import { createCrabClerkGeometry, createCrabClerkMaterial } from './crab-clerk-model.js';
import { createHamourGeometry, createHamourMaterial } from './hamour-model.js';
import { DEFAULT_NARRATOR_MOTION, type NarratorMotionTuning } from './narrator-motion.js';
import type { NarratorUniforms } from './narrator-uniforms.js';
import { createSardinePresidentGeometry, createSardinePresidentMaterial } from './sardine-president-model.js';
import { WORLD_SCALE, type Vec3 } from './world-space.js';

/** The built-in, original cast (procedural, no asset files). */
export type NarratorCastId = 'hamour' | 'sardine-president' | 'crab-clerk';

export const NARRATOR_CAST_IDS: readonly NarratorCastId[] = ['hamour', 'sardine-president', 'crab-clerk'];

/**
 * A narrator from a loaded, static (unrigged) model, e.g. a decimated SpongeBob or Patrick LOD.
 * The model should face +Z. The caller owns it (loads, caches and disposes it); `<Narrator>`
 * only parents and animates it.
 *
 * The object is mounted directly (a three object has one parent), so the same loaded object
 * must not be given to two narrators at once: the second would steal it from the first. Pass
 * `clone: true` (or your own `object.clone()`) for every narrator after the first.
 */
export interface NarratorModel {
  /** The loaded model; null / undefined while it loads (the narrator waits, then swims in). */
  readonly object: Object3D | null | undefined;
  /** Rendered height at scale 1, parent units. Omitted: the model's own measured height. */
  readonly height?: number;
  /** Overrides for this model's motion (e.g. `facingOffset` if it was authored facing +X). */
  readonly motion?: Partial<NarratorMotionTuning>;
  /**
   * Mount a shallow clone (`object.clone(true)`: own nodes, shared geometry and materials) instead
   * of the object itself, so one cached model can serve several narrators. The loader's cached
   * object is never mutated, and the clone shares, so it disposes nothing.
   */
  readonly clone?: boolean;
}

export type NarratorCast = NarratorCastId | NarratorModel;

export interface NarratorCastMesh {
  readonly geometry: BufferGeometry;
  readonly material: Material;
}

export interface NarratorCastSpec {
  readonly label: string;
  /** Rendered height at scale 1, parent units: the cast is in proportion to one another. */
  readonly height: number;
  readonly motion: NarratorMotionTuning;
  /** A fresh geometry and material (the caller disposes both). */
  create(uniforms: NarratorUniforms): NarratorCastMesh;
}

export const NARRATOR_CAST: Readonly<Record<NarratorCastId, NarratorCastSpec>> = {
  hamour: {
    label: 'The Hamour (guide)',
    height: 0.55,
    motion: {
      ...DEFAULT_NARRATOR_MOTION,
      bob: 0.05,
      sway: 0.035,
      talkStretch: 0.07,
      talkBounce: 0.04,
      // A fish reads best three-quarter on: its eye and big jaw toward the visitor.
      facingOffset: 0.7,
      enterSeconds: 1.8,
      exitSeconds: 1.3,
    },
    create: ({ time, swim, talk }) => {
      const material = createHamourMaterial({ time, swim, talk });
      // The presenter is lit for the stage: a stronger warm lift than the ambient Hamour, so it
      // reads beside the brighter cast at conversation distance.
      material.emissive.set('#5a3a1c');
      material.emissiveIntensity = 0.75;
      return { geometry: createHamourGeometry(), material };
    },
  },
  'sardine-president': {
    label: 'The Sardine President',
    height: 0.36,
    motion: {
      ...DEFAULT_NARRATOR_MOTION,
      bob: 0.06,
      sway: 0.06,
      talkStretch: 0.1,
      talkBounce: 0.06,
      // Turned a little so the +X flank (sash and medal) faces the visitor.
      facingOffset: -0.55,
      enterSeconds: 1.4,
      exitSeconds: 1,
    },
    create: (uniforms) => ({
      geometry: createSardinePresidentGeometry(),
      material: createSardinePresidentMaterial(uniforms),
    }),
  },
  'crab-clerk': {
    label: 'The Crab Clerk',
    height: 0.42,
    motion: {
      ...DEFAULT_NARRATOR_MOTION,
      bob: 0.015,
      sway: 0.03,
      talkStretch: 0.1,
      talkBounce: 0.05,
      facingOffset: 0,
      // Crabs walk sideways, along the floor.
      travelYawOffset: -Math.PI / 2,
      enterSeconds: 1.8,
      exitSeconds: 1.4,
      enterFrom: [-3.2, 0, -0.4],
      exitTo: [3.2, 0, -0.4],
    },
    create: (uniforms) => ({
      geometry: createCrabClerkGeometry(),
      material: createCrabClerkMaterial(uniforms),
    }),
  },
};

export const isNarratorCastId = (value: unknown): value is NarratorCastId =>
  typeof value === 'string' && (NARRATOR_CAST_IDS as readonly string[]).includes(value);

/** What an unknown cast id (a config typo, a cast this build does not have) falls back to. */
export const NARRATOR_FALLBACK_CAST: NarratorCastId = 'hamour';

const warnedCasts = new Set<string>();

/**
 * The cast as `<Narrator>` will play it. The cast usually comes from content config, so this is
 * the boundary: an unknown id (or anything that is neither an id nor a `{ object }` model) falls
 * back to `NARRATOR_FALLBACK_CAST`, with one console warning per distinct bad value.
 */
export function resolveNarratorCast(cast: unknown): NarratorCast {
  if (isNarratorCastId(cast)) return cast;
  if (typeof cast === 'object' && cast !== null && 'object' in cast) return cast as NarratorModel;
  const key = typeof cast === 'string' ? cast : String(cast);
  if (!warnedCasts.has(key)) {
    warnedCasts.add(key);
    console.warn(
      `Narrator: unknown cast ${JSON.stringify(key)} (expected ${NARRATOR_CAST_IDS.join(' | ')} or { object }); playing "${NARRATOR_FALLBACK_CAST}".`
    );
  }
  return NARRATOR_FALLBACK_CAST;
}

/** Bounds of a model or geometry in its own space: the base centre, height, width (x) and depth (z). */
export interface NarratorBounds {
  readonly centreX: number;
  readonly centreZ: number;
  readonly minY: number;
  readonly height: number;
  /** Extent along x (a T-posed model's arm span). */
  readonly width: number;
  /** Extent along z. */
  readonly depth: number;
}

const modelBounds = new WeakMap<Object3D, NarratorBounds>();

const UNIT_BOUNDS: NarratorBounds = { centreX: 0, centreZ: 0, minY: 0, height: 1, width: 1, depth: 1 };

/**
 * A model's bounds in its own local space (its parent's transform removed), measured once per
 * object and cached. Degenerate or empty models, and a model that has not loaded yet (null /
 * undefined, not cached), measure as a unit cube standing on the origin.
 */
export function measureNarratorModel(object: Object3D | null | undefined): NarratorBounds {
  if (!object || typeof object !== 'object') return UNIT_BOUNDS;
  const cached = modelBounds.get(object);
  if (cached) return cached;
  const box = new Box3().setFromObject(object);
  if (object.parent) box.applyMatrix4(new Matrix4().copy(object.parent.matrixWorld).invert());
  const bounds = boundsFromBox(box);
  modelBounds.set(object, bounds);
  return bounds;
}

/** Bounds of a geometry's positions. */
export function measureNarratorGeometry(geometry: BufferGeometry): NarratorBounds {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  return boundsFromBox(geometry.boundingBox ?? new Box3());
}

function boundsFromBox(box: Box3): NarratorBounds {
  const height = box.max.y - box.min.y;
  if (box.isEmpty() || !Number.isFinite(height) || height <= 1e-6) return UNIT_BOUNDS;
  const extent = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);
  return {
    centreX: (box.min.x + box.max.x) / 2,
    centreZ: (box.min.z + box.max.z) / 2,
    minY: box.min.y,
    height,
    width: extent(box.max.x - box.min.x),
    depth: extent(box.max.z - box.min.z),
  };
}

const positiveOr = (x: number | undefined, fallback: number): number =>
  typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : fallback;

/** Rendered height of a narrator at `scale` (parent units). Unknown ids measure as the fallback cast. */
export function narratorHeight(cast: NarratorCast, scale = 1): number {
  const resolved = resolveNarratorCast(cast);
  const base =
    typeof resolved === 'string'
      ? NARRATOR_CAST[resolved].height
      : positiveOr(resolved.height, measureNarratorModel(resolved.object).height);
  return base * positiveOr(scale, 1);
}

/** The motion tuning a narrator animates with. Unknown ids get the fallback cast's. */
export function narratorMotion(cast: NarratorCast): NarratorMotionTuning {
  const resolved = resolveNarratorCast(cast);
  return typeof resolved === 'string'
    ? NARRATOR_CAST[resolved].motion
    : { ...DEFAULT_NARRATOR_MOTION, ...resolved.motion };
}

/**
 * The `scale` that keeps a narrator its intended size inside a `<WorldSpace>` (or any group
 * scaled by `worldScale`): cast heights are tuned for world units, and `<WorldSpace>` multiplies
 * by the world scale (20 by default), so a narrator placed there needs 1 / worldScale.
 * Use with `useWorldScale()`: `scale={narratorScaleIn(useWorldScale()) * 1.5}`.
 */
export function narratorScaleIn(worldScale: number = WORLD_SCALE): number {
  return 1 / positiveOr(worldScale, WORLD_SCALE);
}

/** `narratorScaleIn()` at the default `WORLD_SCALE` (0.05). */
export const NARRATOR_SCENE_WORLD_SCALE = 1 / WORLD_SCALE;

/** Clearance above the head, x height: covers the idle bob, the talk hop and the stretch. */
export const NARRATOR_SPEECH_HEADROOM = 0.22;

/**
 * Where a speech bubble should sit: just above the narrator's head at its post, in the same
 * space as `position` (its parent's space; world space when the narrator is mounted at the
 * scene root). Stable: it does not follow the bob or the talk hop, so a bubble does not jitter.
 */
export function narratorSpeechAnchor(cast: NarratorCast, position: Vec3, scale = 1): Vec3 {
  const height = narratorHeight(cast, scale);
  const at = (v: number): number => (Number.isFinite(v) ? v : 0);
  return [at(position[0]), at(position[1]) + height * (1 + NARRATOR_SPEECH_HEADROOM), at(position[2])];
}
