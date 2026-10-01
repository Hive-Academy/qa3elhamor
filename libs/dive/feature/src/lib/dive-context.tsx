import type { DiveAttentionRange, DivePath } from '@qa3elhamor/dive-domain';
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { DiveController, type DiveState } from './dive-controller.js';
import type { DiveFramingOptions } from './framing.js';

const DiveContext = createContext<DiveController | null>(null);

export interface DiveProviderProps {
  /** The dive, built by the composition root from its data. */
  readonly path: DivePath;
  /** Honour `prefers-reduced-motion`: the camera jumps instead of easing, and does not sway. */
  readonly reducedMotion?: boolean;
  /** Spring natural frequency in 1/s (`DIVE_CONTROLLER_DEFAULTS.responsiveness`). */
  readonly responsiveness?: number;
  /** Look-ahead distance in world units. */
  readonly lookAhead?: number;
  /** Idle sway amplitude in world units; 0 disables it. */
  readonly sway?: number;
  /** When the scrolling camera turns to a stop (`DIVE_CONTROLLER_DEFAULTS.attention`). */
  readonly attention?: DiveAttentionRange;
  /** Pull-back near stops on portrait viewports (`DIVE_FRAMING_DEFAULTS`). */
  readonly framing?: DiveFramingOptions;
  readonly children?: ReactNode;
}

/**
 * Owns one `DiveController` for the page. Mount it above both the scroll spacer
 * (`<DiveScroll>`) and the `<Canvas>` holding `<DiveCamera>`; R3F bridges the context into
 * the canvas. Overlays and telemetry below it read the dive with `useDive`/`useDiveState`.
 */
export function DiveProvider({
  path,
  reducedMotion = false,
  responsiveness,
  lookAhead,
  sway,
  attention,
  framing,
  children,
}: DiveProviderProps) {
  // `attention` and `framing` are compared by value, so passing them as inline objects does
  // not rebuild the controller (and lose the visitor's place) on every render.
  const attentionInner = attention?.inner;
  const attentionOuter = attention?.outer;
  const referenceAspect = framing?.referenceAspect;
  const framingStrength = framing?.strength;
  const maxScale = framing?.maxScale;
  // Reduced motion is applied by the effect below, not baked in here, so toggling the OS
  // setting does not rebuild the controller and lose the visitor's place.
  const controller = useMemo(
    () =>
      new DiveController(path, {
        responsiveness,
        lookAhead,
        sway,
        attention:
          attentionInner === undefined || attentionOuter === undefined
            ? undefined
            : { inner: attentionInner, outer: attentionOuter },
        framing:
          referenceAspect === undefined || framingStrength === undefined || maxScale === undefined
            ? undefined
            : { referenceAspect, strength: framingStrength, maxScale },
      }),
    [path, responsiveness, lookAhead, sway, attentionInner, attentionOuter, referenceAspect, framingStrength, maxScale]
  );
  useEffect(() => controller.setReducedMotion(reducedMotion), [controller, reducedMotion]);

  return <DiveContext.Provider value={controller}>{children}</DiveContext.Provider>;
}

/**
 * The page's dive controller: `focusWaypoint`, `release`, `suspend`, `scrollToWaypoint`,
 * `subscribe`, `getState`. Throws outside `<DiveProvider>`.
 */
export function useDive(): DiveController {
  const controller = useContext(DiveContext);
  if (!controller) throw new Error('useDive must be used inside <DiveProvider>.');
  return controller;
}

/**
 * Subscribes a component to part of the dive state. The selector must return a primitive or
 * a stable reference (e.g. `(s) => Math.round(s.depth)`), and the component re-renders only
 * when that value changes, not on every frame.
 */
export function useDiveState<T>(selector: (state: Readonly<DiveState>) => T): T {
  const controller = useDive();
  return useSyncExternalStore(
    controller.subscribe,
    () => selector(controller.getState()),
    () => selector(controller.getState())
  );
}
