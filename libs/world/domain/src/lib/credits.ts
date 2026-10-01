import { ATTRIBUTIONS, creditLine, type Attribution } from './attribution.js';
import { WEB_ASSETS, type AssetEntry, type SourceModelId } from './asset-manifest.js';

/** One credit the live site must show: a source model whose derived assets are bundled. */
export interface ShippedCredit {
  readonly sourceModel: SourceModelId;
  readonly attribution: Attribution;
  /** `creditLine(attribution)`: the exact text the licence requires. Render this, verbatim. */
  readonly line: string;
  /** The bundled assets that carry this credit, in manifest order. */
  readonly assetIds: readonly string[];
}

/**
 * The credits to render, derived from what actually ships: one entry per source model that at
 * least one web asset is derived from, in order of first appearance in the manifest.
 *
 * Adding an asset from a new source model adds its credit here, and so to every surface that
 * renders credits (the in-world plaque and the DOM list). An asset whose source model has no
 * attribution record throws: shipping it would be a licence violation, so it must not render
 * as if all were well.
 */
export function shippedCredits(
  assets: readonly AssetEntry[] = WEB_ASSETS,
  attributions: Readonly<Partial<Record<SourceModelId, Attribution>>> = ATTRIBUTIONS,
): readonly ShippedCredit[] {
  const bySource = new Map<SourceModelId, string[]>();
  for (const asset of assets) {
    const ids = bySource.get(asset.sourceModel);
    if (ids) ids.push(asset.id);
    else bySource.set(asset.sourceModel, [asset.id]);
  }

  return Array.from(bySource, ([sourceModel, assetIds]) => {
    const attribution = attributions[sourceModel];
    if (!attribution) {
      throw new Error(
        `Asset "${assetIds[0]}" is derived from source model "${sourceModel}", which has no ` +
          'attribution record. Add its credit to ATTRIBUTIONS before shipping it.',
      );
    }
    return { sourceModel, attribution, line: creditLine(attribution), assetIds };
  });
}
