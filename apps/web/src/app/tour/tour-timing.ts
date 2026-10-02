/*
 * The tour's timing: how long a flight between stops takes, the curve it follows, and the cut
 * that replaces it with reduced motion. Pure; the shell samples it per animation frame.
 */

/**
 * A leg takes `baseS` plus `perUnitS` per world unit of dive between its stops, between `minS`
 * and `maxS`. On the owner's route: about 5 s from the surface to the Pineapple (50 units),
 * 3 s for the short hop to the Tiki, under 4 s for the two crossings after it.
 */
export const LEG_TIMING = {
  baseS: 2.6,
  perUnitS: 0.05,
  minS: 3,
  maxS: 5,
} as const;

/** Seconds for a flight over `distance` world units of the dive. */
export function legSeconds(distance: number): number {
  const d = Number.isFinite(distance) ? Math.abs(distance) : 0;
  return Math.min(
    LEG_TIMING.maxS,
    Math.max(LEG_TIMING.minS, LEG_TIMING.baseS + LEG_TIMING.perUnitS * d),
  );
}

/**
 * Smootherstep (Perlin's quintic): zero speed and zero acceleration at both ends, so a flight
 * eases out of a stop and settles into the next without a jolt.
 */
export function easeInOut(t: number): number {
  if (!(t > 0)) return 0;
  if (t >= 1) return 1;
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Dive progress `elapsedS` into a flight from `from` to `to` lasting `durationS`. */
export function flightProgress(
  from: number,
  to: number,
  elapsedS: number,
  durationS: number,
): number {
  const t = durationS > 0 ? elapsedS / durationS : 1;
  return from + (to - from) * easeInOut(t);
}

/**
 * The reduced-motion cut: the view fades to the water's colour (`fadeMs`), the camera moves
 * while it is covered, and the view fades back in after `holdMs`. Opacity only, no movement.
 */
export const CUT_TIMING = { fadeMs: 420, holdMs: 240 } as const;
