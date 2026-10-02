import { describe, expect, it } from 'vitest';
import { oceanTextForcedOff } from './ocean-text-context';
import { oceanTextAllowed, oceanTextShown } from './ocean-text-mode';

describe('when the dive draws its words as underwater text', () => {
  it('is allowed without reduced motion, above the low tier', () => {
    expect(oceanTextAllowed({ reducedMotion: false, tier: 'high' })).toBe(true);
    expect(oceanTextAllowed({ reducedMotion: false, tier: 'medium' })).toBe(
      true,
    );
    expect(oceanTextAllowed({ reducedMotion: false, tier: 'low' })).toBe(false);
    expect(oceanTextAllowed({ reducedMotion: true, tier: 'high' })).toBe(false);
  });

  it('shows only once the font is ready: loading and failed keep the HTML text', () => {
    expect(oceanTextShown({ allowed: true, font: 'ready' })).toBe(true);
    expect(oceanTextShown({ allowed: true, font: 'loading' })).toBe(false);
    expect(oceanTextShown({ allowed: true, font: 'failed' })).toBe(false);
    expect(oceanTextShown({ allowed: true, font: 'idle' })).toBe(false);
    expect(oceanTextShown({ allowed: false, font: 'ready' })).toBe(false);
  });

  it('can be turned off from the address (?oceanText=off)', () => {
    expect(oceanTextForcedOff('?oceanText=off&lang=en')).toBe(true);
    expect(oceanTextForcedOff('?lang=en')).toBe(false);
  });
});
