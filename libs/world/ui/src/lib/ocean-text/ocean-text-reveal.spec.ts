import { describe, expect, it } from 'vitest';
import {
  REVEAL_MAX_SPEED,
  oceanGlyphData,
  oceanTextOf,
  revealInText,
  revealTargetHead,
  revealableCharCount,
  stepRevealHead,
} from './ocean-text-reveal.js';

describe('revealableCharCount', () => {
  it('counts code points that make a glyph, skipping whitespace', () => {
    expect(revealableCharCount('Hi! I am')).toBe(6);
    expect(revealableCharCount('أهلاً! تعالى')).toBe(11);
    expect(revealableCharCount(' \n\t')).toBe(0);
  });
});

describe('revealTargetHead', () => {
  const text = 'ab cd';

  it('shows everything when no reveal is given', () => {
    expect(revealTargetHead(undefined, 4, text)).toBe(4);
  });

  it('scales a fraction to glyphs, clamped to 0..1', () => {
    expect(revealTargetHead(0.5, 4, text)).toBe(2);
    expect(revealTargetHead(-1, 4, text)).toBe(0);
    expect(revealTargetHead(3, 4, text)).toBe(4);
    expect(revealTargetHead(Number.NaN, 4, text)).toBe(4);
  });

  it('maps a character count onto glyphs, ignoring whitespace', () => {
    expect(revealTargetHead({ characters: 0 }, 4, text)).toBe(0);
    expect(revealTargetHead({ characters: 2 }, 4, text)).toBe(2);
    expect(revealTargetHead({ characters: 3 }, 4, text)).toBe(2);
    expect(revealTargetHead({ characters: 4 }, 4, text)).toBe(3);
    expect(revealTargetHead({ characters: 99 }, 4, text)).toBe(4);
  });

  it('stays monotonic and exact at both ends when shaping merges characters', () => {
    const arabic = 'لا لا';
    const glyphs = 2; // each lam-alef pair shapes to a single ligature glyph
    const heads = [0, 1, 2, 3, 4, 5].map((n) =>
      revealTargetHead({ characters: n }, glyphs, arabic),
    );
    expect(heads[0]).toBe(0);
    expect(heads[5]).toBe(glyphs);
    heads.slice(1).forEach((h, i) => expect(h).toBeGreaterThanOrEqual(heads[i]));
  });

  it('is 0 before the text has laid out', () => {
    expect(revealTargetHead(1, 0, text)).toBe(0);
  });
});

describe('stepRevealHead', () => {
  it('eases toward the target without overshooting', () => {
    let head = 0;
    const seen: number[] = [];
    for (let i = 0; i < 120; i++) {
      head = stepRevealHead(head, 1, 1 / 60, false);
      seen.push(head);
    }
    expect(seen[0]).toBeGreaterThan(0);
    expect(seen[0]).toBeLessThan(1);
    expect(Math.max(...seen)).toBeLessThanOrEqual(1);
    expect(head).toBe(1);
  });

  it('caps the speed so a large jump travels as a wave', () => {
    expect(stepRevealHead(0, 100, 1 / 60, false)).toBeCloseTo(REVEAL_MAX_SPEED / 60, 5);
  });

  it('jumps straight to the target under reduced motion or on a reset', () => {
    expect(stepRevealHead(0, 40, 1 / 60, true)).toBe(40);
    expect(stepRevealHead(30, 5, 1 / 60, false)).toBe(5);
  });

  it('ignores a long frame (a backgrounded tab)', () => {
    expect(stepRevealHead(0, 100, 5, false)).toBeCloseTo(REVEAL_MAX_SPEED * 0.1, 5);
  });
});

describe('oceanGlyphData', () => {
  it('gives each glyph its centre, order and height', () => {
    const data = oceanGlyphData(new Float32Array([0, 0, 2, 4, 10, -1, 12, 1]));
    expect([...data]).toEqual([1, 2, 0, 4, 11, 0, 1, 2]);
  });
});

describe('oceanTextOf', () => {
  // A dish's name isolated inside an Arabic sentence (`krusty-krab/menu-objects.ts`).
  const isolated = `Price of ${String.fromCodePoint(0x2068)}Kelp Shake${String.fromCodePoint(0x2069)}`;

  it('drops bidi controls, which the font has no glyphs for (troika would fetch a CDN font)', () => {
    expect(oceanTextOf(isolated)).toBe('Price of Kelp Shake');
    expect(oceanTextOf(`a${String.fromCodePoint(0x200f)}b`)).toBe('ab');
  });

  it('keeps a typewriter count in step with the text it sets', () => {
    // 9 characters typed: "Price of " plus the opening isolate.
    expect(revealInText({ characters: 10 }, isolated)).toEqual({ characters: 9 });
    expect(revealInText({ characters: 100 }, isolated)).toEqual({ characters: 19 });
    expect(revealInText(0.5, isolated)).toBe(0.5);
    expect(revealInText(undefined, isolated)).toBeUndefined();
  });
});
