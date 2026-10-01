import type { DeviceCapabilities } from '@qa3elhamor/world-domain';

/** Non-standard navigator fields, each missing on some browsers. */
interface NavigatorHints {
  readonly deviceMemory?: number;
  readonly connection?: { readonly saveData?: boolean };
  readonly userAgentData?: { readonly mobile?: boolean };
}

const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile/i;

const finite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

const matches = (win: Window, query: string): boolean =>
  typeof win.matchMedia === 'function' && win.matchMedia(query).matches;

interface GpuProbe {
  readonly webgl: boolean;
  readonly gpuRenderer?: string;
  readonly maxTextureSize?: number;
}

/**
 * Opens a throwaway WebGL context to read the renderer string and texture limit, then
 * releases it at once (`WEBGL_lose_context`), so the probe never counts against the
 * browser's small per-page context limit. The unmasked renderer is used when the browser
 * exposes it; Firefox and Safari return a coarse or masked `RENDERER`, which only means
 * fewer devices are recognised as strong.
 */
function probeGpu(doc: Document): GpuProbe {
  let gl: WebGLRenderingContext | null = null;
  try {
    const canvas = doc.createElement('canvas');
    gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return { webgl: false };
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER) as unknown;
    return {
      webgl: true,
      gpuRenderer: typeof renderer === 'string' && renderer ? renderer : undefined,
      maxTextureSize: finite(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
    };
  } catch {
    // Some privacy modes throw from getContext or getParameter; treat as unknown GPU, not as
    // missing WebGL, so the canvas still gets its chance.
    return { webgl: true };
  } finally {
    // Released on every path, including a throw after the context was created.
    try {
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      // A context that cannot even be released is left to garbage collection.
    }
  }
}

let cached: DeviceCapabilities | undefined;

/**
 * Snapshot of what the browser discloses about the device, taken once per page (the answer
 * does not change while the page is open, and the GPU probe creates a context).
 */
export function readDeviceCapabilities(win: Window = window): DeviceCapabilities {
  if (cached && win === window) return cached;
  const nav = win.navigator as Navigator & NavigatorHints;
  const snapshot: DeviceCapabilities = {
    ...probeGpu(win.document),
    deviceMemoryGb: finite(nav.deviceMemory),
    hardwareConcurrency: finite(nav.hardwareConcurrency),
    devicePixelRatio: finite(win.devicePixelRatio),
    screenWidth: finite(win.screen?.width),
    screenHeight: finite(win.screen?.height),
    saveData: nav.connection?.saveData === true,
    prefersReducedData: matches(win, '(prefers-reduced-data: reduce)'),
    // A positive hint only: without one, the domain rule falls back to the screen size.
    mobile:
      nav.userAgentData?.mobile ??
      (MOBILE_UA.test(nav.userAgent) || matches(win, '(pointer: coarse) and (hover: none)')
        ? true
        : undefined),
  };
  if (win === window) cached = snapshot;
  return snapshot;
}
