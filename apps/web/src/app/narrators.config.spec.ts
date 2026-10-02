import { NARRATION_LANDMARKS } from '@qa3elhamor/content-domain';
import { findAsset } from '@qa3elhamor/world-domain';
import { NARRATOR_CAST_IDS } from '@qa3elhamor/world-feature';
import { describe, expect, it, vi } from 'vitest';
import {
  NARRATORS_CONFIG,
  NARRATOR_RIGS,
  RESIDENT_PLACEMENTS,
  RESIDENT_SCALE_RANGE,
  bundledCharactersFromEnv,
  narratorFor,
  narratorPosePreviewFor,
  narratorsConfigFor,
  residentPlacementOf,
} from './narrators.config';
import { narratorName } from './narrators/narrator-copy';
import { NARRATOR_CAST } from '../site.config';

describe('narrators config', () => {
  it("follows the site's bundledByDefault when the env leaves it unset", () => {
    expect(NARRATORS_CONFIG.useBundledCharacters).toBe(NARRATOR_CAST.bundledByDefault);
    const off = { ...NARRATORS_CONFIG, useBundledCharacters: false };
    for (const landmark of NARRATION_LANDMARKS)
      expect(narratorFor(landmark, off)).toEqual({
        kind: 'cast',
        cast: NARRATOR_CAST.cast[landmark],
        resident: { landmark, placement: residentPlacementOf(RESIDENT_PLACEMENTS[landmark]) },
      });
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
          ? {
              kind: 'model',
              asset: model.asset,
              heightFactor: model.heightFactor,
              fallback: cast,
              resident: { landmark, placement: residentPlacementOf(RESIDENT_PLACEMENTS[landmark]) },
            }
          : {
              kind: 'cast',
              cast,
              resident: { landmark, placement: residentPlacementOf(RESIDENT_PLACEMENTS[landmark]) },
            },
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
      ({
        kind: 'model',
        asset,
        heightFactor: 1,
        fallback: 'hamour',
        resident: { landmark: 'pineapple', placement: null },
      }) as const;
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
  it('rigs both bundled models, each playing in its own style', () => {
    expect(NARRATOR_RIGS['spongebob-narrator']?.id).toBe('spongebob');
    expect(NARRATOR_RIGS['patrick-narrator']?.id).toBe('patrick');
    expect(NARRATOR_RIGS['patrick-narrator']?.style?.id).toBe('patrick');
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

describe('resident placements', () => {
  it('places SpongeBob beside the Pineapple, validly', () => {
    const placement = residentPlacementOf(RESIDENT_PLACEMENTS.pineapple);
    expect(placement).not.toBeNull();
    expect(placement?.offset.every(Number.isFinite)).toBe(true);
    const bundled = { ...NARRATORS_CONFIG, useBundledCharacters: true };
    expect(narratorFor('pineapple', bundled)).toMatchObject({
      kind: 'model',
      resident: { landmark: 'pineapple', placement },
    });
  });

  it('keeps a resident at the visit post when its landmark has no placement', () => {
    const bundled = { ...NARRATORS_CONFIG, useBundledCharacters: true };
    expect(narratorFor('tiki', bundled, {})).toMatchObject({
      resident: { landmark: 'tiki', placement: null },
    });
  });

  it('accepts finite offsets, a finite facing or camera, and clamps the scale', () => {
    expect(residentPlacementOf({ offset: [0.1, 0, -0.2], facing: 'camera' })).toEqual({
      offset: [0.1, 0, -0.2],
      facing: 'camera',
      scale: 1,
    });
    expect(residentPlacementOf({ offset: [0, 0, 0], facing: -30, scale: 50 })?.scale).toBe(RESIDENT_SCALE_RANGE.max);
    expect(residentPlacementOf({ offset: [0, 0, 0], facing: 90, scale: 0.01 })?.scale).toBe(RESIDENT_SCALE_RANGE.min);
    expect(residentPlacementOf(undefined)).toBeNull();
  });

  it('rejects anything else, with a warning, instead of placing it somewhere odd', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const bad of [
      null,
      {},
      { offset: [0, 0], facing: 'camera' },
      { offset: [0, Number.NaN, 0], facing: 'camera' },
      { offset: [0, 0, 0], facing: 'door' },
      { offset: [0, 0, 0], facing: Number.POSITIVE_INFINITY },
      { offset: [0, 0, 0], facing: 0, scale: -1 },
      { offset: ['0', 0, 0], facing: 0 },
    ])
      expect(residentPlacementOf(bad), JSON.stringify(bad)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(8);
    warn.mockRestore();
  });

  it('previews the new clips (listening, fidgets) from the URL in development', () => {
    expect(narratorPosePreviewFor('?pose=scratch&poseAt=0.5', true)).toEqual({ clip: 'scratch', at: 0.5 });
    expect(narratorPosePreviewFor('?pose=listen', true)).toEqual({ clip: 'listen' });
    for (const clip of ['doze', 'belly', 'clack', 'puff', 'yawn'])
      expect(narratorPosePreviewFor(`?pose=${clip}`, true)).toEqual({ clip });
  });

  it('places a resident at every stop, validly, within the scale range', () => {
    for (const landmark of NARRATION_LANDMARKS) {
      const placement = residentPlacementOf(RESIDENT_PLACEMENTS[landmark], landmark);
      expect(placement, landmark).not.toBeNull();
      expect(placement?.offset.every(Number.isFinite), landmark).toBe(true);
      // Beside the house, not inside the town: within a landmark's own footprint scale.
      expect(Math.hypot(placement?.offset[0] ?? 9, placement?.offset[2] ?? 9), landmark).toBeLessThan(0.5);
      expect(placement?.scale, landmark).toBeGreaterThanOrEqual(RESIDENT_SCALE_RANGE.min);
      expect(placement?.scale, landmark).toBeLessThanOrEqual(RESIDENT_SCALE_RANGE.max);
    }
  });

  it('gives every landmark a resident, whoever plays it (the model, or the original cast)', () => {
    for (const useBundledCharacters of [true, false])
      for (const landmark of NARRATION_LANDMARKS)
        expect(narratorFor(landmark, { ...NARRATORS_CONFIG, useBundledCharacters }).resident?.landmark).toBe(landmark);
  });
});
