import type { QualityTier } from '@qa3elhamor/world-domain';
import { QualityProvider } from '@qa3elhamor/world-feature';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Group } from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLandmarkModel } from './landmark-ports';

const mocks = vi.hoisted(() => ({ useCompressedModel: vi.fn() }));
vi.mock('@qa3elhamor/world-feature', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@qa3elhamor/world-feature')>()),
  useCompressedModel: mocks.useCompressedModel,
}));

const at =
  (tier: QualityTier) =>
  ({ children }: { children?: ReactNode }) => (
    <QualityProvider override={tier}>{children}</QualityProvider>
  );

describe('useLandmarkModel', () => {
  beforeEach(() => {
    mocks.useCompressedModel.mockReset();
    mocks.useCompressedModel.mockReturnValue(new Group());
  });

  it('fetches nothing for an asset above the tier', () => {
    renderHook(() => useLandmarkModel('pineapple-interior'), { wrapper: at('low') });
    expect(mocks.useCompressedModel).toHaveBeenCalledWith(null);
  });

  it('loads the asset once the tier allows it', () => {
    renderHook(() => useLandmarkModel('pineapple-interior'), { wrapper: at('high') });
    expect(mocks.useCompressedModel).toHaveBeenCalledWith(
      expect.stringMatching(/models\/pineapple-interior\.glb$/),
    );
  });

  it('loads low-tier landmarks at every tier', () => {
    renderHook(() => useLandmarkModel('landmark-tiki'), { wrapper: at('low') });
    expect(mocks.useCompressedModel).toHaveBeenCalledWith(
      expect.stringMatching(/models\/landmark-tiki\.glb$/),
    );
  });

  it('fetches nothing for an id the manifest does not list', () => {
    renderHook(() => useLandmarkModel('not-in-manifest'), { wrapper: at('high') });
    expect(mocks.useCompressedModel).toHaveBeenCalledWith(null);
  });
});
