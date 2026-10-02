import type { WallComplaint } from '@qa3elhamor/shared-api-interfaces';
import { describe, expect, it } from 'vitest';
import { excerptOf, noteDate } from './note-text';
import {
  INITIAL_WALL_PAGING,
  currentPage,
  hasNewer,
  hasOlder,
  pendingCursor,
  wallPagingReducer,
  type WallPaging,
  type WallPagingEvent,
} from './wall-paging';

const note = (id: string): WallComplaint => ({
  id,
  subject: id,
  body: 'b',
  senderName: 'n',
  senderSpecies: null,
  submittedAt: '2026-09-30T10:00:00.000Z',
});
const run = (...events: WallPagingEvent[]): WallPaging =>
  events.reduce(wallPagingReducer, INITIAL_WALL_PAGING);
const loaded = (ids: string[], nextCursor: string | null): WallPagingEvent => ({
  type: 'loaded',
  items: ids.map(note),
  nextCursor,
});

describe('wallPagingReducer', () => {
  it('starts by fetching the newest page', () => {
    expect(pendingCursor(INITIAL_WALL_PAGING)).toBeNull();
  });

  it('pages older by cursor and newer from what it already holds', () => {
    let state = run(loaded(['a', 'b'], 'C1'));
    expect(pendingCursor(state)).toBeUndefined();
    expect(hasOlder(state)).toBe(true);
    expect(hasNewer(state)).toBe(false);

    state = wallPagingReducer(state, { type: 'older' });
    expect(pendingCursor(state)).toBe('C1');
    state = wallPagingReducer(state, loaded(['c'], null));
    expect(currentPage(state).map((n) => n.id)).toEqual(['c']);
    expect(hasOlder(state)).toBe(false);

    const request = state.request;
    state = wallPagingReducer(state, { type: 'newer' });
    expect(currentPage(state).map((n) => n.id)).toEqual(['a', 'b']);
    // Newer is local: no request.
    expect(state.request).toBe(request);
    expect(pendingCursor(state)).toBeUndefined();

    state = wallPagingReducer(state, { type: 'older' });
    expect(currentPage(state).map((n) => n.id)).toEqual(['c']);
    expect(state.status).toBe('ready');
  });

  it('reads on past a page of already-shown complaints (new ones pushed them down)', () => {
    let state = run(loaded(['a', 'b'], 'C1'), { type: 'older' });
    expect(pendingCursor(state)).toBe('C1');
    const request = state.request;
    state = wallPagingReducer(state, loaded(['a', 'b'], 'C2'));
    // Still loading, now past the repeat.
    expect(state.status).toBe('loading');
    expect(pendingCursor(state)).toBe('C2');
    expect(state.request).toBe(request + 1);
    state = wallPagingReducer(state, loaded(['c'], null));
    expect(currentPage(state).map((n) => n.id)).toEqual(['c']);
    expect(state.index).toBe(1);
  });

  it('ends paging when a later page brings nothing new and no further cursor', () => {
    const ended = run(loaded(['a'], 'C1'), { type: 'older' }, loaded(['a'], null));
    expect(ended.pages).toHaveLength(1);
    expect(ended.status).toBe('ready');
    expect(hasOlder(ended)).toBe(false);
    // A cursor that does not move would loop for ever: that is the end too.
    const stuck = run(loaded(['a'], 'C1'), { type: 'older' }, loaded(['a'], 'C1'));
    expect(stuck.status).toBe('ready');
    expect(hasOlder(stuck)).toBe(false);
  });

  it('keeps an empty first page as an empty wall', () => {
    const state = run(loaded([], null));
    expect(state.status).toBe('ready');
    expect(currentPage(state)).toEqual([]);
  });

  it('fails visibly, then retries the same request', () => {
    let state = run(loaded(['a'], 'C1'), { type: 'older' }, { type: 'failed', kind: 'network' });
    expect(state).toMatchObject({ status: 'failed', failure: 'network' });
    expect(currentPage(state).map((n) => n.id)).toEqual(['a']);
    state = wallPagingReducer(state, { type: 'retry' });
    expect(pendingCursor(state)).toBe('C1');
  });

  it('starts again from the newest page on a stale cursor', () => {
    const state = run(
      loaded(['a'], 'C1'),
      { type: 'older' },
      { type: 'failed', kind: 'invalid-cursor' },
    );
    expect(state.pages).toEqual([]);
    expect(pendingCursor(state)).toBeNull();
  });

  it('ignores an aborted request (the board went away or refetched)', () => {
    const state = run({ type: 'failed', kind: 'aborted' });
    expect(state).toEqual(INITIAL_WALL_PAGING);
  });
});

describe('note text', () => {
  it('keeps short text whole', () => {
    expect(excerptOf('Short.')).toEqual({ text: 'Short.', cut: false });
  });

  it('cuts long text at a word, by code points, never inside an emoji', () => {
    const long = `${'word '.repeat(40)}end`;
    const excerpt = excerptOf(long, 22);
    expect(excerpt.cut).toBe(true);
    expect(excerpt.text).toBe('word word word word…');
    const emoji = excerptOf('🐟'.repeat(10), 5);
    expect(emoji.text).toBe(`${'🐟'.repeat(5)}…`);
  });

  it('formats the date in the page language, or nothing for a bad instant', () => {
    expect(noteDate('2026-09-30T10:00:00.000Z', 'en')).toMatch(/2026/);
    expect(noteDate('2026-09-30T10:00:00.000Z', 'ar')).toMatch(/[٠-٩]|2026/);
    expect(noteDate('yesterday', 'en')).toBeNull();
  });
});
