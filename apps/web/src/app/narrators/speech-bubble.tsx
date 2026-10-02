import { LANDMARK_AUTOFOCUS_ATTRIBUTE } from '@qa3elhamor/landmarks-ui';
import { useSfx, useVoiceBabble } from '@qa3elhamor/world-audio';
import type { VoiceProfileId } from '@qa3elhamor/world-domain';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from 'react';
import type { OceanSpeechLine, OceanSpeechLink } from './ocean-speech-link';
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
  /**
   * The speaker's babble voice (`narrator-voice.ts`), heard as the line types out. Null or
   * omitted: silent. A departing bubble is silent.
   */
  readonly voice?: VoiceProfileId | null;
  /**
   * "Say hi": a small tag on the bubble's rim that pokes the narrator, the keyboard's way to what
   * a click on the narrator does. Last in the tab order. Shown when both are given.
   */
  readonly greetLabel?: string;
  readonly onGreet?: () => void;
  /**
   * Ocean mode: the line, the name and the tail are drawn in the water by the bubble's twin
   * (`OceanSpeech`) over this box. The box stays (transparent): its text visually hidden but
   * read and focused as before, its buttons as glass pills along the drawn bubble's bottom.
   */
  readonly ocean?: OceanSpeechLink | null;
  /** The HUD's direction, for the drawn bubble's alignment. Default `ltr`. */
  readonly dir?: 'ltr' | 'rtl';
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
  voice = null,
  greetLabel,
  onGreet,
  ocean = null,
  dir = 'ltr',
}: SpeechBubbleProps) {
  const shown = useTypewriter(text, typing, take, onTyped, {
    instant: reducedMotion,
  });
  const [typed, rest] = splitTyped(text, shown);
  // The keyboard's ring on the bubble: drawn by the glass in ocean mode (a DOM outline would
  // cut through the name tag on its rim).
  const [ringed, setRinged] = useState(false);
  useOceanLine(ocean, {
    text,
    typed: shown,
    speaker,
    topic,
    departing,
    lingerSeconds,
    dir,
    ringed,
  });
  useVoiceBabble(departing ? null : voice, typed);
  usePopOnAppear(departing);
  const greets = !departing && greetLabel !== undefined && onGreet;

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
      data-ocean={ocean ? '' : undefined}
      style={{ '--speech-linger': `${lingerSeconds}s` } as CSSProperties}
      inert={departing}
      aria-hidden={departing ? true : undefined}
    >
      <section
        className="speech"
        data-greet={greets ? '' : undefined}
        aria-label={speaker}
        aria-roledescription={roleDescription}
        tabIndex={-1}
        {...(autofocus ? { [LANDMARK_AUTOFOCUS_ATTRIBUTE]: '' } : {})}
        onKeyDown={onKeyDown}
        onClick={onClick}
        onFocus={(event) =>
          setRinged(
            event.target === event.currentTarget &&
              focusVisible(event.currentTarget),
          )
        }
        onBlur={() => setRinged(false)}
      >
        <p className="speech__who">
          <span className="speech__name">{speaker}</span>
          {topic && <span className="speech__topic">{topic}</span>}
        </p>
        {/* `auto`: a line without a translation is English, and keeps its own direction. */}
        <p className="speech__line" aria-hidden="true" dir="auto">
          <span>{typed}</span>
          {typing && !reducedMotion && <span className="speech__caret" />}
          <span className="speech__rest">{rest}</span>
        </p>
        <p className="speech__spoken" aria-live="polite" dir="auto">
          {text}
        </p>
        {/* Ocean mode: the room the drawn line takes (`--ocean-text-h`, set by `OceanSpeech`). */}
        {ocean && <div className="speech__ocean" aria-hidden="true" />}
        {children && <div className="speech__footer">{children}</div>}
        {greets && (
          <button type="button" className="speech__greet" onClick={onGreet}>
            {greetLabel}
          </button>
        )}
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

/** Publishes the line to the bubble's twin in the water while in ocean mode; clears it after. */
function useOceanLine(ocean: OceanSpeechLink | null, line: OceanSpeechLine) {
  const { text, typed, speaker, topic, departing, lingerSeconds, dir, ringed } =
    line;
  useEffect(() => {
    ocean?.set({
      text,
      typed,
      speaker,
      topic,
      departing,
      lingerSeconds,
      dir,
      ringed,
    });
  }, [
    ocean,
    text,
    typed,
    speaker,
    topic,
    departing,
    lingerSeconds,
    dir,
    ringed,
  ]);
  useEffect(() => () => ocean?.set(null), [ocean]);
}

/** Whether `element`'s focus shows a ring (keyboard focus); false where the browser cannot say. */
function focusVisible(element: Element): boolean {
  try {
    return element.matches(':focus-visible');
  } catch {
    return false;
  }
}

/** The bubble's pop, once as it appears (not for one that mounts already departing). */
function usePopOnAppear(departing: boolean) {
  const { pop } = useSfx();
  const popped = useRef(false);
  useEffect(() => {
    if (popped.current || departing) return;
    popped.current = true;
    pop();
  }, [departing, pop]);
}
