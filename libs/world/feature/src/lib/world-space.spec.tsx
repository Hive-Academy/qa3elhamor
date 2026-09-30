import { findAsset } from '@qa3elhamor/world-domain';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { assetUrl } from './asset-url.js';
import {
  WATER_VOLUME,
  WORLD_SCALE,
  WorldScaleProvider,
  sceneToWorld,
  useSceneToWorld,
  useWorldScale,
} from './world-space.js';

const withScale =
  (scale: number) =>
  ({ children }: { children?: ReactNode }) => <WorldScaleProvider scale={scale}>{children}</WorldScaleProvider>;

describe('world scale convention', () => {
  it('converts scene-world points with an explicit scale', () => {
    expect(sceneToWorld([1, 2, 3], 2)).toEqual([2, 4, 6]);
  });

  it('defaults the scene scale to WORLD_SCALE outside any provider', () => {
    const { result } = renderHook(() => useSceneToWorld());
    expect(result.current([0.5, -0.25, 1])).toEqual([0.5 * WORLD_SCALE, -0.25 * WORLD_SCALE, WORLD_SCALE]);
  });

  it('reads the provided scale, so conversion cannot disagree with the transform', () => {
    const { result } = renderHook(() => ({ scale: useWorldScale(), toWorld: useSceneToWorld() }), {
      wrapper: withScale(30),
    });
    expect(result.current.scale).toBe(30);
    expect(result.current.toWorld([1, 1, 1])).toEqual([30, 30, 30]);
  });

  it('rejects a non-positive scale', () => {
    expect(() => renderHook(() => useWorldScale(), { wrapper: withScale(0) })).toThrow(RangeError);
  });

  it('keeps every landmark offset (|x|,|z| < 1 scene-world unit) inside the water volume', () => {
    const [x, y, z] = sceneToWorld([0.8, 0.2, -0.33], WORLD_SCALE);
    expect(x).toBeLessThan(WATER_VOLUME.max[0]);
    expect(y).toBeLessThan(WATER_VOLUME.max[1]);
    expect(z).toBeGreaterThan(WATER_VOLUME.min[2]);
  });
});

describe('assetUrl', () => {
  it('joins the base URL with the manifested path', () => {
    const path = findAsset('environment')?.compressedPath;
    expect(assetUrl('environment')).toBe(`/${path}`);
    expect(assetUrl('environment', '/site')).toBe(`/site/${path}`);
    expect(assetUrl('environment', '/site/')).toBe(`/site/${path}`);
  });

  it('refuses ids that are not in the manifest', () => {
    expect(() => assetUrl('nope')).toThrow(/Unknown asset "nope"/);
  });
});
