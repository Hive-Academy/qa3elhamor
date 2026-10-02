import { useState } from 'react';
import { TOUR } from '../../site.config';
import {
  readTourChoice,
  tourEntry,
  tourParam,
  type TourEntry,
  type TourStop,
} from './tour-entry';
import {
  browserTourStorage,
  createTourStore,
  type TourStore,
} from './tour-store';

/**
 * The page's tour, decided once when the dive mounts: the intro for a first visit (or
 * `?tour=on`), the replay button for a returning visitor, nothing with `?tour=off`, with
 * `TOUR.enabled: false`, or in an automated browser (the end-to-end suite).
 */
export function useTourSetup(stops: readonly TourStop[]): {
  readonly store: TourStore;
  readonly entry: TourEntry;
} {
  const [setup] = useState(() => {
    const storage = browserTourStorage();
    const entry = tourEntry({
      enabled: TOUR.enabled && stops.length > 0,
      param: tourParam(window.location.search),
      automated:
        typeof navigator !== 'undefined' && navigator.webdriver === true,
      stored: readTourChoice(storage),
    });
    return {
      entry,
      store: createTourStore({ stops, intro: entry === 'intro', storage }),
    };
  });
  return setup;
}
