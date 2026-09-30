import type { CloseReason } from '@qa3elhamor/landmarks-domain';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { isReturnableFocus } from './focus-management.js';
import './landmark-return-bar.css';

export interface LandmarkReturnBarProps {
  readonly open: boolean;
  /** The landmark's name, shown and used as the region's accessible name. */
  readonly title: string;
  readonly onClose: (reason: CloseReason) => void;
  /** The button's text. Default "Back to the dive". */
  readonly closeLabel?: string;
  /** Optional one-line hint, e.g. "Hover a dish to look closer". */
  readonly hint?: string;
  readonly dir?: 'ltr' | 'rtl';
  readonly lang?: string;
  /** Where focus goes on close when the opener cannot take it back; see the dialog host. */
  readonly returnFocus?: () => HTMLElement | null;
}

/**
 * The DOM side of a landmark that presents in the scene (`in-world`) or not at all (`none`):
 * a small, non-modal bar naming the landmark with a way back to the dive. The scene stays
 * interactive, so nothing is made inert. On open, focus moves to the button, so keyboard
 * users land somewhere meaningful; Esc anywhere on the page closes, and focus returns to the
 * opener (or `returnFocus()`).
 */
export function LandmarkReturnBar({
  open,
  title,
  onClose,
  closeLabel = 'Back to the dive',
  hint,
  dir,
  lang,
  returnFocus,
}: LandmarkReturnBarProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const returnFocusRef = useRef(returnFocus);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
    returnFocusRef.current = returnFocus;
  });

  useLayoutEffect(() => {
    if (!open) return;
    const opener = document.activeElement;
    buttonRef.current?.focus();
    return () => {
      const target = isReturnableFocus(opener)
        ? opener
        : (returnFocusRef.current?.() ?? null);
      target?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented)
        onCloseRef.current('escape');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <section className="lmk-return" aria-label={title} dir={dir} lang={lang}>
      <div className="lmk-return__text">
        <strong className="lmk-return__title">{title}</strong>
        {hint && <span className="lmk-return__hint">{hint}</span>}
      </div>
      <button
        ref={buttonRef}
        type="button"
        className="lmk-return__button"
        onClick={() => onCloseRef.current('button')}
      >
        {closeLabel}
      </button>
    </section>
  );
}
