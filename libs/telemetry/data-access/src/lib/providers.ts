import type { TelemetryEvent } from '@qa3elhamor/telemetry-domain';
import type { PlausibleConfig, UmamiConfig } from './analytics-config.js';
import {
  pageUrl,
  sendUnloadSafe,
  type AnalyticsRuntime,
  type ScriptProvider,
} from './script-analytics.js';

/** `window.plausible(name, { props })` from https://plausible.io/docs/custom-event-goals */
export type PlausibleGlobal = (
  name: string,
  options?: { props?: Readonly<Record<string, string | number>> }
) => void;

/** `window.umami.track(name, data)` from https://umami.is/docs/tracker-functions */
export interface UmamiGlobal {
  track(name: string, data?: Readonly<Record<string, string | number>>): unknown;
}

type WithGlobals = Window & { plausible?: unknown; umami?: unknown };

const props = (event: TelemetryEvent): Readonly<Record<string, string | number>> =>
  event.props as Readonly<Record<string, string | number>>;

/**
 * Plausible. The standard script is cookieless and has no cookie mode to enable. The exit
 * path always uses the Events API via `sendBeacon` (text/plain, as Plausible's own script
 * does), which is the most reliable transport during `pagehide`.
 */
export function plausibleProvider(config: PlausibleConfig): ScriptProvider {
  return {
    name: 'plausible',
    scriptSrc: config.scriptSrc,
    scriptAttributes: { 'data-domain': config.domain },
    exitViaGlobal: false,
    sendViaGlobal(runtime, event) {
      const global = (runtime.window as WithGlobals).plausible;
      if (typeof global !== 'function') return false;
      (global as PlausibleGlobal)(event.name, { props: props(event) });
      return true;
    },
    sendDirect(runtime, event) {
      sendUnloadSafe(
        runtime,
        config.eventEndpoint,
        {
          name: event.name,
          url: pageUrl(runtime),
          domain: config.domain,
          referrer: null,
          props: props(event),
        },
        'text/plain'
      );
    },
  };
}

/**
 * Umami. The tracker is cookieless by design. `data-do-not-track` makes the script itself
 * honour DNT too, as defence in depth for the automatic pageview. The exit path prefers the
 * loaded `umami.track`, which sends with `fetch(..., { keepalive: true })`; without the
 * script it posts to `/api/send` with the same transport.
 */
export function umamiProvider(config: UmamiConfig): ScriptProvider {
  return {
    name: 'umami',
    scriptSrc: config.scriptSrc,
    scriptAttributes: { 'data-website-id': config.websiteId, 'data-do-not-track': 'true' },
    exitViaGlobal: true,
    sendViaGlobal(runtime, event) {
      const global = (runtime.window as WithGlobals).umami;
      if (typeof global !== 'object' || global === null) return false;
      const track = (global as Partial<UmamiGlobal>).track;
      if (typeof track !== 'function') return false;
      track.call(global, event.name, props(event));
      return true;
    },
    sendDirect(runtime: AnalyticsRuntime, event) {
      const { location, screen } = runtime.window;
      sendUnloadSafe(
        runtime,
        config.eventEndpoint,
        {
          type: 'event',
          payload: {
            website: config.websiteId,
            hostname: location.hostname,
            url: location.pathname,
            name: event.name,
            data: props(event),
            language: runtime.navigator.language,
            screen: `${screen.width}x${screen.height}`,
          },
        },
        'application/json'
      );
    },
  };
}
