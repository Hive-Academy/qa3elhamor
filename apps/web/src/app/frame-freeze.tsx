import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';

/** Set on `<html>` to stop drawing frames; removing it resumes the render loop. */
export const FREEZE_FRAMES_ATTRIBUTE = 'data-freeze-frames';

/**
 * Stops the render loop while `<html data-freeze-frames>` is set, so a canvas screenshot can be
 * compared pixel for pixel (apps/web-e2e/src/visual.spec.ts). Fish, residents and caustics never
 * fully stop, even under reduced motion. Nothing sets the attribute in normal use.
 */
export function FrameFreeze() {
  const setFrameloop = useThree((state) => state.setFrameloop);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () =>
      setFrameloop(root.hasAttribute(FREEZE_FRAMES_ATTRIBUTE) ? 'never' : 'always');
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { attributes: true, attributeFilter: [FREEZE_FRAMES_ATTRIBUTE] });
    return () => {
      observer.disconnect();
      setFrameloop('always');
    };
  }, [setFrameloop]);

  return null;
}
