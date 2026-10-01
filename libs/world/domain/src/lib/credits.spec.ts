import { describe, expect, it } from 'vitest';
import { ATTRIBUTIONS, creditLine, type Attribution } from './attribution.js';
import {
  SOURCE_MODELS,
  WEB_ASSETS,
  type AssetEntry,
  type SourceModelId,
} from './asset-manifest.js';
import { shippedCredits } from './credits.js';

const asset = (id: string, sourceModel: SourceModelId): AssetEntry => ({
  id,
  sourceModel,
  compressedPath: `models/${id}.glb`,
  budgetBytes: 1024,
  minimumTier: 'low',
  lazy: false,
});

describe('shippedCredits', () => {
  it('credits every source model a shipped asset is derived from, once each', () => {
    const credits = shippedCredits();
    const shippedSources = new Set(WEB_ASSETS.map((a) => a.sourceModel));

    expect(credits.map((c) => c.sourceModel).sort()).toEqual([...shippedSources].sort());
    for (const source of shippedSources) {
      const credit = credits.find((c) => c.sourceModel === source);
      expect(credit?.attribution).toBe(ATTRIBUTIONS[source]);
    }
  });

  it('covers all four bundled models today', () => {
    expect(shippedCredits().map((c) => c.sourceModel).sort()).toEqual(
      SOURCE_MODELS.map((m) => m.id).sort(),
    );
  });

  it('carries the exact licence credit string', () => {
    for (const credit of shippedCredits()) {
      expect(credit.line).toBe(creditLine(credit.attribution));
    }
  });

  it('lists the assets that carry each credit, so derived landmarks keep the map credit', () => {
    const map = shippedCredits().find((c) => c.sourceModel === 'bikini-bottom-map');
    expect(map?.assetIds).toEqual(
      WEB_ASSETS.filter((a) => a.sourceModel === 'bikini-bottom-map').map((a) => a.id),
    );
    expect(map?.assetIds).toContain('landmark-tiki');
  });

  it('omits a source model when nothing derived from it ships', () => {
    const credits = shippedCredits([asset('environment', 'bikini-bottom-map')]);
    expect(credits.map((c) => c.sourceModel)).toEqual(['bikini-bottom-map']);
  });

  it('adds a credit automatically when an asset from another source model is added', () => {
    const before = [asset('environment', 'bikini-bottom-map')];
    const after = [...before, asset('patrick-character', 'patrick-character')];

    expect(shippedCredits(before).map((c) => c.sourceModel)).not.toContain('patrick-character');
    expect(shippedCredits(after).map((c) => c.sourceModel)).toEqual([
      'bikini-bottom-map',
      'patrick-character',
    ]);
  });

  it('picks up a brand-new source model from the attribution records', () => {
    const kelp = 'kelp-forest' as SourceModelId;
    const kelpCredit: Attribution = {
      title: 'Kelp Forest',
      author: 'someone',
      authorUrl: 'https://example.org/someone',
      sourceUrl: 'https://example.org/kelp',
      license: 'CC-BY-4.0',
      licenseUrl: 'http://creativecommons.org/licenses/by/4.0/',
    };
    const credits = shippedCredits([...WEB_ASSETS, asset('kelp', kelp)], {
      ...ATTRIBUTIONS,
      [kelp]: kelpCredit,
    });

    const added = credits.find((c) => c.sourceModel === kelp);
    expect(added?.line).toBe(creditLine(kelpCredit));
    expect(added?.assetIds).toEqual(['kelp']);
  });

  it('refuses to render when a shipped asset has no attribution record', () => {
    const orphan = 'orphan-model' as SourceModelId;
    expect(() => shippedCredits([asset('orphan', orphan)])).toThrow(/orphan-model.*attribution/s);
  });
});
