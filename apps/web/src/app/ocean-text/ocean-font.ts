/*
 * The font every in-world SDF text (`OceanText`) is set in, and whether it can be used. troika
 * reads .ttf (not .woff2), so the dive fetches the self-hosted IBM Plex Sans Arabic SemiBold
 * .ttf (Latin and Arabic in one face) once, lazily, when the first SDF text is about to show.
 * Until the file has arrived the HTML text stays on screen; if it cannot be fetched (offline, a
 * blocked request, a timeout) or troika fails to read it, the HTML text simply stays.
 */

export const OCEAN_FONT_URL = `${import.meta.env.BASE_URL}fonts/ibm-plex-sans-arabic/IBMPlexSansArabic-SemiBold.ttf`;

/** Gives up on a font request that has not answered by then (the HTML text stays). */
export const OCEAN_FONT_TIMEOUT_MS = 20_000;

export type OceanFontStatus = 'idle' | 'loading' | 'ready' | 'failed';

export interface OceanFontStore {
  readonly get: () => OceanFontStatus;
  readonly subscribe: (listener: () => void) => () => void;
  /** Starts the fetch once; later calls do nothing. */
  readonly load: () => void;
  /** The font turned out unusable after all (troika could not read it). */
  readonly fail: () => void;
}

export type FontFetch = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<{ readonly ok: boolean }>;

export function createOceanFontStore(
  url: string,
  fetchFont: FontFetch,
  timeoutMs = OCEAN_FONT_TIMEOUT_MS,
): OceanFontStore {
  let status: OceanFontStatus = 'idle';
  const listeners = new Set<() => void>();
  const set = (next: OceanFontStatus) => {
    if (status === next) return;
    status = next;
    for (const listener of listeners) listener();
  };
  return {
    get: () => status,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load: () => {
      if (status !== 'idle') return;
      set('loading');
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), timeoutMs);
      fetchFont(url, { signal: abort.signal })
        .then((response) => {
          // The browser's HTTP cache answers troika's own request for the same file.
          if (status === 'loading') set(response.ok ? 'ready' : 'failed');
        })
        .catch(() => set('failed'))
        .finally(() => clearTimeout(timer));
    },
    fail: () => set('failed'),
  };
}

/** The page's one font store. */
export const OCEAN_FONT = createOceanFontStore(OCEAN_FONT_URL, (url, init) =>
  fetch(url, { ...init, cache: 'force-cache' }),
);
