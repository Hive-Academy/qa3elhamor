import type { Document } from '@gltf-transform/core';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getBounds } from '@gltf-transform/functions';
import { createIO, countTriangles } from './pipeline.js';

export interface VerifiedAsset {
  readonly id: string;
  readonly bytes: number;
  readonly triangles: number;
  /** Measured height of a standing character, or null. */
  readonly height: number | null;
}

type Budgeted = {
  id: string;
  compressedPath: string;
  budgetBytes: number;
  triangleBudget?: number;
  standingHeight?: number;
};

/** Largest allowed distance of a standing character's feet and x/z centre from the origin. */
const STAND_TOLERANCE = 0.005;
const HEIGHT_TOLERANCE = 0.01;

/** Fails unless the character stands on y = 0, centred on x/z, at the manifest's height. */
function measureStanding(asset: Budgeted, doc: Document): number {
  const { min, max } = getBounds(doc.getRoot().getDefaultScene()!);
  const height = max[1]! - min[1]!;
  const expected = asset.standingHeight!;
  const off = [min[1]!, (min[0]! + max[0]!) / 2, (min[2]! + max[2]!) / 2].map((v) => Math.abs(v) / expected);
  if (off.some((v) => v > STAND_TOLERANCE)) {
    throw new Error(
      `${asset.id}: not standing at the origin (lowest y ${min[1]!.toFixed(3)}, ` +
        `x/z centre ${((min[0]! + max[0]!) / 2).toFixed(3)}, ${((min[2]! + max[2]!) / 2).toFixed(3)}).`,
    );
  }
  if (Math.abs(height - expected) > expected * HEIGHT_TOLERANCE) {
    throw new Error(`${asset.id}: height ${height.toFixed(3)} differs from the manifest's ${expected}.`);
  }
  return height;
}

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
  if (asset.triangleBudget !== undefined && triangles > asset.triangleBudget) {
    throw new Error(`${asset.id}: ${triangles} triangles exceeds its budget of ${asset.triangleBudget}.`);
  }
  const height = asset.standingHeight === undefined ? null : measureStanding(asset, doc);
  return { id: asset.id, bytes: glb.byteLength, triangles, height };
}

/** Re-reads a committed GLB from `publicDir` and verifies it. */
export async function verifyAsset(publicDir: string, asset: Budgeted): Promise<VerifiedAsset> {
  return verifyBytes(asset, new Uint8Array(await readFile(resolve(publicDir, asset.compressedPath))));
}
