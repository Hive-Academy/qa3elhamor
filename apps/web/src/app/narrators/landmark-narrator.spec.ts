import { NARRATOR_SPEECH_HEADROOM } from '@qa3elhamor/world-feature';
import { describe, expect, it } from 'vitest';
import type { NarratorChoice } from '../narrators.config';
import { fallbackOf, mouthOf, narratorRenderedHeight, speechAnchorOf } from './landmark-narrator';

const hamour: NarratorChoice = { kind: 'cast', cast: 'hamour' };
const spongebob: NarratorChoice = {
  kind: 'model',
  asset: 'spongebob-narrator',
  heightFactor: 1.9,
  fallback: 'hamour',
};

describe('narrator sizing', () => {
  it('draws a bundled character heightFactor times taller than the cast', () => {
    expect(narratorRenderedHeight(hamour, 1)).toBe(1);
    expect(narratorRenderedHeight(spongebob, 1)).toBeCloseTo(1.9, 9);
  });

  it('puts the speech anchor just over the rendered head', () => {
    expect(speechAnchorOf(spongebob, [0, 2, 0], 1)[1]).toBeCloseTo(2 + 1.9 * (1 + NARRATOR_SPEECH_HEADROOM), 9);
  });

  it('breathes from the face: high on a standing character, low and forward on a fish', () => {
    const rendered = narratorRenderedHeight(spongebob, 1);
    const sb = mouthOf(spongebob, [0, 0, 0], rendered, 0);
    expect(sb[1]).toBeGreaterThan(rendered * 0.7);
    expect(sb[2]).toBeLessThan(rendered * 0.3);
    const fish = mouthOf(hamour, [0, 0, 0], 1, 0);
    expect(fish[1]).toBeCloseTo(0.55, 9);
    expect(fish[2]).toBeCloseTo(0.7, 9);
    // Towards the visitor: a quarter turn faces +X.
    expect(mouthOf(hamour, [0, 0, 0], 1, Math.PI / 2)[0]).toBeCloseTo(0.7, 9);
  });

  it('names the cast member standing in for a model that cannot play', () => {
    expect(fallbackOf(spongebob)).toEqual(hamour);
    expect(fallbackOf(hamour)).toBe(hamour);
  });
});
