/**
 * Compresses the source models under `assets/` into the web-ready outputs listed by
 * `WEB_ASSETS`, then verifies every output against its byte budget.
 *
 *   npm run assets:compress        build every asset, then verify
 *   npm run assets:verify          verify the committed outputs only
 *
 * Exits non-zero when an output is over budget, cannot be re-read, or the set of outputs
 * drifts from the manifest. See README.md.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_MODELS, WEB_ASSETS, type AssetEntry } from '@qa3elhamor/world-domain';
import { LANDMARKS, type Vec3 } from './landmarks.js';
import {
  assertLandmarkRegions,
  buildAsset,
  createIO,
  initCodecs,
  type BuiltAsset,
  type AssetOptions,
} from './pipeline.js';
import { renderReport, type ReportRow } from './report.js';
import { verifyAsset, verifyBytes, type VerifiedAsset } from './verify.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = resolve(repoRoot, 'apps/web/public');
const modelsDir = resolve(publicDir, 'models');
const reportPath = resolve(repoRoot, 'docs/asset-compression-report.md');

const LANDMARK_OPTIONS: AssetOptions = { join: true };

/** Processing beyond the common steps. A landmark or model not listed here takes the defaults. */
const OPTIONS: Readonly<Record<string, AssetOptions>> = {
  environment: { join: true, textureQuality: 65 },
  'landmark-pineapple': LANDMARK_OPTIONS,
  'landmark-tiki': LANDMARK_OPTIONS,
  'landmark-krusty-krab': LANDMARK_OPTIONS,
  'landmark-bureau': LANDMARK_OPTIONS,
  'pineapple-interior': { maxTextureSize: 512 },
  // 519,664 triangles cannot fit 2 MiB however well Meshopt packs them.
  'spongebob-character': { simplify: { ratio: 0.15, error: 0.01 } },
  'patrick-character': { weld: true },
  // Narrator LODs: stood on the ground, facing +z (both sources already do), ~512 px textures.
  // The face-bearing SpongeBob meshes keep more triangles: at the flat ~1% the body's skin opens
  // dark slits where its UV seams collapse. Anything not listed gets `ratio`.
  'spongebob-narrator': {
    stand: { yaw: 0 },
    join: true,
    dropNormalMaps: true,
    maxTextureSize: 512,
    simplify: {
      ratio: 0.009,
      error: 0.05,
      ratioByMaterial: {
        'Base.002': 0.05,
        'EyeWhites.002': 0.05,
        'Pupils.002': 0.08,
        'Teeth.002': 0.1,
        'Cheeks.002': 0.05,
        'Eyelashes.002': 0.04,
      },
    },
  },
  // Patrick's texture is one flat colour per quad, each quad its own UV island, which pins the
  // simplifier at 16k triangles. The colour moves onto the vertices instead and the texture goes.
  'patrick-narrator': {
    stand: { yaw: 0 },
    join: true,
    bakeVertexColours: true,
    simplify: { ratio: 0.15, error: 0.05 },
  },
};

const landmarkIds = new Set(LANDMARKS.map((l) => l.id));
/**
 * Every other manifest entry is a whole model: its source compressed as it is (plus any
 * `OPTIONS`), not re-centred. So adding your own model is a `SOURCE_MODELS` + `WEB_ASSETS` entry
 * and nothing here (docs/template.md, "Replace a landmark's model").
 */
const WHOLE_MODEL_IDS = WEB_ASSETS.map((a) => a.id).filter(
  (id) => id !== 'environment' && !landmarkIds.has(id),
);
const RECIPE_IDS = new Set(['environment', ...landmarkIds, ...WHOLE_MODEL_IDS]);

function sourcePath(entry: AssetEntry): string {
  const model = SOURCE_MODELS.find((m) => m.id === entry.sourceModel);
  if (!model) throw new Error(`${entry.id}: unknown source model "${entry.sourceModel}".`);
  return resolve(repoRoot, model.path);
}

/** The manifest and this pipeline must describe exactly the same set of outputs. */
function assertNoDrift(): void {
  const manifestIds = new Set(WEB_ASSETS.map((a) => a.id));
  const problems: string[] = [];
  if (manifestIds.size !== WEB_ASSETS.length) problems.push('WEB_ASSETS has duplicate ids.');
  for (const id of manifestIds) {
    if (!RECIPE_IDS.has(id)) problems.push(`No recipe for manifest asset "${id}".`);
  }
  for (const id of RECIPE_IDS) {
    if (!manifestIds.has(id)) problems.push(`Recipe "${id}" has no WEB_ASSETS entry.`);
  }
  const landmarkIdList = LANDMARKS.map((l) => l.id);
  if (new Set(landmarkIdList).size !== landmarkIdList.length) {
    problems.push(`LANDMARKS has duplicate ids: ${landmarkIdList.join(', ')}.`);
  }
  for (const key of Object.keys(OPTIONS)) {
    if (!RECIPE_IDS.has(key)) problems.push(`OPTIONS has "${key}", which is not a recipe id.`);
  }
  const environment = WEB_ASSETS.find((a) => a.id === 'environment');
  for (const asset of WEB_ASSETS) {
    // A character stood on the ground must declare its height, and only such a character may.
    if ((OPTIONS[asset.id]?.stand !== undefined) !== (asset.standingHeight !== undefined)) {
      problems.push(`${asset.id}: \`stand\` in OPTIONS and \`standingHeight\` in WEB_ASSETS must go together.`);
    }
    // Landmarks are cut from the same map as the environment; a different source would be a typo.
    if (landmarkIds.has(asset.id) && asset.sourceModel !== environment?.sourceModel) {
      problems.push(`${asset.id}: sourceModel "${asset.sourceModel}" differs from the environment's.`);
    }
    if (!asset.compressedPath.startsWith('models/') || !asset.compressedPath.endsWith('.glb')) {
      problems.push(`${asset.id}: compressedPath "${asset.compressedPath}" is not models/*.glb.`);
    }
  }
  if (problems.length) throw new Error(`Manifest drift:\n  - ${problems.join('\n  - ')}`);
}

/** Any `.glb` in models/ that the manifest does not list is drift; fail rather than delete it. */
async function assertNoExtraOutputs(): Promise<void> {
  const expected = new Set(WEB_ASSETS.map((a) => a.compressedPath.replace(/^models\//, '')));
  const extra = (await readdir(modelsDir).catch(() => [] as string[])).filter(
    (f) => f.endsWith('.glb') && !expected.has(f),
  );
  if (extra.length) {
    throw new Error(
      `models/ contains files not in WEB_ASSETS: ${extra.join(', ')}. Delete them, or add the asset to the manifest.`,
    );
  }
}

interface Placement {
  offset: Vec3 | null;
  bytes: number;
  budgetBytes: number;
  triangles: number;
  /** Set for a standing character; see `AssetEntry.standingHeight`. */
  height: number | null;
}

async function main(): Promise<void> {
  const verifyOnly = process.argv.includes('--verify');
  assertNoDrift();
  await initCodecs();
  await assertNoExtraOutputs();

  const built = new Map<string, BuiltAsset>();
  const verified = new Map<string, VerifiedAsset>();
  const failures: string[] = [];

  if (verifyOnly) {
    for (const entry of WEB_ASSETS) {
      try {
        verified.set(entry.id, await verifyAsset(publicDir, entry));
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }
  } else {
    const mapEntry = WEB_ASSETS.find((a) => a.id === 'environment')!;
    assertLandmarkRegions(await createIO().read(sourcePath(mapEntry)));
    // Build and verify everything in memory first, so a failure leaves the committed set untouched.
    for (const entry of WEB_ASSETS) {
      const asset = await buildAsset(entry.id, sourcePath(entry), OPTIONS[entry.id] ?? {});
      built.set(entry.id, asset);
      try {
        verified.set(entry.id, await verifyBytes(entry, asset.bytes));
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }
  }
  for (const entry of WEB_ASSETS) {
    const v = verified.get(entry.id);
    if (v) {
      console.log(
        `verified ${entry.id.padEnd(22)} ${String(v.bytes).padStart(8)} / ${entry.budgetBytes} bytes, ${v.triangles} tris`,
      );
    }
  }
  if (failures.length) throw new Error(`Verification failed:\n  - ${failures.join('\n  - ')}`);
  if (verifyOnly) {
    console.log('asset-compression: OK');
    return;
  }

  const placements: Record<string, Placement> = {};
  const rows: ReportRow[] = [];
  for (const entry of WEB_ASSETS) {
    const v = verified.get(entry.id)!;
    const b = built.get(entry.id)!;
    placements[entry.id] = {
      offset: b.offset,
      bytes: v.bytes,
      budgetBytes: entry.budgetBytes,
      triangles: v.triangles,
      height: b.height === null ? null : Number(b.height.toFixed(3)),
    };
    const source = SOURCE_MODELS.find((m) => m.id === entry.sourceModel)!;
    rows.push({
      entry,
      sourceModelBytes: source.bytes,
      outputBytes: v.bytes,
      trianglesBefore: b.trianglesBefore,
      trianglesAfter: v.triangles,
      offset: b.offset,
    });
  }
  // Everything that can fail has; only now touch the disk.
  const report = renderReport(await readFile(reportPath, 'utf8').catch(() => null), rows);
  await mkdir(modelsDir, { recursive: true });
  for (const entry of WEB_ASSETS) {
    await writeFile(resolve(publicDir, entry.compressedPath), built.get(entry.id)!.bytes);
  }
  await writeFile(resolve(modelsDir, 'placements.json'), JSON.stringify(placements, null, 2) + '\n');
  await writeFile(reportPath, report);
  console.log('asset-compression: OK');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
