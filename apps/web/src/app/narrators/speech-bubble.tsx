import { LANDMARK_AUTOFOCUS_ATTRIBUTE } from '@qa3elhamor/landmarks-ui';
import type {
  CSSProperties,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  Ref,
} from 'react';
import { splitTyped, useTypewriter } from './typewriter';
import './speech-bubble.css';

export interface SpeechBubbleProps {
  /** Who is talking: the bubble's name tag and accessible name. */
  readonly speaker: string;
  /** What about, when the narrator comments on something (a skill group's name). */
  readonly topic?: string;
  readonly text: string;
  /** True while the text types out (the narrator is talking). */
  readonly typing: boolean;
  /** Restarts the typing when it changes. */
  readonly take: number;
  readonly onTyped: () => void;
  /** Click or tap on the bubble, Space or Enter on it: finish the line, or go on. */
  readonly onAdvance: () => void;
  /** Says what a click on the bubble does, for its accessible description. */
  readonly roleDescription: string;
  /** The bubble's footer: progress, "Next", "Skip", or the closing actions. */
  readonly children?: ReactNode;
  /** The positioned box: the scene moves it over the narrator every frame. */
  readonly boxRef?: Ref<HTMLDivElement>;
  /** Leaving: shown, but out of reach and out of the accessibility tree, then fades. */
  readonly departing?: boolean;
  /** Seconds a departing bubble stays before it fades. Default 1.6. */
  readonly lingerSeconds?: number;
  /** Take focus when the stage opens (`data-landmark-autofocus`). */
  readonly autofocus?: boolean;
  /** Reduced motion: lines appear whole, no typing, no caret, no pop. */
  readonly reducedMotion?: boolean;
}

/**
 * A comic speech bubble: a name tag, a line typed out letter by letter, a footer of controls,
 * and a tail the scene points at the narrator (`--tail-x`, `--tail-len`, `--tail-skew` on the
 * box). The untyped rest of the line is laid out but invisible, so the bubble never changes
 * size while it types. Screen readers get the whole line at once, politely.
 */
export function SpeechBubble({
  speaker,
  topic,
  text,
  typing,
  take,
  onTyped,
  onAdvance,
  roleDescription,
  children,
  boxRef,
  departing = false,
  lingerSeconds = 1.6,
  autofocus = false,
  reducedMotion = false,
}: SpeechBubbleProps) {
  const shown = useTypewriter(text, typing, take, onTyped, {
    instant: reducedMotion,
  });
  const [typed, rest] = splitTyped(text, shown);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      onAdvance();
    }
  };
  const onClick = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as Element).closest('button, a')) return;
    onAdvance();
  };

  return (
    <div
      ref={boxRef}
      className="speech-box"
      data-departing={departing ? '' : undefined}
      data-reduced-motion={reducedMotion ? '' : undefined}
      style={{ '--speech-linger': `${lingerSeconds}s` } as CSSProperties}
      inert={departing}
      aria-hidden={departing ? true : undefined}
    >
      <section
        className="speech"
        aria-label={speaker}
        aria-roledescription={roleDescription}
        tabIndex={-1}
        {...(autofocus ? { [LANDMARK_AUTOFOCUS_ATTRIBUTE]: '' } : {})}
        onKeyDown={onKeyDown}
        onClick={onClick}
      >
        <p className="speech__who">
          <span className="speech__name">{speaker}</span>
          {topic && <span className="speech__topic">{topic}</span>}
        </p>
        <p className="speech__line" aria-hidden="true">
          <span>{typed}</span>
          {typing && !reducedMotion && <span className="speech__caret" />}
          <span className="speech__rest">{rest}</span>
        </p>
        <p className="speech__spoken" aria-live="polite">
          {text}
        </p>
        {children && <div className="speech__footer">{children}</div>}
      </section>
      <span className="speech__tail" aria-hidden="true">
        <svg viewBox="0 0 40 100" preserveAspectRatio="none">
          <polygon className="speech__tail-fill" points="0,0 40,0 20,100" />
          <polyline className="speech__tail-ink" points="0,2 20,100 40,2" />
        </svg>
      </span>
    </div>
  );
}
