/**
 * Reveal timing for `OceanText`: how many glyphs are "surfaced" for a given `reveal` value, and
 * how the shader's reveal head chases that target from frame to frame. Pure, so the typewriter
 * behaviour is testable without WebGL.
 *
 * Glyph order is troika's instance order, which is the logical (reading) order of the string,
 * so a growing head reveals Arabic right-to-left and English left-to-right without any special
 * casing. Whitespace has no glyph.
 */

/**
 * How much of the text is shown: a fraction (0..1) of the glyphs, or `{ characters }`, the number
 * of characters of `text` a typewriter or a voice track has reached.
 */
export type OceanTextReveal = number | { readonly characters: number };

/** Glyphs the reveal head travels per second at most, so a big jump reads as a wave. */
export const REVEAL_MAX_SPEED = 38;
/** Exponential chase rate (1/s): a one-glyph step surfaces ~90% in a quarter second. */
export const REVEAL_CHASE_RATE = 9;
/** Longest frame step honoured, so a backgrounded tab does not finish the reveal in one leap. */
const MAX_STEP_SECONDS = 0.1;
const SNAP_DISTANCE = 0.002;

const WHITESPACE = /\s/u;

/** Characters of `text` that produce a glyph: code points that are not whitespace. */
export function revealableCharCount(text: string): number {
  let count = 0;
  for (const char of text) {
    if (!WHITESPACE.test(char)) count++;
  }
  return count;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * The reveal head (in glyphs) that `reveal` asks for. A head of `n` shows glyphs `0..n-1` fully;
 * a fractional head leaves the next glyph mid-surface.
 *
 * `{ characters }` maps onto glyphs proportionally, because shaping can merge characters into one
 * glyph (Arabic lam-alef) or split one into several; the result is monotonic and exact at both
 * ends, which is what a typewriter needs.
 */
export function revealTargetHead(
  reveal: OceanTextReveal | undefined,
  glyphCount: number,
  text: string,
): number {
  if (glyphCount <= 0) return 0;
  if (reveal === undefined) return glyphCount;
  if (typeof reveal === 'number') {
    return Number.isFinite(reveal) ? clamp(reveal, 0, 1) * glyphCount : glyphCount;
  }
  const total = revealableCharCount(text);
  if (total === 0 || !Number.isFinite(reveal.characters)) return glyphCount;
  const shown = revealableCharCount([...text].slice(0, Math.max(0, Math.floor(reveal.characters))).join(''));
  return Math.round((clamp(shown, 0, total) / total) * glyphCount);
}

/**
 * Advances the reveal head one frame toward `target`: an exponential chase (each glyph eases up)
 * capped at `REVEAL_MAX_SPEED`. Reduced motion, a target behind the head (a reset), or a
 * non-finite value jumps straight to the target.
 */
export function stepRevealHead(
  current: number,
  target: number,
  deltaSeconds: number,
  reducedMotion: boolean,
): number {
  if (reducedMotion || !Number.isFinite(current) || target <= current) return target;
  const dt = clamp(Number.isFinite(deltaSeconds) ? deltaSeconds : 0, 0, MAX_STEP_SECONDS);
  const gap = target - current;
  const step = Math.min(gap * (1 - Math.exp(-REVEAL_CHASE_RATE * dt)), REVEAL_MAX_SPEED * dt);
  const next = current + step;
  return target - next < SNAP_DISTANCE ? target : next;
}

/** Floats per glyph in the `aOceanGlyph` instance attribute: centre x, centre y, order, height. */
export const OCEAN_GLYPH_ITEM_SIZE = 4;

/**
 * Builds the `aOceanGlyph` instance data from troika's `glyphBounds` ([minX, minY, maxX, maxY]
 * per glyph, in instance order): each glyph's centre (the pivot it pops and wobbles around), its
 * order (what the reveal head compares against) and its quad height.
 */
export function oceanGlyphData(glyphBounds: ArrayLike<number>): Float32Array {
  const count = Math.floor(glyphBounds.length / 4);
  const data = new Float32Array(count * OCEAN_GLYPH_ITEM_SIZE);
  for (let i = 0; i < count; i++) {
    const minX = glyphBounds[i * 4];
    const minY = glyphBounds[i * 4 + 1];
    const maxX = glyphBounds[i * 4 + 2];
    const maxY = glyphBounds[i * 4 + 3];
    data[i * 4] = (minX + maxX) / 2;
    data[i * 4 + 1] = (minY + maxY) / 2;
    data[i * 4 + 2] = i;
    data[i * 4 + 3] = maxY - minY;
  }
  return data;
}
