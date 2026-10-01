/*
 * Placing small DOM pieces next to things in the scene, on screen: a speech bubble above its
 * narrator with the tail pointing at it, and a panel beside a bubble. Kept inside the viewport.
 * Pure: the scene projects the anchor, these decide the box.
 */

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface BoxSize {
  readonly width: number;
  readonly height: number;
}

/** Space the page chrome keeps for itself, in CSS pixels from each edge. */
export interface ScreenInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export const NO_INSETS: ScreenInsets = { top: 0, right: 0, bottom: 0, left: 0 };

const clamp = (v: number, lo: number, hi: number): number =>
  hi < lo ? lo : v < lo ? lo : v > hi ? hi : v;

export interface SpeechBubblePlacement {
  /** False when the anchor is off screen (the narrator swam out of view): hide the bubble. */
  readonly visible: boolean;
  readonly left: number;
  readonly top: number;
  /** Where the tail leaves the bubble's bottom edge, from its left edge. */
  readonly tailX: number;
  /** How far the tail's tip leans sideways from `tailX` to reach the anchor. */
  readonly tailLean: number;
  /** The tail's length from the bubble to the anchor (at least `tail`). */
  readonly tailLength: number;
}

export interface SpeechBubbleInput {
  /** The point the tail points at (just above the narrator's head). */
  readonly anchor: ScreenPoint;
  readonly size: BoxSize;
  readonly viewport: BoxSize;
  readonly insets?: ScreenInsets;
  /** The tail's natural length. Default 22. */
  readonly tail?: number;
  /** Where along its width the bubble sits over the anchor: 0 = its left edge. Default 0.3. */
  readonly bias?: number;
}

/** Room the tail keeps from the bubble's rounded corners. */
const TAIL_CORNER = 30;
/** How far off screen the anchor may be before the bubble hides. */
const OFFSCREEN_SLACK = 24;

/**
 * A speech bubble above its anchor, its tail pointing down at it. It slides sideways to stay
 * on screen, and the tail leans to keep pointing at the anchor. When there is no room above,
 * it stays at the top inset and the tail grows instead (it never covers the narrator).
 */
export function placeSpeechBubble({
  anchor,
  size,
  viewport,
  insets = NO_INSETS,
  tail = 22,
  bias = 0.3,
}: SpeechBubbleInput): SpeechBubblePlacement {
  const visible =
    Number.isFinite(anchor.x) &&
    Number.isFinite(anchor.y) &&
    anchor.x > -OFFSCREEN_SLACK &&
    anchor.x < viewport.width + OFFSCREEN_SLACK &&
    anchor.y > -OFFSCREEN_SLACK &&
    anchor.y < viewport.height + OFFSCREEN_SLACK;
  const ax = Number.isFinite(anchor.x) ? anchor.x : viewport.width / 2;
  const ay = Number.isFinite(anchor.y) ? anchor.y : viewport.height / 2;
  const left = clamp(
    ax - size.width * bias,
    insets.left,
    viewport.width - insets.right - size.width,
  );
  const top = Math.max(ay - tail - size.height, insets.top);
  const tailX = clamp(ax - left, TAIL_CORNER, size.width - TAIL_CORNER);
  const tailLength = Math.max(ay - (top + size.height), tail * 0.5);
  return {
    visible,
    left: Math.round(left),
    top: Math.round(top),
    tailX: Math.round(tailX),
    tailLean: Math.round(
      clamp(ax - left - tailX, -tailLength * 1.2, tailLength * 1.2),
    ),
    tailLength: Math.round(tailLength),
  };
}

export type PanelSide = 'left' | 'right' | 'above' | 'below';

/**
 * A panel beside a round thing on screen (a bubble at `centre`, `radius` px), on its outer
 * side: away from `hub`, the middle of the group it belongs to (the landmark), so it covers
 * neither the landmark nor its neighbours. Tries outward first (the stronger direction, then the
 * other axis), then below, above and the inner sides; the first that fits inside the viewport
 * and insets wins, else the one that overflows least, clamped in.
 */
export function placePanel({
  centre,
  radius,
  hub,
  size,
  viewport,
  insets = NO_INSETS,
  gap = 10,
}: {
  readonly centre: ScreenPoint;
  readonly radius: number;
  readonly hub: ScreenPoint;
  readonly size: BoxSize;
  readonly viewport: BoxSize;
  readonly insets?: ScreenInsets;
  readonly gap?: number;
}): { readonly left: number; readonly top: number; readonly side: PanelSide } {
  const dx = centre.x - hub.x;
  const dy = centre.y - hub.y;
  const horizontal: PanelSide = dx >= 0 ? 'right' : 'left';
  const vertical: PanelSide = dy >= 0 ? 'below' : 'above';
  const order: PanelSide[] =
    Math.abs(dx) >= Math.abs(dy)
      ? [horizontal, vertical]
      : [vertical, horizontal];
  for (const side of ['below', 'above', 'right', 'left'] as const)
    if (!order.includes(side)) order.push(side);

  const reach = radius + gap;
  const boxAt = (side: PanelSide) => {
    switch (side) {
      case 'right':
        return { left: centre.x + reach, top: centre.y - size.height / 2 };
      case 'left':
        return {
          left: centre.x - reach - size.width,
          top: centre.y - size.height / 2,
        };
      case 'below':
        return { left: centre.x - size.width / 2, top: centre.y + reach };
      case 'above':
        return {
          left: centre.x - size.width / 2,
          top: centre.y - reach - size.height,
        };
    }
  };
  const minLeft = insets.left;
  const maxLeft = viewport.width - insets.right - size.width;
  const minTop = insets.top;
  const maxTop = viewport.height - insets.bottom - size.height;
  // How far a box at `side` would stick out along the axis it moves away on: the other axis
  // can slide freely (clamped) without covering the bubble.
  const overflow = (side: PanelSide): number => {
    const box = boxAt(side);
    return side === 'left' || side === 'right'
      ? Math.max(minLeft - box.left, box.left - maxLeft, 0)
      : Math.max(minTop - box.top, box.top - maxTop, 0);
  };
  const side =
    order.find((candidate) => overflow(candidate) === 0) ??
    order.reduce((best, candidate) =>
      overflow(candidate) < overflow(best) ? candidate : best,
    );
  const box = boxAt(side);
  return {
    left: Math.round(clamp(box.left, minLeft, maxLeft)),
    top: Math.round(clamp(box.top, minTop, maxTop)),
    side,
  };
}
