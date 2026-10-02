/**
 * Layout math for `OceanBubble`: the bubble body around a text block, the bubbly tail (a lobe
 * merged into the body plus two detached air bubbles trailing toward the speaker), and the quad
 * the bubble shader draws into. Pure, in the text's local units.
 */

/** A text block's rectangle, as troika reports it ([minX, minY, maxX, maxY]). */
export interface OceanTextBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Which lower corner the tail leaves from, toward the speaker; `none` for a free bubble. */
export type BubbleTailSide = 'left' | 'right' | 'none';

export interface BubbleCircle {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

export interface BubbleLayout {
  /** Body centre and half extents, in the text's local units. */
  readonly centerX: number;
  readonly centerY: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly radius: number;
  /** Tail lobe (merged) then two detached bubbles; radius 0 when there is no tail. */
  readonly tail: readonly [BubbleCircle, BubbleCircle, BubbleCircle];
  /** The quad the shader draws into: body, tail and the rim's glow margin. */
  readonly quad: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
}

const NO_CIRCLE: BubbleCircle = { x: 0, y: 0, r: 0 };

export function boundsFromTroika(box: ArrayLike<number>): OceanTextBounds | null {
  if (box.length < 4) return null;
  const [minX, minY, maxX, maxY] = [box[0], box[1], box[2], box[3]];
  if (![minX, minY, maxX, maxY].every(Number.isFinite) || maxX < minX || maxY < minY) return null;
  return { minX, minY, maxX, maxY };
}

export function sameBounds(
  a: OceanTextBounds | null,
  b: OceanTextBounds | null,
  epsilon = 1e-4,
): boolean {
  if (a === null || b === null) return a === b;
  return (
    Math.abs(a.minX - b.minX) < epsilon &&
    Math.abs(a.minY - b.minY) < epsilon &&
    Math.abs(a.maxX - b.maxX) < epsilon &&
    Math.abs(a.maxY - b.maxY) < epsilon
  );
}

/**
 * Lays a bubble out around `bounds` with `padding` on every side. The corner radius is a
 * pebble-like share of the height; the tail scales with the body so a one-liner and a paragraph
 * keep the same character. `tailAt` (x, in the bounds' units) moves the tail's root along the
 * bottom edge, over the speaker; the tail still trails off towards `tailSide`.
 */
export function bubbleLayout(
  bounds: OceanTextBounds,
  padding: number,
  tailSide: BubbleTailSide,
  tailAt?: number,
): BubbleLayout {
  const pad = Math.max(0, padding);
  const halfWidth = (bounds.maxX - bounds.minX) / 2 + pad;
  const halfHeight = (bounds.maxY - bounds.minY) / 2 + pad;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const radius = Math.min(halfHeight, halfWidth, Math.max(pad * 1.4, halfHeight * 0.6));
  const unit = Math.min(halfHeight * 2, 1.2);

  let tail: BubbleLayout['tail'] = [NO_CIRCLE, NO_CIRCLE, NO_CIRCLE];
  if (tailSide !== 'none') {
    const sign = tailSide === 'left' ? -1 : 1;
    // Under the corner by default; under `tailAt` (x from the body's centre) when given, kept
    // clear of the rounded corners.
    const reach = Math.max(halfWidth - radius * 1.15, 0);
    const lobeX =
      tailAt === undefined || !Number.isFinite(tailAt)
        ? sign * reach
        : Math.min(Math.max(tailAt - centerX, -reach), reach);
    const lobe = { x: lobeX, y: -halfHeight + unit * 0.01, r: unit * 0.14 };
    const mid = {
      x: lobe.x + sign * unit * 0.17,
      y: -halfHeight - unit * 0.22,
      r: unit * 0.07,
    };
    const tip = {
      x: mid.x + sign * unit * 0.12,
      y: mid.y - unit * 0.16,
      r: unit * 0.042,
    };
    tail = [lobe, mid, tip];
  }

  const margin = unit * 0.12;
  let minX = -halfWidth;
  let maxX = halfWidth;
  let minY = -halfHeight;
  for (const c of tail) {
    if (c.r === 0) continue;
    minX = Math.min(minX, c.x - c.r);
    maxX = Math.max(maxX, c.x + c.r);
    minY = Math.min(minY, c.y - c.r);
  }
  return {
    centerX,
    centerY,
    halfWidth,
    halfHeight,
    radius,
    tail,
    quad: {
      minX: minX - margin,
      minY: minY - margin,
      maxX: maxX + margin,
      maxY: halfHeight + margin,
    },
  };
}
