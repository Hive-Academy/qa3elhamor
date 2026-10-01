/*
 * A narrator's dialogue as a pure state machine: the tour (the landmark's lines, one bubble
 * at a time), hints that interrupt it (a comment on the object the visitor is looking at) and
 * resume it, and a farewell on leaving. The bubble types each text out; `typing` is true until
 * the typewriter reports the end (`typed`) or the visitor completes it (`advance`).
 */

/** What a narrator can say at one landmark, already in the visitor's language. */
export interface DialogueScript {
  /** The tour, in order. At least one line. */
  readonly lines: readonly string[];
  /** Comments by object id (at the Pineapple, a skill group id). */
  readonly hints: Readonly<Record<string, string>>;
  readonly farewell?: string;
}

/**
 * - `waiting`: the narrator is still swimming in; nothing is said yet.
 * - `tour`: a line of the tour (`line`).
 * - `hint`: a comment on `hint`; the tour waits at `line`.
 * - `farewell`: leaving.
 */
export type DialogueStage = 'waiting' | 'tour' | 'hint' | 'farewell';

export interface DialogueState {
  readonly stage: DialogueStage;
  /** The tour line: the current one, or the one a hint interrupted. */
  readonly line: number;
  /** The object being commented on, while `stage` is `hint`. */
  readonly hint: string | null;
  /**
   * The object the visitor picked (at the Pineapple, a skill bubble), or null. The one source of
   * truth for the selection: it is set by `select` and cleared whenever the narrator goes back
   * to the tour (`resume`, an `advance` out of a hint, `skip`) or stops talking (`farewell`).
   * An object with no hint can be selected without a comment; the tour line stays.
   */
  readonly selected: string | null;
  /** True while the current text is being typed out (the narrator is talking). */
  readonly typing: boolean;
  /** Whether the tour line had been typed out in full when a hint interrupted it. */
  readonly lineDone: boolean;
  /** Bumped whenever a text starts from the beginning: the typewriter's restart key. */
  readonly take: number;
}

export type DialogueEvent =
  /** The narrator has arrived: the tour starts. */
  | { readonly type: 'arrive' }
  /** The typewriter reached the end of the text. */
  | { readonly type: 'typed' }
  /** Click or tap on the bubble, Space, Enter, or "Next": finish the line, or go on. */
  | { readonly type: 'advance' }
  /** Straight to the tour's last line, in full (its actions show). */
  | { readonly type: 'skip' }
  /** The visitor picked an object: select it, and comment on it if it has a hint. */
  | { readonly type: 'select'; readonly id: string }
  /** Back from a hint to the tour line it interrupted. */
  | { readonly type: 'resume' }
  /** The visitor is leaving. */
  | { readonly type: 'farewell' }
  /** Gone: back to the start for the next visit. */
  | { readonly type: 'reset' };

export const INITIAL_DIALOGUE: DialogueState = {
  stage: 'waiting',
  line: 0,
  hint: null,
  selected: null,
  typing: false,
  lineDone: false,
  take: 0,
};

const lastLine = (script: DialogueScript): number =>
  Math.max(script.lines.length - 1, 0);

/** Starts `next` typing from its first character. */
const speak = (
  state: DialogueState,
  next: Partial<DialogueState>,
): DialogueState => ({
  ...state,
  ...next,
  typing: true,
  take: state.take + 1,
});

export function dialogueReducer(
  state: DialogueState,
  event: DialogueEvent,
  script: DialogueScript,
): DialogueState {
  switch (event.type) {
    case 'arrive':
      if (state.stage === 'tour' || state.stage === 'hint') return state;
      return speak(
        { ...INITIAL_DIALOGUE, take: state.take },
        { stage: 'tour' },
      );

    case 'typed':
      return state.typing ? { ...state, typing: false } : state;

    case 'advance':
      if (state.stage === 'waiting' || state.stage === 'farewell') return state;
      if (state.typing) return { ...state, typing: false };
      if (state.stage === 'hint')
        return dialogueReducer(state, { type: 'resume' }, script);
      if (state.line < lastLine(script))
        return speak(state, { line: state.line + 1 });
      return state;

    case 'skip':
      if (state.stage !== 'tour' && state.stage !== 'hint') return state;
      return {
        ...state,
        stage: 'tour',
        hint: null,
        selected: null,
        line: lastLine(script),
        typing: false,
        lineDone: true,
        take: state.take + 1,
      };

    case 'select': {
      if (state.stage !== 'tour' && state.stage !== 'hint') return state;
      if (state.selected === event.id) return state;
      if (!(event.id in script.hints)) {
        // Nothing to say about it: back to the tour line (if a comment on another was showing),
        // with this one selected, so its skills still show.
        const tour =
          state.stage === 'hint'
            ? dialogueReducer(state, { type: 'resume' }, script)
            : state;
        return { ...tour, selected: event.id };
      }
      const lineDone = state.stage === 'tour' ? !state.typing : state.lineDone;
      return speak(state, {
        stage: 'hint',
        hint: event.id,
        selected: event.id,
        lineDone,
      });
    }

    case 'resume':
      if (state.stage !== 'hint') return state;
      // A line the visitor had already read comes back whole; an interrupted one starts again.
      return state.lineDone
        ? {
            ...state,
            stage: 'tour',
            hint: null,
            selected: null,
            typing: false,
            take: state.take + 1,
          }
        : speak(state, { stage: 'tour', hint: null, selected: null });

    case 'farewell':
      if (state.stage === 'farewell') return state;
      if (script.farewell === undefined)
        return { ...INITIAL_DIALOGUE, take: state.take + 1 };
      return speak(state, { stage: 'farewell', hint: null, selected: null });

    case 'reset':
      return { ...INITIAL_DIALOGUE, take: state.take + 1 };
  }
}

/** The text in the bubble, or null when there is no bubble. */
export function dialogueText(
  state: DialogueState,
  script: DialogueScript,
): string | null {
  switch (state.stage) {
    case 'waiting':
      return null;
    case 'tour':
      return script.lines[state.line] ?? null;
    case 'hint':
      return (state.hint !== null && script.hints[state.hint]) || null;
    case 'farewell':
      return script.farewell ?? null;
  }
}

/** The tour's last line, typed out: the bubble offers its actions (the full card, leave). */
export const showsActions = (
  state: DialogueState,
  script: DialogueScript,
): boolean =>
  state.stage === 'tour' && state.line === lastLine(script) && !state.typing;

/** Whether "Next" has somewhere to go: a line to finish, a later line, or a tour to resume. */
export const canAdvance = (
  state: DialogueState,
  script: DialogueScript,
): boolean =>
  state.stage === 'hint' ||
  (state.stage === 'tour' && (state.typing || state.line < lastLine(script)));
