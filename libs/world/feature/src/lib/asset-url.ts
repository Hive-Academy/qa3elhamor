import { findAsset } from '@qa3elhamor/world-domain';

/**
 * Public URL of a manifested asset. The manifest owns the path; the app owns the base URL
 * (Vite's `import.meta.env.BASE_URL`), so a fork deployed under a sub-path still resolves.
 */
export function assetUrl(id: string, baseUrl = '/'): string {
  const asset = findAsset(id);
  if (!asset) {
    throw new Error(`Unknown asset "${id}": it is not in WEB_ASSETS.`);
  }
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}${asset.compressedPath}`;
}
