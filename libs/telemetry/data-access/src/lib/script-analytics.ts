import type { TelemetryEvent } from '@qa3elhamor/telemetry-domain';
import type { AnalyticsPort } from './analytics-port.js';
import { injectScript } from './script-loader.js';

/** The browser surface a script adapter touches; injectable so tests can mock it. */
export interface AnalyticsRuntime {
  readonly window: Window;
  readonly document: Document;
  readonly navigator: Navigator;
}

/** What differs between script-tag providers. */
export interface ScriptProvider {
  readonly name: 'plausible' | 'umami';
  readonly scriptSrc: string;
  readonly scriptAttributes: Readonly<Record<string, string>>;
  /** Sends through the provider's loaded global; false when the global is missing. */
  sendViaGlobal(runtime: AnalyticsRuntime, event: TelemetryEvent): boolean;
  /**
   * Sends straight to the provider's collection API with a transport that survives page
   * unload (`sendBeacon` or `fetch` with `keepalive`), without the provider script.
   */
  sendDirect(runtime: AnalyticsRuntime, event: TelemetryEvent): void;
  /** Whether the exit path should go through the global once it is ready. */
  readonly exitViaGlobal: boolean;
}

/** Bounds memory if the script is slow; a dive yields well under this many events. */
export const MAX_QUEUED_EVENTS = 50;

type LoadState = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * Shared behaviour of the script-tag adapters: one-time injection when `load()` is called, a
 * bounded queue until the script loads, and an exit path that does not wait for anything.
 *
 * If the script fails to load (usually a content blocker) the adapter goes silent for the
 * rest of the visit, including the exit path: a visitor blocking the script is treated as
 * not wanting to be counted.
 */
export class ScriptAnalytics implements AnalyticsPort {
  private state: LoadState = 'idle';
  private loading: Promise<void> | null = null;
  private queue: TelemetryEvent[] = [];

  constructor(
    private readonly providerImpl: ScriptProvider,
    private readonly runtime: AnalyticsRuntime
  ) {}

  get provider(): 'plausible' | 'umami' {
    return this.providerImpl.name;
  }

  load(): Promise<void> {
    if (this.loading) return this.loading;
    this.state = 'loading';
    this.loading = injectScript(
      this.runtime.document,
      this.providerImpl.scriptSrc,
      this.providerImpl.scriptAttributes
    ).then(
      () => {
        this.state = 'ready';
        const pending = this.queue;
        this.queue = [];
        for (const event of pending) this.deliver(event);
      },
      () => {
        this.state = 'failed';
        this.queue = [];
      }
    );
    return this.loading;
  }

  track(event: TelemetryEvent): void {
    if (this.state === 'failed') return;
    if (this.state === 'ready') {
      this.deliver(event);
      return;
    }
    // Queue only: the script is injected when the owner calls `load()` (the telemetry client
    // does so on the first idle period), never as a side effect of an early event.
    if (this.queue.length < MAX_QUEUED_EVENTS) this.queue.push(event);
  }

  trackOnExit(event: TelemetryEvent): void {
    if (this.state === 'failed') return;
    // Anything still queued would die with the page: send it on the unload-safe path too.
    const pending = [...this.queue, event];
    this.queue = [];
    for (const item of pending) {
      if (this.state === 'ready' && this.providerImpl.exitViaGlobal) this.deliver(item);
      else this.safely(() => this.providerImpl.sendDirect(this.runtime, item));
    }
  }

  private deliver(event: TelemetryEvent): void {
    this.safely(() => {
      if (!this.providerImpl.sendViaGlobal(this.runtime, event)) {
        this.providerImpl.sendDirect(this.runtime, event);
      }
    });
  }

  /** Provider globals are third-party code; a throw there must not reach the app. */
  private safely(send: () => void): void {
    try {
      send();
    } catch {
      // Deliberately swallowed: a lost analytics event is preferable to a broken page.
    }
  }
}

/** POSTs JSON with a transport that outlives the page; returns false only if nothing was sent. */
export function sendUnloadSafe(
  runtime: AnalyticsRuntime,
  url: string,
  body: unknown,
  contentType: 'text/plain' | 'application/json'
): boolean {
  const payload = JSON.stringify(body);
  const nav = runtime.navigator;
  // sendBeacon only allows CORS-safelisted types without a preflight, i.e. text/plain.
  if (contentType === 'text/plain' && typeof nav.sendBeacon === 'function') {
    if (nav.sendBeacon(url, new Blob([payload], { type: contentType }))) return true;
  }
  const fetchFn = runtime.window.fetch;
  if (typeof fetchFn !== 'function') return false;
  void fetchFn
    .call(runtime.window, url, {
      method: 'POST',
      body: payload,
      headers: { 'Content-Type': contentType },
      keepalive: true,
      credentials: 'omit',
    })
    .catch(() => undefined);
  return true;
}

/** The page URL without query string or fragment, which may carry campaign ids or tokens. */
export function pageUrl(runtime: AnalyticsRuntime): string {
  const { origin, pathname } = runtime.window.location;
  return `${origin}${pathname}`;
}
