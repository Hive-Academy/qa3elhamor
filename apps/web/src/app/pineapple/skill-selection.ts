/** How a skill bubble was picked: pointing at it, focusing its label, or tapping it. */
export type SelectSource = 'hover' | 'focus' | 'tap';

/**
 * Arrow-key travel between the bubbles' labels: the index to focus after `key` from `index`,
 * or null when the key is not one of ours. Right/Down go on and Left/Up go back (mirrored
 * right-to-left), wrapping round; Home and End go to the ends.
 */
export function bubbleKeyStep(
  index: number,
  key: string,
  count: number,
  dir: 'ltr' | 'rtl' = 'ltr',
): number | null {
  if (count <= 0) return null;
  const forward = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
  const back = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
  const at = Number.isInteger(index) && index >= 0 && index < count ? index : 0;
  switch (key) {
    case forward:
    case 'ArrowDown':
      return (at + 1) % count;
    case back:
    case 'ArrowUp':
      return (at - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/**
 * Hover intent: a pointer passing over bubbles on its way somewhere should not make the
 * narrator start (and abandon) a comment on each. A hover selects only after resting this long;
 * focus and taps select at once.
 */
export const HOVER_INTENT_MS = 140;

export const pickDelay = (source: SelectSource): number =>
  source === 'hover' ? HOVER_INTENT_MS : 0;

/** How far out of the door (0 to 1) a bubble must be before it can be picked. */
export const PICKABLE_FROM = 0.8;

/**
 * Whether a pointer pick on a bubble counts. A bubble still flying out of (or back into) the
 * door is not a target yet. Hover is for a mouse only: a finger dragging across the scene must
 * not select on its way, touch and pen pick by tapping.
 */
export function acceptsPick(
  source: SelectSource,
  pointerType: string | undefined,
  progress: number,
): boolean {
  if (!(progress >= PICKABLE_FROM)) return false;
  return source !== 'hover' || pointerType === 'mouse';
}
