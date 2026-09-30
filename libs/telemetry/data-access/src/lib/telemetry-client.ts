import { TelemetrySession, type TelemetrySessionOptions } from '@qa3elhamor/telemetry-domain';
import type { AnalyticsConfig } from './analytics-config.js';
import { NoopAnalytics, type AnalyticsPort } from './analytics-port.js';
import { isTrackingOptedOut, type PrivacySignals } from './privacy.js';
import { plausibleProvider, umamiProvider } from './providers.js';
import { ScriptAnalytics, type AnalyticsRuntime } from './script-analytics.js';

/** The real browser globals, or null outside a browser (SSR, node tests). */
export function browserRuntime(): AnalyticsRuntime | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  return { window, document, navigator: window.navigator };
}

/**
 * Picks the adapter: no-op when unconfigured, outside a browser, or when the visitor sent
 * Do Not Track / Global Privacy Control; otherwise the configured provider.
 */
export function createAnalytics(
  config: AnalyticsConfig,
  runtime: AnalyticsRuntime | null = browserRuntime()
): AnalyticsPort {
  if (config.provider === 'none' || runtime === null) return new NoopAnalytics();
  const signals = runtime.navigator as Navigator & PrivacySignals;
  const legacy = runtime.window as Window & { doNotTrack?: string | null };
  if (isTrackingOptedOut(signals, legacy)) return new NoopAnalytics();
  const provider =
    config.provider === 'plausible' ? plausibleProvider(config) : umamiProvider(config);
  return new ScriptAnalytics(provider, runtime);
}

export interface TelemetryClientOptions extends TelemetrySessionOptions {
  /**
   * Upper bound in ms before the provider script is injected even if the main thread never
   * goes idle. The script is otherwise injected on the first idle period after `start`.
   */
  readonly loadTimeoutMs?: number;
}

export interface TelemetryClient {
  readonly port: AnalyticsPort;
  readonly session: TelemetrySession;
  /**
   * Schedules the lazy script load and listens for `pagehide` to send the drop-off event
   * (and `pageshow` to re-arm it after a back/forward-cache return). Returns a cleanup
   * function; safe to call again after cleanup (React strict mode).
   */
  start(): () => void;
}

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function createTelemetryClient(
  config: AnalyticsConfig,
  runtime: AnalyticsRuntime | null = browserRuntime(),
  options: TelemetryClientOptions = {}
): TelemetryClient {
  const port = createAnalytics(config, runtime);
  const session = new TelemetrySession(port, options);
  const loadTimeoutMs = options.loadTimeoutMs ?? 4000;

  const start = (): (() => void) => {
    if (runtime === null || port.provider === 'none') return () => undefined;
    const win = runtime.window as IdleWindow;

    let cancelLoad: () => void;
    if (typeof win.requestIdleCallback === 'function') {
      const handle = win.requestIdleCallback(() => void port.load(), { timeout: loadTimeoutMs });
      cancelLoad = () => win.cancelIdleCallback?.(handle);
    } else {
      const handle = win.setTimeout(() => void port.load(), Math.min(loadTimeoutMs, 1500));
      cancelLoad = () => win.clearTimeout(handle);
    }

    // `pagehide` fires on close, navigation and bfcache entry; unlike `unload` it keeps the
    // page bfcache-eligible. Every hide sends the drop-off, persisted or not: a page entering
    // the bfcache is usually never shown again (and is evicted without another event), so
    // skipping `persisted` hides would lose most exits. If it IS restored (`pageshow` with
    // `persisted`), the visit resumes and the drop-off is re-armed, so the real exit is
    // reported with the depth reached by then.
    const onPageHide = (): void => session.dropOff();
    const onPageShow = (event: PageTransitionEvent): void => {
      if (event.persisted) session.resumeVisit();
    };
    win.addEventListener('pagehide', onPageHide);
    win.addEventListener('pageshow', onPageShow);

    return () => {
      cancelLoad();
      win.removeEventListener('pagehide', onPageHide);
      win.removeEventListener('pageshow', onPageShow);
    };
  };

  return { port, session, start };
}
