import { describe, expect, it } from 'vitest';
import {
  assessDeviceTier,
  resolveInitialTier,
  type DeviceCapabilities,
} from './quality-capabilities.js';

const desktop = (overrides: Partial<DeviceCapabilities> = {}): DeviceCapabilities => ({
  webgl: true,
  gpuRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  maxTextureSize: 16384,
  deviceMemoryGb: 8,
  hardwareConcurrency: 12,
  devicePixelRatio: 1,
  screenWidth: 1920,
  screenHeight: 1080,
  mobile: false,
  ...overrides,
});

const phone = (overrides: Partial<DeviceCapabilities> = {}): DeviceCapabilities => ({
  webgl: true,
  gpuRenderer: 'Adreno (TM) 619',
  maxTextureSize: 16384,
  deviceMemoryGb: 4,
  hardwareConcurrency: 8,
  devicePixelRatio: 2.75,
  screenWidth: 393,
  screenHeight: 873,
  mobile: true,
  ...overrides,
});

describe('resolveInitialTier', () => {
  it('starts a desktop with a discrete GPU at high', () => {
    const decision = assessDeviceTier(desktop());
    expect(decision.tier).toBe('high');
    expect(decision.ceiling).toBe('high');
    expect(decision.reasons).toEqual([]);
  });

  it('recognises Apple silicon and Radeon as strong', () => {
    expect(resolveInitialTier(desktop({ gpuRenderer: 'Apple M2' }))).toBe('high');
    expect(resolveInitialTier(desktop({ gpuRenderer: 'AMD Radeon RX 6700 XT' }))).toBe('high');
  });

  it('starts an integrated or undisclosed desktop GPU at medium', () => {
    expect(resolveInitialTier(desktop({ gpuRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620)' }))).toBe(
      'medium'
    );
    expect(resolveInitialTier(desktop({ gpuRenderer: 'Intel(R) HD Graphics 4000' }))).toBe('medium');
    expect(resolveInitialTier(desktop({ gpuRenderer: undefined }))).toBe('medium');
  });

  it('starts a mid-range Android phone at medium', () => {
    expect(resolveInitialTier(phone())).toBe('medium');
  });

  it('starts a weak-GPU phone at medium and a 1 GiB phone at low', () => {
    expect(resolveInitialTier(phone({ gpuRenderer: 'Mali-G52 MC2', deviceMemoryGb: 8 }))).toBe('medium');
    expect(resolveInitialTier(phone({ deviceMemoryGb: 1 }))).toBe('low');
  });

  it('lets a flagship phone start at high', () => {
    expect(resolveInitialTier(phone({ gpuRenderer: 'Adreno (TM) 740', deviceMemoryGb: 8 }))).toBe('high');
    expect(resolveInitialTier(phone({ gpuRenderer: 'Mali-G715-Immortalis MC11', deviceMemoryGb: 8 }))).toBe(
      'high'
    );
  });

  it('treats a phone-sized screen as mobile when there is no mobile hint', () => {
    const small = { mobile: undefined, gpuRenderer: 'Adreno (TM) 650', screenWidth: 390, screenHeight: 844 };
    expect(assessDeviceTier(desktop(small)).reasons).toContain('mobile device without a known flagship GPU');
    expect(assessDeviceTier(desktop({ ...small, screenWidth: 1920, screenHeight: 1080 })).reasons).not.toContain(
      'mobile device without a known flagship GPU'
    );
  });

  it('keeps a flagship GPU at medium when memory is unknown', () => {
    expect(resolveInitialTier(phone({ gpuRenderer: 'Adreno (TM) 740', deviceMemoryGb: undefined }))).toBe(
      'medium'
    );
  });

  it('caps by cores and texture size', () => {
    expect(resolveInitialTier(desktop({ hardwareConcurrency: 4 }))).toBe('medium');
    expect(resolveInitialTier(desktop({ hardwareConcurrency: 2 }))).toBe('low');
    expect(resolveInitialTier(desktop({ maxTextureSize: 4096 }))).toBe('medium');
    expect(resolveInitialTier(desktop({ maxTextureSize: 2048 }))).toBe('low');
  });

  it('pins software renderers, missing WebGL and data-saving requests to low, with a low ceiling', () => {
    for (const caps of [
      desktop({ gpuRenderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)' }),
      desktop({ webgl: false, gpuRenderer: undefined }),
      desktop({ saveData: true }),
      desktop({ prefersReducedData: true }),
    ]) {
      const decision = assessDeviceTier(caps);
      expect(decision.tier).toBe('low');
      expect(decision.ceiling).toBe('low');
    }
  });

  it('leaves the ceiling at high for hardware limits the governor may overrule', () => {
    expect(assessDeviceTier(phone({ deviceMemoryGb: 1 })).ceiling).toBe('high');
  });

  it('lists every reason, most restrictive first', () => {
    const { reasons } = assessDeviceTier(phone({ deviceMemoryGb: 1, saveData: true }));
    expect(reasons[0]).toMatch(/Save-Data|GiB/);
    expect(reasons).toContain('mobile device without a known flagship GPU');
  });
});
