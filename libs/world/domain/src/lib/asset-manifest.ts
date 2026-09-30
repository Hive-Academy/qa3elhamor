import type { QualityTier } from './quality-tier.js';
import { ATTRIBUTIONS } from './attribution.js';

/**
 * The contract every 3D asset is described by.
 *
 * `sourcePath` points at the raw model committed under `assets/`; `compressedPath` is what
 * the `asset-compression` pipeline emits and what the site actually loads. Both are recorded
 * so the pipeline is reproducible from the repository alone.
 */
export interface AssetEntry {
  readonly id: string;
  /** Raw model as committed, relative to the repository root. */
  readonly sourcePath: string;
  /** Web-ready output, relative to the web app's public directory. Null until compressed. */
  readonly compressedPath: string | null;
  /** Size of the raw source in bytes, as committed. */
  readonly sourceBytes: number;
  /**
   * Ceiling for the compressed output in bytes. `asset-compression` fails the build when an
   * output exceeds this, and `perf-budget` sums these to gate the total payload.
   */
  readonly budgetBytes: number;
  /** Lowest quality tier at which this asset is loaded at all. */
  readonly minimumTier: QualityTier;
}

const MB = 1024 * 1024;

/**
 * The four models committed under `assets/`, totalling ~27.6 MB raw.
 *
 * The budgets below are deliberately aggressive — an order of magnitude under source — and
 * are the target `asset-compression` must hit with Meshopt/Draco geometry and KTX2 textures.
 * They are the number to argue with during that roadmap item, not a prediction.
 */
export const SOURCE_ASSETS: readonly AssetEntry[] = [
  {
    id: 'bikini-bottom-map',
    sourcePath: 'assets/bikini_bottom_map_3d_model/scene.gltf',
    compressedPath: null,
    sourceBytes: 5.0 * MB,
    budgetBytes: 1.5 * MB,
    minimumTier: 'low',
  },
  {
    id: 'pineapple-house',
    sourcePath: 'assets/sbfbb-spongebob_house/scene.gltf',
    compressedPath: null,
    sourceBytes: 2.3 * MB,
    budgetBytes: 0.6 * MB,
    minimumTier: 'low',
  },
  {
    id: 'spongebob-character',
    sourcePath: 'assets/sponge_on_the_run_spongebob_base_model/scene.gltf',
    compressedPath: null,
    sourceBytes: 17 * MB,
    budgetBytes: 2 * MB,
    minimumTier: 'medium',
  },
  {
    id: 'patrick-character',
    sourcePath: 'assets/sponge_on_the_run_patrick_base_model_textured/scene.gltf',
    compressedPath: null,
    sourceBytes: 3.3 * MB,
    budgetBytes: 1 * MB,
    minimumTier: 'high',
  },
];

export const findAsset = (id: string): AssetEntry | undefined =>
  SOURCE_ASSETS.find((asset) => asset.id === id);

/** Total compressed budget across every asset — the ceiling `perf-budget` enforces. */
export const totalBudgetBytes = (
  assets: readonly AssetEntry[] = SOURCE_ASSETS
): number => assets.reduce((sum, asset) => sum + asset.budgetBytes, 0);

/** Asset ids that have no attribution record. Non-empty means a licence violation. */
export const assetsMissingAttribution = (
  assets: readonly AssetEntry[] = SOURCE_ASSETS
): readonly string[] =>
  assets.filter((asset) => !ATTRIBUTIONS[asset.id]).map((asset) => asset.id);
