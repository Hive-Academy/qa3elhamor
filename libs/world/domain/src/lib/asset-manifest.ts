import type { QualityTier } from './quality-tier.js';
import { ATTRIBUTIONS } from './attribution.js';

export type SourceModelId =
  | 'bikini-bottom-map'
  | 'pineapple-interior'
  | 'spongebob-character'
  | 'patrick-character';

/**
 * A raw model committed under `assets/`. Licence credit is keyed by this id.
 *
 * Every source model stays listed here, and keeps its CC-BY-4.0 credit, whether or not
 * anything derived from it ships.
 */
export interface SourceModel {
  readonly id: SourceModelId;
  /** The model's `scene.gltf`, relative to the repository root. */
  readonly path: string;
  /** Real total of the model's directory in bytes, as committed. */
  readonly bytes: number;
}

/**
 * A web-ready file the site loads, derived from one source model.
 *
 * Outputs of the `asset-compression` pipeline are committed, so the site never builds them
 * at deploy time. A derived asset is a derivative work: it carries its source model's
 * CC-BY-4.0 credit, so extracting a landmark from the map does not detach it from the map's
 * attribution.
 */
export interface AssetEntry {
  readonly id: string;
  /** The raw model this output is derived from; its credit applies to this output. */
  readonly sourceModel: SourceModelId;
  /** Compressed output, relative to `apps/web/public`, e.g. `models/landmark-tiki.glb`. */
  readonly compressedPath: string;
  /**
   * Ceiling for the compressed output in bytes. The pipeline fails when an output exceeds
   * this. Budgets are the numbers to argue with, not predictions.
   */
  readonly budgetBytes: number;
  /** Lowest quality tier at which this asset is loaded at all. */
  readonly minimumTier: QualityTier;
  /** True when the asset is fetched on demand and excluded from the initial-load budget. */
  readonly lazy: boolean;
  /** Ceiling for the output's triangle count. The pipeline fails when an output exceeds it. */
  readonly triangleBudget?: number;
  /**
   * Set for a character that stands on the ground: its origin is at its feet (lowest point y = 0,
   * bounding box centred on x/z), it faces +z, and this is its height in the units of the GLB
   * (the source model's units, not metres). A consumer scales by `desiredHeight / standingHeight`.
   * The pipeline fails when the output's real height differs by more than 1%.
   */
  readonly standingHeight?: number;
}

const KiB = 1024;
const MiB = 1024 * KiB;

/** The four models committed under `assets/`, with their real directory totals. */
export const SOURCE_MODELS: readonly SourceModel[] = [
  {
    id: 'bikini-bottom-map',
    path: 'assets/bikini_bottom_map_3d_model/scene.gltf',
    bytes: 4_942_248,
  },
  {
    // The pineapple's interior only; the map supplies the exterior shell.
    id: 'pineapple-interior',
    path: 'assets/sbfbb-spongebob_house/scene.gltf',
    bytes: 2_289_066,
  },
  {
    id: 'spongebob-character',
    path: 'assets/sponge_on_the_run_spongebob_base_model/scene.gltf',
    bytes: 17_354_286,
  },
  {
    id: 'patrick-character',
    path: 'assets/sponge_on_the_run_patrick_base_model_textured/scene.gltf',
    bytes: 3_393_407,
  },
];

/**
 * Every file the site loads. The map is split into the environment (landmark nodes removed)
 * and one entry per MVP landmark, so a regression is attributable to the file that caused it.
 * Characters, narrators and the interior are lazy: none is needed for the first view.
 */
export const WEB_ASSETS: readonly AssetEntry[] = [
  {
    id: 'environment',
    sourceModel: 'bikini-bottom-map',
    compressedPath: 'models/environment.glb',
    budgetBytes: 1200 * KiB,
    minimumTier: 'low',
    lazy: false,
  },
  {
    id: 'landmark-pineapple',
    sourceModel: 'bikini-bottom-map',
    compressedPath: 'models/landmark-pineapple.glb',
    budgetBytes: 150 * KiB,
    minimumTier: 'low',
    lazy: false,
  },
  {
    id: 'landmark-tiki',
    sourceModel: 'bikini-bottom-map',
    compressedPath: 'models/landmark-tiki.glb',
    budgetBytes: 150 * KiB,
    minimumTier: 'low',
    lazy: false,
  },
  {
    id: 'landmark-krusty-krab',
    sourceModel: 'bikini-bottom-map',
    compressedPath: 'models/landmark-krusty-krab.glb',
    budgetBytes: 150 * KiB,
    minimumTier: 'low',
    lazy: false,
  },
  {
    // Source for the Chum Bucket reskin.
    id: 'landmark-bureau',
    sourceModel: 'bikini-bottom-map',
    compressedPath: 'models/landmark-bureau.glb',
    budgetBytes: 150 * KiB,
    minimumTier: 'low',
    lazy: false,
  },
  {
    id: 'pineapple-interior',
    sourceModel: 'pineapple-interior',
    compressedPath: 'models/pineapple-interior.glb',
    budgetBytes: 600 * KiB,
    minimumTier: 'high',
    lazy: true,
  },
  {
    id: 'spongebob-character',
    sourceModel: 'spongebob-character',
    compressedPath: 'models/spongebob-character.glb',
    budgetBytes: 2 * MiB,
    minimumTier: 'medium',
    lazy: true,
  },
  {
    id: 'patrick-character',
    sourceModel: 'patrick-character',
    compressedPath: 'models/patrick-character.glb',
    budgetBytes: 1 * MiB,
    minimumTier: 'high',
    lazy: true,
  },
  {
    // Talking-narrator LOD of the SpongeBob model: ~12k tris, stood on the ground facing +z.
    id: 'spongebob-narrator',
    sourceModel: 'spongebob-character',
    compressedPath: 'models/spongebob-narrator.glb',
    budgetBytes: 250 * KiB,
    minimumTier: 'medium',
    lazy: true,
    triangleBudget: 12_500,
    standingHeight: 10.033,
  },
  {
    // Talking-narrator LOD of the Patrick model: ~10k tris, stood on the ground facing +z.
    id: 'patrick-narrator',
    sourceModel: 'patrick-character',
    compressedPath: 'models/patrick-narrator.glb',
    budgetBytes: 200 * KiB,
    minimumTier: 'medium',
    lazy: true,
    triangleBudget: 10_000,
    standingHeight: 14.889,
  },
];

export const findAsset = (id: string): AssetEntry | undefined =>
  WEB_ASSETS.find((asset) => asset.id === id);

/** The source model for an id. Throws only if `SOURCE_MODELS` and `SourceModelId` diverge. */
export const findSourceModel = (id: SourceModelId): SourceModel => {
  const model = SOURCE_MODELS.find((candidate) => candidate.id === id);
  if (!model) {
    throw new Error(`Source model "${id}" is not listed in SOURCE_MODELS`);
  }
  return model;
};

/** Total compressed budget across every asset, lazy or not. */
export const totalBudgetBytes = (assets: readonly AssetEntry[] = WEB_ASSETS): number =>
  assets.reduce((sum, asset) => sum + asset.budgetBytes, 0);

/** Compressed budget of what the first view loads: non-lazy assets only. */
export const initialLoadBudgetBytes = (assets: readonly AssetEntry[] = WEB_ASSETS): number =>
  totalBudgetBytes(assets.filter((asset) => !asset.lazy));

/** Source model ids that have no attribution record. Non-empty means a licence violation. */
export const assetsMissingAttribution = (
  models: readonly SourceModel[] = SOURCE_MODELS
): readonly SourceModelId[] =>
  models.filter((model) => !ATTRIBUTIONS[model.id]).map((model) => model.id);
