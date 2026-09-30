/** A scalar value chasing a target with some velocity. Mutated in place; never reallocated. */
export interface SpringState {
  value: number;
  velocity: number;
}

/**
 * Advances a critically damped spring by `dt` seconds towards `target`, in place.
 *
 * This is the exact closed-form solution, not an Euler step, so the result does not depend
 * on how the time is sliced: one 1/30 s step equals two 1/60 s steps, and a 144 Hz display
 * feels the same as a 60 Hz one. Critical damping is the fastest approach that never
 * overshoots from rest, which is what makes a scroll-driven camera feel weighty rather than
 * springy.
 *
 * `omega` is the natural frequency in 1/s: the spring covers about 90% of a step change in
 * 3.9 / omega seconds.
 */
export function stepCriticalSpring(state: SpringState, target: number, omega: number, dt: number): void {
  if (!(dt > 0) || !(omega > 0)) return;
  const offset = state.value - target;
  const j = state.velocity + offset * omega;
  const decay = Math.exp(-omega * dt);
  state.value = target + (offset + j * dt) * decay;
  state.velocity = (state.velocity - j * omega * dt) * decay;
}

/** Settles `state` onto `target` once it is closer than `epsilon` and nearly still. */
export function settleSpring(state: SpringState, target: number, epsilon = 1e-6): boolean {
  if (Math.abs(state.value - target) < epsilon && Math.abs(state.velocity) < epsilon) {
    state.value = target;
    state.velocity = 0;
    return true;
  }
  return false;
}

/** Jumps `state` to `target` with no motion: the reduced-motion path. */
export function snapSpring(state: SpringState, target: number): void {
  state.value = target;
  state.velocity = 0;
}
