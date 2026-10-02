import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { CONTACT_SUBMITTER } from '../contact-submitter';
import {
  routeByVisibility,
  type ComplaintSubmitter,
} from '../overlays/complaint-scroll/complaint-submitter';
import type { NoticeBoardProps } from './notice-board';
import { WALL_COPY, type WallCopy } from './wall-copy';
import { WALL_API_URL } from './wall-env';

/**
 * The public complaints wall as the rest of the site sees it: `null` when the build has no
 * `VITE_WALL_API_URL` (the default), and then nothing of the wall renders anywhere and nothing
 * calls it, and the bundler drops this module's wall code and words (`WALL_API_URL` folds to
 * `null`). On, the board, its client and the submitter are separate chunks, fetched the first
 * time a visitor reads the wall or pins a complaint.
 */
export interface WallPort {
  /** The API root (`WALL_API_URL`). */
  readonly apiUrl: string;
  /** Files a public complaint (`POST /complaints`): `awaiting-moderation` on success. */
  readonly submitter: ComplaintSubmitter;
  /**
   * The words the Bureau form and the page need for the wall (the public choice, its outcomes,
   * the page section). Carried here rather than imported by them, so a build without the wall
   * has none of them.
   */
  readonly words: WallCopy;
  /** The noticeboard (lazy): render inside `<Suspense>`. */
  readonly Board: LazyExoticComponent<ComponentType<NoticeBoardProps>>;
}

export function createWallPort(apiUrl: string): WallPort {
  let loaded: Promise<ComplaintSubmitter> | null = null;
  const load = (): Promise<ComplaintSubmitter> => {
    loaded ??= Promise.all([import('./wall-client'), import('./wall-submitter')]).then(
      ([client, submitter]) =>
        submitter.wallSubmitter(client.createWallClient({ baseUrl: apiUrl })),
    );
    // A chunk that failed to load (offline for a moment) is retried on the next submission.
    loaded.catch(() => (loaded = null));
    return loaded;
  };
  return {
    apiUrl,
    words: WALL_COPY,
    submitter: { submit: (draft) => load().then((wall) => wall.submit(draft)) },
    Board: lazy(() => import('./notice-board').then((m) => ({ default: m.NoticeBoard }))),
  };
}

/** This build's wall, or `null` (off). */
export const WALL: WallPort | null =
  WALL_API_URL === null ? null : createWallPort(WALL_API_URL);

/**
 * The Bureau form's submitter everywhere it shows: the private contact adapter, and with the
 * wall on, the public wall for complaints the visitor chose to pin.
 */
export const COMPLAINT_SUBMITTER: ComplaintSubmitter =
  WALL === null
    ? CONTACT_SUBMITTER
    : routeByVisibility({ private: CONTACT_SUBMITTER, public: WALL.submitter });
