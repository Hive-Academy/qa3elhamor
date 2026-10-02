import { describe, expect, it } from 'vitest';
import {
  HOVER_INTENT_MS,
  PICKABLE_FROM,
  acceptsPick,
  objectKeyStep,
  pickDelay,
} from './object-selection';

describe('objectKeyStep', () => {
  it('goes on with Right and Down, back with Left and Up, wrapping round', () => {
    expect(objectKeyStep(0, 'ArrowRight', 6)).toBe(1);
    expect(objectKeyStep(5, 'ArrowDown', 6)).toBe(0);
    expect(objectKeyStep(0, 'ArrowLeft', 6)).toBe(5);
    expect(objectKeyStep(3, 'ArrowUp', 6)).toBe(2);
  });

  it('mirrors left and right for right-to-left text', () => {
    expect(objectKeyStep(0, 'ArrowLeft', 6, 'rtl')).toBe(1);
    expect(objectKeyStep(0, 'ArrowRight', 6, 'rtl')).toBe(5);
    expect(objectKeyStep(0, 'ArrowDown', 6, 'rtl')).toBe(1);
  });

  it('jumps to the ends with Home and End', () => {
    expect(objectKeyStep(3, 'Home', 6)).toBe(0);
    expect(objectKeyStep(3, 'End', 6)).toBe(5);
  });

  it('leaves other keys (Tab, Enter, Space) to the browser', () => {
    for (const key of ['Tab', 'Enter', ' ', 'Escape', 'a'])
      expect(objectKeyStep(2, key, 6)).toBeNull();
    expect(objectKeyStep(0, 'ArrowRight', 0)).toBeNull();
    expect(objectKeyStep(-4, 'ArrowRight', 3)).toBe(1);
  });
});

describe('pickDelay', () => {
  it('waits for a resting pointer, but not for focus or a tap', () => {
    expect(pickDelay('hover')).toBe(HOVER_INTENT_MS);
    expect(pickDelay('focus')).toBe(0);
    expect(pickDelay('tap')).toBe(0);
  });
});

describe('acceptsPick', () => {
  it('lets a mouse hover pick an object that is out', () => {
    expect(acceptsPick('hover', 'mouse', 1)).toBe(true);
  });

  it('never picks on a touch or pen hover: they pick by tapping', () => {
    expect(acceptsPick('hover', 'touch', 1)).toBe(false);
    expect(acceptsPick('hover', 'pen', 1)).toBe(false);
    expect(acceptsPick('hover', undefined, 1)).toBe(false);
    expect(acceptsPick('tap', 'touch', 1)).toBe(true);
    expect(acceptsPick('tap', undefined, 1)).toBe(true);
  });

  it('ignores an object still arriving (or leaving)', () => {
    expect(acceptsPick('tap', 'mouse', PICKABLE_FROM - 0.01)).toBe(false);
    expect(acceptsPick('hover', 'mouse', 0.2)).toBe(false);
    expect(acceptsPick('tap', 'mouse', Number.NaN)).toBe(false);
    expect(acceptsPick('tap', 'mouse', PICKABLE_FROM)).toBe(true);
  });
});
