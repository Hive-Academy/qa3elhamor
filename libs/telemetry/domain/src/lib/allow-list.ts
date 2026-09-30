import {
  DEPTH_BUCKETS,
  DEPTH_MILESTONES,
  TELEMETRY_QUALITY_TIERS,
  type TelemetryEvent,
  type TelemetryEventName,
  type TelemetryPropValue,
} from './events.js';

/**
 * Ids are content slugs (`kebab-case` or `snake_case`, lowercase ASCII, at most 64 chars).
 * Anything else — spaces, capitals, `@`, `/`, `?`, digits-only strings longer than the cap —
 * is rejected, which keeps free text, emails and URLs out of the provider by construction.
 */
const SLUG_PATTERN = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
export const MAX_SLUG_LENGTH = 64;

type PropRule =
  | { readonly kind: 'slug' }
  | { readonly kind: 'enum'; readonly values: readonly TelemetryPropValue[] };

const slug: PropRule = { kind: 'slug' };
const oneOf = (values: readonly TelemetryPropValue[]): PropRule => ({ kind: 'enum', values });

/** Per event, the exact set of required properties and the rule each value must pass. */
export const EVENT_ALLOW_LIST: Readonly<
  Record<TelemetryEventName, Readonly<Record<string, PropRule>>>
> = {
  dive_depth_reached: { milestone: oneOf(DEPTH_MILESTONES) },
  landmark_clicked: { landmarkId: slug },
  overlay_opened: { overlayKey: slug },
  dive_drop_off: { maxDepthBucket: oneOf(DEPTH_BUCKETS), lastWaypointId: slug },
  quality_tier_resolved: { tier: oneOf(TELEMETRY_QUALITY_TIERS) },
};

export function isTelemetrySlug(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(value)
  );
}

function passes(rule: PropRule, value: unknown): boolean {
  if (rule.kind === 'slug') return isTelemetrySlug(value);
  return rule.values.some((allowed) => allowed === value);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOwn = (record: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(record, key);

/**
 * Returns a fresh, allow-listed copy of `input`, or `null` when the event name is unknown,
 * a required property is missing, an extra property is present, or a value fails its rule.
 * Callers drop `null` silently: telemetry must never break the page.
 */
export function sanitizeEvent(input: unknown): TelemetryEvent | null {
  if (!isRecord(input) || typeof input['name'] !== 'string') return null;
  const name = input['name'];
  if (!hasOwn(EVENT_ALLOW_LIST, name)) return null;
  const rules = EVENT_ALLOW_LIST[name as TelemetryEventName];

  const props = input['props'];
  if (!isRecord(props)) return null;
  const keys = Object.keys(props);
  const ruleKeys = Object.keys(rules);
  if (keys.length !== ruleKeys.length) return null;

  const clean: Record<string, TelemetryPropValue> = {};
  for (const key of ruleKeys) {
    if (!hasOwn(props, key)) return null;
    const value = props[key];
    const rule = rules[key];
    if (rule === undefined || !passes(rule, value)) return null;
    clean[key] = value as TelemetryPropValue;
  }
  // The rules above establish exactly the shape of one union member for `name`.
  return { name, props: clean } as unknown as TelemetryEvent;
}
