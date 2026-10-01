import type { QualityTier } from './quality-tier.js';

/**
 * What the page could learn about the device before rendering a frame. Every field is
 * optional because every source is: `navigator.deviceMemory` is Chromium-only,
 * `WEBGL_debug_renderer_info` is masked by some browsers, and WebGL itself can be missing.
 * An unknown field never raises the tier; it simply does not count against it.
 */
export interface DeviceCapabilities {
  /** False when no WebGL context could be created at all. */
  readonly webgl: boolean;
  /** `UNMASKED_RENDERER_WEBGL` when exposed, else `RENDERER`. */
  readonly gpuRenderer?: string;
  /** `MAX_TEXTURE_SIZE` in px. */
  readonly maxTextureSize?: number;
  /** `navigator.deviceMemory` in GiB (Chromium rounds to 0.25-8). */
  readonly deviceMemoryGb?: number;
  /** `navigator.hardwareConcurrency`. */
  readonly hardwareConcurrency?: number;
  readonly devicePixelRatio?: number;
  /** `screen.width` / `screen.height` in CSS px. */
  readonly screenWidth?: number;
  readonly screenHeight?: number;
  /** `navigator.connection.saveData`. */
  readonly saveData?: boolean;
  /** `prefers-reduced-data: reduce`. */
  readonly prefersReducedData?: boolean;
  /** `navigator.userAgentData.mobile`, else a user-agent match, else a coarse pointer. */
  readonly mobile?: boolean;
}

export interface InitialTierDecision {
  readonly tier: QualityTier;
  /**
   * The highest tier the frame-rate governor may later upgrade to. `low` when the cap is a
   * visitor's request (Save-Data, reduced data) or a software/absent GPU, which no frame
   * rate can overrule; otherwise `high`.
   */
  readonly ceiling: QualityTier;
  /** Why the tier is not higher, most restrictive first. Empty when nothing capped it. */
  readonly reasons: readonly string[];
}

/** Software rasterisers: a scene this size is unusable on any of them. */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i;

/**
 * GPUs that cannot hold the full scene at 60 fps: older Mali (4xx, T-series, G31-G57),
 * Adreno 3xx-5xx, PowerVR and pre-Iris Intel HD. They start at medium or low; the governor
 * corrects the guess either way once frames are measured.
 */
const WEAK_MOBILE_GPU = /mali-(?:[34]\d\d|t\d+|g(?:31|51|52|57))\b|adreno[^\d]*[345]\d\d\b|powervr/i;
const WEAK_DESKTOP_GPU = /intel.*\bhd graphics|intel.*gma/i;

/** Discrete or Apple-silicon class GPUs, and current flagship mobile GPUs. */
const STRONG_GPU =
  /nvidia|geforce|quadro|rtx|radeon(?! r[2-5])|apple m\d|adreno[^\d]*[78]\d\d\b|mali-g(?:7[1-9]|6[1-9]|7\d\d|9\d\d)|immortalis|xclipse/i;

const TIER_RANK: Record<QualityTier, number> = { low: 0, medium: 1, high: 2 };

/**
 * The starting tier from a capability snapshot. Deliberately conservative on phones: a wrong
 * guess downward costs a few seconds of a plainer scene until the governor may upgrade once,
 * a wrong guess upward costs a stutter on first impression.
 *
 * Rules, applied as caps (the lowest cap wins):
 * - no WebGL, a software renderer, Save-Data or `prefers-reduced-data` → low;
 * - under 2 GiB memory, 2 or fewer cores, or a texture limit under 4096 → low;
 * - a known weak GPU, 4 GiB or less, 4 or fewer cores, a texture limit under 8192 → medium;
 * - a phone or tablet → medium, unless its GPU is a known strong one with 6 GiB or more;
 * - a desktop with an unrecognised GPU → medium; with a known strong GPU → high.
 */
export function assessDeviceTier(capabilities: DeviceCapabilities): InitialTierDecision {
  const caps: { tier: QualityTier; reason: string }[] = [];
  const cap = (tier: QualityTier, reason: string): void => {
    caps.push({ tier, reason });
  };
  const renderer = capabilities.gpuRenderer ?? '';
  const memory = capabilities.deviceMemoryGb;
  const cores = capabilities.hardwareConcurrency;
  const textureSize = capabilities.maxTextureSize;

  const hardLimit =
    !capabilities.webgl ||
    SOFTWARE_RENDERER.test(renderer) ||
    capabilities.saveData === true ||
    capabilities.prefersReducedData === true;
  if (!capabilities.webgl) cap('low', 'no WebGL context');
  if (SOFTWARE_RENDERER.test(renderer)) cap('low', `software renderer (${renderer})`);
  if (capabilities.saveData) cap('low', 'Save-Data is on');
  if (capabilities.prefersReducedData) cap('low', 'prefers-reduced-data');
  if (memory !== undefined && memory < 2) cap('low', `${memory} GiB device memory`);
  if (cores !== undefined && cores <= 2) cap('low', `${cores} CPU cores`);
  if (textureSize !== undefined && textureSize < 4096) cap('low', `max texture ${textureSize}px`);

  const strongGpu = STRONG_GPU.test(renderer);
  if (WEAK_MOBILE_GPU.test(renderer) || WEAK_DESKTOP_GPU.test(renderer)) {
    cap('medium', `entry-level GPU (${renderer})`);
  }
  if (memory !== undefined && memory <= 4) cap('medium', `${memory} GiB device memory`);
  if (cores !== undefined && cores <= 4) cap('medium', `${cores} CPU cores`);
  if (textureSize !== undefined && textureSize < 8192) cap('medium', `max texture ${textureSize}px`);

  // Without a mobile hint, a phone-sized screen (short side under 600 CSS px) counts as one.
  const shortSide =
    capabilities.screenWidth !== undefined && capabilities.screenHeight !== undefined
      ? Math.min(capabilities.screenWidth, capabilities.screenHeight)
      : undefined;
  const mobile = capabilities.mobile ?? (shortSide !== undefined && shortSide < 600);
  if (mobile) {
    const flagship = strongGpu && memory !== undefined && memory >= 6;
    if (!flagship) cap('medium', 'mobile device without a known flagship GPU');
  } else if (!strongGpu) {
    cap('medium', renderer ? `unrecognised GPU (${renderer})` : 'GPU not disclosed');
  }

  caps.sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier]);
  return {
    tier: caps[0]?.tier ?? 'high',
    ceiling: hardLimit ? 'low' : 'high',
    reasons: caps.map((entry) => entry.reason),
  };
}

/** The starting tier from a capability snapshot. See `assessDeviceTier` for the rules. */
export const resolveInitialTier = (capabilities: DeviceCapabilities): QualityTier =>
  assessDeviceTier(capabilities).tier;
