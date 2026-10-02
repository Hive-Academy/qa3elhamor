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

/** A rectangle on screen, in CSS pixels. */
export interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Room a speech bubble keeps from the page chrome it steps around. */
export const CHROME_GAP = 14;

/** The least room a speech bubble keeps from the browser window's edges. */
export const WINDOW_MARGIN = 12;

/**
 * `insets` for a layer whose box (`layer`, in window pixels) may not match the window: grown so
 * that whatever is placed inside them stays `margin` px inside the window as well. A layer
 * wider than the window, or shifted, would otherwise let a bubble clamped to it touch the
 * window's edge.
 */
export function windowSafeInsets(
  insets: ScreenInsets,
  layer: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  },
  window: BoxSize,
  margin = WINDOW_MARGIN,
): ScreenInsets {
  return {
    top: Math.max(insets.top, margin - layer.top),
    right: Math.max(insets.right, layer.right - window.width + margin),
    bottom: Math.max(insets.bottom, layer.bottom - window.height + margin),
    left: Math.max(insets.left, margin - layer.left),
  };
}

/**
 * The CSS `skewX` angle (degrees) that leans a speech bubble's tail by `tailLean` px over its
 * `tailLength`. The tail skews about its top edge, and CSS `skewX(a)` moves a point `y` px down
 * by `y * tan(a)` to the right: a positive lean (the narrator to the right) is a positive angle.
 */
export const tailSkewDegrees = (place: {
  readonly tailLean: number;
  readonly tailLength: number;
}): number =>
  (Math.atan2(place.tailLean, Math.max(place.tailLength, 1)) * 180) / Math.PI;

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
  /**
   * The page's fixed chrome (credits, language switch, depth gauge, sound switch, tour bar,
   * landmark list): the bubble steps around these, never over or under them.
   */
  readonly keepOut?: readonly ScreenRect[];
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
  keepOut,
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
  const minLeft = insets.left;
  const maxLeft = viewport.width - insets.right - size.width;
  const natural = {
    left: clamp(ax - size.width * bias, minLeft, maxLeft),
    top: Math.max(ay - tail - size.height, insets.top),
  };
  const { left, top } = keepOut?.length
    ? clearOfChrome(natural, size, keepOut, {
        minLeft,
        maxLeft,
        minTop: insets.top,
        // Never down over the narrator: its bottom stays above the anchor, a short tail between.
        // (A bubble already pressed down to the top inset may move sideways at that height.)
        maxBottom: Math.max(ay - tail * 0.5, natural.top + size.height),
      })
    : natural;
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

/**
 * The nearest spot to `box` that clears every `keepOut` rectangle (with `CHROME_GAP`), within the
 * limits: beside a piece of chrome, under it, or both (under one, beside another). `box` itself
 * when it is clear, or when no spot is (the bubble then keeps its natural place).
 */
export function clearOfChrome(
  box: { readonly left: number; readonly top: number },
  size: BoxSize,
  keepOut: readonly ScreenRect[],
  limits: {
    readonly minLeft: number;
    readonly maxLeft: number;
    readonly minTop: number;
    readonly maxBottom: number;
  },
): { readonly left: number; readonly top: number } {
  const g = CHROME_GAP;
  const hits = (left: number, top: number): boolean =>
    keepOut.some(
      (r) =>
        left < r.right + g &&
        left + size.width > r.left - g &&
        top < r.bottom + g &&
        top + size.height > r.top - g,
    );
  if (!hits(box.left, box.top)) return box;
  const xs = [box.left];
  const ys = [box.top];
  for (const r of keepOut) {
    xs.push(r.right + g, r.left - g - size.width);
    ys.push(r.bottom + g);
  }
  let best: { left: number; top: number } | null = null;
  let bestCost = Infinity;
  for (const left of xs) {
    if (left < limits.minLeft || left > limits.maxLeft) continue;
    for (const top of ys) {
      if (top < limits.minTop || top + size.height > limits.maxBottom) continue;
      if (hits(left, top)) continue;
      const cost = Math.abs(left - box.left) + Math.abs(top - box.top);
      if (cost < bestCost) {
        bestCost = cost;
        best = { left, top };
      }
    }
  }
  return best ?? box;
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
  extent,
  hub,
  size,
  viewport,
  insets = NO_INSETS,
  gap = 10,
  prefer,
}: {
  readonly centre: ScreenPoint;
  readonly radius: number;
  /** Half width and half height of a thing that is not round (a tablet); default `radius`. */
  readonly extent?: { readonly x: number; readonly y: number };
  readonly hub: ScreenPoint;
  readonly size: BoxSize;
  readonly viewport: BoxSize;
  readonly insets?: ScreenInsets;
  readonly gap?: number;
  /**
   * A side to try first, before the outer sides: `above` for things in a row (the Tiki's
   * tablets), where the outer side would cover a neighbour.
   */
  readonly prefer?: PanelSide;
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
  if (prefer) order.unshift(...order.splice(order.indexOf(prefer), 1));

  const reachX = (extent?.x ?? radius) + gap;
  const reachY = (extent?.y ?? radius) + gap;
  const boxAt = (side: PanelSide) => {
    switch (side) {
      case 'right':
        return { left: centre.x + reachX, top: centre.y - size.height / 2 };
      case 'left':
        return {
          left: centre.x - reachX - size.width,
          top: centre.y - size.height / 2,
        };
      case 'below':
        return { left: centre.x - size.width / 2, top: centre.y + reachY };
      case 'above':
        return {
          left: centre.x - size.width / 2,
          top: centre.y - reachY - size.height,
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
