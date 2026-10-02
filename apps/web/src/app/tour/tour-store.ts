import type { AutoplayMode, VisitAutoplay } from '../narrators/visit-autoplay';
import { writeTourChoice, type TourStop, type TourStorage } from './tour-entry';
import {
  choiceAfter,
  initialTour,
  tourReducer,
  type TourEvent,
  type TourState,
} from './tour-machine';

/**
 * The tour as an external store (read with `useSyncExternalStore`): the pure machine
 * (`tour-machine.ts`) plus the two things around it, remembering the visitor's choice and
 * telling the narrated visits when to talk hands-free (`VisitAutoplay`).
 */
export interface TourStore extends VisitAutoplay {
  readonly stops: readonly TourStop[];
  readonly getState: () => TourState;
  readonly dispatch: (event: TourEvent) => void;
}

export interface TourStoreOptions {
  readonly stops: readonly TourStop[];
  /** Start at the intro; otherwise free. */
  readonly intro: boolean;
  /** Where the choice is remembered; null when storage is unavailable. */
  readonly storage: TourStorage | null;
}

export function createTourStore({
  stops,
  intro,
  storage,
}: TourStoreOptions): TourStore {
  let state = initialTour(intro && stops.length > 0);
  const listeners = new Set<() => void>();

  const dispatch = (event: TourEvent): void => {
    const next = tourReducer(state, event, stops.length);
    if (next === state) return;
    const choice = choiceAfter(state, next, stops.length);
    state = next;
    if (choice) writeTourChoice(storage, choice);
    for (const listener of listeners) listener();
  };

  const stopIdOf = (index: number): string | undefined => stops[index]?.id;

  return {
    stops,
    getState: () => state,
    dispatch,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    modeFor: (landmarkId): AutoplayMode => {
      if (stopIdOf(state.stop) !== landmarkId) return 'off';
      if (state.phase === 'visiting') return 'playing';
      if (state.phase === 'paused' && state.resume === 'visit') return 'paused';
      return 'off';
    },
    finished: (landmarkId) => {
      if (state.phase === 'visiting' && stopIdOf(state.stop) === landmarkId)
        dispatch({ type: 'finished', stop: state.stop });
    },
  };
}

/** `localStorage`, or null where touching it throws (blocked cookies, some private modes). */
export function browserTourStorage(): TourStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
