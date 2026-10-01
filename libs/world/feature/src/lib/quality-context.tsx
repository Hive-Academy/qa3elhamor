import {
  DEFAULT_GOVERNOR_POLICY,
  QUALITY_PROFILES,
  adaptTier,
  assessDeviceTier,
  createGovernorState,
  parseQualityOverride,
  settleGovernor,
  settledGovernorState,
  type DeviceCapabilities,
  type FrameStats,
  type GovernorPolicy,
  type GovernorState,
  type QualityProfile,
  type QualityTier,
} from '@qa3elhamor/world-domain';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { readDeviceCapabilities } from './device-capabilities.js';

export interface QualityState {
  readonly tier: QualityTier;
  readonly profile: QualityProfile;
  /** True once the tier is final: the governor has stopped adapting. */
  readonly settled: boolean;
  /** `override` when `?quality=` chose the tier; the governor then never runs. */
  readonly source: 'detected' | 'override';
  /** The tier the page started at, before any frame was measured. */
  readonly initialTier: QualityTier;
  /** Why the initial tier was not higher (see `assessDeviceTier`). */
  readonly reasons: readonly string[];
}

/** Latest measurement window, for diagnostics. Subscribe with `useQualityFrameStats`. */
interface FrameStatsStore {
  readonly get: () => FrameStats | null;
  readonly subscribe: (listener: () => void) => () => void;
  readonly publish: (stats: FrameStats) => void;
}

const createFrameStatsStore = (): FrameStatsStore => {
  let latest: FrameStats | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => latest,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish: (stats) => {
      latest = stats;
      for (const listener of listeners) listener();
    },
  };
};

interface QualityController {
  readonly state: QualityState;
  /** Feeds one measurement window to the governor. Called by `<QualityMonitor>`. */
  readonly observe: (stats: FrameStats) => void;
  readonly stats: FrameStatsStore;
}

const QualityContext = createContext<QualityController | null>(null);

const BACKSTOP_TICK_MS = 1000;
const BACKSTOP_GRACE_MS = 5000;

export interface QualityProviderProps {
  /** Capability snapshot; defaults to probing this browser (`readDeviceCapabilities`). */
  readonly capabilities?: DeviceCapabilities;
  /**
   * Manual tier. `undefined` reads `?quality=low|medium|high` from the page URL; `null`
   * forces detection. Never persisted.
   */
  readonly override?: QualityTier | null;
  readonly policy?: GovernorPolicy;
  /**
   * Called exactly once, with the final tier, when the governor settles (immediately for an
   * override). This is the only moment the tier is safe to report to analytics.
   */
  readonly onSettled?: (tier: QualityTier) => void;
  readonly children?: ReactNode;
}

interface Start {
  readonly governor: GovernorState;
  readonly source: QualityState['source'];
  readonly initialTier: QualityTier;
  readonly reasons: readonly string[];
}

const toState = (start: Start, governor: GovernorState): QualityState => ({
  tier: governor.tier,
  profile: QUALITY_PROFILES[governor.tier],
  settled: governor.settled,
  source: start.source,
  initialTier: start.initialTier,
  reasons: start.reasons,
});

function resolveStart(
  capabilities: DeviceCapabilities | undefined,
  override: QualityTier | null | undefined
): Start {
  const manual =
    override === undefined
      ? typeof window === 'undefined'
        ? null
        : parseQualityOverride(window.location.search)
      : override;
  if (manual) {
    return {
      governor: settledGovernorState(manual),
      source: 'override',
      initialTier: manual,
      reasons: ['?quality= override'],
    };
  }
  const decision = assessDeviceTier(capabilities ?? readDeviceCapabilities());
  return {
    governor: createGovernorState(decision.tier, decision.ceiling),
    source: 'detected',
    initialTier: decision.tier,
    reasons: decision.reasons,
  };
}

/**
 * Owns the page's quality tier. Mount it outside the `<Canvas>` (the WebGL context's
 * antialias setting needs the starting tier before the canvas exists) and put
 * `<QualityMonitor>` inside the canvas to feed it frames. R3F bridges the context across.
 *
 * The starting tier comes from the device snapshot, or from `?quality=`. The frame-rate
 * governor (`adaptTier`) then adjusts it until it settles, at which point `onSettled` fires
 * once. Provider state changes only when the tier or the settled flag does, so the tree
 * re-renders a handful of times per visit, never per frame.
 */
export function QualityProvider({
  capabilities,
  override,
  policy = DEFAULT_GOVERNOR_POLICY,
  onSettled,
  children,
}: QualityProviderProps) {
  // Resolved once per mount: a new snapshot mid-visit would restart the governor.
  const [start] = useState(() => resolveStart(capabilities, override));
  const [state, setState] = useState(() => toState(start, start.governor));
  const governor = useRef(start.governor);
  const [stats] = useState(createFrameStatsStore);

  const observe = useCallback(
    (window: FrameStats) => {
      stats.publish(window);
      const previous = governor.current;
      const next = adaptTier(previous, window, policy);
      governor.current = next;
      if (next.tier !== previous.tier || next.settled !== previous.settled) {
        setState(toState(start, next));
      }
    },
    [policy, start, stats]
  );

  // Wall-clock backstop: if no window has settled the governor after `maxDurationMs` of
  // visible time plus a grace period (frames stopped arriving: context lost, a frozen render
  // loop), settle at the current tier so the final tier is still reported.
  useEffect(() => {
    if (state.settled) return undefined;
    const deadlineMs = policy.maxDurationMs + BACKSTOP_GRACE_MS;
    let visibleMs = 0;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      visibleMs += BACKSTOP_TICK_MS;
      if (visibleMs < deadlineMs) return;
      clearInterval(timer);
      const next = settleGovernor(governor.current);
      if (next === governor.current) return;
      governor.current = next;
      setState(toState(start, next));
    }, BACKSTOP_TICK_MS);
    return () => clearInterval(timer);
  }, [policy, start, state.settled]);

  const reported = useRef(false);
  const onSettledRef = useRef(onSettled);
  useEffect(() => {
    onSettledRef.current = onSettled;
  }, [onSettled]);
  useEffect(() => {
    if (!state.settled || reported.current) return;
    reported.current = true;
    onSettledRef.current?.(state.tier);
  }, [state.settled, state.tier]);

  const controller = useMemo<QualityController>(
    () => ({ state, observe, stats }),
    [state, observe, stats]
  );
  return <QualityContext.Provider value={controller}>{children}</QualityContext.Provider>;
}

/** Internal: the monitor and diagnostics use it; scene code reads `useQuality`. */
export function useQualityController(): QualityController {
  const controller = useContext(QualityContext);
  if (!controller) throw new Error('useQuality must be used inside <QualityProvider>.');
  return controller;
}

/** The current tier, its budgets, and whether it is final. Requires `<QualityProvider>`. */
export const useQuality = (): QualityState => useQualityController().state;

/** The latest measured window (null before the first), re-rendering once per window. */
export function useQualityFrameStats(): FrameStats | null {
  const { stats } = useQualityController();
  return useSyncExternalStore(stats.subscribe, stats.get, stats.get);
}
