/** The privacy signals read; both are non-standard enough to be absent from lib.dom typings. */
export interface PrivacySignals {
  readonly doNotTrack?: string | null;
  readonly globalPrivacyControl?: boolean;
}

/**
 * True when the visitor asked not to be tracked, via Do Not Track (`'1'`, also the legacy
 * `window.doNotTrack`) or Global Privacy Control. Cookieless analytics would not legally
 * require this, but honouring an explicit signal is cheap and is the choice documented in
 * `docs/analytics.md`: the page then uses the no-op adapter and loads no provider script.
 */
export function isTrackingOptedOut(
  navigator: PrivacySignals | undefined,
  legacyWindow?: { readonly doNotTrack?: string | null }
): boolean {
  if (navigator?.globalPrivacyControl === true) return true;
  if (navigator?.doNotTrack === '1') return true;
  return legacyWindow?.doNotTrack === '1';
}
