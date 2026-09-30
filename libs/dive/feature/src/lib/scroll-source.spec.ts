import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollTopForProgress, windowScrollSource } from './scroll-source.js';

/** A controllable ResizeObserver: jsdom has none. */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly observed: Element[] = [];
  disconnected = false;
  constructor(readonly callback: () => void) {
    FakeResizeObserver.instances.push(this);
  }
  observe(target: Element) {
    this.observed.push(target);
  }
  unobserve() {
    /* not used */
  }
  disconnect() {
    this.disconnected = true;
  }
}

const setDocumentHeight = (px: number) =>
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: px });

afterEach(() => {
  vi.unstubAllGlobals();
  FakeResizeObserver.instances = [];
});

describe('windowScrollSource', () => {
  it('re-reads progress when the document height changes without a window resize', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
    setDocumentHeight(5000);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 2000 });

    const source = windowScrollSource();
    const onChange = vi.fn();
    const unsubscribe = source.subscribe(onChange);
    expect(source.read()).toBe(0.5);

    const [observer] = FakeResizeObserver.instances;
    expect(observer.observed).toEqual([document.documentElement]);

    setDocumentHeight(9000); // content mounted in flow; no resize event
    observer.callback();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(source.read()).toBe(0.25);

    unsubscribe();
    expect(observer.disconnected).toBe(true);
  });

  it('still works where ResizeObserver is unavailable', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const source = windowScrollSource();
    const onChange = vi.fn();
    const unsubscribe = source.subscribe(onChange);
    window.dispatchEvent(new Event('scroll'));
    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
    window.dispatchEvent(new Event('scroll'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('treats NaN progress as the surface', () => {
    expect(scrollTopForProgress(Number.NaN, 1000)).toBe(0);
  });
});
