import { useDiveState } from '@qa3elhamor/dive-feature';
import { useAudioDepth } from '@qa3elhamor/world-audio';

/** Depth steps the filter follows: fine enough to sound continuous, coarse enough not to re-render per frame. */
const DEPTH_STEPS = 50;

/**
 * Feeds the dive's depth to the ambient sound's low-pass (muffled deeper down). Mount inside
 * `<DiveProvider>`; renders nothing. Narrators duck the music themselves (`useAudioDucking`).
 */
export function DiveAudioMix() {
  const depth = useDiveState((state) => Math.round(state.depthRatio * DEPTH_STEPS) / DEPTH_STEPS);
  useAudioDepth(depth);
  return null;
}
