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

describe('narrators config', () => {
  it('ships the original cast: the Hamour guides the Pineapple', () => {
    expect(NARRATORS_CONFIG.useBundledCharacters).toBe(false);
    expect(narratorFor('pineapple')).toEqual({ kind: 'cast', cast: 'hamour' });
    expect(narratorFor('tiki')).toEqual({ kind: 'cast', cast: 'hamour' });
    expect(narratorFor('bureau')).toEqual({ kind: 'cast', cast: 'sardine-president' });
    expect(narratorFor('krusty-krab')).toEqual({ kind: 'cast', cast: 'crab-clerk' });
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

  it('gives a mixed cast with the switch: SpongeBob and Patrick where named, the cast elsewhere', () => {
    const bundled = { ...NARRATORS_CONFIG, useBundledCharacters: true };
    expect(narratorFor('pineapple', bundled)).toEqual({
      kind: 'model',
      asset: 'spongebob-narrator',
      heightFactor: NARRATORS_CONFIG.bundled.pineapple?.heightFactor,
      fallback: 'hamour',
    });
    expect(narratorFor('tiki', bundled)).toMatchObject({
      kind: 'model',
      asset: 'patrick-narrator',
      fallback: 'hamour',
    });
    expect(narratorFor('krusty-krab', bundled)).toEqual({ kind: 'cast', cast: 'crab-clerk' });
    expect(narratorFor('bureau', bundled)).toEqual({ kind: 'cast', cast: 'sardine-president' });
    expect(narratorName(narratorFor('pineapple', bundled), 'en')).toBe('SpongeBob');
    expect(narratorName(narratorFor('tiki', bundled), 'en')).toBe('Patrick');
    expect(narratorName(narratorFor('pineapple'), 'en')).toBe('The Hamour');
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
