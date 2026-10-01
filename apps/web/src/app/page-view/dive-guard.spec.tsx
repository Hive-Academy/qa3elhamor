import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CONTEXT_RESTORE_GRACE_MS,
  DiveFailureBoundary,
  createGuardedRenderer,
  watchContextLoss,
} from './dive-guard';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('watchContextLoss', () => {
  it('reports a context that stays lost past the grace period', () => {
    vi.useFakeTimers();
    const canvas = document.createElement('canvas');
    const onFailure = vi.fn();
    watchContextLoss(canvas, onFailure);

    canvas.dispatchEvent(new Event('webglcontextlost'));
    vi.advanceTimersByTime(CONTEXT_RESTORE_GRACE_MS - 1);
    expect(onFailure).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('forgives a context the browser restores in time', () => {
    vi.useFakeTimers();
    const canvas = document.createElement('canvas');
    const onFailure = vi.fn();
    watchContextLoss(canvas, onFailure);

    canvas.dispatchEvent(new Event('webglcontextlost'));
    vi.advanceTimersByTime(CONTEXT_RESTORE_GRACE_MS / 2);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    vi.advanceTimersByTime(CONTEXT_RESTORE_GRACE_MS * 2);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('stops watching once cleaned up', () => {
    vi.useFakeTimers();
    const canvas = document.createElement('canvas');
    const onFailure = vi.fn();
    const stop = watchContextLoss(canvas, onFailure);

    canvas.dispatchEvent(new Event('webglcontextlost'));
    stop();
    vi.advanceTimersByTime(CONTEXT_RESTORE_GRACE_MS * 2);
    canvas.dispatchEvent(new Event('webglcontextlost'));
    vi.advanceTimersByTime(CONTEXT_RESTORE_GRACE_MS * 2);
    expect(onFailure).not.toHaveBeenCalled();
  });
});

describe('createGuardedRenderer', () => {
  it('reports a renderer the browser refuses, then rethrows', () => {
    // No context, exactly as on a GPU that refuses one.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const onFailure = vi.fn();
    expect(() =>
      createGuardedRenderer(
        { canvas: document.createElement('canvas') },
        onFailure,
      ),
    ).toThrow();
    expect(onFailure).toHaveBeenCalledTimes(1);
  });
});

describe('DiveFailureBoundary', () => {
  function BrokenScene(): never {
    throw new Error('shader compile failed');
  }

  it('reports a scene error and renders nothing in its place', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onFailure = vi.fn();
    const { container } = render(
      <DiveFailureBoundary onFailure={onFailure}>
        <BrokenScene />
      </DiveFailureBoundary>,
    );
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure.mock.calls[0][0]).toEqual(
      new Error('shader compile failed'),
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders its children while they work', () => {
    const { getByText } = render(
      <DiveFailureBoundary onFailure={vi.fn()}>
        <p>the dive</p>
      </DiveFailureBoundary>,
    );
    expect(getByText('the dive')).toBeTruthy();
  });
});
