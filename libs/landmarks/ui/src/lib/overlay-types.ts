import type { ComponentType } from 'react';

/** What every landmark overlay receives. Overlays are plain React DOM components. */
export interface LandmarkOverlayProps {
  /** The landmark that opened it. */
  readonly landmarkId: string;
  /** The landmark's label in the current locale; the host already shows it as the heading. */
  readonly title: string;
  readonly locale: string;
  readonly dir: 'ltr' | 'rtl';
  /** Closes the overlay and returns the camera to the dive (e.g. after a form is sent). */
  readonly onClose: () => void;
}

/**
 * Overlays by key: a landmark's `overlay` field names one. Because an overlay is an ordinary
 * component, the no-WebGL fallback can render the same one outside the canvas.
 */
export type LandmarkOverlayRegistry = Readonly<
  Record<string, ComponentType<LandmarkOverlayProps>>
>;
