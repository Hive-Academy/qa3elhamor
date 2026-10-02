import { describe, expect, it, vi } from 'vitest';
import {
  TOUR_STORAGE_KEY,
  type TourStop,
  type TourStorage,
} from './tour-entry';
import { createTourStore } from './tour-store';

const STOPS: TourStop[] = [
  {
    id: 'pineapple',
    waypoint: 'landmark-pineapple',
    label: { en: 'The Pineapple' },
  },
  {
    id: 'bureau',
    waypoint: 'landmark-bureau',
    label: { en: 'Complaints Bureau' },
  },
];

const memory = () => {
  const data = new Map<string, string>();
  const storage: TourStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
  return { storage, data };
};

describe('createTourStore', () => {
  it('notifies on change only', () => {
    const store = createTourStore({ stops: STOPS, intro: true, storage: null });
    const listener = vi.fn();
    store.subscribe(listener);
    store.dispatch({ type: 'arrived' });
    expect(listener).not.toHaveBeenCalled();
    store.dispatch({ type: 'begin' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('starts free when there is no intro or nothing to tour', () => {
    expect(
      createTourStore({ stops: STOPS, intro: false, storage: null }).getState()
        .phase,
    ).toBe('free');
    expect(
      createTourStore({ stops: [], intro: true, storage: null }).getState()
        .phase,
    ).toBe('free');
  });

  it('lets only the visited stop talk hands-free, and holds it while paused', () => {
    const store = createTourStore({ stops: STOPS, intro: true, storage: null });
    store.dispatch({ type: 'begin' });
    expect(store.modeFor('pineapple')).toBe('off');
    store.dispatch({ type: 'arrived' });
    expect(store.modeFor('pineapple')).toBe('playing');
    expect(store.modeFor('bureau')).toBe('off');
    store.dispatch({ type: 'pause', reason: 'user' });
    expect(store.modeFor('pineapple')).toBe('paused');
  });

  it('moves on when the visited stop reports it has finished, not another', () => {
    const store = createTourStore({ stops: STOPS, intro: true, storage: null });
    store.dispatch({ type: 'begin' });
    store.dispatch({ type: 'arrived' });
    store.finished('bureau');
    expect(store.getState().phase).toBe('visiting');
    store.finished('pineapple');
    expect(store.getState()).toMatchObject({ phase: 'flying', stop: 1 });
  });

  it('remembers skipping and finishing', () => {
    const skipped = memory();
    const a = createTourStore({
      stops: STOPS,
      intro: true,
      storage: skipped.storage,
    });
    a.dispatch({ type: 'explore' });
    expect(skipped.data.get(TOUR_STORAGE_KEY)).toBe('skipped');

    const done = memory();
    const b = createTourStore({
      stops: STOPS,
      intro: true,
      storage: done.storage,
    });
    b.dispatch({ type: 'begin' });
    b.dispatch({ type: 'next' });
    b.dispatch({ type: 'arrived' });
    expect(done.data.get(TOUR_STORAGE_KEY)).toBe('done');
    b.dispatch({ type: 'explore' });
    expect(done.data.get(TOUR_STORAGE_KEY)).toBe('done');
  });
});
