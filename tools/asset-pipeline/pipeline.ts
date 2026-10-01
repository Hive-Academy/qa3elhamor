import {
  Document,
  NodeIO,
  PropertyType,
  type mat4,
  type Material,
  type Node,
  type Primitive,
  type Skin,
  type Texture,
  type TextureInfo,
  type Transform,
} from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import {
  clearNodeParent,
  clearNodeTransform,
  compactPrimitive,
  dedup,
  getBounds,
  join,
  prune,
  QUANTIZE_DEFAULTS,
  reorder,
  quantize,
  textureCompress,
  transformMesh,
  unweld,
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
  /** Keep topological borders (UV seams, open edges) fixed. Stops cracks along texture seams. */
  readonly lockBorder?: boolean;
  /** Allow collapses across UV/normal seams, charged as attribute error. For models with dense seams. */
  readonly permissive?: boolean;
  /** Per-material override of `ratio`, keyed by the source material name. */
  readonly ratioByMaterial?: Readonly<Record<string, number>>;
}

/** Per-asset processing knobs on top of the common prune, dedup, textures and Meshopt steps. */
export interface AssetOptions {
  /** Decimate before Meshopt. Meshopt compresses triangles; it does not remove them. */
  readonly simplify?: SimplifyConfig;
  /** Merge vertices that share all attributes. Implied by `simplify`. */
  readonly weld?: boolean;
  /** Merge primitives that share a material, to cut the primitive, accessor and JSON count. */
  readonly join?: boolean;
  /**
   * Stand a whole character on the ground at the origin: bake every node transform, turn it `yaw`
   * radians about +y, centre its bounding box on x/z and put its lowest point at y = 0. The
   * resulting height is recorded as `height`. Units stay those of the source model.
   */
  readonly stand?: { readonly yaw: number };
  /**
   * Drop normal maps and the tangent stream they need. Invisible at narrator viewing distances, and
   * the saving is a full texture plus 16 bytes per vertex.
   */
  readonly dropNormalMaps?: boolean;
  /**
   * Replace the base colour texture with per-vertex colour, sampled at each triangle's UV centroid.
   * For models whose texture is a flat colour per quad (Patrick), where every quad is its own UV
   * island: the islands stop the simplifier collapsing anything, and the texture is mostly
   * gutter. Needs `simplify` to do the decimating; this only moves the colour onto the mesh.
   */
  readonly bakeVertexColours?: boolean;
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
  /** Height of a `stand`ed character in source units, or null. */
  readonly height: number | null;
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

/** Bakes the scene into mesh-root nodes, then yaws, centres and grounds it. Returns its height. */
export function standOnGround(doc: Document, yaw: number): number {
  if (doc.getRoot().listSkins().length > 0) {
    throw new Error('stand: skinned models are not supported (joint nodes would be discarded).');
  }
  const meshNodes = doc.getRoot().listNodes().filter((n) => n.getMesh());
  for (const node of meshNodes) bakeWorldTransform(node);
  for (const node of doc.getRoot().listNodes()) if (!node.getMesh()) node.dispose();
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  // Column-major: rotation about +y by `yaw`.
  const rotate: mat4 = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
  for (const node of meshNodes) transformMesh(node.getMesh()!, rotate);
  const { min, max } = unionBounds(meshNodes);
  const shift = [-(min[0]! + max[0]!) / 2, -min[1]!, -(min[2]! + max[2]!) / 2];
  for (const node of meshNodes) {
    transformMesh(node.getMesh()!, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, shift[0]!, shift[1]!, shift[2]!, 1]);
  }
  return max[1]! - min[1]!;
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
  // Materials are deduped after simplify, so `ratioByMaterial` sees the source's material names:
  // dedup keeps one name per merged group and would make the other keys match nothing.
  await doc.transform(
    dedup({
      propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE, PropertyType.SKIN],
    }),
    prune(),
  );
  dropOrphanedSkinAttributes(doc);
  if (options.dropNormalMaps) dropNormalMaps(doc);
  if (options.bakeVertexColours) await bakeVertexColours(doc);
  if (options.weld || options.simplify) await doc.transform(weld());
  if (options.simplify) simplifyAttributeAware(doc, options.simplify);
  await doc.transform(dedup({ propertyTypes: [PropertyType.MATERIAL] }), prune());
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

const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

async function bakeVertexColours(doc: Document): Promise<void> {
  await doc.transform(unweld());
  const decoded = new Map<Texture, { data: Buffer; width: number; height: number }>();
  for (const material of doc.getRoot().listMaterials()) {
    const texture = material.getBaseColorTexture();
    if (!texture || decoded.has(texture)) continue;
    const { data, info } = await sharp(Buffer.from(texture.getImage()!))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    decoded.set(texture, { data, width: info.width, height: info.height });
  }
  const baked = new Set<Material>();
  const lut = Array.from({ length: 256 }, (_, i) => srgbToLinear(i / 255));
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const texture = prim.getMaterial()?.getBaseColorTexture();
      const uv = prim.getAttribute('TEXCOORD_0');
      if (!texture) continue;
      if (!uv || prim.getIndices()) {
        // `unweld` leaves no index buffer, so an indexed or UV-less textured primitive was not baked.
        throw new Error(`bakeVertexColours: textured primitive of "${mesh.getName()}" has no UVs or is still indexed.`);
      }
      baked.add(prim.getMaterial()!);
      const image = decoded.get(texture)!;
      const colours = new Float32Array(uv.getCount() * 3);
      const tri = [0, 0, 0];
      const el = [0, 0];
      for (let t = 0; t < uv.getCount(); t += 3) {
        let u = 0;
        let v = 0;
        for (let k = 0; k < 3; k++) {
          tri[k] = t + k;
          uv.getElement(tri[k]!, el);
          u += el[0]! / 3;
          v += el[1]! / 3;
        }
        const x = Math.min(image.width - 1, Math.floor((u - Math.floor(u)) * image.width));
        const y = Math.min(image.height - 1, Math.floor((v - Math.floor(v)) * image.height));
        const at = (y * image.width + x) * 4;
        for (const vertex of tri) {
          for (let c = 0; c < 3; c++) colours[vertex! * 3 + c] = lut[image.data[at + c]!]!;
        }
      }
      prim.setAttribute(
        'COLOR_0',
        doc.createAccessor().setType('VEC3').setArray(colours).setBuffer(doc.getRoot().listBuffers()[0]!),
      );
      prim.setAttribute('TEXCOORD_0', null);
      smoothNormals(prim);
    }
  }
  for (const material of baked) material.setBaseColorTexture(null);
}

/**
 * Gives every vertex at one position the same normal (the average). The source splits its normals
 * at quad borders; with the UV islands gone those splits are the only thing left stopping collapses.
 */
function smoothNormals(prim: Primitive): void {
  const position = prim.getAttribute('POSITION');
  const normal = prim.getAttribute('NORMAL');
  if (!position || !normal) return;
  const sums = new Map<string, number[]>();
  // Positions are bucketed to 1e-4 source units (about 7e-6 of Patrick's height): finer than any
  // real feature of these models, so distinct vertices never share a bucket in practice.
  const keyOf = (i: number): string => {
    const p = position.getElement(i, [0, 0, 0]);
    return p.map((x) => Math.round(x * 1e4)).join();
  };
  const n = [0, 0, 0];
  for (let i = 0; i < position.getCount(); i++) {
    normal.getElement(i, n);
    const key = keyOf(i);
    const sum = sums.get(key) ?? sums.set(key, [0, 0, 0]).get(key)!;
    for (let c = 0; c < 3; c++) sum[c]! += n[c]!;
  }
  for (let i = 0; i < position.getCount(); i++) {
    const sum = sums.get(keyOf(i))!;
    const len = Math.hypot(sum[0]!, sum[1]!, sum[2]!) || 1;
    normal.setElement(i, [sum[0]! / len, sum[1]! / len, sum[2]! / len]);
  }
}

function dropNormalMaps(doc: Document): void {
  for (const material of doc.getRoot().listMaterials()) material.setNormalTexture(null);
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) prim.setAttribute('TANGENT', null);
  }
}

/** How strongly a UV or normal change counts against a collapse, relative to a position change. */
const UV_WEIGHT = 2;
const NORMAL_WEIGHT = 0.5;
const COLOUR_WEIGHT = 1;

/**
 * Decimates every triangle primitive with the Meshopt simplifier, weighing UV and normal error as
 * well as position. glTF-Transform's own `simplify` looks at positions only, which lets a collapse
 * drag a vertex across a UV island boundary and sample the atlas's empty (black) texels; this is
 * what produced dark slits across SpongeBob's face. Callers must `weld` first.
 */
function simplifyAttributeAware(doc: Document, config: SimplifyConfig): void {
  const matched = new Set<string>();
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4 || !prim.getIndices()) {
        console.warn(
          `simplify: skipped a primitive of "${mesh.getName()}" (material "${prim.getMaterial()?.getName() ?? ''}"): ` +
            'not an indexed triangle list, so it keeps full detail.',
        );
        continue;
      }
      const position = prim.getAttribute('POSITION');
      const uv = prim.getAttribute('TEXCOORD_0');
      const normal = prim.getAttribute('NORMAL');
      const colour = prim.getAttribute('COLOR_0');
      const indices = prim.getIndices();
      if (!position) continue;
      const count = position.getCount();
      const positions = new Float32Array(count * 3);
      const attributes = new Float32Array(count * 8);
      const el = [0, 0, 0];
      for (let i = 0; i < count; i++) {
        position.getElement(i, el);
        positions.set(el, i * 3);
        if (uv) {
          uv.getElement(i, el);
          attributes[i * 8] = el[0]!;
          attributes[i * 8 + 1] = el[1]!;
        }
        if (normal) {
          normal.getElement(i, el);
          attributes.set(el, i * 8 + 2);
        }
        if (colour) {
          colour.getElement(i, el);
          attributes.set(el.slice(0, 3), i * 8 + 5);
        }
      }
      const src = new Uint32Array(indices!.getArray()!);
      const materialName = prim.getMaterial()?.getName() ?? '';
      if (config.ratioByMaterial && materialName in config.ratioByMaterial) matched.add(materialName);
      const ratio = config.ratioByMaterial?.[materialName] ?? config.ratio;
      const target = Math.floor((ratio * src.length) / 3) * 3;
      const [dst] = MeshoptSimplifier.simplifyWithAttributes(
        src,
        positions,
        3,
        attributes,
        8,
        [
          UV_WEIGHT,
          UV_WEIGHT,
          NORMAL_WEIGHT,
          NORMAL_WEIGHT,
          NORMAL_WEIGHT,
          COLOUR_WEIGHT,
          COLOUR_WEIGHT,
          COLOUR_WEIGHT,
        ],
        null,
        target,
        config.error,
        [...(config.lockBorder ? (['LockBorder'] as const) : []), ...(config.permissive ? (['Permissive'] as const) : [])],
      );
      if (dst.length === 0) {
        throw new Error(`simplify: material "${materialName}" of "${mesh.getName()}" decimated to nothing.`);
      }
      indices!.setArray(new Uint32Array(dst));
      compactPrimitive(prim);
      const compacted = prim.getIndices()!;
      if (prim.getAttribute('POSITION')!.getCount() <= 65534) {
        compacted.setArray(new Uint16Array(compacted.getArray()!));
      }
    }
  }
  const dead = Object.keys(config.ratioByMaterial ?? {}).filter((key) => !matched.has(key));
  if (dead.length) {
    throw new Error(
      `simplify: ratioByMaterial keys match no material: ${dead.join(', ')}. ` +
        'The source was probably re-exported with different material names.',
    );
  }
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
  const height = options.stand ? standOnGround(doc, options.stand.yaw) : null;
  await optimise(doc, options);
  return { bytes: await io.writeBinary(doc), offset, trianglesBefore, height };
}
