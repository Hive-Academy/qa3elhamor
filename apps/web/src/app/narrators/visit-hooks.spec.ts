import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DialogueEvent } from './dialogue';
import { HOVER_INTENT_MS } from './object-selection';
import { useFullView, useObjectPicking, useVisitLifecycle } from './visit-hooks';

afterEach(() => vi.useRealTimers());

const types = (dispatch: ReturnType<typeof vi.fn>) =>
  dispatch.mock.calls.map(([event]) => (event as DialogueEvent).type);

describe('useVisitLifecycle', () => {
  it('starts the tour once the narrator has arrived, and only then', () => {
    const dispatch = vi.fn();
    const { result } = renderHook(() => useVisitLifecycle(true, 2, dispatch));
    expect(result.current).toMatchObject({ mounted: true, present: true });
    expect(dispatch).not.toHaveBeenCalled();
    act(() => result.current.onSettled());
    expect(types(dispatch)).toEqual(['arrive']);
  });

  it('says goodbye on leaving, sends the narrator off after the farewell, then unmounts', () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    const { result, rerender } = renderHook(
      ({ open }) => useVisitLifecycle(open, 2, dispatch),
      { initialProps: { open: true } },
    );
    act(() => result.current.onSettled());
    rerender({ open: false });
    expect(types(dispatch)).toEqual(['arrive', 'farewell']);
    expect(result.current.present).toBe(true);
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.present).toBe(false);
    act(() => result.current.onExited());
    expect(types(dispatch)).toEqual(['arrive', 'farewell', 'reset']);
    expect(result.current.mounted).toBe(false);
  });

  it('goes straight back to the tour when re-opened while still saying goodbye', () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    const { result, rerender } = renderHook(
      ({ open }) => useVisitLifecycle(open, 2, dispatch),
      { initialProps: { open: true } },
    );
    act(() => result.current.onSettled());
    rerender({ open: false });
    rerender({ open: true });
    expect(types(dispatch)).toEqual(['arrive', 'farewell', 'arrive']);
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.present).toBe(true);
  });

  it('does not start the tour for a narrator that arrives after the visitor left', () => {
    const dispatch = vi.fn();
    const { result, rerender } = renderHook(
      ({ open }) => useVisitLifecycle(open, 0, dispatch),
      { initialProps: { open: true } },
    );
    rerender({ open: false });
    act(() => result.current.onSettled());
    expect(types(dispatch)).toEqual(['farewell']);
  });
});

describe('useObjectPicking', () => {
  it('selects on focus and tap at once, and on hover only after a rest', () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    const { result } = renderHook(() => useObjectPicking(dispatch));
    act(() => result.current.onPick('prio', 'tap'));
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'select', id: 'prio' });
    act(() => result.current.onPick('miramar', 'hover'));
    expect(dispatch).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(HOVER_INTENT_MS));
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'select', id: 'miramar' });
  });

  it('forgets a hover that leaves before it rests', () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    const { result } = renderHook(() => useObjectPicking(dispatch));
    act(() => result.current.onPick('prio', 'hover'));
    act(() => result.current.onUnhover());
    act(() => vi.advanceTimersByTime(HOVER_INTENT_MS * 2));
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('useFullView', () => {
  it('closes on Esc before anything else hears it, and closes with the landmark', () => {
    const { result, rerender } = renderHook(({ open }) => useFullView(open), {
      initialProps: { open: true },
    });
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    const esc = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    act(() => {
      window.dispatchEvent(esc);
    });
    expect(esc.defaultPrevented).toBe(true);
    expect(result.current[0]).toBe(false);

    act(() => result.current[1](true));
    rerender({ open: false });
    expect(result.current[0]).toBe(false);
  });
});
