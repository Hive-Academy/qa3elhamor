/** A point or extent in scene-world units (the units the landmark GLBs are authored in). */
export type Vec3 = readonly [number, number, number];

/**
 * Text shown to visitors. A plain string, or one string per locale with English required.
 * Structurally compatible with the content model's localised strings, so `apps/web` can pass
 * content straight through without this library importing it.
 */
export type LocalizedText =
  string | { readonly en: string; readonly ar?: string };

/**
 * What the pointer has to hit to reach a landmark. Sizes are in the model's own units (scene
 * world, before the landmark's `scale`); the target rotates and scales with the model.
 *
 * - `bounds`: the model's bounding box, grown by `padding` on every side. The default.
 * - `box`: an explicit box, for a model whose bounds are misleading (a long antenna, a flag).
 * - `sphere`: an explicit sphere, forgiving for small or round landmarks.
 */
export type HitTargetSpec =
  | { readonly kind: 'bounds'; readonly padding?: number }
  | { readonly kind: 'box'; readonly size: Vec3; readonly center?: Vec3 }
  | {
      readonly kind: 'sphere';
      readonly radius: number;
      readonly center?: Vec3;
    };

export const DEFAULT_HIT_TARGET: HitTargetSpec = { kind: 'bounds', padding: 0 };

/**
 * What opening a landmark shows, besides moving the camera to it:
 *
 * - `dialog`: its `overlay` component in the modal paper dialog (bio, contact form).
 * - `in-world`: no dialog; its `scene` component takes over in 3D (a menu, a notice board, a
 *   card floating out of a door) and receives the focused state, with a non-modal "back to
 *   the dive" stage around it. Falls back to `overlay` where in-world is unavailable
 *   (`effectivePresentation`).
 * - `none`: the camera visits; the same bar returns to the dive.
 */
export type LandmarkPresentation = 'dialog' | 'in-world' | 'none';

export const LANDMARK_PRESENTATIONS: readonly LandmarkPresentation[] = [
  'dialog',
  'in-world',
  'none',
];

/** A definition's presentation, with the default applied. */
export const presentationOf = (
  definition: Pick<LandmarkDefinition, 'presentation'>,
): LandmarkPresentation => definition.presentation ?? 'dialog';

/**
 * What opening the landmark actually shows on this page. `inWorld` is false when the page
 * cannot or should not run in-world presentations (reduced motion, a low quality tier, no
 * WebGL): an `in-world` landmark then falls back to its `overlay` in the dialog, or, with no
 * overlay, to a camera-only visit. Other presentations are unaffected.
 */
export function effectivePresentation(
  definition: Pick<LandmarkDefinition, 'presentation' | 'overlay'>,
  inWorld: boolean,
): LandmarkPresentation {
  const declared = presentationOf(definition);
  if (declared !== 'in-world' || inWorld) return declared;
  return definition.overlay ? 'dialog' : 'none';
}

/**
 * Everything the site needs to know to show one landmark. Adding a landmark is adding one of
 * these plus an overlay component; nothing in the scene graph changes.
 */
export interface LandmarkDefinition {
  /** Stable slug (`a-z`, `0-9`, `-`), used in telemetry and URLs. */
  readonly id: string;
  /**
   * The model reference handed to the injected model loader: an asset id or a URL, whatever
   * the composition root's loader understands. The kernel never interprets it.
   */
  readonly model: string;
  /** Where the model's origin sits, in scene-world units (see `WorldSpace`). */
  readonly position: Vec3;
  /** Euler rotation in radians (XYZ). */
  readonly rotation?: Vec3;
  /** Uniform or per-axis scale. */
  readonly scale?: number | Vec3;
  /** Defaults to `DEFAULT_HIT_TARGET` (the model's bounding box). */
  readonly hitTarget?: HitTargetSpec;
  /**
   * The camera waypoint to swim to when the landmark is opened. Framing (view offset, look-at
   * height) belongs to the waypoint, so it is set where the dive defines its stops.
   */
  readonly waypoint: string;
  /** How an opened landmark presents its content. Defaults to `'dialog'`. */
  readonly presentation?: LandmarkPresentation;
  /**
   * Key of the DOM overlay component. Required for `'dialog'`. On an `'in-world'` landmark it
   * is the fallback: the dialog shown instead of the scene when the page runs without
   * in-world presentations (reduced motion, low tier, no WebGL). Ignored for `'none'`.
   */
  readonly overlay?: string;
  /**
   * Key of an in-scene component rendered in the landmark's own frame (its position,
   * rotation and scale), for 3D content: a menu that zooms on hover, a notice board.
   * Required for `'in-world'`; optional decoration for the others.
   */
  readonly scene?: string;
  /** Short name on the beacon and in the landmark list. */
  readonly label: LocalizedText;
  /** One line under the label: what opening it gives the visitor ("About me"). */
  readonly caption?: LocalizedText;
}

/** Picks the text for `locale`, falling back to English. */
export function resolveText(text: LocalizedText, locale = 'en'): string {
  if (typeof text === 'string') return text;
  return (locale === 'ar' ? text.ar : undefined) ?? text.en;
}

/** Writing direction of a locale, for `dir` attributes. */
export const textDirection = (locale: string): 'ltr' | 'rtl' =>
  locale === 'ar' ? 'rtl' : 'ltr';
