import { summariseFrameTimes, profilePixelRatio } from '@qa3elhamor/world-domain';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useQualityController } from './quality-context.js';

/** Ring capacity: a one-second window at up to 480 Hz. Percentiles do not need order. */
const RING_CAPACITY = 480;
/**
 * A frame at least this long is reported to the governor on its own, as a one-frame window,
 * instead of being folded into the current window: a device stalling for seconds per frame
 * must still step down and settle. Tab switches are excluded by `visibilitychange`.
 */
const STALL_FRAME_MS = 2000;

interface FrameRing {
  readonly samples: Float32Array;
  readonly scratch: Float32Array;
  /** Frames in the current window (may exceed capacity; the ring keeps the latest). */
  frames: number;
  windowMs: number;
  /** Set when the page was hidden: the next frame's delta spans the hidden time. */
  skipNext: boolean;
}

const createRing = (): FrameRing => ({
  samples: new Float32Array(RING_CAPACITY),
  scratch: new Float32Array(RING_CAPACITY),
  frames: 0,
  windowMs: 0,
  skipNext: false,
});

export interface QualityMonitorProps {
  /** Length of one measurement window handed to the governor, in ms. */
  readonly windowMs?: number;
}

/**
 * Measures frame times inside the `<Canvas>` and feeds one summary per window to the
 * governor in `<QualityProvider>`; also applies the tier's pixel ratio through R3F's
 * `setDpr`. Per frame it writes one float into a preallocated ring and allocates nothing.
 *
 * Hiding the page discards the window in progress and the first frame after it, so time the
 * page was not rendering never counts as slowness. The pixel ratio is re-applied when the
 * native ratio changes (browser zoom, moving to another monitor).
 */
export function QualityMonitor({ windowMs = 1000 }: QualityMonitorProps) {
  const { state, observe } = useQualityController();
  const setDpr = useThree((three) => three.setDpr);
  const ring = useRef<FrameRing | null>(null);

  useEffect(() => {
    let query: MediaQueryList | null = null;
    const apply = (): void => {
      setDpr(profilePixelRatio(state.profile, window.devicePixelRatio));
      // A `resolution` query matches only the current ratio, so re-arm it after each change.
      query?.removeEventListener('change', apply);
      query =
        typeof window.matchMedia === 'function'
          ? window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
          : null;
      query?.addEventListener('change', apply);
    };
    apply();
    return () => query?.removeEventListener('change', apply);
  }, [setDpr, state.profile]);

  useEffect(() => {
    const onVisibility = (): void => {
      ring.current ??= createRing();
      ring.current.skipNext = true;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useFrame((_, delta) => {
    ring.current ??= createRing();
    const buffer = ring.current;
    const frameMs = delta * 1000;
    if (buffer.skipNext || !(frameMs > 0)) {
      buffer.skipNext = false;
      buffer.frames = 0;
      buffer.windowMs = 0;
      return;
    }
    if (frameMs >= STALL_FRAME_MS) {
      buffer.samples[0] = frameMs;
      observe(summariseFrameTimes(buffer.samples, 1, buffer.scratch, frameMs));
      buffer.frames = 0;
      buffer.windowMs = 0;
      return;
    }
    buffer.samples[buffer.frames % RING_CAPACITY] = frameMs;
    buffer.frames += 1;
    buffer.windowMs += frameMs;
    if (buffer.windowMs < windowMs) return;

    observe(summariseFrameTimes(buffer.samples, buffer.frames, buffer.scratch, buffer.windowMs));
    buffer.frames = 0;
    buffer.windowMs = 0;
  });

  return null;
}
