/** Constrains `value` to the inclusive range [min, max]. */
export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/** Linear interpolation between `a` and `b` at `t`, where `t` is unclamped. */
export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * t;

/** Maps `value` from [inMin, inMax] onto [outMin, outMax], clamped to the output range. */
export const remap = (
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number => {
  if (inMax === inMin) return outMin;
  const t = (value - inMin) / (inMax - inMin);
  return clamp(lerp(outMin, outMax, t), Math.min(outMin, outMax), Math.max(outMin, outMax));
};

/** Hermite smoothing over [edge0, edge1]; the standard easing curve for scroll-driven motion. */
export const smoothstep = (edge0: number, edge1: number, value: number): number => {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
