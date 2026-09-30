import type { TelemetryEvent, TelemetryEventName } from './events.js';

/**
 * - `once`: admitted once per visit. `by: 'name'` allows one event of that name at all;
 *   `by: 'props'` allows one per distinct property set (one per depth milestone).
 * - `window`: an identical event (same name and props) within `ms` of the last admitted one
 *   is a double fire (pointer + click, React strict-mode effects) and is dropped.
 */
export type DedupePolicy =
  | { readonly kind: 'once'; readonly by: 'name' | 'props' }
  | { readonly kind: 'window'; readonly ms: number };

export const REPEAT_WINDOW_MS = 1000;

export const DEDUPE_RULES: Readonly<Record<TelemetryEventName, DedupePolicy>> = {
  dive_depth_reached: { kind: 'once', by: 'props' },
  dive_drop_off: { kind: 'once', by: 'name' },
  // The tier the page settled on at start-up; later adaptive changes are not "resolution".
  quality_tier_resolved: { kind: 'once', by: 'name' },
  landmark_clicked: { kind: 'window', ms: REPEAT_WINDOW_MS },
  overlay_opened: { kind: 'window', ms: REPEAT_WINDOW_MS },
};

/** A stable key for an event's name and props, independent of property order. */
export function eventKey(event: TelemetryEvent): string {
  const props = event.props as Readonly<Record<string, string | number>>;
  const parts = Object.keys(props)
    .sort()
    // JSON keeps the value's type: 25 and '25' must not collide.
    .map((key) => `${key}=${JSON.stringify(props[key])}`);
  return `${event.name}|${parts.join('&')}`;
}

/** Applies `DEDUPE_RULES` for one visit. `now` is injectable for tests. */
export class EventDeduper {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly rules: Readonly<Record<TelemetryEventName, DedupePolicy>> = DEDUPE_RULES
  ) {}

  /** True when the event should be sent; records it as sent. */
  admit(event: TelemetryEvent): boolean {
    const rule = this.rules[event.name];
    const time = this.now();
    if (rule.kind === 'once') {
      const key = rule.by === 'name' ? event.name : eventKey(event);
      if (this.seen.has(key)) return false;
      this.seen.set(key, time);
      return true;
    }
    const key = eventKey(event);
    const last = this.seen.get(key);
    if (last !== undefined && time - last < rule.ms) return false;
    this.seen.set(key, time);
    return true;
  }

  /** Forgets every admitted event of this name, so the next one is admitted again. */
  forget(name: TelemetryEventName): void {
    for (const key of [...this.seen.keys()]) {
      if (key === name || key.startsWith(`${name}|`)) this.seen.delete(key);
    }
  }
}
