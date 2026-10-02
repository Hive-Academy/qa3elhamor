import { Component, lazy, type ErrorInfo, type ReactNode } from 'react';
import { readDeviceCapabilities } from '@qa3elhamor/world-feature';
import { choosePresentation } from './page-view/presentation';

/*
 * The seam between the entry and the 3D dive (`dive-shell.tsx`). Nothing here may import
 * three, R3F or drei: this module is in the first download for every visitor, including the
 * ones who never dive (no WebGL, `?view=page`). docs/perf-budget.md.
 */

/** Whether this browser can create a WebGL context (probed once, cached by the world library). */
export const hasWebgl = (): boolean => readDeviceCapabilities().webgl;

let pending: Promise<typeof import('./dive-shell')> | undefined;

/**
 * The dive chunk, imported once per document. Vite's preload helper fetches its vendor chunks
 * (`vendor-three`, `vendor-r3f`, `vendor-drei`) in parallel with it, so there is no waterfall.
 */
export const loadDiveShell = (): Promise<typeof import('./dive-shell')> =>
  (pending ??= import('./dive-shell').catch((error: unknown) => {
    // A failed download (offline, deploy swap) must not poison later attempts.
    pending = undefined;
    throw error;
  }));

/**
 * Called by `main.tsx` before the first render: when the first view will be the dive, its chunk
 * starts downloading now instead of after React has rendered and suspended. A failure is not
 * reported here; the render path meets the same rejected promise and falls back to the page.
 */
export function preloadDiveForFirstView(webgl: () => boolean = hasWebgl): void {
  const first = choosePresentation({
    search: window.location.search,
    webgl: webgl(),
  });
  if (first.kind === 'dive') loadDiveShell().catch(() => undefined);
}

/** The dive, rendered under `<Suspense>`; the first render waits for `loadDiveShell()`. */
export const LazyDiveShell = lazy(() =>
  loadDiveShell().then((module) => ({ default: module.DiveShell })),
);

/**
 * Catches a dive chunk that failed to load (offline, a deploy that replaced the hashed file)
 * and hands the visitor to the page view, as a broken scene does. Errors inside the loaded
 * scene are caught closer to the canvas, by `DiveFailureBoundary` in `dive-shell.tsx`.
 */
export class DiveLoadBoundary extends Component<
  { readonly onFailure: () => void; readonly children: ReactNode },
  { readonly failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(
      'The dive could not be loaded:',
      error instanceof Error ? error.message : error,
      info.componentStack,
    );
    this.props.onFailure();
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * What stands in for the canvas while the dive chunk downloads: the water the dive starts in,
 * light from the surface fading into depth. Decorative (the scene note beside it already names
 * the site and offers the page), so hidden from assistive technology.
 */
export function DiveLoading() {
  return <div className="dive-loading" aria-hidden="true" />;
}
