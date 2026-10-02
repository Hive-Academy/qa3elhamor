/*
 * The cinematic tour as a pure state machine: the intro, then for each stop a flight and a visit,
 * then the finale at the last stop, with the visitor able to pause, skip ahead or leave at any
 * moment. It knows stops only by index; the shell (`tour-director.tsx`) turns phases into camera
 * flights and landmark openings, and turns what the visitor does into events.
 */

/**
 * - `intro`: the title over the surface, waiting for "Begin the journey" or "Explore on my own".
 * - `flying`: the camera is travelling to `stop` (a cut, with reduced motion).
 * - `visiting`: `stop`'s landmark is open and its narrator talks hands-free.
 * - `paused`: waiting for the visitor; `resume` says what "Resume the journey" does.
 * - `finale`: the last stop's visit stays open with the closing line and "Explore freely".
 * - `free`: no tour: the ordinary dive (and, where offered, "Replay the journey").
 */
export type TourPhase =
  'intro' | 'flying' | 'visiting' | 'paused' | 'finale' | 'free';

/** Why the tour paused: the visitor asked, scrolled, closed the visit or opened another landmark. */
export type PauseReason = 'user' | 'input' | 'visit-closed' | 'visit-opened';

/** How the landmark at a stop presents: in-world talks hands-free; a dialog waits for its Close. */
export type StopPresentation = 'in-world' | 'dialog';

export interface TourState {
  readonly phase: TourPhase;
  /** The stop being flown to, visited, or (when paused) resumed at. */
  readonly stop: number;
  /** What resuming does: fly on to `stop`, or carry on with the visit open at `stop`. */
  readonly resume: 'fly' | 'visit';
  readonly reason: PauseReason | null;
  /** Bumped on every new flight: the shell's restart key, so a re-flown leg starts afresh. */
  readonly leg: number;
}

export type TourEvent =
  /** "Begin the journey" (or "Replay the journey"): from the first stop. */
  | { readonly type: 'begin' }
  /** "Explore on my own", "Skip tour", "Explore freely": the ordinary dive from here. */
  | { readonly type: 'explore' }
  /** The flight reached its stop. */
  | { readonly type: 'arrived' }
  /** The visit at `stop` has said everything (its autoplay reported it). */
  | { readonly type: 'finished'; readonly stop: number }
  /** "Next stop". */
  | { readonly type: 'next' }
  | { readonly type: 'pause'; readonly reason: 'user' | 'input' }
  | { readonly type: 'resume' }
  /** The visitor closed the open visit themselves (Esc, "Back to the dive", the dialog's Close, a scroll). */
  | { readonly type: 'visit-closed'; readonly presentation: StopPresentation }
  /** The visitor opened a landmark the tour did not (the landmark list, a click in the scene). */
  | { readonly type: 'visit-opened' };

export const initialTour = (intro: boolean): TourState => ({
  phase: intro ? 'intro' : 'free',
  stop: 0,
  resume: 'fly',
  reason: null,
  leg: 0,
});

const fly = (state: TourState, stop: number): TourState => ({
  phase: 'flying',
  stop,
  resume: 'fly',
  reason: null,
  leg: state.leg + 1,
});

const pause = (
  state: TourState,
  stop: number,
  resume: TourState['resume'],
  reason: PauseReason,
): TourState => ({ ...state, phase: 'paused', stop, resume, reason });

const free = (state: TourState): TourState => ({
  ...state,
  phase: 'free',
  reason: null,
});

/** After the visit at `state.stop`: on to the next stop, or the finale after the last. */
const onward = (state: TourState, stops: number): TourState =>
  state.stop < stops - 1
    ? fly(state, state.stop + 1)
    : { ...state, phase: 'finale', reason: null };

/**
 * The tour's transitions over `stops` stops (at least one). Events that do not apply in the
 * current phase leave the state as it is, so the shell may send them without checking.
 */
export function tourReducer(
  state: TourState,
  event: TourEvent,
  stops: number,
): TourState {
  if (stops < 1) return state.phase === 'free' ? state : free(state);
  const last = stops - 1;
  const { phase } = state;

  switch (event.type) {
    case 'begin':
      return phase === 'intro' || phase === 'free' ? fly(state, 0) : state;

    case 'explore':
      return phase === 'free' ? state : free(state);

    case 'arrived':
      return phase === 'flying' ? { ...state, phase: 'visiting' } : state;

    case 'finished':
      return phase === 'visiting' && event.stop === state.stop
        ? onward(state, stops)
        : state;

    case 'next':
      if (phase === 'flying')
        return state.stop < last ? fly(state, state.stop + 1) : state;
      if (phase === 'visiting') return onward(state, stops);
      if (phase === 'paused')
        return state.resume === 'visit'
          ? onward(state, stops)
          : fly(state, Math.min(state.stop + 1, last));
      return state;

    case 'pause':
      // A scroll during the intro is a visitor exploring on their own.
      if (phase === 'intro')
        return event.reason === 'input' ? free(state) : state;
      if (phase === 'flying')
        return pause(state, state.stop, 'fly', event.reason);
      // During a visit only the pause button counts: a scroll there closes the visit, which
      // arrives as `visit-closed`.
      if (phase === 'visiting' && event.reason === 'user')
        return pause(state, state.stop, 'visit', 'user');
      return state;

    case 'resume':
      if (phase !== 'paused') return state;
      return state.resume === 'visit'
        ? { ...state, phase: 'visiting', reason: null }
        : fly(state, state.stop);

    case 'visit-closed': {
      const visitOpen =
        phase === 'visiting' ||
        phase === 'finale' ||
        (phase === 'paused' && state.resume === 'visit');
      if (!visitOpen) return state;
      // Leaving the last stop ends the journey.
      if (phase === 'finale' || state.stop >= last) return free(state);
      // A dialog has no hands-free narration: its Close is how the visitor says "next".
      if (phase === 'visiting' && event.presentation === 'dialog')
        return fly(state, state.stop + 1);
      return pause(state, state.stop + 1, 'fly', 'visit-closed');
    }

    case 'visit-opened':
      if (phase === 'flying')
        return pause(state, state.stop, 'fly', 'visit-opened');
      if (
        phase === 'visiting' ||
        (phase === 'paused' && state.resume === 'visit')
      )
        return pause(
          state,
          Math.min(state.stop + 1, last),
          'fly',
          'visit-opened',
        );
      if (phase === 'finale') return free(state);
      return state;
  }
}

/** Whether the tour is under way (its controls show): from the first flight to the finale. */
export const tourActive = (state: TourState): boolean =>
  state.phase === 'flying' ||
  state.phase === 'visiting' ||
  state.phase === 'paused' ||
  state.phase === 'finale';

/**
 * What the visitor's choice becomes once `next` follows `previous`, to remember between visits:
 * `done` on reaching the last stop, `skipped` on leaving the intro or the tour for the free dive
 * before that; null when nothing new was decided.
 */
export function choiceAfter(
  previous: TourState,
  next: TourState,
  stops: number,
): 'done' | 'skipped' | null {
  const atLast =
    (next.phase === 'visiting' && next.stop >= stops - 1) ||
    next.phase === 'finale';
  if (atLast && !(previous.phase === next.phase && previous.stop === next.stop))
    return 'done';
  if (next.phase === 'free' && previous.phase !== 'free') {
    const reachedEnd =
      previous.phase === 'finale' ||
      (previous.stop >= stops - 1 &&
        (previous.phase === 'visiting' ||
          (previous.phase === 'paused' && previous.resume === 'visit')));
    return reachedEnd ? null : 'skipped';
  }
  return null;
}
