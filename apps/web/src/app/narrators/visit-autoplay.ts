import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from 'react';
import {
  canAdvance,
  dialogueText,
  showsActions,
  type DialogueEvent,
  type DialogueScript,
  type DialogueState,
} from './dialogue';

/*
 * Hands-free visits. Something outside the visit (the cinematic tour, `app/tour/`) can ask a
 * narrator to move on by itself: after a line has finished typing it waits a reading time, then
 * goes to the next line; after the last line (and a dwell for the landmark's content) it reports
 * the visit finished. The visitor's own controls keep working throughout, and without a provider
 * nothing changes: every visit is manual, as before.
 */

/** `playing`: lines advance by themselves. `paused`: they wait. `off`: the visit is manual. */
export type AutoplayMode = 'off' | 'playing' | 'paused';

/** What a visit needs from whoever drives it hands-free. An external store, by landmark id. */
export interface VisitAutoplay {
  readonly subscribe: (listener: () => void) => () => void;
  readonly modeFor: (landmarkId: string) => AutoplayMode;
  /** The visit at `landmarkId` has said everything and shown its content. */
  readonly finished: (landmarkId: string) => void;
}

export const VisitAutoplayContext = createContext<VisitAutoplay | null>(null);

/** Reading time for a line once typed: 900 ms plus 45 ms a character, between 2 s and 7 s. */
export const READING_TIME = {
  baseMs: 900,
  perCharMs: 45,
  minMs: 2000,
  maxMs: 7000,
} as const;

/** How long a line stays up after it is typed, in ms. Arabic and English alike, by characters. */
export function readingMs(text: string): number {
  const ms =
    READING_TIME.baseMs + READING_TIME.perCharMs * Array.from(text).length;
  return Math.min(READING_TIME.maxMs, Math.max(READING_TIME.minMs, ms));
}

/** Extra time on the last line of an object tour, for the skill bubbles, tablets or menu. */
export const CONTENT_DWELL_MS = 3200;

export type AutoplayStep =
  | { readonly kind: 'advance'; readonly afterMs: number }
  | { readonly kind: 'finish'; readonly afterMs: number };

/**
 * What a hands-free visit does next from `dialogue`, or null to wait: nothing while the narrator
 * is arriving, typing or saying goodbye; after a typed line, the next line (a comment on an
 * object goes back to the tour the same way) once it has been read; after the typed last line,
 * finish, once it has been read and the content has had `contentDwellMs`.
 */
export function autoplayStep(
  dialogue: DialogueState,
  script: DialogueScript,
  contentDwellMs: number,
): AutoplayStep | null {
  if (dialogue.stage !== 'tour' && dialogue.stage !== 'hint') return null;
  if (dialogue.typing) return null;
  const read = readingMs(dialogueText(dialogue, script) ?? '');
  if (canAdvance(dialogue, script)) return { kind: 'advance', afterMs: read };
  if (showsActions(dialogue, script))
    return { kind: 'finish', afterMs: read + contentDwellMs };
  return null;
}

const OFF = (): AutoplayMode => 'off';
const NONE = () => () => undefined;

export interface VisitAutoplayOptions {
  /** The visitor has opened something the narrator waits on (the full view, the form). */
  readonly held: boolean;
  /** `CONTENT_DWELL_MS` for an object tour; 0 where there is nothing to look at. */
  readonly contentDwellMs: number;
}

/**
 * Drives one visit hands-free while its autoplay is `playing` (`VisitAutoplayContext`), with one
 * timer at a time. Returns the mode, for anything that wants to show it.
 */
export function useVisitAutoplay(
  landmarkId: string,
  dialogue: DialogueState,
  script: DialogueScript,
  dispatch: (event: DialogueEvent) => void,
  { held, contentDwellMs }: VisitAutoplayOptions,
): AutoplayMode {
  const autoplay = useContext(VisitAutoplayContext);
  const read = autoplay ? () => autoplay.modeFor(landmarkId) : OFF;
  const mode = useSyncExternalStore(autoplay?.subscribe ?? NONE, read, read);
  const step =
    mode === 'playing' && !held
      ? autoplayStep(dialogue, script, contentDwellMs)
      : null;
  const kind = step?.kind ?? null;
  const afterMs = step?.afterMs ?? 0;
  // `take` changes whenever a text starts over, so each line gets its own reading time.
  const take = dialogue.take;

  useEffect(() => {
    if (kind === null || !autoplay) return undefined;
    const timer = window.setTimeout(() => {
      if (kind === 'advance') dispatch({ type: 'advance' });
      else autoplay.finished(landmarkId);
    }, afterMs);
    return () => window.clearTimeout(timer);
  }, [kind, afterMs, take, autoplay, landmarkId, dispatch]);

  return mode;
}
