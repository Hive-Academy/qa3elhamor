import { useEffect } from 'react';
import { useDive } from './dive-context.js';
import { windowScrollSource } from './scroll-source.js';

export interface DiveScrollProps {
  /** Scroll length of the whole dive, in viewport heights. */
  readonly screens?: number;
  readonly className?: string;
}

export const DEFAULT_DIVE_SCREENS = 8;

/**
 * The dive's scroll track: an empty block that makes the document `screens` viewports tall,
 * and binds the document's native scroll to the dive. The canvas and overlays sit over it in
 * fixed position. Native scrolling is the whole input model, so keyboard, scroll bar, touch
 * and assistive technology keep working with no key handling here.
 */
export function DiveScroll({ screens = DEFAULT_DIVE_SCREENS, className }: DiveScrollProps) {
  const controller = useDive();

  useEffect(() => controller.connect(windowScrollSource()), [controller]);

  return <div className={className} style={{ height: `${screens * 100}vh` }} data-dive-scroll="" />;
}
