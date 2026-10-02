import { describe, expect, it } from 'vitest';
import { isRtlText, signFont, wrapSignText } from './sign-texture.js';

/** Every character 10 px wide. */
const measure = (value: string) => [...value].length * 10;

describe('painted signs', () => {
  it('wraps words to the width', () => {
    expect(wrapSignText('Senior Software Engineer', 110, 3, measure)).toEqual([
      'Senior',
      'Software',
      'Engineer',
    ]);
    expect(wrapSignText('Senior Software Engineer', 160, 3, measure)).toEqual([
      'Senior Software',
      'Engineer',
    ]);
  });

  it('ends the last allowed line in an ellipsis when words are left over', () => {
    expect(wrapSignText('one two three four', 80, 1, measure)).toEqual(['one two…']);
    const lines = wrapSignText('alpha beta gamma delta', 100, 2, measure);
    expect(lines).toHaveLength(2);
    expect(lines[1]?.endsWith('…')).toBe(true);
  });

  it('keeps a single over-long word whole', () => {
    expect(wrapSignText('Supercalifragilistic', 50, 2, measure)).toEqual(['Supercalifragilistic']);
  });

  it('reads the direction from the first strong letter', () => {
    expect(isRtlText('مدير تقني')).toBe(true);
    expect(isRtlText('2020 – مدير')).toBe(true);
    expect(isRtlText('CTO, شركة')).toBe(false);
  });

  it('builds a canvas font', () => {
    expect(signFont({ size: 28.4, weight: 700, family: 'Georgia, serif' })).toBe(
      '700 28px Georgia, serif',
    );
  });
});
