import { isComposingKey } from '@qa3elhamor/landmarks-ui';

/**
 * What an Escape does while the complaint scroll is unrolled. Escape never costs the visitor
 * their text, and is never stolen from what it belongs to:
 * - `ignore`: not an Escape, or one cancelling an IME composition (the input method's own);
 * - `swallow`: the complaint is travelling; the visitor stays to see how it went (the Bureau
 *   neither rolls back nor closes);
 * - `leave-field`: in a field (closing a datalist or select popup, too), the first Escape only
 *   leaves the field, for the "Roll it back up" button;
 * - `roll-back`: outside a field, back into the tube, with the draft kept.
 * Anything but `ignore` is handled here: the landmark stage's own Escape (close) does not run.
 */
export type ScrollEscape = 'ignore' | 'swallow' | 'leave-field' | 'roll-back';

export function scrollEscape(
  event: Pick<KeyboardEvent, 'key' | 'isComposing' | 'keyCode'>,
  context: { readonly sending: boolean; readonly inField: boolean },
): ScrollEscape {
  if (event.key !== 'Escape' || isComposingKey(event as KeyboardEvent))
    return 'ignore';
  if (context.sending) return 'swallow';
  return context.inField ? 'leave-field' : 'roll-back';
}
