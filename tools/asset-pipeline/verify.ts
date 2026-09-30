import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createIO, countTriangles } from './pipeline.js';

export interface VerifiedAsset {
  readonly id: string;
  readonly bytes: number;
  readonly triangles: number;
}

type Budgeted = { id: string; compressedPath: string; budgetBytes: number };

/** Parses GLB bytes with the Meshopt decoder registered and checks them against the budget. */
export async function verifyBytes(asset: Budgeted, glb: Uint8Array): Promise<VerifiedAsset> {
  const doc = await createIO().readBinary(glb);
  const triangles = countTriangles(doc);
  if (triangles <= 0) throw new Error(`${asset.id}: parsed, but contains no triangles.`);
  if (glb.byteLength > asset.budgetBytes) {
    throw new Error(
      `${asset.id}: ${glb.byteLength} bytes exceeds its budget of ${asset.budgetBytes} bytes.`,
    );
  }
  return { id: asset.id, bytes: glb.byteLength, triangles };
}

/** Re-reads a committed GLB from `publicDir` and verifies it. */
export async function verifyAsset(publicDir: string, asset: Budgeted): Promise<VerifiedAsset> {
  return verifyBytes(asset, new Uint8Array(await readFile(resolve(publicDir, asset.compressedPath))));
}
