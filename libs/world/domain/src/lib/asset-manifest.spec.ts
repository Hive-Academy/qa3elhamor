import { describe, expect, it } from 'vitest';
import {
  SOURCE_ASSETS,
  assetsMissingAttribution,
  findAsset,
  totalBudgetBytes,
} from './asset-manifest.js';
import { ATTRIBUTIONS, creditLine } from './attribution.js';
import { tierAllows } from './quality-tier.js';

describe('asset manifest', () => {
  it('finds an asset by id', () => {
    expect(findAsset('pineapple-house')?.sourcePath).toContain('sbfbb-spongebob_house');
    expect(findAsset('nope')).toBeUndefined();
  });

  it('budgets every asset well under its source size', () => {
    for (const asset of SOURCE_ASSETS) {
      expect(asset.budgetBytes).toBeLessThan(asset.sourceBytes);
    }
  });

  it('keeps the total compressed budget under 6 MB', () => {
    expect(totalBudgetBytes()).toBeLessThan(6 * 1024 * 1024);
  });
});

describe('attribution', () => {
  // CC-BY-4.0 requires visible credit for every bundled model. If this fails, the site
  // cannot ship: an asset was added without its licence obligation.
  it('has a credit for every bundled asset', () => {
    expect(assetsMissingAttribution()).toEqual([]);
  });

  it('renders the credit string the licence mandates', () => {
    const line = creditLine(ATTRIBUTIONS['pineapple-house']);
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
