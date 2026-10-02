import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { VisitAutoplayContext } from '../narrators/visit-autoplay';
import type { TourEntry } from './tour-entry';
import type { TourState } from './tour-machine';
import type { TourStore } from './tour-store';

interface TourContextValue {
  readonly store: TourStore;
  readonly entry: TourEntry;
}

const TourContext = createContext<TourContextValue | null>(null);

/**
 * Provides the page's tour to its chrome and, as their `VisitAutoplay`, to the narrated visits
 * (R3F bridges both contexts into the canvas).
 */
export function TourProvider({
  store,
  entry,
  children,
}: TourContextValue & { readonly children?: ReactNode }) {
  const value = useMemo(() => ({ store, entry }), [store, entry]);
  return (
    <TourContext.Provider value={value}>
      <VisitAutoplayContext.Provider value={store}>
        {children}
      </VisitAutoplayContext.Provider>
    </TourContext.Provider>
  );
}

export function useTour(): TourContextValue {
  const value = useContext(TourContext);
  if (!value)
    throw new Error('Tour components must be rendered inside <TourProvider>.');
  return value;
}

/**
 * Subscribes to part of the tour's state. The selector must return a primitive or a stable
 * reference; the component re-renders only when that value changes.
 */
export function useTourState<T>(selector: (state: TourState) => T): T {
  const { store } = useTour();
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}
