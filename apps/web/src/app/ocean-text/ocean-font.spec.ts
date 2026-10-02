import { describe, expect, it, vi } from 'vitest';
import { createOceanFontStore } from './ocean-font';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the ocean text font store', () => {
  it('is idle until asked, then loading, then ready when the font answers', async () => {
    const fetchFont = vi.fn(() => Promise.resolve({ ok: true }));
    const store = createOceanFontStore('/font.ttf', fetchFont);
    const seen: string[] = [];
    store.subscribe(() => seen.push(store.get()));
    expect(store.get()).toBe('idle');
    store.load();
    expect(store.get()).toBe('loading');
    await flush();
    expect(store.get()).toBe('ready');
    expect(seen).toEqual(['loading', 'ready']);
    expect(fetchFont).toHaveBeenCalledWith(
      '/font.ttf',
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('fetches once however often it is asked', async () => {
    const fetchFont = vi.fn(() => Promise.resolve({ ok: true }));
    const store = createOceanFontStore('/font.ttf', fetchFont);
    store.load();
    store.load();
    await flush();
    store.load();
    expect(fetchFont).toHaveBeenCalledTimes(1);
  });

  it('fails on an error status and on a rejected request', async () => {
    const notFound = createOceanFontStore('/font.ttf', () =>
      Promise.resolve({ ok: false }),
    );
    notFound.load();
    await flush();
    expect(notFound.get()).toBe('failed');

    const offline = createOceanFontStore('/font.ttf', () =>
      Promise.reject(new TypeError('offline')),
    );
    offline.load();
    await flush();
    expect(offline.get()).toBe('failed');
  });

  it('gives up on a request that does not answer in time', async () => {
    vi.useFakeTimers();
    try {
      const slow = createOceanFontStore(
        '/font.ttf',
        (_url, { signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () =>
              reject(new Error('aborted')),
            );
          }),
        1000,
      );
      slow.load();
      await vi.advanceTimersByTimeAsync(1000);
      expect(slow.get()).toBe('failed');
    } finally {
      vi.useRealTimers();
    }
  });

  it('can be failed after it was ready (troika could not read the file)', async () => {
    const store = createOceanFontStore('/font.ttf', () =>
      Promise.resolve({ ok: true }),
    );
    store.load();
    await flush();
    store.fail();
    expect(store.get()).toBe('failed');
  });
});
