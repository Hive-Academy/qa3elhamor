import {
  Document,
  NodeIO,
  PropertyType,
  type Node,
  type Primitive,
  type Skin,
  type TextureInfo,
  type Transform,
} from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import {
  clearNodeParent,
  clearNodeTransform,
  dedup,
  getBounds,
  join,
  prune,
  QUANTIZE_DEFAULTS,
  reorder,
  quantize,
  simplify,
  textureCompress,
  transformMesh,
  weld,
} from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import {
  CENTRE_TOLERANCE,
  LANDMARKS,
  NODE_CENTRE_TOLERANCE,
  RAW_TO_WORLD,
  SIZE_TOLERANCE,
  type LandmarkSpec,
  type Vec3,
} from './landmarks.js';

const DEFAULT_MAX_TEXTURE_SIZE = 1024;
const DEFAULT_WEBP_QUALITY = 80;

export interface SimplifyConfig {
  /** Fraction of triangles to keep. */
  readonly ratio: number;
  /** Maximum error relative to the mesh extent. */
  readonly error: number;
}

/** Per-asset processing knobs on top of the common prune, dedup, textures and Meshopt steps. */
export interface AssetOptions {
  /** Decimate before Meshopt. Meshopt compresses triangles; it does not remove them. */
  readonly simplify?: SimplifyConfig;
  /** Merge vertices that share all attributes. Implied by `simplify`. */
  readonly weld?: boolean;
  /** Merge primitives that share a material, to cut the primitive, accessor and JSON count. */
  readonly join?: boolean;
  /** Textures larger than this many pixels on a side are resized down. Default 1024. */
  readonly maxTextureSize?: number;
  /** WebP quality, 1-100. Default 80. */
  readonly textureQuality?: number;
}

export interface BuiltAsset {
  readonly bytes: Uint8Array;
  /** Scene-world position of the asset's origin, or null when it is already in place. */
  readonly offset: Vec3 | null;
  readonly trianglesBefore: number;
}

export async function initCodecs(): Promise<void> {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
}

export function createIO(): NodeIO {
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
    });
}

export function countTriangles(doc: Document): number {
  let total = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) total += primitiveTriangles(prim);
  }
  return total;
}

function primitiveTriangles(prim: Primitive): number {
  if (prim.getMode() !== 4) return 0;
  const indices = prim.getIndices();
  const count = indices ? indices.getCount() : (prim.getAttribute('POSITION')?.getCount() ?? 0);
  return Math.floor(count / 3);
}

/** The source map's ancestors must be a pure uniform 0.01 scale, or the raw<->world maths is wrong. */
function assertUniformScale(node: Node): void {
  const s = node.getWorldScale();
  for (const v of s) {
    if (Math.abs(v - RAW_TO_WORLD) > 1e-6) {
      throw new Error(
        `Source map node "${node.getName()}" has world scale [${s.join(', ')}], expected ${RAW_TO_WORLD}. ` +
          'The raw-to-world assumption in landmarks.ts no longer holds.',
      );
    }
  }
}

/** The node and every descendant. The map's allowlisted nodes are containers; meshes sit on a child. */
function subtree(node: Node): Node[] {
  const out: Node[] = [];
  node.traverse((n) => out.push(n));
  return out;
}

/** Moves the node to the scene root and applies its full world transform to its mesh vertices. */
function bakeWorldTransform(node: Node): void {
  const mesh = node.getMesh();
  if (mesh && mesh.listParents().filter((p) => p.propertyType === PropertyType.NODE).length > 1) {
    node.setMesh(mesh.clone());
  }
  clearNodeParent(node);
  clearNodeTransform(node);
}

function nodeRawCentre(node: Node): Vec3 {
  const { min, max } = getBounds(node);
  return [0, 1, 2].map((i) => (min[i]! + max[i]!) / 2 / RAW_TO_WORLD) as unknown as Vec3;
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Fails unless every allowlisted node exists, has geometry, and matches the audit: its bbox centre
 * is where it was measured, no node is longer than the part allows, and the part's union bbox has
 * the audited size and centre. Any failure means the allowlist no longer describes the source map.
 */
export function assertLandmarkRegions(
  mapDoc: Document,
  landmarks: readonly LandmarkSpec[] = LANDMARKS,
): void {
  const nodes = mapDoc.getRoot().listNodes();
  const seen = new Map<number, string>();
  for (const spec of landmarks) {
    for (const part of spec.parts) {
      const where = `${spec.id} "${part.label}"`;
      const pinned = Object.keys(part.nodeCentres).map(Number).sort((a, b) => a - b);
      if (pinned.join() !== [...part.nodes].sort((a, b) => a - b).join()) {
        throw new Error(`${where}: nodeCentres keys [${pinned}] do not match nodes [${part.nodes}].`);
      }
      for (const index of part.nodes) {
        const owner = seen.get(index);
        if (owner) throw new Error(`Node ${index} is allowlisted by both ${owner} and ${spec.id}.`);
        seen.set(index, spec.id);
        const node = nodes[index];
        if (!node || !subtree(node).some((n) => n.getMesh())) {
          throw new Error(`${where}: node ${index} does not exist or has no geometry.`);
        }
        assertUniformScale(node);
        const name = `${where}: node ${index} "${node.getName()}"`;
        const centre = nodeRawCentre(node);
        const fmt = (v: readonly number[]): string => `[${v.map((x) => x.toFixed(2)).join(', ')}]`;
        const fromRegion = distance(centre, part.centre);
        if (fromRegion > part.radius) {
          throw new Error(
            `${name} has bbox centre ${fmt(centre)}, ${fromRegion.toFixed(2)} from the region ` +
              `centre (radius ${part.radius}).`,
          );
        }
        const fromPinned = distance(centre, part.nodeCentres[index]!);
        if (fromPinned > NODE_CENTRE_TOLERANCE) {
          throw new Error(
            `${name} has bbox centre ${fmt(centre)}, expected ${fmt(part.nodeCentres[index]!)} ` +
              `(tolerance ${NODE_CENTRE_TOLERANCE}).`,
          );
        }
        const { min, max } = getBounds(node);
        const diagonal = Math.hypot(...[0, 1, 2].map((i) => (max[i]! - min[i]!) / RAW_TO_WORLD));
        if (diagonal > part.maxNodeDiagonal) {
          throw new Error(
            `${name} has bbox diagonal ${diagonal.toFixed(2)} > ${part.maxNodeDiagonal}; it is ` +
              'probably a multi-building mesh.',
          );
        }
      }
      const { min, max } = unionBounds(part.nodes.map((i) => nodes[i]!));
      const size = [0, 1, 2].map((i) => (max[i]! - min[i]!) / RAW_TO_WORLD);
      const unionCentre = [0, 1, 2].map((i) => (max[i]! + min[i]!) / 2 / RAW_TO_WORLD);
      const sizeOff = size.some((v, i) => Math.abs(v - part.size[i]!) > part.size[i]! * SIZE_TOLERANCE);
      if (sizeOff || distance(unionCentre as unknown as Vec3, part.centre) > CENTRE_TOLERANCE) {
        throw new Error(
          `${where}: union bbox size [${size.map((v) => v.toFixed(2))}] centre ` +
            `[${unionCentre.map((v) => v.toFixed(2))}] does not match the audit ` +
            `(size [${part.size}] +/-${SIZE_TOLERANCE * 100}%, centre [${part.centre}] +/-${CENTRE_TOLERANCE}).`,
        );
      }
    }
  }
}

function unionBounds(roots: readonly Node[]): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const root of roots) {
    const b = getBounds(root);
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i]!, b.min[i]!);
      max[i] = Math.max(max[i]!, b.max[i]!);
    }
  }
  return { min, max };
}

export function allLandmarkNodes(): number[] {
  return LANDMARKS.flatMap((l) => l.parts.flatMap((p) => [...p.nodes]));
}

/** Keeps only the allowlisted nodes, baked into scene-world and re-centred on their bbox centre. */
export function extractLandmark(mapDoc: Document, spec: LandmarkSpec): { offset: Vec3 } {
  const nodes = mapDoc.getRoot().listNodes();
  const keep = new Set(spec.parts.flatMap((p) => p.nodes.flatMap((i) => subtree(nodes[i]!))));
  const meshNodes = [...keep].filter((n) => n.getMesh());
  // World matrices must be read before any node is re-parented.
  const { min, max } = unionBounds(spec.parts.flatMap((p) => p.nodes.map((i) => nodes[i]!)));
  const centre = [0, 1, 2].map((i) => (min[i]! + max[i]!) / 2) as unknown as Vec3;
  for (const node of meshNodes) bakeWorldTransform(node);
  for (const node of nodes) if (!keep.has(node) || !node.getMesh()) node.dispose();
  for (const node of meshNodes) {
    transformMesh(node.getMesh()!, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -centre[0], -centre[1], -centre[2], 1]);
  }
  return { offset: centre };
}

/** Removes every landmark node and bakes what is left into scene-world, in place. */
export function extractEnvironment(mapDoc: Document): void {
  const nodes = mapDoc.getRoot().listNodes();
  for (const index of allLandmarkNodes()) for (const n of subtree(nodes[index]!)) n.dispose();
  for (const node of mapDoc.getRoot().listNodes()) if (node.getMesh()) bakeWorldTransform(node);
  for (const node of mapDoc.getRoot().listNodes()) if (!node.getMesh()) node.dispose();
}

/** The lossless steps, then geometry decimation (when configured), textures, and Meshopt. */
export async function optimise(doc: Document, options: AssetOptions): Promise<void> {
  await doc.transform(dedup(), prune());
  dropOrphanedSkinAttributes(doc);
  if (options.weld || options.simplify) await doc.transform(weld());
  if (options.simplify) {
    await doc.transform(
      simplify({
        simplifier: MeshoptSimplifier,
        ratio: options.simplify.ratio,
        error: options.simplify.error,
      }),
    );
  }
  wrapTexcoordsIntoUnitRange(doc);
  if (options.join) await doc.transform(join({ keepMeshes: false, keepNamed: false }));
  const size = options.maxTextureSize ?? DEFAULT_MAX_TEXTURE_SIZE;
  await doc.transform(
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      resize: [size, size],
      quality: options.textureQuality ?? DEFAULT_WEBP_QUALITY,
    }),
    prune(),
  );
  stripNames(doc);
  await compressGeometry(doc);
}

/**
 * The map's UVs mostly sit outside [0,1], which stops `quantize` packing them and leaves 8 bytes
 * of float per vertex. Every sampler here repeats, so a whole-number shift of a primitive's UVs
 * samples exactly the same texels. Shift each primitive so its UV minimum lands in [0,1).
 * Primitives that still span more than one tile afterwards stay float, but snapped (see `snap`).
 */
/**
 * Rounds to a 1/UV_GRID grid. A float32 UV snapped to a coarse grid has empty low mantissa bytes,
 * which Meshopt packs far better; the error is under a texel for textures up to UV_GRID pixels.
 */
const UV_GRID = 2048;
const snap = (v: number): number => Math.round(v * UV_GRID) / UV_GRID;

function wrapTexcoordsIntoUnitRange(doc: Document): void {
  const repeats = doc
    .getRoot()
    .listTextures()
    .every((t) =>
      t
        .listParents()
        .filter((p): p is TextureInfo => p.propertyType === PropertyType.TEXTURE_INFO)
        .every((info) => info.getWrapS() === 10497 && info.getWrapT() === 10497),
    );
  if (!repeats) return;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const semantic of prim.listSemantics().filter((k) => k.startsWith('TEXCOORD_'))) {
        let uv = prim.getAttribute(semantic)!;
        if (uv.listParents().filter((p) => p.propertyType !== PropertyType.ROOT).length > 1) {
          uv = uv.clone();
          prim.setAttribute(semantic, uv);
        }
        const min = [Infinity, Infinity];
        const el = [0, 0];
        for (let i = 0; i < uv.getCount(); i++) {
          uv.getElement(i, el);
          min[0] = Math.min(min[0]!, el[0]!);
          min[1] = Math.min(min[1]!, el[1]!);
        }
        const shift = [Math.floor(min[0]!), Math.floor(min[1]!)];
        for (let i = 0; i < uv.getCount(); i++) {
          uv.getElement(i, el);
          uv.setElement(i, [snap(el[0]! - shift[0]!), snap(el[1]! - shift[1]!)]);
        }
      }
    }
  }
}

/** Node, mesh, accessor, texture and image names are JSON weight the site never reads. */
function stripNames(doc: Document): void {
  const root = doc.getRoot();
  for (const p of [
    ...root.listNodes(),
    ...root.listMeshes(),
    ...root.listAccessors(),
    ...root.listTextures(),
    ...root.listSkins(),
  ]) {
    p.setName('');
  }
}

/** Points every node at one skin when skins have the same joints and inverse bind matrices. */
function mergeIdenticalSkins(): Transform {
  return async (doc: Document): Promise<void> => {
    const canonical = new Map<string, Skin>();
    const uid = new Map<Node, number>();
    const id = (n: Node): number => uid.get(n) ?? uid.set(n, uid.size).get(n)!;
    for (const node of doc.getRoot().listNodes()) {
      const skin = node.getSkin();
      if (!skin) continue;
      const ibm = skin.getInverseBindMatrices()?.getArray() ?? [];
      const key = `${skin.listJoints().map(id).join(',')}|${skin.getSkeleton() ? id(skin.getSkeleton()!) : ''}|${Array.from(ibm).join(',')}`;
      const first = canonical.get(key);
      if (first) node.setSkin(first);
      else canonical.set(key, skin);
    }
  };
}

/**
 * Meshopt `medium`: reorder, quantise with no octahedral filter, then compress. `high` is not used
 * because it warps the silhouette of these low-poly models. This is `meshopt({ level: 'medium' })`
 * with two deliberate differences:
 *
 * - Normals are quantised to 8 bits rather than 10. Ten-bit normals are stored as int16 and barely
 *   compress; eight-bit ones cost about half as much and are not visible on flat-shaded stylised art.
 * - Skinned meshes are quantised against one shared volume, then their identical skins are merged.
 *   Per-mesh volumes give every mesh its own corrected skin, which costs more than quantising saves.
 */
async function compressGeometry(doc: Document): Promise<void> {
  const skinned = doc.getRoot().listSkins().length > 0;
  await doc.transform(
    reorder({ encoder: MeshoptEncoder, target: 'size' }),
    quantize({
      ...QUANTIZE_DEFAULTS,
      pattern: /.*/,
      patternTargets: /.*/,
      quantizeNormal: 8,
      quantizationVolume: skinned ? 'scene' : 'mesh',
    }),
  );
  if (skinned) await doc.transform(mergeIdenticalSkins(), prune());
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
}

/**
 * `prune` drops a skin no node references, but leaves the JOINTS_n/WEIGHTS_n vertex streams that
 * only that skin could use. With no skin left they are dead weight, so remove them.
 */
function dropOrphanedSkinAttributes(doc: Document): void {
  if (doc.getRoot().listSkins().length > 0) return;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const semantic of prim.listSemantics()) {
        if (/^(JOINTS|WEIGHTS)_\d+$/.test(semantic)) prim.setAttribute(semantic, null);
      }
    }
  }
}

/** Reads one source model and produces the optimised GLB for the asset `id`. */
export async function buildAsset(
  id: string,
  sourceGltf: string,
  options: AssetOptions,
): Promise<BuiltAsset> {
  const io = createIO();
  const doc = await io.read(sourceGltf);
  let offset: Vec3 | null = null;
  const landmark = LANDMARKS.find((l) => l.id === id);
  if (id === 'environment') extractEnvironment(doc);
  else if (landmark) offset = extractLandmark(doc, landmark).offset;
  await doc.transform(prune());
  const trianglesBefore = countTriangles(doc);
  await optimise(doc, options);
  return { bytes: await io.writeBinary(doc), offset, trianglesBefore };
}
