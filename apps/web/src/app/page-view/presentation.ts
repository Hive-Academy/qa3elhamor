import { useCallback, useEffect, useRef, useState } from 'react';

/** The URL parameter that asks for the page: `?view=page` (shareable). */
export const VIEW_PARAM = 'view';
export const PAGE_VIEW_VALUE = 'page';

/** Why the visitor is reading the page instead of diving. Each gets its own notice. */
export type PageReason =
  /** Asked for it: `?view=page`, or the "read it as a page" link. */
  | 'requested'
  /** The browser cannot create a WebGL context at all. */
  | 'no-webgl'
  /** The dive started and then broke: renderer creation, a scene error, a lost GPU context. */
  | 'dive-failed';

export type Presentation =
  | { readonly kind: 'dive' }
  | { readonly kind: 'page'; readonly reason: PageReason };

export const DIVE: Presentation = { kind: 'dive' };
export const pageFor = (reason: PageReason): Presentation => ({
  kind: 'page',
  reason,
});

export interface PresentationInputs {
  /** `location.search`. */
  readonly search: string;
  /** `readDeviceCapabilities().webgl`. */
  readonly webgl: boolean;
}

/**
 * Dive or page, decided up front. No WebGL wins over everything (there is no dive to offer);
 * otherwise `?view=page` asks for the page. Reduced motion is not a reason on its own: the dive
 * already honours it (jump-cut camera, instant narrators, dialogs instead of in-world cards), and
 * the "read it as a page" link is there for anyone who wants out.
 */
export function choosePresentation({
  search,
  webgl,
}: PresentationInputs): Presentation {
  if (!webgl) return pageFor('no-webgl');
  return new URLSearchParams(search).get(VIEW_PARAM) === PAGE_VIEW_VALUE
    ? pageFor('requested')
    : DIVE;
}

/** `search` with `?view=page` set (`page`) or removed (`dive`); every other parameter kept. */
export function searchFor(search: string, view: 'page' | 'dive'): string {
  const params = new URLSearchParams(search);
  if (view === 'page') params.set(VIEW_PARAM, PAGE_VIEW_VALUE);
  else params.delete(VIEW_PARAM);
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** A same-document href for the given view, from a `location`-shaped object. */
export const hrefFor = (
  location: Pick<Location, 'pathname' | 'search'>,
  view: 'page' | 'dive',
): string => `${location.pathname}${searchFor(location.search, view)}`;

export interface PresentationControl {
  readonly presentation: Presentation;
  /** True once the visitor switched views in this document (not on the first load). */
  readonly switched: boolean;
  /** Leaves the dive for the page and records it in history (`?view=page`). */
  readonly readAsPage: () => void;
  /** Leaves the page for the dive and records it in history. */
  readonly returnToDive: () => void;
  /** The dive broke at runtime: show the page, keep the URL so a reload retries the dive. */
  readonly diveFailed: () => void;
}

/**
 * Owns the dive/page choice for the composition root: the up-front decision, the in-session
 * switches (History API, so Back works and the URL is shareable) and the runtime fallback.
 */
export function usePresentation(webgl: () => boolean): PresentationControl {
  const [presentation, setPresentation] = useState<Presentation>(() =>
    choosePresentation({ search: window.location.search, webgl: webgl() }),
  );
  const [switched, setSwitched] = useState(false);
  const current = useRef(presentation);
  useEffect(() => {
    current.current = presentation;
  }, [presentation]);

  useEffect(() => {
    const sync = () => {
      const before = current.current;
      // A broken dive stays broken for this document; Back must not remount it.
      if (before.kind === 'page' && before.reason === 'dive-failed') return;
      const next = choosePresentation({
        search: window.location.search,
        webgl: webgl(),
      });
      // Popstate also fires for in-page anchors (the section nav): only a change of view is a
      // switch, and only a switch moves focus and scroll.
      if (next.kind === before.kind) return;
      setSwitched(true);
      setPresentation(next);
      window.scrollTo(0, 0);
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [webgl]);

  const switchTo = useCallback((view: 'page' | 'dive') => {
    window.history.pushState(null, '', hrefFor(window.location, view));
    setSwitched(true);
    setPresentation(view === 'page' ? pageFor('requested') : DIVE);
    // The dive's scroll track is many screens tall; neither view should open mid-way down it.
    window.scrollTo(0, 0);
  }, []);

  const readAsPage = useCallback(() => switchTo('page'), [switchTo]);
  const returnToDive = useCallback(() => switchTo('dive'), [switchTo]);
  const diveFailed = useCallback(() => {
    setSwitched(true);
    setPresentation(pageFor('dive-failed'));
    window.scrollTo(0, 0);
  }, []);

  return { presentation, switched, readAsPage, returnToDive, diveFailed };
}
