import type { WallComplaint } from '@qa3elhamor/shared-api-interfaces';
import type { WallFailureKind } from './wall-client';

/*
 * Paging through the wall, as a pure state machine. The API pages newest first by an opaque
 * cursor and cannot go back, so the board keeps every page it has read: "Newer" is local, and
 * "Older" fetches only past the last page held.
 */

export interface WallPaging {
  /** Every page read so far, newest first. */
  readonly pages: readonly (readonly WallComplaint[])[];
  /** The cursor after the last page held; `null` once the oldest page has been read. */
  readonly nextCursor: string | null;
  /** The page on show. */
  readonly index: number;
  /** `loading` while a page is on its way (the first, or an older one). */
  readonly status: 'loading' | 'ready' | 'failed';
  readonly failure: WallFailureKind | null;
  /** Bumped by `retry` and by a stale cursor: the board refetches from where it stands. */
  readonly request: number;
  /** The cursor of the request in flight past the last page, to spot one that repeats. */
  readonly asked: string | null;
}

export type WallPagingEvent =
  | { readonly type: 'loaded'; readonly items: readonly WallComplaint[]; readonly nextCursor: string | null }
  | { readonly type: 'failed'; readonly kind: WallFailureKind }
  | { readonly type: 'older' }
  | { readonly type: 'newer' }
  | { readonly type: 'retry' };

export const INITIAL_WALL_PAGING: WallPaging = {
  pages: [],
  nextCursor: null,
  index: 0,
  status: 'loading',
  failure: null,
  request: 0,
  asked: null,
};

/** What the board should fetch now: `null` when nothing (ready, failed, or settled). */
export const pendingCursor = (state: WallPaging): string | null | undefined => {
  if (state.status !== 'loading') return undefined;
  return state.pages.length === 0 ? null : state.asked;
};

export const hasOlder = (state: WallPaging): boolean =>
  state.index < state.pages.length - 1 || state.nextCursor !== null;

export const hasNewer = (state: WallPaging): boolean => state.index > 0;

export const currentPage = (state: WallPaging): readonly WallComplaint[] =>
  state.pages[state.index] ?? [];

export function wallPagingReducer(state: WallPaging, event: WallPagingEvent): WallPaging {
  switch (event.type) {
    case 'loaded': {
      if (state.status !== 'loading') return state;
      // A later page can repeat an item when the wall changed between reads: keep the first.
      const seen = new Set(state.pages.flat().map((item) => item.id));
      const items = event.items.filter((item) => !seen.has(item.id));
      const first = state.pages.length === 0;
      if (!first && items.length === 0) {
        // Everything on this page was already shown: complaints approved meanwhile pushed
        // older ones down. Read on past it while the server has more (and its cursor moves);
        // otherwise this was the oldest page after all.
        const onward = event.nextCursor !== null && event.nextCursor !== state.asked;
        return onward
          ? { ...state, asked: event.nextCursor, nextCursor: event.nextCursor, request: state.request + 1 }
          : { ...state, status: 'ready', failure: null, nextCursor: null, asked: null };
      }
      const pages = [...state.pages, items];
      return {
        ...state,
        pages,
        nextCursor: event.nextCursor,
        index: pages.length - 1,
        status: 'ready',
        failure: null,
        asked: null,
      };
    }
    case 'failed':
      if (state.status !== 'loading') return state;
      if (event.kind === 'aborted') return state;
      if (event.kind === 'invalid-cursor') {
        // The wall moved under the cursor: read it again from the newest page.
        return { ...INITIAL_WALL_PAGING, request: state.request + 1 };
      }
      return { ...state, status: 'failed', failure: event.kind };
    case 'older':
      if (state.status === 'loading') return state;
      if (state.index < state.pages.length - 1) {
        return { ...state, index: state.index + 1, status: 'ready', failure: null };
      }
      return state.nextCursor === null
        ? state
        : {
            ...state,
            status: 'loading',
            failure: null,
            request: state.request + 1,
            asked: state.nextCursor,
          };
    case 'newer':
      if (state.status === 'loading' || state.index === 0) return state;
      return { ...state, index: state.index - 1, status: 'ready', failure: null };
    case 'retry':
      return state.status === 'failed'
        ? {
            ...state,
            status: 'loading',
            failure: null,
            request: state.request + 1,
            asked: state.pages.length === 0 ? null : state.nextCursor,
          }
        : state;
  }
}
