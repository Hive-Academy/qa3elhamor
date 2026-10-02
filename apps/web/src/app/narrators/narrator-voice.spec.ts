import { isVoiceProfileId } from '@qa3elhamor/world-domain';
import { NARRATOR_CAST_IDS } from '@qa3elhamor/world-feature';
import { describe, expect, it } from 'vitest';
import { voiceOf } from './narrator-voice';

describe('voiceOf', () => {
  it('gives each original cast member its own voice', () => {
    expect(voiceOf({ kind: 'cast', cast: 'hamour' })).toBe('hamour');
    expect(voiceOf({ kind: 'cast', cast: 'sardine-president' })).toBe(
      'sardine-president',
    );
    expect(voiceOf({ kind: 'cast', cast: 'crab-clerk' })).toBe('crab-clerk');
  });

  it('has a voice profile for every cast member', () => {
    for (const cast of NARRATOR_CAST_IDS)
      expect(isVoiceProfileId(voiceOf({ kind: 'cast', cast }))).toBe(true);
  });

  it("gives a bundled model its character's voice, not its fallback cast's", () => {
    expect(
      voiceOf({
        kind: 'model',
        asset: 'spongebob-narrator',
        heightFactor: 1.4,
        fallback: 'hamour',
      }),
    ).toBe('spongebob');
    expect(
      voiceOf({
        kind: 'model',
        asset: 'patrick-narrator',
        heightFactor: 1.4,
        fallback: 'crab-clerk',
      }),
    ).toBe('patrick');
  });
});
