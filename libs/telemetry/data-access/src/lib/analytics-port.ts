import type { TelemetrySink } from '@qa3elhamor/telemetry-domain';
import type { AnalyticsProviderName } from './analytics-config.js';

/**
 * Provider-agnostic delivery of allow-listed telemetry events. Every adapter is cookieless
 * and swallows its own failures: analytics must never break or slow the page.
 */
export interface AnalyticsPort extends TelemetrySink {
  readonly provider: AnalyticsProviderName;
  /**
   * Injects the provider script (idempotent). Tracking never injects it by itself: events
   * tracked before `load()` is called, or before the script settles, are queued.
   */
  load(): Promise<void>;
}

/** Used when unconfigured, in a non-browser runtime, or when the visitor opted out. */
export class NoopAnalytics implements AnalyticsPort {
  readonly provider = 'none' as const;
  load(): Promise<void> {
    return Promise.resolve();
  }
  track(): void {
    // Intentionally nothing: this adapter exists so callers never branch on "is analytics on".
  }
  trackOnExit(): void {
    // Intentionally nothing, as above.
  }
}
