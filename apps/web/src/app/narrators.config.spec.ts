import { NARRATION_LANDMARKS } from '@qa3elhamor/content-domain';
import { findAsset } from '@qa3elhamor/world-domain';
import { NARRATOR_CAST_IDS } from '@qa3elhamor/world-feature';
import { describe, expect, it } from 'vitest';
import {
  NARRATORS_CONFIG,
  NARRATOR_RIGS,
  bundledCharactersFromEnv,
  narratorFor,
  narratorPosePreviewFor,
  narratorsConfigFor,
} from './narrators.config';
import { narratorName } from './narrators/narrator-copy';
import { NARRATOR_CAST } from '../site.config';

describe('narrators config', () => {
  it("follows the site's bundledByDefault when the env leaves it unset", () => {
    expect(NARRATORS_CONFIG.useBundledCharacters).toBe(NARRATOR_CAST.bundledByDefault);
    const off = { ...NARRATORS_CONFIG, useBundledCharacters: false };
    for (const landmark of NARRATION_LANDMARKS)
      expect(narratorFor(landmark, off)).toEqual({ kind: 'cast', cast: NARRATOR_CAST.cast[landmark] });
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
    const switched = { cast: NARRATOR_CAST.cast, useBundledCharacters: true, bundledByDefault: false };
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

  it('env true/false overrides; anything else uses the site default', () => {
    expect(bundledCharactersFromEnv({ VITE_BUNDLED_CHARACTERS: 'true' })).toBe(true);
    expect(bundledCharactersFromEnv({ VITE_BUNDLED_CHARACTERS: 'true' }, false)).toBe(true);
    expect(bundledCharactersFromEnv({ VITE_BUNDLED_CHARACTERS: 'false' }, true)).toBe(false);
    for (const value of [undefined, '', 'TRUE', '1', 'yes']) {
      expect(bundledCharactersFromEnv({ VITE_BUNDLED_CHARACTERS: value })).toBe(false);
      expect(bundledCharactersFromEnv({ VITE_BUNDLED_CHARACTERS: value }, true)).toBe(true);
    }
  });

  it('previews the switch from the URL in development only', () => {
    const off = { ...NARRATORS_CONFIG, useBundledCharacters: false };
    expect(narratorsConfigFor('?narrators=bundled', true, off).useBundledCharacters).toBe(true);
    expect(narratorsConfigFor('?narrators=bundled', false, off).useBundledCharacters).toBe(false);
    const on = { ...NARRATORS_CONFIG, useBundledCharacters: true };
    expect(narratorsConfigFor('?narrators=original', true, on).useBundledCharacters).toBe(false);
    expect(narratorsConfigFor('?quality=high', true)).toBe(NARRATORS_CONFIG);
  });
});

describe('narrator rigs and the pose preview', () => {
  it('rigs SpongeBob only (Patrick keeps the static model for now)', () => {
    expect(NARRATOR_RIGS['spongebob-narrator']?.id).toBe('spongebob');
    expect(NARRATOR_RIGS['patrick-narrator']).toBeUndefined();
  });

  it('reads ?pose (and ?poseAt) in development only', () => {
    expect(narratorPosePreviewFor('?pose=wave', true)).toEqual({ clip: 'wave' });
    expect(narratorPosePreviewFor('?pose=hop&poseAt=0.5', true)).toEqual({
      clip: 'hop',
      at: 0.5,
    });
    expect(narratorPosePreviewFor('?pose=hop&poseAt=7', true)).toEqual({
      clip: 'hop',
      at: 1,
    });
    expect(narratorPosePreviewFor('?pose=dance', true)).toBeNull();
    expect(narratorPosePreviewFor('?pose=wave', false)).toBeNull();
  });
});
