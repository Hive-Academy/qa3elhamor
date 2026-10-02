import { describe, expect, it, vi } from 'vitest';
import { RESIDENT_SCALE_RANGE, type ResidentPlacement } from '../narrators.config';
import {
  FRAME_AXES,
  PLACEMENT_STEP,
  createPlacementStore,
  nudgePlacement,
  placeModeFor,
  placementSnippet,
} from './placement-edit';

const AT: ResidentPlacement = { offset: [0.1, 0, 0.2], facing: 'camera', scale: 1 };

describe('placeModeFor', () => {
  it('reads ?place=resident in development only', () => {
    expect(placeModeFor('?place=resident', true)).toBe('resident');
    expect(placeModeFor('?quality=high&place=resident', true)).toBe('resident');
    expect(placeModeFor('?place=resident', false)).toBeNull();
    expect(placeModeFor('?place=landmark', true)).toBeNull();
    expect(placeModeFor('', true)).toBeNull();
  });
});

describe('nudgePlacement', () => {
  it('moves along the ground axes it is given, finer with Shift', () => {
    expect(nudgePlacement(AT, 'ArrowRight', false)?.offset).toEqual([0.105, 0, 0.2]);
    expect(nudgePlacement(AT, 'ArrowUp', true)?.offset).toEqual([0.1, 0, 0.2 - PLACEMENT_STEP.fineMove]);
    const axes = { right: [0, 1], forward: [1, 0] } as const;
    expect(nudgePlacement(AT, 'ArrowUp', false, axes)?.offset).toEqual([0.105, 0, 0.2]);
    expect(nudgePlacement(AT, 'ArrowLeft', false, axes)?.offset).toEqual([0.1, 0, 0.2 - PLACEMENT_STEP.move]);
  });

  it('raises and lowers with PageUp / PageDown', () => {
    expect(nudgePlacement(AT, 'PageUp', false)?.offset[1]).toBe(PLACEMENT_STEP.move);
    expect(nudgePlacement(AT, 'PageDown', true)?.offset[1]).toBe(-PLACEMENT_STEP.fineMove);
  });

  it('turns from the heading it shows when it faces the camera, wrapping at 180', () => {
    expect(nudgePlacement(AT, 'q', false, FRAME_AXES, 40)?.facing).toBe(45);
    expect(nudgePlacement({ ...AT, facing: 178 }, 'Q', false)?.facing).toBe(-177);
    expect(nudgePlacement({ ...AT, facing: 10 }, 'e', true)?.facing).toBe(9);
  });

  it('scales within the allowed range', () => {
    expect(nudgePlacement(AT, '+', false)?.scale).toBe(1.05);
    expect(nudgePlacement(AT, '-', true)?.scale).toBe(0.99);
    expect(nudgePlacement({ ...AT, scale: RESIDENT_SCALE_RANGE.max }, '+', false)?.scale).toBe(RESIDENT_SCALE_RANGE.max);
  });

  it('ignores other keys', () => {
    for (const key of ['a', 'Enter', ' ', 'Tab']) expect(nudgePlacement(AT, key, false)).toBeNull();
  });
});

describe('placementSnippet', () => {
  it('writes the exact line for RESIDENT_PLACEMENTS', () => {
    expect(placementSnippet('pineapple', { offset: [0.0123456, -0, 0.2], facing: 'camera', scale: 0.6 })).toBe(
      "pineapple: { offset: [0.0123, 0, 0.2], facing: 'camera', scale: 0.6 },",
    );
    expect(placementSnippet('krusty-krab', { offset: [1, 2, 3], facing: -12.346 })).toBe(
      "'krusty-krab': { offset: [1, 2, 3], facing: -12.35, scale: 1 },",
    );
  });
});

describe('createPlacementStore', () => {
  it('keeps edits per landmark and tells its listeners', () => {
    const store = createPlacementStore();
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    store.set('pineapple', AT);
    expect(store.get('pineapple')).toBe(AT);
    expect(store.get('tiki')).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    store.set('tiki', AT);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
