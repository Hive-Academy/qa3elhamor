import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  INITIAL_DIALOGUE,
  dialogueReducer,
  type DialogueEvent,
  type DialogueScript,
  type DialogueState,
} from './dialogue';
import {
  CONTENT_DWELL_MS,
  READING_TIME,
  VisitAutoplayContext,
  autoplayStep,
  readingMs,
  useVisitAutoplay,
  type AutoplayMode,
  type VisitAutoplay,
} from './visit-autoplay';

afterEach(() => vi.useRealTimers());

const script: DialogueScript = {
  lines: ['One.', 'Two.'],
  hints: { a: 'About a.' },
  farewell: 'Bye.',
};
const run = (events: readonly DialogueEvent[]): DialogueState =>
  events.reduce((s, e) => dialogueReducer(s, e, script), INITIAL_DIALOGUE);

describe('readingMs', () => {
  it('is 900 ms plus 45 ms a character, clamped to 2..7 s', () => {
    expect(readingMs('')).toBe(READING_TIME.minMs);
    expect(readingMs('x'.repeat(40))).toBe(900 + 45 * 40);
    expect(readingMs('x'.repeat(400))).toBe(READING_TIME.maxMs);
  });

  it('counts Arabic by characters, the same as English', () => {
    const arabic = 'أهلاً بك في قاع الهامور، تعال نتفرج';
    expect(readingMs(arabic)).toBe(900 + 45 * Array.from(arabic).length);
  });
});

describe('autoplayStep', () => {
  it('waits while the narrator arrives, types or leaves', () => {
    expect(autoplayStep(INITIAL_DIALOGUE, script, 0)).toBeNull();
    expect(autoplayStep(run([{ type: 'arrive' }]), script, 0)).toBeNull();
    const leaving = run([{ type: 'arrive' }, { type: 'farewell' }]);
    expect(autoplayStep(leaving, script, 0)).toBeNull();
  });

  it('advances a typed line once it has been read', () => {
    const typed = run([{ type: 'arrive' }, { type: 'typed' }]);
    expect(autoplayStep(typed, script, CONTENT_DWELL_MS)).toEqual({
      kind: 'advance',
      afterMs: readingMs('One.'),
    });
  });

  it('goes back to the tour from a comment the same way', () => {
    const hint = run([
      { type: 'arrive' },
      { type: 'typed' },
      { type: 'select', id: 'a' },
      { type: 'typed' },
    ]);
    expect(autoplayStep(hint, script, 0)).toEqual({
      kind: 'advance',
      afterMs: readingMs('About a.'),
    });
  });

  it('finishes after the last line, its reading time and the content dwell', () => {
    const last = run([
      { type: 'arrive' },
      { type: 'typed' },
      { type: 'advance' },
      { type: 'typed' },
    ]);
    expect(autoplayStep(last, script, 1000)).toEqual({
      kind: 'finish',
      afterMs: readingMs('Two.') + 1000,
    });
  });
});

/** A hand-rolled autoplay store for one landmark. */
function fakeAutoplay(initial: AutoplayMode) {
  let mode = initial;
  const listeners = new Set<() => void>();
  const finished = vi.fn();
  const autoplay: VisitAutoplay = {
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    modeFor: (id) => (id === 'pineapple' ? mode : 'off'),
    finished,
  };
  const set = (next: AutoplayMode) => {
    mode = next;
    listeners.forEach((l) => l());
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <VisitAutoplayContext.Provider value={autoplay}>
      {children}
    </VisitAutoplayContext.Provider>
  );
  return { autoplay, set, finished, wrapper };
}

describe('useVisitAutoplay', () => {
  const typedFirst = run([{ type: 'arrive' }, { type: 'typed' }]);
  const typedLast = run([
    { type: 'arrive' },
    { type: 'typed' },
    { type: 'advance' },
    { type: 'typed' },
  ]);

  it('is off, and does nothing, without a provider', () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    const { result } = renderHook(() =>
      useVisitAutoplay('pineapple', typedFirst, script, dispatch, {
        held: false,
        contentDwellMs: 0,
      }),
    );
    expect(result.current).toBe('off');
    act(() => vi.advanceTimersByTime(60_000));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('advances after the reading time while playing', () => {
    vi.useFakeTimers();
    const { wrapper } = fakeAutoplay('playing');
    const dispatch = vi.fn();
    renderHook(
      () =>
        useVisitAutoplay('pineapple', typedFirst, script, dispatch, {
          held: false,
          contentDwellMs: 0,
        }),
      { wrapper },
    );
    act(() => vi.advanceTimersByTime(readingMs('One.') - 1));
    expect(dispatch).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(dispatch).toHaveBeenCalledWith({ type: 'advance' });
  });

  it('reports the visit finished after the last line and the dwell', () => {
    vi.useFakeTimers();
    const { wrapper, finished } = fakeAutoplay('playing');
    renderHook(
      () =>
        useVisitAutoplay('pineapple', typedLast, script, vi.fn(), {
          held: false,
          contentDwellMs: 500,
        }),
      { wrapper },
    );
    act(() => vi.advanceTimersByTime(readingMs('Two.') + 500));
    expect(finished).toHaveBeenCalledWith('pineapple');
  });

  it('waits while paused, held, or for another landmark, and resumes with a full reading time', () => {
    vi.useFakeTimers();
    const { wrapper, set } = fakeAutoplay('paused');
    const dispatch = vi.fn();
    const { rerender } = renderHook(
      ({ held, id }: { held: boolean; id: string }) =>
        useVisitAutoplay(id, typedFirst, script, dispatch, {
          held,
          contentDwellMs: 0,
        }),
      { wrapper, initialProps: { held: false, id: 'pineapple' } },
    );
    act(() => vi.advanceTimersByTime(60_000));
    act(() => set('playing'));
    rerender({ held: true, id: 'pineapple' });
    act(() => vi.advanceTimersByTime(60_000));
    rerender({ held: false, id: 'tiki' });
    act(() => vi.advanceTimersByTime(60_000));
    expect(dispatch).not.toHaveBeenCalled();
    rerender({ held: false, id: 'pineapple' });
    act(() => vi.advanceTimersByTime(readingMs('One.')));
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
