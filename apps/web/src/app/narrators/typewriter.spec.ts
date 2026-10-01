import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TYPE_CPS, splitTyped, typedLength, typingSeconds, useTypewriter } from './typewriter';

describe('typewriter timing', () => {
  it('types one character per tick of the pace', () => {
    expect(typedLength('abcdef', 0)).toBe(0);
    expect(typedLength('abcdef', 1 / TYPE_CPS)).toBe(1);
    expect(typedLength('abcdef', 3 / TYPE_CPS)).toBe(3);
    expect(typedLength('abcdef', 100)).toBe(6);
  });

  it('pauses after punctuation, but not at the very end', () => {
    // "a." then a pause of 7 characters' worth before "b".
    expect(typedLength('a.b', 2 / TYPE_CPS)).toBe(2);
    expect(typedLength('a.b', 8 / TYPE_CPS)).toBe(2);
    expect(typedLength('a.b', 10 / TYPE_CPS)).toBe(3);
    expect(typingSeconds('a.')).toBeCloseTo(2 / TYPE_CPS);
    expect(typingSeconds('a.b')).toBeCloseTo(10 / TYPE_CPS);
  });

  it('never gives NaN or more than the text', () => {
    expect(typedLength('abc', Number.NaN)).toBe(0);
    expect(typedLength('abc', -1)).toBe(0);
    expect(typedLength('abc', 1, 0)).toBe(0);
    expect(typedLength('', 5)).toBe(0);
    expect(typingSeconds('')).toBe(0);
  });

  it('counts code points, so Arabic and emoji are never split mid-character', () => {
    const text = 'قاع 🐟';
    expect(splitTyped(text, 5)).toEqual(['قاع 🐟', '']);
    expect(splitTyped(text, 4)).toEqual(['قاع ', '🐟']);
    expect(typedLength(text, 100)).toBe(5);
  });
});

describe('useTypewriter', () => {
  afterEach(() => vi.useRealTimers());

  it('types the line out over time, then reports the end once', () => {
    vi.useFakeTimers();
    const onTyped = vi.fn();
    const { result } = renderHook(() => useTypewriter('Hello there.', true, 1, onTyped));
    expect(result.current).toBe(0);
    act(() => vi.advanceTimersByTime(120));
    expect(result.current).toBeGreaterThan(0);
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current).toBe(12);
    expect(onTyped).toHaveBeenCalledTimes(1);
  });

  it('instant (reduced motion): the whole line at once, and onTyped once per take', () => {
    vi.useFakeTimers();
    const onTyped = vi.fn();
    const { result, rerender } = renderHook(
      ({ take }) => useTypewriter('Hello there.', true, take, onTyped, { instant: true }),
      { initialProps: { take: 1 } },
    );
    expect(result.current).toBe(12);
    expect(onTyped).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(5000));
    expect(onTyped).toHaveBeenCalledTimes(1);
    rerender({ take: 2 });
    expect(onTyped).toHaveBeenCalledTimes(2);
  });

  it('not typing: the whole line, no report', () => {
    const onTyped = vi.fn();
    const { result } = renderHook(() => useTypewriter('Done.', false, 3, onTyped));
    expect(result.current).toBe(5);
    expect(onTyped).not.toHaveBeenCalled();
  });
});
