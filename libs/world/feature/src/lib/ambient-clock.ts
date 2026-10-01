import type { IUniform } from 'three';

/**
 * The ambient-life shader clock wraps at this many seconds (2 pi x 50). Every angular
 * frequency in the ambient shaders is a multiple of 0.02 rad/s, so each completes a whole
 * number of cycles per period and the wrap is invisible; the clock never grows large enough
 * for float32 precision to make the motion step.
 */
export const AMBIENT_TIME_PERIOD = Math.PI * 100;

/** Name of the shared time uniform in every ambient-life shader patch. */
export const AMBIENT_TIME_UNIFORM = 'uAmbientTime';

export const createAmbientClock = (): IUniform<number> => ({ value: 0 });

/** Advances the clock by `step` seconds, wrapping at `AMBIENT_TIME_PERIOD`. */
export const tickAmbientClock = (clock: IUniform<number>, step: number): void => {
  if (step > 0) clock.value = (clock.value + step) % AMBIENT_TIME_PERIOD;
};
