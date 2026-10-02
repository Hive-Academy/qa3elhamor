/*
 * The resident narrator: a rigged bundled character idling at its landmark while the visitor
 * dives past, before the landmark is opened, so the place feels inhabited. This is when it is
 * there and when it waves, from the camera's distance to its post. Pure: no React, no three.js.
 *
 * Distances are multiples of the landmark's stop distance (its resting camera's distance to the
 * post), so the thresholds suit any landmark's framing.
 */

/** Within this, it loads and shows up (x stop distance). */
export const RESIDENT_SHOW_WITHIN = 4;
/** Beyond this, it goes (and unmounts): wider than `RESIDENT_SHOW_WITHIN`, so it does not flicker. */
export const RESIDENT_HIDE_BEYOND = 5;
/** Coming within this, it waves (x stop distance). */
export const RESIDENT_WAVE_WITHIN = 1.6;
/** Leaving beyond this re-arms the wave. */
export const RESIDENT_WAVE_REARM = 2.2;
/** How long a wave lasts, seconds. */
export const RESIDENT_WAVE_SECONDS = 2.4;
/** At least this long between two waves, seconds. */
export const RESIDENT_WAVE_COOLDOWN = 10;

export interface ResidentState {
  shown: boolean;
  /** True once it has waved at this approach; cleared when the camera goes beyond the re-arm. */
  waved: boolean;
  /** Seconds of wave left. */
  waveLeft: number;
  /** Seconds since the last wave started. */
  sinceWave: number;
}

export const createResidentState = (): ResidentState => ({
  shown: false,
  waved: false,
  waveLeft: 0,
  sinceWave: Number.POSITIVE_INFINITY,
});

/**
 * Advances one frame from the camera's `distance` to the post and the landmark's `stopDistance`.
 * Returns whether it is shown and whether it is waving. An unknown distance (NaN) keeps it as it
 * was; a non-positive stop distance shows nothing.
 */
export function stepResident(
  state: ResidentState,
  distance: number,
  stopDistance: number,
  dt: number,
): { readonly shown: boolean; readonly waving: boolean } {
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
  state.waveLeft = Math.max(0, state.waveLeft - step);
  state.sinceWave += step;
  if (!(stopDistance > 0) || !Number.isFinite(stopDistance)) {
    state.shown = false;
    state.waveLeft = 0;
    return { shown: false, waving: false };
  }
  if (Number.isFinite(distance)) {
    const k = distance / stopDistance;
    if (k <= RESIDENT_SHOW_WITHIN) state.shown = true;
    else if (k > RESIDENT_HIDE_BEYOND) state.shown = false;
    if (k > RESIDENT_WAVE_REARM) state.waved = false;
    else if (
      state.shown &&
      k <= RESIDENT_WAVE_WITHIN &&
      !state.waved &&
      state.sinceWave >= RESIDENT_WAVE_COOLDOWN
    ) {
      state.waved = true;
      state.waveLeft = RESIDENT_WAVE_SECONDS;
      state.sinceWave = 0;
    }
  }
  if (!state.shown) state.waveLeft = 0;
  return { shown: state.shown, waving: state.waveLeft > 0 };
}
