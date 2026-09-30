import { describe, expect, it, vi } from 'vitest';
import {
  IDLE,
  LandmarkInteraction,
  transition,
  type LandmarkEffect,
  type LandmarkInteractionState,
} from './landmark-interaction.js';

const hovered = (
  id: string,
  source: 'pointer' | 'keyboard' = 'pointer',
): LandmarkInteractionState => ({
  phase: 'hovered',
  id,
  source,
});
const focused = (
  id: string,
  source: 'pointer' | 'keyboard' = 'pointer',
): LandmarkInteractionState => ({
  phase: 'focused',
  id,
  source,
});

describe('transition', () => {
  it('walks idle -> hovered -> focused -> idle', () => {
    const a = transition(IDLE, {
      type: 'hover',
      id: 'tiki',
      source: 'pointer',
    });
    expect(a).toEqual(hovered('tiki'));
    const b = transition(a, {
      type: 'activate',
      id: 'tiki',
      source: 'pointer',
    });
    expect(b).toEqual(focused('tiki'));
    expect(transition(b, { type: 'close', reason: 'escape' })).toBe(IDLE);
  });

  it('gives keyboard the same path as the pointer', () => {
    const a = transition(IDLE, {
      type: 'hover',
      id: 'tiki',
      source: 'keyboard',
    });
    const b = transition(a, {
      type: 'activate',
      id: 'tiki',
      source: 'keyboard',
    });
    expect(b).toEqual(focused('tiki', 'keyboard'));
  });

  it('opens straight from idle (touch, list buttons)', () => {
    expect(
      transition(IDLE, { type: 'activate', id: 'bureau', source: 'pointer' }),
    ).toEqual(focused('bureau'));
  });

  it('moves the hover between landmarks and only unhovers the hovered one', () => {
    const a = transition(hovered('tiki'), {
      type: 'hover',
      id: 'bureau',
      source: 'pointer',
    });
    expect(a).toEqual(hovered('bureau'));
    expect(transition(a, { type: 'unhover', id: 'tiki' })).toBe(a);
    expect(transition(a, { type: 'unhover', id: 'bureau' })).toBe(IDLE);
  });

  it('ignores hover and re-activation while focused, and close while nothing is', () => {
    const open = focused('tiki');
    expect(
      transition(open, { type: 'hover', id: 'bureau', source: 'pointer' }),
    ).toBe(open);
    expect(
      transition(open, { type: 'activate', id: 'tiki', source: 'pointer' }),
    ).toBe(open);
    expect(transition(open, { type: 'unhover', id: 'tiki' })).toBe(open);
    const h = hovered('tiki');
    expect(transition(h, { type: 'close', reason: 'button' })).toBe(h);
  });

  it('switches straight from one focused landmark to another', () => {
    expect(
      transition(focused('tiki'), {
        type: 'activate',
        id: 'bureau',
        source: 'keyboard',
      }),
    ).toEqual(focused('bureau', 'keyboard'));
  });
});

describe('LandmarkInteraction', () => {
  const setup = () => {
    const effects: LandmarkEffect[] = [];
    const store = new LandmarkInteraction(
      (id) => ['tiki', 'bureau'].includes(id),
      (e) => effects.push(e),
    );
    const listener = vi.fn();
    store.subscribe(listener);
    return { store, effects, listener };
  };

  it('emits hover, open and close effects once each and notifies on change only', () => {
    const { store, effects, listener } = setup();
    store.dispatch({ type: 'hover', id: 'tiki', source: 'pointer' });
    store.dispatch({ type: 'hover', id: 'tiki', source: 'pointer' });
    store.dispatch({ type: 'activate', id: 'tiki', source: 'pointer' });
    store.dispatch({ type: 'close', reason: 'escape' });
    expect(effects).toEqual([
      { type: 'hover', id: 'tiki', source: 'pointer' },
      { type: 'open', id: 'tiki', source: 'pointer' },
      { type: 'close', id: 'tiki', reason: 'escape' },
    ]);
    expect(listener).toHaveBeenCalledTimes(3);
    expect(store.getState()).toBe(IDLE);
  });

  it('closes the old landmark with reason switch before opening the new one', () => {
    const { store, effects } = setup();
    store.dispatch({ type: 'activate', id: 'tiki', source: 'pointer' });
    store.dispatch({ type: 'activate', id: 'bureau', source: 'pointer' });
    expect(effects).toEqual([
      { type: 'open', id: 'tiki', source: 'pointer' },
      { type: 'close', id: 'tiki', reason: 'switch' },
      { type: 'open', id: 'bureau', source: 'pointer' },
    ]);
  });

  it('does not emit hover when a hover ends', () => {
    const { store, effects } = setup();
    store.dispatch({ type: 'hover', id: 'tiki', source: 'pointer' });
    store.dispatch({ type: 'unhover', id: 'tiki' });
    expect(effects).toHaveLength(1);
  });

  it('ignores unknown landmarks', () => {
    const { store, effects, listener } = setup();
    store.dispatch({ type: 'activate', id: 'atlantis', source: 'keyboard' });
    expect(store.getState()).toBe(IDLE);
    expect(effects).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('stops notifying after unsubscribe', () => {
    const { store } = setup();
    const late = vi.fn();
    const off = store.subscribe(late);
    off();
    store.dispatch({ type: 'hover', id: 'bureau', source: 'keyboard' });
    expect(late).not.toHaveBeenCalled();
  });
});
