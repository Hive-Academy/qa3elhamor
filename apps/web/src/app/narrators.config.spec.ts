import { NARRATION_LANDMARKS } from '@qa3elhamor/content-domain';
import { findAsset } from '@qa3elhamor/world-domain';
import { NARRATOR_CAST_IDS } from '@qa3elhamor/world-feature';
import { describe, expect, it } from 'vitest';
import {
  NARRATORS_CONFIG,
  bundledCharactersFromEnv,
  narratorFor,
  narratorsConfigFor,
} from './narrators.config';
import { narratorName } from './narrators/narrator-copy';
import { NARRATOR_CAST } from '../site.config';

describe('narrators config', () => {
  it('ships the original cast (site.config.ts) unless the switch is on', () => {
    expect(NARRATORS_CONFIG.useBundledCharacters).toBe(false);
    for (const landmark of NARRATION_LANDMARKS)
      expect(narratorFor(landmark)).toEqual({ kind: 'cast', cast: NARRATOR_CAST.cast[landmark] });
  });

  it('names a real cast member for every landmark, and real, lazy, tier-gated models', () => {
    for (const landmark of NARRATION_LANDMARKS)
      expect(NARRATOR_CAST_IDS).toContain(NARRATORS_CONFIG.cast[landmark]);
    for (const character of Object.values(NARRATORS_CONFIG.bundled)) {
      const asset = findAsset(character?.asset ?? '');
      expect(asset?.lazy).toBe(true);
      expect(asset?.minimumTier).not.toBe('low');
      expect(asset?.standingHeight).toBeGreaterThan(0);
    }
  });

  it('gives a mixed cast with the switch: the bundled model where named, the cast elsewhere', () => {
    const bundled = { ...NARRATORS_CONFIG, useBundledCharacters: true };
    for (const landmark of NARRATION_LANDMARKS) {
      const cast = NARRATOR_CAST.cast[landmark];
      const model = NARRATOR_CAST.bundled[landmark];
      expect(narratorFor(landmark, bundled), landmark).toEqual(
        model
          ? { kind: 'model', asset: model.asset, heightFactor: model.heightFactor, fallback: cast }
          : { kind: 'cast', cast },
      );
    }
    const switched = { cast: NARRATOR_CAST.cast, useBundledCharacters: true };
    expect(
      narratorFor('pineapple', {
        ...switched,
        bundled: { pineapple: { asset: 'spongebob-narrator', heightFactor: 1.9 } },
      }),
    ).toMatchObject({ kind: 'model', asset: 'spongebob-narrator' });
  });

  it('names whoever plays the narrator', () => {
    const model = (asset: 'spongebob-narrator' | 'patrick-narrator') =>
      ({ kind: 'model', asset, heightFactor: 1, fallback: 'hamour' }) as const;
    expect(narratorName(model('spongebob-narrator'), 'en')).toBe('SpongeBob');
    expect(narratorName(model('patrick-narrator'), 'en')).toBe('Patrick');
    expect(narratorName({ kind: 'cast', cast: 'hamour' }, 'en')).toBe('The Hamour');
  });

  it('turns on only for VITE_BUNDLED_CHARACTERS=true', () => {
    expect(bundledCharactersFromEnv({ VITE_BUNDLED_CHARACTERS: 'true' })).toBe(true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', 'yes'])
      expect(bundledCharactersFromEnv({ VITE_BUNDLED_CHARACTERS: value })).toBe(false);
  });

  it('previews the switch from the URL in development only', () => {
    expect(narratorsConfigFor('?narrators=bundled', true).useBundledCharacters).toBe(true);
    expect(narratorsConfigFor('?narrators=bundled', false).useBundledCharacters).toBe(false);
    const on = { ...NARRATORS_CONFIG, useBundledCharacters: true };
    expect(narratorsConfigFor('?narrators=original', true, on).useBundledCharacters).toBe(false);
    expect(narratorsConfigFor('?quality=high', true)).toBe(NARRATORS_CONFIG);
  });
});
