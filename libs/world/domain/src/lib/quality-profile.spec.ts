import { describe, expect, it } from 'vitest';
import { WEB_ASSETS } from './asset-manifest.js';
import { assetAllowed, assetsForTier } from './quality-assets.js';
import {
  QUALITY_PROFILES,
  higherTier,
  isQualityTier,
  lowerTier,
  parseQualityOverride,
  profilePixelRatio,
  shouldAntialias,
} from './quality-profile.js';
import { QUALITY_TIERS } from './quality-tier.js';

const total = (tier: (typeof QUALITY_TIERS)[number]): number =>
  QUALITY_PROFILES[tier].particles.plankton + QUALITY_PROFILES[tier].particles.bubbles;

describe('QUALITY_PROFILES', () => {
  it('has one profile per tier, keyed by its own tier', () => {
    for (const tier of QUALITY_TIERS) expect(QUALITY_PROFILES[tier].tier).toBe(tier);
  });

  it('never gives a lower tier more of any budget than a higher one', () => {
    for (const [lower, higher] of [
      ['low', 'medium'],
      ['medium', 'high'],
    ] as const) {
      const a = QUALITY_PROFILES[lower];
      const b = QUALITY_PROFILES[higher];
      expect(total(lower)).toBeLessThan(total(higher));
      expect(a.dpr[1]).toBeLessThanOrEqual(b.dpr[1]);
      expect(a.anisotropy).toBeLessThanOrEqual(b.anisotropy);
      expect(a.caustics.resolution).toBeLessThanOrEqual(b.caustics.resolution);
      expect(Number(a.caustics.enabled)).toBeLessThanOrEqual(Number(b.caustics.enabled));
      expect(Number(a.antialias)).toBeLessThanOrEqual(Number(b.antialias));
      expect(Number(a.beaconOcclusion)).toBeLessThanOrEqual(Number(b.beaconOcclusion));
      expect(a.ambientLife.schools).toBeLessThanOrEqual(b.ambientLife.schools);
      expect(a.ambientLife.fishPerSchool).toBeLessThanOrEqual(b.ambientLife.fishPerSchool);
      expect(a.ambientLife.neighbourSamples).toBeLessThanOrEqual(b.ambientLife.neighbourSamples);
      expect(a.ambientLife.kelp).toBeLessThan(b.ambientLife.kelp);
      expect(Number(a.ambientLife.hamour)).toBeLessThanOrEqual(Number(b.ambientLife.hamour));
    }
  });

  it('keeps some ambient life at every tier, and the low tier cheap', () => {
    for (const tier of QUALITY_TIERS) {
      const life = QUALITY_PROFILES[tier].ambientLife;
      expect(life.hamour).toBe(true);
      expect(life.schools * life.fishPerSchool).toBeGreaterThan(0);
      expect(life.kelp).toBeGreaterThan(0);
      expect(life.neighbourSamples).toBeLessThan(life.fishPerSchool);
    }
    const low = QUALITY_PROFILES.low.ambientLife;
    expect(low.schools * low.fishPerSchool).toBeLessThanOrEqual(32);
    expect(low.schools * low.fishPerSchool * low.neighbourSamples).toBeLessThanOrEqual(100);
  });

  it('keeps shadows and post-processing off at every tier for now', () => {
    for (const tier of QUALITY_TIERS) {
      expect(QUALITY_PROFILES[tier].shadows).toBe(false);
      expect(QUALITY_PROFILES[tier].postprocessing).toBe('none');
    }
  });

  it('keeps the high tier at the art-directed particle budget', () => {
    expect(total('high')).toBe(2400);
  });
});

describe('profilePixelRatio / shouldAntialias', () => {
  it('clamps the native ratio into the profile range', () => {
    expect(profilePixelRatio(QUALITY_PROFILES.low, 3)).toBe(1);
    expect(profilePixelRatio(QUALITY_PROFILES.medium, 3)).toBe(1.5);
    expect(profilePixelRatio(QUALITY_PROFILES.high, 3)).toBe(2);
    expect(profilePixelRatio(QUALITY_PROFILES.high, 0.5)).toBe(1);
  });

  it('treats a missing or broken native ratio as 1', () => {
    expect(profilePixelRatio(QUALITY_PROFILES.high, Number.NaN)).toBe(1);
    expect(profilePixelRatio(QUALITY_PROFILES.high, 0)).toBe(1);
  });

  it('uses MSAA only on the high tier below a 1.5 pixel ratio', () => {
    expect(shouldAntialias(QUALITY_PROFILES.high, 1)).toBe(true);
    expect(shouldAntialias(QUALITY_PROFILES.high, 2)).toBe(false);
    expect(shouldAntialias(QUALITY_PROFILES.medium, 1)).toBe(false);
    expect(shouldAntialias(QUALITY_PROFILES.low, 1)).toBe(false);
  });
});

describe('tier stepping and parsing', () => {
  it('steps one tier at a time and stops at the ends', () => {
    expect(lowerTier('high')).toBe('medium');
    expect(lowerTier('low')).toBeUndefined();
    expect(higherTier('low')).toBe('medium');
    expect(higherTier('high')).toBeUndefined();
  });

  it('recognises only the three tier names', () => {
    expect(isQualityTier('medium')).toBe(true);
    expect(isQualityTier('ultra')).toBe(false);
    expect(isQualityTier(2)).toBe(false);
  });

  it('parses ?quality= case-insensitively and ignores anything else', () => {
    expect(parseQualityOverride('?quality=low')).toBe('low');
    expect(parseQualityOverride('?x=1&quality=HIGH')).toBe('high');
    expect(parseQualityOverride('?quality=ultra')).toBeNull();
    expect(parseQualityOverride('?quality=')).toBeNull();
    expect(parseQualityOverride('')).toBeNull();
  });
});

describe('asset gating', () => {
  it('never offers a high-tier asset to a low-tier device', () => {
    const low = assetsForTier('low').map((asset) => asset.id);
    expect(low).not.toContain('pineapple-interior');
    expect(low).not.toContain('spongebob-character');
    expect(low).not.toContain('patrick-character');
    expect(low).toContain('environment');
  });

  it('adds medium assets at medium and everything at high', () => {
    expect(assetsForTier('medium').map((asset) => asset.id)).toContain('spongebob-character');
    expect(assetsForTier('medium').map((asset) => asset.id)).not.toContain('patrick-character');
    expect(assetsForTier('high')).toHaveLength(WEB_ASSETS.length);
  });

  it('answers per asset, and refuses unknown ids', () => {
    expect(assetAllowed('pineapple-interior', 'low')).toBe(false);
    expect(assetAllowed('pineapple-interior', 'high')).toBe(true);
    expect(assetAllowed('no-such-asset', 'high')).toBe(false);
  });
});
