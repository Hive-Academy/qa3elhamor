import type { CloseReason } from '@qa3elhamor/landmarks-domain';
import { useEffect, useLayoutEffect, useRef, type Ref } from 'react';
import { isReturnableFocus } from './focus-management.js';
import './landmark-stage.css';

/** Mark the element an in-world scene wants focus on once its DOM is in the stage. */
export const LANDMARK_AUTOFOCUS_ATTRIBUTE = 'data-landmark-autofocus';

/** Page scroll, in CSS pixels, that counts as "scrolling away" from an open stage. */
export const DEFAULT_LEAVE_SCROLL_PX = 64;

/**
 * After a text field in the scene loses focus, page scroll stays "not leaving" this long (ms):
 * an on-screen keyboard closing scrolls the page back.
 */
export const TEXT_ENTRY_SCROLL_GRACE_MS = 1000;

const NOT_TYPED_INTO = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/** Whether `element` takes typed text (and so may raise an on-screen keyboard or an IME). */
export function isTextEntry(element: Element | EventTarget | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  )
    return true;
  if (element instanceof HTMLInputElement)
    return !NOT_TYPED_INTO.has(element.type.toLowerCase());
  return element.isContentEditable === true;
}

/** An Escape that belongs to an IME (cancelling a composition), not to the page. */
export const isComposingKey = (event: KeyboardEvent): boolean =>
  event.isComposing || event.keyCode === 229;

export interface LandmarkStageProps {
  readonly open: boolean;
  /**
   * The open landmark's id. Opening another landmark straight from this one (a switch) is a
   * new opening of the same stage: focus moves to the new scene, and the eventual close still
   * returns it to whatever opened the first one.
   */
  readonly openId?: string;
  /** The landmark's name, shown in the bar and used as the region's accessible name. */
  readonly title: string;
  readonly onClose: (reason: CloseReason) => void;
  /** The leave button's text. Default "Back to the dive". */
  readonly closeLabel?: string;
  /** Optional one-line hint, e.g. "Hover a dish to look closer". */
  readonly hint?: string;
  readonly dir?: 'ltr' | 'rtl';
  readonly lang?: string;
  /** Where focus goes on close when the opener cannot take it back; see the dialog host. */
  readonly returnFocus?: () => HTMLElement | null;
  /**
   * Receives the scene slot: a full-viewport element outside the canvas, inside the stage's
   * region, where an in-world scene mounts its real DOM (drei `<Html portal>`). It exists for
   * the stage's whole life, open or not, so a scene can play an exit after closing.
   */
  readonly sceneLayerRef?: Ref<HTMLDivElement>;
  /**
   * Closes with reason `scroll` once the page has scrolled this many pixels while open, so
   * scrolling on is a way out. `false` turns it off. Default `DEFAULT_LEAVE_SCROLL_PX`.
   * Suspended while a text field in the scene has focus (and for
   * `TEXT_ENTRY_SCROLL_GRACE_MS` after): an on-screen keyboard scrolls the page (iOS Safari)
   * without the visitor meaning to leave.
   */
  readonly leaveOnScroll?: number | false;
}

/**
 * The DOM side of a landmark that presents in the scene (`in-world`) or not at all (`none`):
 * a non-modal, named region holding the scene's DOM slot and a small bar with a way back to
 * the dive. The scene stays interactive, so nothing is made inert.
 *
 * Focus: on open it moves to the leave button, so keyboard users land somewhere meaningful at
 * once; when the scene's DOM arrives with an element marked `data-landmark-autofocus` and focus
 * has not moved since, focus goes there instead. Esc anywhere on the page closes (not one the
 * scene already handled, nor one cancelling an IME composition), as does scrolling the page
 * away (`leaveOnScroll`, suspended while the visitor types in the scene, whose on-screen
 * keyboard may scroll the page). On close, focus returns to the opener (or
 * `returnFocus()`), unless something newer has taken it: a switch to another landmark in this
 * stage, or a modal dialog that opened in its place.
 */
export function LandmarkStage({
  open,
  openId,
  title,
  onClose,
  closeLabel = 'Back to the dive',
  hint,
  dir,
  lang,
  returnFocus,
  sceneLayerRef,
  leaveOnScroll = DEFAULT_LEAVE_SCROLL_PX,
}: LandmarkStageProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const slotRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<Element | null>(null);
  /** Bumped on every opening, so a superseded opening's cleanup can tell it lost. */
  const generation = useRef(0);
  /** The opener, handed from an opening that closed to one that switched in after it. */
  const handoff = useRef<Element | null>(null);
  const session = open ? (openId ?? '') : null;
  const onCloseRef = useRef(onClose);
  const returnFocusRef = useRef(returnFocus);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
    returnFocusRef.current = returnFocus;
  });

  useLayoutEffect(() => {
    if (session === null) return;
    generation.current += 1;
    const button = buttonRef.current;
    // The opener is what has focus now, unless that is this stage's own departing content
    // (a switch made from inside the old scene, or from the canvas): then the first opener.
    const active = document.activeElement;
    const own =
      active === null ||
      active === document.body ||
      active === button ||
      Boolean(slotRef.current?.contains(active));
    const opener = own ? (handoff.current ?? active) : active;
    handoff.current = null;
    button?.focus({ preventScroll: true });

    // The scene's DOM arrives from another React root (the canvas), a frame or two later.
    const slot = slotRef.current;
    const candidates = () =>
      Array.from(
        slot?.querySelectorAll<HTMLElement>(
          `[${LANDMARK_AUTOFOCUS_ATTRIBUTE}]`,
        ) ?? [],
      );
    // On a switch the previous scene is still live in the slot for a moment (it turns inert
    // as it leaves): never focus it. A scene that is inert now may be this one re-opening.
    const previous = new Set(
      candidates().filter((element) => !element.closest('[inert]')),
    );
    const moveIntoScene = (): boolean => {
      const target = candidates().find(
        (element) => !previous.has(element) && !element.closest('[inert]'),
      );
      if (!target) return false;
      const active = document.activeElement;
      if (active === button || active === document.body || active === null)
        target.focus({ preventScroll: true });
      return true;
    };
    let observer: MutationObserver | null = null;
    if (slot && !moveIntoScene() && typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(() => {
        if (moveIntoScene()) observer?.disconnect();
      });
      observer.observe(slot, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['inert', LANDMARK_AUTOFOCUS_ATTRIBUTE],
      });
    }

    openerRef.current = opener;
    return () => {
      observer?.disconnect();
      handoff.current = openerRef.current;
    };
  }, [session]);

  // Focus goes back in a passive cleanup, after the commit: the scene's DOM can outlive the
  // stage (an exit animation), and React restores focus after a commit to a focused element
  // that is still in the document, which would pull it back into the departing scene.
  useEffect(() => {
    if (session === null) return;
    const mine = generation.current;
    return () => {
      // Superseded by a switch within this stage: the new opening owns focus (and the opener).
      if (generation.current !== mine) return;
      handoff.current = null;
      // A modal dialog opened in this one's place (a switch to a dialog landmark) and has
      // already moved focus inside itself.
      if (document.activeElement?.closest('[aria-modal="true"]')) return;
      const opener = openerRef.current;
      const target = isReturnableFocus(opener)
        ? opener
        : (returnFocusRef.current?.() ?? null);
      target?.focus({ preventScroll: true });
    };
  }, [session]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      // An Escape that cancels an IME composition is the input method's, not a way out.
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !isComposingKey(event)
      )
        onCloseRef.current('escape');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open || leaveOnScroll === false) return;
    let start = window.scrollY;
    let typingUntil = 0;
    const inScene = (target: EventTarget | null): boolean =>
      target instanceof Node && Boolean(slotRef.current?.contains(target));
    const typing = (): boolean => {
      const active = document.activeElement;
      return (
        (isTextEntry(active) && inScene(active)) ||
        performance.now() < typingUntil
      );
    };
    const onFocusOut = (event: FocusEvent) => {
      if (isTextEntry(event.target) && inScene(event.target))
        typingUntil = performance.now() + TEXT_ENTRY_SCROLL_GRACE_MS;
    };
    const onScroll = () => {
      // The keyboard moved the page, not the visitor: measure from here on.
      if (typing()) {
        start = window.scrollY;
        return;
      }
      if (Math.abs(window.scrollY - start) >= leaveOnScroll)
        onCloseRef.current('scroll');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('focusout', onFocusOut, true);
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('focusout', onFocusOut, true);
    };
  }, [open, leaveOnScroll]);

  const setSlot = (element: HTMLDivElement | null) => {
    slotRef.current = element;
    if (typeof sceneLayerRef === 'function') sceneLayerRef(element);
    else if (sceneLayerRef) sceneLayerRef.current = element;
  };

  return (
    <div
      className="lmk-stage"
      data-open={open ? '' : undefined}
      role={open ? 'region' : undefined}
      aria-label={open ? title : undefined}
      dir={dir}
      lang={lang}
    >
      <div ref={setSlot} className="lmk-stage__scene" />
      {open && (
        <div className="lmk-return">
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
            <span className="lmk-return__ping" aria-hidden="true" />
            {closeLabel}
          </button>
        </div>
      )}
    </div>
  );
}
