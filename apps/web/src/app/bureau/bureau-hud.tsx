import type { Locale } from '@qa3elhamor/content-domain';
import {
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { fillCopy } from '../overlays/overlay-copy';
import {
  canAdvance,
  dialogueText,
  showsActions,
  type DialogueScript,
  type DialogueState,
} from '../narrators/dialogue';
import { NARRATOR_COPY } from '../narrators/narrator-copy';
import { SpeechBubble } from '../narrators/speech-bubble';
import type { BureauWords } from './bureau-copy';
import '../narrators/visit-hud.css';
import './bureau.css';

export interface BureauHudProps {
  readonly lang: Locale;
  readonly dir: 'ltr' | 'rtl';
  /** The viewport, in CSS pixels. */
  readonly width: number;
  readonly height: number;
  /** Seconds the farewell stays before it fades. */
  readonly farewellSeconds: number;
  readonly reducedMotion?: boolean;
  /** True while the landmark is open; false while the visit plays its exit. */
  readonly open: boolean;

  readonly speaker: string;
  readonly dialogue: DialogueState;
  readonly script: DialogueScript;
  readonly onTyped: () => void;
  readonly onAdvance: () => void;
  readonly onSkip: () => void;
  readonly onLeave: () => void;

  /** The scroll is out of the tube: the bubble steps aside while the visitor types. */
  readonly scrollOut: boolean;
  /** "File a complaint" (and, after one, "File another complaint"). */
  readonly onOpenScroll: () => void;
  readonly words: BureauWords;
  /** The action after a complaint is filed (`complaintAnotherLabel`). */
  readonly fileAnother: string;
  /** The bubble's tag while the President says where the bottle is going. */
  readonly filedTopic: string;

  /** Positioned by the scene every frame. */
  readonly speechRef: RefObject<HTMLDivElement | null>;
  /** On a phone: the scroll as a sheet over the scene (null elsewhere, or while it is away). */
  readonly sheet?: ReactNode;
}

/**
 * The Bureau visit's DOM over the scene: the Sardine President's speech bubble (the tour, then
 * "File a complaint" or "Back to the dive"), and on a phone the scroll's sheet. While the
 * scroll is out the bubble is gone, so nothing in it can react to the visitor's typing: the
 * bubble only ever answers keys pressed on itself.
 */
export function BureauHud({
  lang,
  dir,
  width,
  height,
  farewellSeconds,
  reducedMotion = false,
  open,
  speaker,
  dialogue,
  script,
  onTyped,
  onAdvance,
  onSkip,
  onLeave,
  scrollOut,
  onOpenScroll,
  words,
  fileAnother,
  filedTopic,
  speechRef,
  sheet,
}: BureauHudProps) {
  const kit = NARRATOR_COPY[lang];
  const text = dialogueText(dialogue, script);
  const filed = dialogue.stage === 'hint';
  const actions = filed || showsActions(dialogue, script);

  // Focus never falls to <body>: when the scroll goes back in the tube (or into the bottle) it
  // moves to the bubble's way on, and so it does when the control holding it goes away.
  const root = useRef<HTMLDivElement>(null);
  const hadFocus = useRef(false);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const wasOut = useRef(scrollOut);
  useEffect(() => {
    const putAway = wasOut.current && !scrollOut;
    wasOut.current = scrollOut;
    if (!open || scrollOut) return;
    if (!putAway && !hadFocus.current) return;
    const active = document.activeElement;
    if (!putAway && active && active !== document.body) return;
    const target =
      primaryRef.current ??
      root.current?.querySelector<HTMLElement>('.speech') ??
      null;
    target?.focus({ preventScroll: true });
  });

  const onward = <span aria-hidden="true">{dir === 'rtl' ? '‹' : '›'}</span>;
  const footer =
    dialogue.stage === 'farewell' ? null : actions ? (
      <div className="speech__actions">
        <button
          ref={primaryRef}
          type="button"
          className="speech__button speech__button--primary"
          onClick={onOpenScroll}
        >
          <span className="bureau-scroll-icon" aria-hidden="true" />
          {filed ? fileAnother : words.openScroll}
        </button>
        <button type="button" className="speech__button" onClick={onLeave}>
          {kit.leave}
        </button>
      </div>
    ) : (
      <>
        <ol
          className="speech__dots"
          aria-label={fillCopy(kit.lineOf, {
            n: dialogue.line + 1,
            total: script.lines.length,
          })}
        >
          {script.lines.map((_, i) => (
            <li
              key={i}
              className="speech__dot"
              data-on={i <= dialogue.line ? '' : undefined}
            />
          ))}
        </ol>
        <button
          type="button"
          className="speech__button speech__button--quiet"
          onClick={onSkip}
        >
          {kit.skip}
        </button>
        {canAdvance(dialogue, script) && (
          <button type="button" className="speech__button" onClick={onAdvance}>
            {kit.next} {onward}
          </button>
        )}
      </>
    );

  return (
    <div
      ref={root}
      className="visit-hud bureau-hud"
      data-stage={dialogue.stage}
      data-scroll-out={scrollOut ? '' : undefined}
      dir={dir}
      lang={lang}
      style={{ width, height } as CSSProperties}
      onFocusCapture={() => (hadFocus.current = true)}
      onBlurCapture={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node)
          hadFocus.current = root.current?.contains(next) ?? false;
      }}
    >
      {scrollOut && (
        <div className="visit-full-dim bureau-dim" aria-hidden="true" />
      )}

      {text !== null && !scrollOut && (
        <SpeechBubble
          boxRef={speechRef}
          speaker={speaker}
          topic={filed ? filedTopic : undefined}
          text={text}
          typing={dialogue.typing}
          take={dialogue.take}
          onTyped={onTyped}
          onAdvance={onAdvance}
          roleDescription={kit.bubbleRole}
          departing={!open}
          lingerSeconds={farewellSeconds}
          autofocus={open}
          reducedMotion={reducedMotion}
        >
          {footer}
        </SpeechBubble>
      )}

      {sheet}
    </div>
  );
}
