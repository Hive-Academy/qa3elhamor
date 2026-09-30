import {
  LANDMARK_PRESENTATIONS,
  presentationOf,
  type HitTargetSpec,
  type LandmarkDefinition,
  type LocalizedText,
  type Vec3,
} from './landmark-definition.js';

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** One thing wrong with a landmark definition, precise enough to fix without a debugger. */
export interface LandmarkIssue {
  /** The offending definition's id, or its array index when the id itself is unusable. */
  readonly landmark: string;
  readonly field: string;
  readonly message: string;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const isFiniteVec3 = (value: unknown): value is Vec3 =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every((c) => typeof c === 'number' && Number.isFinite(c));

const isPositiveVec3 = (value: unknown): boolean =>
  isFiniteVec3(value) && value.every((c) => c > 0);

const hasText = (text: LocalizedText | undefined): boolean =>
  typeof text === 'string'
    ? text.trim() !== ''
    : typeof text?.en === 'string' && text.en.trim() !== '';

function hitTargetIssues(spec: HitTargetSpec): string[] {
  switch (spec.kind) {
    case 'bounds':
      return spec.padding === undefined ||
        (Number.isFinite(spec.padding) && spec.padding >= 0)
        ? []
        : ['padding must be a finite number >= 0'];
    case 'box':
      return [
        ...(isPositiveVec3(spec.size)
          ? []
          : ['size must be three positive finite numbers']),
        ...(spec.center === undefined || isFiniteVec3(spec.center)
          ? []
          : ['center must be three finite numbers']),
      ];
    case 'sphere':
      return [
        ...(Number.isFinite(spec.radius) && spec.radius > 0
          ? []
          : ['radius must be a positive finite number']),
        ...(spec.center === undefined || isFiniteVec3(spec.center)
          ? []
          : ['center must be three finite numbers']),
      ];
    default:
      return [`unknown kind "${(spec as { kind: unknown }).kind}"`];
  }
}

/** Checks one definition on its own. `ref` names it in issues (its id, or its index). */
export function landmarkIssues(
  definition: LandmarkDefinition,
  ref: string = definition.id,
): LandmarkIssue[] {
  const issues: LandmarkIssue[] = [];
  const add = (field: string, message: string) =>
    issues.push({ landmark: ref, field, message });

  if (typeof definition.id !== 'string' || !SLUG.test(definition.id)) {
    add(
      'id',
      `"${String(definition.id)}" is not a slug (lowercase letters, digits and single dashes)`,
    );
  }
  if (typeof definition.model !== 'string' || definition.model.trim() === '')
    add('model', 'is required');
  if (!isFiniteVec3(definition.position))
    add('position', 'must be three finite numbers');
  if (definition.rotation !== undefined && !isFiniteVec3(definition.rotation)) {
    add('rotation', 'must be three finite numbers (radians)');
  }
  if (definition.scale !== undefined) {
    const ok =
      typeof definition.scale === 'number'
        ? Number.isFinite(definition.scale) && definition.scale > 0
        : isPositiveVec3(definition.scale);
    if (!ok)
      add('scale', 'must be a positive number or three positive numbers');
  }
  if (definition.hitTarget !== undefined) {
    for (const message of hitTargetIssues(definition.hitTarget))
      add('hitTarget', message);
  }
  if (
    typeof definition.waypoint !== 'string' ||
    definition.waypoint.trim() === ''
  )
    add('waypoint', 'is required');
  const presentation = presentationOf(definition);
  const blank = (value: unknown) =>
    typeof value !== 'string' || value.trim() === '';
  if (!LANDMARK_PRESENTATIONS.includes(presentation)) {
    add('presentation', `must be one of ${LANDMARK_PRESENTATIONS.join(', ')}`);
  }
  if (presentation === 'dialog' && blank(definition.overlay)) {
    add('overlay', 'is required for a dialog landmark');
  } else if (definition.overlay !== undefined && blank(definition.overlay)) {
    add('overlay', 'must be a non-empty key when given');
  }
  if (presentation === 'in-world' && blank(definition.scene)) {
    add('scene', 'is required for an in-world landmark');
  } else if (definition.scene !== undefined && blank(definition.scene)) {
    add('scene', 'must be a non-empty key when given');
  }
  if (!hasText(definition.label)) add('label', 'needs non-empty English text');
  if (definition.caption !== undefined && !hasText(definition.caption))
    add('caption', 'needs non-empty English text');
  return issues;
}

/** Validates one definition. */
export function validateLandmark(
  definition: LandmarkDefinition,
): Result<LandmarkDefinition, LandmarkIssue[]> {
  const issues = landmarkIssues(definition);
  return issues.length === 0
    ? { ok: true, value: definition }
    : { ok: false, error: issues };
}

/** The validated, ordered set of landmarks on the page. */
export interface LandmarkRegistry {
  /** In declaration order: the order of the landmark list and of keyboard navigation. */
  readonly all: readonly LandmarkDefinition[];
  get(id: string): LandmarkDefinition | undefined;
  has(id: string): boolean;
}

export interface LandmarkRegistryOptions {
  /** When given, every `waypoint` must be one of these (the dive's waypoint ids). */
  readonly waypointIds?: Iterable<string>;
  /** When given, every `overlay` must be one of these (the registered overlay keys). */
  readonly overlayKeys?: Iterable<string>;
  /** When given, every `scene` must be one of these (the registered in-scene component keys). */
  readonly sceneKeys?: Iterable<string>;
}

/**
 * Builds the registry from data, checking each definition, id uniqueness and, when the
 * composition root supplies them, that waypoints and overlays exist. All issues are
 * reported together rather than the first one.
 */
export function createLandmarkRegistry(
  definitions: readonly LandmarkDefinition[],
  options: LandmarkRegistryOptions = {},
): Result<LandmarkRegistry, LandmarkIssue[]> {
  const issues: LandmarkIssue[] = [];
  const waypoints = options.waypointIds ? new Set(options.waypointIds) : null;
  const overlays = options.overlayKeys ? new Set(options.overlayKeys) : null;
  const scenes = options.sceneKeys ? new Set(options.sceneKeys) : null;
  const byId = new Map<string, LandmarkDefinition>();

  definitions.forEach((definition, index) => {
    const ref =
      typeof definition.id === 'string' && definition.id !== ''
        ? definition.id
        : `#${index}`;
    issues.push(...landmarkIssues(definition, ref));
    if (byId.has(definition.id)) {
      const first = definitions.findIndex((d) => d.id === definition.id);
      issues.push({
        landmark: ref,
        field: 'id',
        message: `duplicates landmark #${first}`,
      });
    } else {
      byId.set(definition.id, definition);
    }
    if (waypoints && !waypoints.has(definition.waypoint)) {
      issues.push({
        landmark: ref,
        field: 'waypoint',
        message: `"${definition.waypoint}" is not a dive waypoint`,
      });
    }
    if (
      overlays &&
      definition.overlay !== undefined &&
      !overlays.has(definition.overlay)
    ) {
      issues.push({
        landmark: ref,
        field: 'overlay',
        message: `no overlay is registered under "${definition.overlay}"`,
      });
    }
    if (
      scenes &&
      definition.scene !== undefined &&
      !scenes.has(definition.scene)
    ) {
      issues.push({
        landmark: ref,
        field: 'scene',
        message: `no scene component is registered under "${definition.scene}"`,
      });
    }
  });

  if (issues.length > 0) return { ok: false, error: issues };
  const all = Object.freeze([...definitions]);
  return {
    ok: true,
    value: { all, get: (id) => byId.get(id), has: (id) => byId.has(id) },
  };
}

/** Formats issues one per line, for an error message or a build log. */
export const formatLandmarkIssues = (
  issues: readonly LandmarkIssue[],
): string =>
  issues.map((i) => `- ${i.landmark}.${i.field}: ${i.message}`).join('\n');
