import type { ShippedCredit } from '@qa3elhamor/world-domain';
import { useEffect, useId, useRef, useState } from 'react';
import { CreditsList } from './credits-list.js';
import './credits.css';

export interface CreditsDialogProps {
  readonly credits: readonly ShippedCredit[];
  /** The always-visible trigger's text. Default "Credits". */
  readonly triggerLabel?: string;
  /** The dialog's heading and accessible name. Default "Credits". */
  readonly title?: string;
  readonly intro?: string;
  readonly closeLabel?: string;
}

const DEFAULT_INTRO =
  'The 3D models in this site are used under the Creative Commons Attribution 4.0 licence. ' +
  'Their authors are credited below, as the licence requires.';

/**
 * A small, always-visible "Credits" button in the page chrome that opens the full credits in a
 * native modal `<dialog>`: focus moves into it, Tab stays inside, Esc and the Close button
 * dismiss it, and focus returns to the button.
 */
export function CreditsDialog({
  credits,
  triggerLabel = 'Credits',
  title = 'Credits',
  intro = DEFAULT_INTRO,
  closeLabel = 'Close',
}: CreditsDialogProps) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = triggerRef.current;
    if (!dialog || !open) return;
    // Engines without `showModal` (old browsers, jsdom) get a non-modal open dialog.
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    return () => {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="world-credits__trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </button>
      <dialog
        ref={dialogRef}
        className="world-credits__dialog"
        aria-labelledby={headingId}
        lang="en"
        dir="ltr"
        // The native Esc path: keep React's state in step with the element.
        onClose={() => setOpen(false)}
      >
        <h2 id={headingId} className="world-credits__title">
          {title}
        </h2>
        <p className="world-credits__intro">{intro}</p>
        <CreditsList credits={credits} />
        <button type="button" className="world-credits__close" onClick={() => setOpen(false)}>
          {closeLabel}
        </button>
      </dialog>
    </>
  );
}
