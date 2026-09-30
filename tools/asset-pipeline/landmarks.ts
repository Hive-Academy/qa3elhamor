/**
 * Landmark extraction config for `assets/bikini_bottom_map_3d_model`.
 *
 * Node indices and centres come from `docs/asset-inventory.md` ("Landmark extraction map").
 * Centres are RAW accessor coordinates: scene-world is raw x 0.01, because nodes 0 and 1 of the
 * map carry a net uniform 0.01 scale.
 *
 * The map has no per-building parent nodes, and several landmarks have parts under both the
 * `buildings` and `details` groups. Selection is therefore an explicit allowlist, and every
 * allowlisted node's bounding-box centre must sit inside its part's region. Name matching is
 * not used: eighteen nodes match /krusty|krab/i and six of them belong to other buildings.
 */

export type Vec3 = readonly [number, number, number];

/** Scene-world = raw accessor coordinates x this. */
export const RAW_TO_WORLD = 0.01;

export interface LandmarkPart {
  readonly label: string;
  /** Node indices in the source glTF `nodes` array. */
  readonly nodes: readonly number[];
  /** Expected bounding-box centre of the part, raw accessor space. */
  readonly centre: Vec3;
  /** Every node's bbox centre must be within this distance (raw units) of `centre`. */
  readonly radius: number;
  /**
   * Expected bounding-box size of all the part's nodes together, raw units, from the audit. The
   * union of the allowlisted nodes must match it within SIZE_TOLERANCE, and its centre must match
   * `centre` within CENTRE_TOLERANCE. This is what rejects a node that sits in the region but is
   * really a multi-building mesh, such as 279 or 313.
   */
  readonly size: Vec3;
  /**
   * Measured bounding-box centre of each allowlisted node, raw units. Pins node identity: a node
   * that merely sits inside the part's region (node 227 beside the Chum Bucket) still fails.
   */
  readonly nodeCentres: Readonly<Record<number, Vec3>>;
  /** No single node may have a bounding-box diagonal longer than this (raw units). */
  readonly maxNodeDiagonal: number;
}

/** Relative tolerance per axis on a part's expected size. */
export const SIZE_TOLERANCE = 0.1;
/** Absolute tolerance, raw units, on a part's expected centre. */
export const CENTRE_TOLERANCE = 1.5;
/** Absolute tolerance, raw units, on each node's measured centre. */
export const NODE_CENTRE_TOLERANCE = 1;

export interface LandmarkSpec {
  /** Matches an `AssetEntry.id` in `WEB_ASSETS`. */
  readonly id: string;
  readonly parts: readonly LandmarkPart[];
}

export const LANDMARKS: readonly LandmarkSpec[] = [
  {
    id: 'landmark-pineapple',
    parts: [
      {
        label: 'pineapple shell, crown, door, dressing',
        // 259 shell, 223 crown, 229 airlock, 247 door, 241 chair, 353/355 flowers (`details`).
        nodes: [259, 223, 229, 247, 241, 353, 355],
        centre: [78.91, 6.95, -9.92],
        radius: 7,
        size: [7.77, 12.8, 7.78],
        maxNodeDiagonal: 14,
        nodeCentres: {
          259: [78.85, 4.59, -10.08],
          223: [78.8, 10.66, -10.12],
          229: [77.28, 2.66, -6.73],
          247: [77.29, 2.69, -6.8],
          241: [78.82, 8.21, -10.12],
          353: [78.8, 1.93, -7.96],
          355: [78.91, 1.73, -9.23],
        },
      },
    ],
  },
  {
    id: 'landmark-tiki',
    parts: [
      {
        label: 'tiki head',
        nodes: [263],
        centre: [65.15, 7.0, -19.21],
        radius: 3,
        size: [7.13, 11.84, 6.8],
        maxNodeDiagonal: 16.5,
        nodeCentres: { 263: [65.15, 7.0, -19.21] },
      },
    ],
  },
  {
    id: 'landmark-krusty-krab',
    parts: [
      {
        label: 'krusty krab building',
        nodes: [175, 187, 209, 183, 173, 181, 171, 179, 177, 185],
        centre: [-55.4, 4.09, -37.53],
        radius: 6,
        size: [17.23, 9.02, 13.91],
        maxNodeDiagonal: 26,
        nodeCentres: {
          175: [-55.4, 4.09, -37.53],
          187: [-55.39, 4.19, -37.4],
          209: [-55.29, 4.21, -37.46],
          183: [-55.32, 5.3, -37.5],
          173: [-54.6, 5.19, -33.35],
          181: [-55.3, 1.95, -37.46],
          171: [-54.64, 4.35, -33.24],
          179: [-54.67, 1.26, -33.88],
          177: [-56.74, 1.96, -36.32],
          185: [-53.61, 1.95, -36.84],
        },
      },
      {
        label: 'krusty krab roadside sign (`details`)',
        nodes: [342, 344],
        centre: [-67.81, 10.59, -23.32],
        radius: 4,
        size: [7.9, 8.62, 7.83],
        maxNodeDiagonal: 15.5,
        nodeCentres: {
          342: [-67.81, 10.59, -23.32],
          344: [-68.93, 11.53, -25.21],
        },
      },
    ],
  },
  {
    id: 'landmark-bureau',
    parts: [
      {
        // Chum Bucket, reskinned later into the Complaints Bureau.
        label: 'chum bucket, hand, sign (`details`)',
        nodes: [199, 201, 203, 357],
        centre: [-60.57, 17.18, -0.87],
        radius: 16,
        size: [20.29, 35.06, 18.36],
        maxNodeDiagonal: 43,
        nodeCentres: {
          199: [-60.57, 13.9, -0.87],
          201: [-58.75, 9.95, -6.82],
          203: [-60.89, 29.43, -1.1],
          357: [-58.24, 4.69, -7.67],
        },
      },
    ],
  },
];
