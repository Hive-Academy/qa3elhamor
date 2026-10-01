import { describe, expect, it } from 'vitest';
import { effectivePresentation } from './landmark-definition.js';

describe('effectivePresentation', () => {
  const card = {
    presentation: 'in-world',
    overlay: 'pineapple',
  } as const;

  it('keeps an in-world landmark in the world when the page can run it', () => {
    expect(effectivePresentation(card, true)).toBe('in-world');
  });

  it('falls back to the overlay dialog when in-world is unavailable', () => {
    expect(effectivePresentation(card, false)).toBe('dialog');
  });

  it('falls back to a camera-only visit when there is no overlay to fall back to', () => {
    expect(effectivePresentation({ presentation: 'in-world' }, false)).toBe(
      'none',
    );
  });

  it('leaves dialog and camera-only landmarks alone either way', () => {
    for (const inWorld of [true, false]) {
      expect(effectivePresentation({ overlay: 'bureau' }, inWorld)).toBe(
        'dialog',
      );
      expect(effectivePresentation({ presentation: 'none' }, inWorld)).toBe(
        'none',
      );
    }
  });
});
