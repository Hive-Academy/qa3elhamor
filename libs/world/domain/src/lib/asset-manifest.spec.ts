import { describe, expect, it } from 'vitest';
import {
  SOURCE_MODELS,
  WEB_ASSETS,
  assetsMissingAttribution,
  findAsset,
  findSourceModel,
  initialLoadBudgetBytes,
  totalBudgetBytes,
  type AssetEntry,
} from './asset-manifest.js';
import { ATTRIBUTIONS, creditLine } from './attribution.js';
import { tierAllows } from './quality-tier.js';

const MiB = 1024 * 1024;

describe('asset manifest', () => {
  it('finds an asset by id', () => {
    expect(findAsset('landmark-tiki')?.compressedPath).toBe('models/landmark-tiki.glb');
    expect(findAsset('nope')).toBeUndefined();
  });

  it('finds a source model by id', () => {
    expect(findSourceModel('pineapple-interior').path).toContain('sbfbb-spongebob_house');
  });

  it('derives every web asset from a listed source model', () => {
    const sourceIds = new Set(SOURCE_MODELS.map((model) => model.id));
    for (const asset of WEB_ASSETS) {
      expect(sourceIds.has(asset.sourceModel)).toBe(true);
    }
  });

  it('has unique asset and source model ids', () => {
    const ids = WEB_ASSETS.map((asset) => asset.id);
    expect(new Set(ids).size).toBe(ids.length);
    const sourceIds = SOURCE_MODELS.map((model) => model.id);
    expect(new Set(sourceIds).size).toBe(sourceIds.length);
  });

  it('has unique compressed paths under models/', () => {
    const paths = WEB_ASSETS.map((asset) => asset.compressedPath);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) {
      expect(path.startsWith('models/')).toBe(true);
    }
  });

  it('budgets every asset under its source model size', () => {
    for (const asset of WEB_ASSETS) {
      expect(asset.budgetBytes).toBeLessThan(findSourceModel(asset.sourceModel).bytes);
    }
  });

  it('keeps the initial-load budget under 2 MiB', () => {
    expect(initialLoadBudgetBytes()).toBeLessThan(2 * MiB);
  });

  it('excludes lazy assets from the initial-load budget', () => {
    const eager: AssetEntry = { ...WEB_ASSETS[0], id: 'eager', budgetBytes: 100, lazy: false };
    const lazy: AssetEntry = { ...WEB_ASSETS[0], id: 'lazy', budgetBytes: 1_000, lazy: true };
    expect(initialLoadBudgetBytes([eager, lazy])).toBe(100);
    expect(totalBudgetBytes([eager, lazy])).toBe(1_100);

    const lazyTotal = totalBudgetBytes(WEB_ASSETS.filter((asset) => asset.lazy));
    expect(lazyTotal).toBeGreaterThan(0);
    expect(initialLoadBudgetBytes()).toBe(totalBudgetBytes() - lazyTotal);
  });

  it('keeps the total compressed budget under 6 MiB', () => {
    expect(totalBudgetBytes()).toBeLessThan(6 * MiB);
  });
});

describe('attribution', () => {
  // CC-BY-4.0 requires visible credit for every bundled model. If this fails, the site
  // cannot ship: a model was added without its licence obligation.
  it('has a credit for every source model', () => {
    expect(assetsMissingAttribution()).toEqual([]);
  });

  it('renders the credit string the licence mandates', () => {
    const line = creditLine(ATTRIBUTIONS['pineapple-interior']);
    expect(line).toContain('Sbfbb-SpongeBob House');
    expect(line).toContain('CC-BY-4.0');
    expect(line).toContain('sketchfab.com/cherylhill28');
  });
});

describe('quality tiers', () => {
  it('loads low-tier assets everywhere', () => {
    expect(tierAllows('low', 'low')).toBe(true);
    expect(tierAllows('high', 'low')).toBe(true);
  });

  it('withholds high-tier assets from low-tier devices', () => {
    expect(tierAllows('low', 'high')).toBe(false);
    expect(tierAllows('medium', 'high')).toBe(false);
  });
});
