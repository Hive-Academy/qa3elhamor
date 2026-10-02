import { describe, expect, it } from 'vitest';
import {
  choiceAfter,
  initialTour,
  tourActive,
  tourReducer,
  type TourEvent,
  type TourState,
} from './tour-machine';

const STOPS = 3;
const run = (
  events: readonly TourEvent[],
  from: TourState = initialTour(true),
  stops = STOPS,
) => events.reduce((state, event) => tourReducer(state, event, stops), from);

const begin: TourEvent = { type: 'begin' };
const arrived: TourEvent = { type: 'arrived' };
const finished = (stop: number): TourEvent => ({ type: 'finished', stop });

describe('tourReducer', () => {
  it('starts at the intro, or free when there is none', () => {
    expect(initialTour(true).phase).toBe('intro');
    expect(initialTour(false).phase).toBe('free');
  });

  it('flies to each stop, visits it, and ends in the finale at the last', () => {
    let state = run([begin]);
    expect(state).toMatchObject({ phase: 'flying', stop: 0, leg: 1 });
    state = run([arrived], state);
    expect(state).toMatchObject({ phase: 'visiting', stop: 0 });
    state = run([finished(0)], state);
    expect(state).toMatchObject({ phase: 'flying', stop: 1, leg: 2 });
    state = run([arrived, finished(1), arrived, finished(2)], state);
    expect(state).toMatchObject({ phase: 'finale', stop: 2 });
    expect(run([{ type: 'explore' }], state).phase).toBe('free');
  });

  it('ignores a finished report from another stop', () => {
    const visiting = run([begin, arrived]);
    expect(run([finished(1)], visiting)).toBe(visiting);
  });

  it('explores on its own from the intro, by the button or by scrolling', () => {
    expect(run([{ type: 'explore' }]).phase).toBe('free');
    expect(run([{ type: 'pause', reason: 'input' }]).phase).toBe('free');
    expect(run([{ type: 'pause', reason: 'user' }]).phase).toBe('intro');
  });

  it('pauses a flight where it is and flies the same leg again on resume', () => {
    const paused = run([begin, { type: 'pause', reason: 'input' }]);
    expect(paused).toMatchObject({
      phase: 'paused',
      stop: 0,
      resume: 'fly',
      reason: 'input',
    });
    expect(run([{ type: 'resume' }], paused)).toMatchObject({
      phase: 'flying',
      stop: 0,
      leg: 2,
    });
  });

  it('pauses a visit with it still open, and carries on with it', () => {
    const visiting = run([begin, arrived]);
    expect(run([{ type: 'pause', reason: 'input' }], visiting)).toBe(visiting);
    const paused = run([{ type: 'pause', reason: 'user' }], visiting);
    expect(paused).toMatchObject({ phase: 'paused', resume: 'visit', stop: 0 });
    expect(run([{ type: 'resume' }], paused)).toMatchObject({
      phase: 'visiting',
      stop: 0,
    });
  });

  it('skips ahead with Next from a flight, a visit or a pause', () => {
    expect(run([begin, { type: 'next' }])).toMatchObject({
      phase: 'flying',
      stop: 1,
    });
    expect(run([begin, arrived, { type: 'next' }])).toMatchObject({
      phase: 'flying',
      stop: 1,
    });
    expect(
      run([
        begin,
        arrived,
        { type: 'pause', reason: 'user' },
        { type: 'next' },
      ]),
    ).toMatchObject({ phase: 'flying', stop: 1 });
    // The last flight has nowhere further to go; the last visit goes to the finale.
    const lastFlight = run([begin, { type: 'next' }, { type: 'next' }]);
    expect(lastFlight).toMatchObject({ phase: 'flying', stop: 2 });
    expect(run([{ type: 'next' }], lastFlight)).toBe(lastFlight);
    expect(run([arrived, { type: 'next' }], lastFlight).phase).toBe('finale');
  });

  it('pauses on the next stop when the visitor closes an in-world visit', () => {
    const closed = run([
      begin,
      arrived,
      { type: 'visit-closed', presentation: 'in-world' },
    ]);
    expect(closed).toMatchObject({
      phase: 'paused',
      stop: 1,
      resume: 'fly',
      reason: 'visit-closed',
    });
    expect(run([{ type: 'resume' }], closed)).toMatchObject({
      phase: 'flying',
      stop: 1,
    });
  });

  it('treats closing a dialog as "next stop"', () => {
    const closed = run([
      begin,
      arrived,
      { type: 'visit-closed', presentation: 'dialog' },
    ]);
    expect(closed).toMatchObject({ phase: 'flying', stop: 1 });
  });

  it('ends the journey when the last stop is closed, in the finale or before it', () => {
    const atLast = run([begin, { type: 'next' }, { type: 'next' }, arrived]);
    expect(
      run([{ type: 'visit-closed', presentation: 'dialog' }], atLast).phase,
    ).toBe('free');
    const finale = run([finished(2)], atLast);
    expect(finale.phase).toBe('finale');
    expect(
      run([{ type: 'visit-closed', presentation: 'in-world' }], finale).phase,
    ).toBe('free');
  });

  it('pauses when the visitor opens a landmark of their own', () => {
    expect(run([begin, { type: 'visit-opened' }])).toMatchObject({
      phase: 'paused',
      stop: 0,
      reason: 'visit-opened',
    });
    expect(run([begin, arrived, { type: 'visit-opened' }])).toMatchObject({
      phase: 'paused',
      stop: 1,
      resume: 'fly',
    });
  });

  it('replays from the free dive', () => {
    const free = run([{ type: 'explore' }]);
    expect(run([begin], free)).toMatchObject({ phase: 'flying', stop: 0 });
  });

  it('ignores events that do not apply', () => {
    const intro = initialTour(true);
    for (const event of [
      arrived,
      finished(0),
      { type: 'next' },
      { type: 'resume' },
    ] as const)
      expect(run([event], intro)).toBe(intro);
    const free = initialTour(false);
    expect(run([{ type: 'visit-closed', presentation: 'dialog' }], free)).toBe(
      free,
    );
  });

  it('has nothing to tour with no stops', () => {
    expect(run([begin], initialTour(true), 0).phase).toBe('free');
  });
});

describe('tourActive', () => {
  it('is true from the first flight to the finale', () => {
    expect(tourActive(initialTour(true))).toBe(false);
    expect(tourActive(run([begin]))).toBe(true);
    expect(tourActive(run([begin, { type: 'pause', reason: 'user' }]))).toBe(
      true,
    );
    expect(tourActive(run([{ type: 'explore' }]))).toBe(false);
  });
});

describe('choiceAfter', () => {
  const step = (from: TourState, event: TourEvent) =>
    [from, tourReducer(from, event, STOPS)] as const;

  it('remembers "skipped" for leaving the intro or the tour early', () => {
    expect(
      choiceAfter(...step(initialTour(true), { type: 'explore' }), STOPS),
    ).toBe('skipped');
    expect(
      choiceAfter(...step(run([begin, arrived]), { type: 'explore' }), STOPS),
    ).toBe('skipped');
  });

  it('remembers "done" on reaching the last stop, and nothing more after it', () => {
    const lastFlight = run([begin, { type: 'next' }, { type: 'next' }]);
    expect(choiceAfter(...step(lastFlight, arrived), STOPS)).toBe('done');
    const finale = run([arrived, finished(2)], lastFlight);
    expect(choiceAfter(...step(finale, { type: 'explore' }), STOPS)).toBeNull();
  });

  it('decides nothing on ordinary steps', () => {
    expect(choiceAfter(...step(initialTour(true), begin), STOPS)).toBeNull();
    expect(choiceAfter(...step(run([begin]), arrived), STOPS)).toBeNull();
  });
});
