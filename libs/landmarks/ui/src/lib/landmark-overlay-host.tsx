import type { CloseReason } from '@qa3elhamor/landmarks-domain';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  focusableWithin,
  inertOutside,
  isReturnableFocus,
} from './focus-management.js';
import './landmark-overlay-host.css';

export { focusableWithin } from './focus-management.js';

export interface LandmarkOverlayHostProps {
  readonly open: boolean;
  /** The dialog's accessible name and visible heading. */
  readonly title: string;
  readonly onClose: (reason: CloseReason) => void;
  readonly dir?: 'ltr' | 'rtl';
  readonly lang?: string;
  /** Accessible name of the close button. */
  readonly closeLabel?: string;
  /**
   * Where focus goes on close when the opener cannot take it back (the dialog was opened
   * from the canvas, so focus was on `<body>` or inside the `aria-hidden` canvas). Called
   * at close time. Without it, or when it returns null, focus stays where closing left it.
   */
  readonly returnFocus?: () => HTMLElement | null;
  /**
   * Stops the page scrolling behind the dialog. Default true. Turn it off when something else
   * owns the scroll while the dialog is open: the landmark kernel does, because the dive
   * ignores scroll in focus and restores the page position itself on release.
   */
  readonly lockScroll?: boolean;
  /** Where the dialog is portalled. Default `document.body`. */
  readonly container?: HTMLElement;
  readonly children?: ReactNode;
}

/**
 * The shell every landmark overlay opens in: a modal dialog on paper, over a dimmed sea.
 *
 * Accessibility: `role="dialog"` with `aria-modal` and the title as its name; everything
 * outside it is `inert` while open, so neither Tab nor a screen reader's virtual cursor can
 * leave; focus moves into the dialog on open, Tab and Shift+Tab wrap inside it, Esc and the
 * close button close it, and focus returns to the opener (or `returnFocus()`).
 */
export function LandmarkOverlayHost({
  open,
  title,
  onClose,
  dir = 'ltr',
  lang,
  closeLabel = 'Close',
  returnFocus,
  lockScroll = true,
  container,
  children,
}: LandmarkOverlayHostProps) {
  const titleId = useId();
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const returnFocusRef = useRef(returnFocus);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
    returnFocusRef.current = returnFocus;
  });

  // Layout effect: the opener is captured before any child effect can move focus, and on
  // close the background is made interactive again before focus is sent back into it.
  useLayoutEffect(() => {
    if (!open) return;
    const opener = document.activeElement;
    const restoreBackground = backdropRef.current
      ? inertOutside(backdropRef.current)
      : () => undefined;
    const dialog = dialogRef.current;
    if (dialog) {
      const body = dialog.querySelector<HTMLElement>('[data-overlay-body]');
      const target =
        (body && focusableWithin(body)[0]) ??
        dialog.querySelector<HTMLElement>('[data-overlay-close]') ??
        dialog;
      target.focus();
    }
    return () => {
      restoreBackground();
      const target = isReturnableFocus(opener)
        ? opener
        : (returnFocusRef.current?.() ?? null);
      target?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open || !lockScroll) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previous;
    };
  }, [open, lockScroll]);

  if (!open) return null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCloseRef.current('escape');
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = focusableWithin(dialogRef.current);
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    const inside = active instanceof Node && dialogRef.current.contains(active);
    if (
      event.shiftKey &&
      (!inside || active === first || active === dialogRef.current)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (!inside || active === last)) {
      event.preventDefault();
      first.focus();
    }
  };

  // Pointer-down on the backdrop itself (not a drag that started inside the paper) closes.
  const onBackdropPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onCloseRef.current('backdrop');
  };

  return createPortal(
    <div
      ref={backdropRef}
      className="lmk-overlay"
      onPointerDown={onBackdropPointerDown}
    >
      <div
        ref={dialogRef}
        className="lmk-overlay__paper"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        dir={dir}
        lang={lang}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header className="lmk-overlay__header">
          <h2 id={titleId} className="lmk-overlay__title">
            {title}
          </h2>
          <button
            type="button"
            className="lmk-overlay__close"
            aria-label={closeLabel}
            data-overlay-close=""
            onClick={() => onCloseRef.current('button')}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="lmk-overlay__body" data-overlay-body="">
          {children}
        </div>
      </div>
    </div>,
    container ?? document.body,
  );
}
