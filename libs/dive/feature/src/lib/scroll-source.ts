/** Maps a scroll offset to dive progress in [0, 1]. A page that cannot scroll is at the surface. */
export function progressFromScroll(scrollTop: number, maxScroll: number): number {
  if (!(maxScroll > 0) || !Number.isFinite(scrollTop)) return 0;
  const p = scrollTop / maxScroll;
  return p <= 0 ? 0 : p >= 1 ? 1 : p;
}

/** The scroll offset at which the dive reaches `progress`. */
export function scrollTopForProgress(progress: number, maxScroll: number): number {
  const p = Number.isNaN(progress) || progress <= 0 ? 0 : progress >= 1 ? 1 : progress;
  return maxScroll > 0 ? p * maxScroll : 0;
}

/**
 * Where scroll input comes from. The dive reads native scrolling rather than hijacking wheel
 * or touch events, so keyboard scrolling (PageUp/PageDown, Home/End, arrows, Space), scroll
 * bars, touch and assistive technology all work without any code here.
 */
export interface ScrollSource {
  /**
   * How far down the scroll track the page is, in [0, 1]. The dive turns this into path
   * progress with `DivePath.progressAtScroll`, which slows the camera near stops.
   */
  read(): number;
  /** Scrolls the page to the scroll fraction `progress`, animated or instant. */
  scrollTo(progress: number, smooth: boolean): void;
  /** Calls `onChange` whenever the scroll position or the scrollable range changes. */
  subscribe(onChange: () => void): () => void;
}

/** The document's own scrolling, for a tall spacer over a fixed canvas. */
export function windowScrollSource(win: Window & typeof globalThis = window): ScrollSource {
  const maxScroll = (): number => win.document.documentElement.scrollHeight - win.innerHeight;
  return {
    read: () => progressFromScroll(win.scrollY, maxScroll()),
    scrollTo: (progress, smooth) =>
      win.scrollTo({ top: scrollTopForProgress(progress, maxScroll()), behavior: smooth ? 'smooth' : 'instant' }),
    subscribe: (onChange) => {
      win.addEventListener('scroll', onChange, { passive: true });
      win.addEventListener('resize', onChange);
      // The document can grow or shrink without the window resizing (content mounting in
      // flow, a new `DiveScroll` length, late fonts or images). That changes what the current
      // scroll offset means, so re-read then too. `<html>` is auto-height, so its border box
      // tracks the document height. Absent where ResizeObserver is (old browsers, jsdom).
      const observer =
        typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(() => onChange()) : null;
      observer?.observe(win.document.documentElement);
      return () => {
        win.removeEventListener('scroll', onChange);
        win.removeEventListener('resize', onChange);
        observer?.disconnect();
      };
    },
  };
}
