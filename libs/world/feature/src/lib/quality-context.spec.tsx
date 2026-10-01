import {
  DEFAULT_GOVERNOR_POLICY,
  QUALITY_PROFILES,
  type DeviceCapabilities,
  type FrameStats,
} from '@qa3elhamor/world-domain';
import { act, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MeshStandardMaterial } from 'three';
import { applyCaustics, createCausticsTexture, createCausticsUniforms, removeCaustics } from './caustics-material.js';
import { OCEAN_ENVIRONMENT_DEFAULTS } from './ocean-config.js';
import {
  QualityProvider,
  useQuality,
  useQualityController,
  type QualityProviderProps,
} from './quality-context.js';
import { QualityReadout } from './quality-readout.js';

const STRONG_DESKTOP: DeviceCapabilities = {
  webgl: true,
  gpuRenderer: 'NVIDIA GeForce RTX 3060',
  maxTextureSize: 16384,
  deviceMemoryGb: 8,
  hardwareConcurrency: 12,
  mobile: false,
};

const SLOW: FrameStats = { durationMs: 1000, frames: 30, p50Ms: 33, p90Ms: 40 };
const NEUTRAL: FrameStats = { durationMs: 1000, frames: 50, p50Ms: 20, p90Ms: 20 };

const wrapper =
  (props: Omit<QualityProviderProps, 'children'>) =>
  ({ children }: { children?: ReactNode }) => <QualityProvider {...props}>{children}</QualityProvider>;

const feed = (observe: (stats: FrameStats) => void, stats: FrameStats, times: number): void => {
  act(() => {
    for (let i = 0; i < times; i++) observe(stats);
  });
};

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('QualityProvider', () => {
  it('starts at the tier the device snapshot resolves to', () => {
    const { result } = renderHook(() => useQuality(), {
      wrapper: wrapper({ capabilities: STRONG_DESKTOP, override: null }),
    });
    expect(result.current).toMatchObject({ tier: 'high', settled: false, source: 'detected' });
    expect(result.current.profile).toBe(QUALITY_PROFILES.high);
  });

  it('downgrades on sustained slow frames and reports the final tier exactly once', () => {
    const onSettled = vi.fn();
    const { result } = renderHook(() => useQualityController(), {
      wrapper: wrapper({ capabilities: STRONG_DESKTOP, override: null, onSettled }),
    });

    feed(result.current.observe, SLOW, 6);
    expect(result.current.state.tier).toBe('medium');
    expect(onSettled).not.toHaveBeenCalled();

    const settleWindows = (DEFAULT_GOVERNOR_POLICY.warmupMs + DEFAULT_GOVERNOR_POLICY.settleAfterMs) / 1000;
    feed(result.current.observe, NEUTRAL, Math.ceil(settleWindows) + 5);
    expect(result.current.state).toMatchObject({ tier: 'medium', settled: true });
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith('medium');
  });

  it('settles at the current tier by wall clock when no frames arrive', () => {
    vi.useFakeTimers();
    try {
      const onSettled = vi.fn();
      const { result } = renderHook(() => useQuality(), {
        wrapper: wrapper({ capabilities: STRONG_DESKTOP, override: null, onSettled }),
      });
      act(() => vi.advanceTimersByTime(DEFAULT_GOVERNOR_POLICY.maxDurationMs));
      expect(result.current.settled).toBe(false);
      act(() => vi.advanceTimersByTime(10_000));
      expect(result.current).toMatchObject({ tier: 'high', settled: true });
      expect(onSettled).toHaveBeenCalledTimes(1);
      expect(onSettled).toHaveBeenCalledWith('high');
    } finally {
      vi.useRealTimers();
    }
  });

  it('honours an explicit override and settles on it at once', () => {
    const onSettled = vi.fn();
    const { result } = renderHook(() => useQualityController(), {
      wrapper: wrapper({ capabilities: STRONG_DESKTOP, override: 'low', onSettled }),
    });
    expect(result.current.state).toMatchObject({ tier: 'low', settled: true, source: 'override' });
    feed(result.current.observe, SLOW, 20);
    expect(result.current.state.tier).toBe('low');
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith('low');
  });

  it('reads ?quality= from the page URL when no override prop is given', () => {
    window.history.replaceState(null, '', '/?quality=medium');
    const { result } = renderHook(() => useQuality(), {
      wrapper: wrapper({ capabilities: STRONG_DESKTOP }),
    });
    expect(result.current).toMatchObject({ tier: 'medium', source: 'override' });
  });

  it('refuses to be read outside a provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useQuality())).toThrow(/QualityProvider/);
  });
});

describe('QualityReadout', () => {
  it('shows the tier and the last window', () => {
    let observe: ((stats: FrameStats) => void) | undefined;
    function Capture() {
      observe = useQualityController().observe;
      return null;
    }
    render(
      <QualityProvider capabilities={STRONG_DESKTOP} override={null}>
        <Capture />
        <QualityReadout />
      </QualityProvider>
    );
    expect(screen.getByTestId('quality-readout').textContent).toBe('high …');
    act(() => observe?.(NEUTRAL));
    expect(screen.getByTestId('quality-readout').textContent).toBe('high … · 50 fps · p90 20.0 ms');
  });
});

describe('removeCaustics', () => {
  it('restores the built-in shader hooks of a patched material', () => {
    const material = new MeshStandardMaterial();
    const pristineKey = material.customProgramCacheKey();
    const uniforms = createCausticsUniforms(createCausticsTexture(16), OCEAN_ENVIRONMENT_DEFAULTS.caustics);
    applyCaustics(material, uniforms);
    expect(material.customProgramCacheKey()).not.toBe(pristineKey);

    const version = material.version;
    removeCaustics(material);
    expect(material.customProgramCacheKey()).toBe(pristineKey);
    expect(material.userData['causticsUniforms']).toBeUndefined();
    expect(material.version).toBeGreaterThan(version);
    // Re-applying after removal patches again.
    expect(applyCaustics(material, uniforms)).toBe(true);
  });
});
