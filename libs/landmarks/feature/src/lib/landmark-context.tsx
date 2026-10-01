import {
  LandmarkInteraction,
  effectivePresentation,
  type CloseReason,
  type InputSource,
  type LandmarkEffect,
  type LandmarkDefinition,
  type LandmarkInteractionState,
  type LandmarkPresentation,
  type LandmarkRegistry,
} from '@qa3elhamor/landmarks-domain';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

/**
 * The camera capability the kernel needs, implemented by the composition root (over the
 * dive controller in this site). `focus` swims to a landmark's waypoint and holds there;
 * `release` hands the camera back to the scroll.
 */
export interface LandmarkCamera {
  focus(waypointId: string): void;
  release(): void;
}

/** Everything telemetry may want to count. */
export type LandmarkEvent =
  | {
      readonly type: 'landmark_hover';
      readonly landmarkId: string;
      readonly source: InputSource;
    }
  | {
      readonly type: 'landmark_open';
      readonly landmarkId: string;
      readonly source: InputSource;
    }
  | {
      readonly type: 'landmark_close';
      readonly landmarkId: string;
      readonly reason: CloseReason;
    }
  | {
      readonly type: 'landmark_model_error';
      readonly landmarkId: string;
      readonly error: unknown;
    }
  | {
      /** A landmark's in-scene component threw; the landmark stays usable without it. */
      readonly type: 'landmark_scene_error';
      readonly landmarkId: string;
      readonly error: unknown;
    };

const toEvent = (effect: LandmarkEffect): LandmarkEvent => {
  switch (effect.type) {
    case 'hover':
      return {
        type: 'landmark_hover',
        landmarkId: effect.id,
        source: effect.source,
      };
    case 'open':
      return {
        type: 'landmark_open',
        landmarkId: effect.id,
        source: effect.source,
      };
    case 'close':
      return {
        type: 'landmark_close',
        landmarkId: effect.id,
        reason: effect.reason,
      };
  }
};

interface LandmarkContextValue {
  readonly registry: LandmarkRegistry;
  readonly interaction: LandmarkInteraction;
  readonly locale: string;
  /**
   * What opening `definition` shows: `effectivePresentation` against the live `inWorld` flag,
   * except for the open landmark, whose presentation is latched when it opened.
   */
  readonly presentationFor: (
    definition: Pick<LandmarkDefinition, 'id' | 'presentation' | 'overlay'>,
  ) => LandmarkPresentation;
  /** The stage's scene slot (outside the canvas), once `<LandmarkOverlays>` has mounted it. */
  readonly sceneLayer: HTMLElement | null;
  readonly setSceneLayer: (element: HTMLElement | null) => void;
  readonly reportModelError: (landmarkId: string, error: unknown) => void;
  readonly reportSceneError: (landmarkId: string, error: unknown) => void;
}

const LandmarkContext = createContext<LandmarkContextValue | null>(null);

export interface LandmarkProviderProps {
  /** The page's landmarks, from `createLandmarkRegistry`. */
  readonly registry: LandmarkRegistry;
  readonly camera: LandmarkCamera;
  /** `en` or `ar`; picks label text and the overlays' direction. Default `en`. */
  readonly locale?: string;
  /**
   * Whether in-world presentations may run. Pass false where they should not (reduced motion,
   * a low quality tier, no WebGL): `in-world` landmarks then open their `overlay` in the
   * dialog instead, and their scene components are not mounted. Default true.
   *
   * The choice is latched when a landmark opens: a change while it is open (the quality
   * governor dropping to the low tier) applies to the next opening, never swapping the open
   * landmark's card for a dialog mid-view.
   */
  readonly inWorld?: boolean;
  /** Hover, open, close, and model or scene failure events, for telemetry. */
  readonly onLandmarkEvent?: (event: LandmarkEvent) => void;
  readonly children?: ReactNode;
}

/**
 * Owns the page's landmark interaction. Mount it above both the `<Canvas>` (for
 * `<LandmarkLayer>`) and the DOM (`<LandmarkOverlays>`, `<LandmarkNav>`); R3F bridges the
 * context into the canvas.
 */
export function LandmarkProvider({
  registry,
  camera,
  locale = 'en',
  inWorld = true,
  onLandmarkEvent,
  children,
}: LandmarkProviderProps) {
  const [sceneLayer, setSceneLayer] = useState<HTMLElement | null>(null);
  const cameraRef = useRef(camera);
  const eventRef = useRef(onLandmarkEvent);
  const inWorldRef = useRef(inWorld);
  /** The open landmark's presentation, fixed at the moment it opened. */
  const latched = useRef<{
    readonly id: string;
    readonly presentation: LandmarkPresentation;
  } | null>(null);
  useLayoutEffect(() => {
    cameraRef.current = camera;
    eventRef.current = onLandmarkEvent;
    inWorldRef.current = inWorld;
  });

  const interaction = useMemo(
    () =>
      new LandmarkInteraction(
        (id) => registry.has(id),
        (effect) => {
          const definition = registry.get(effect.id);
          if (effect.type === 'open' && definition) {
            latched.current = {
              id: effect.id,
              presentation: effectivePresentation(
                definition,
                inWorldRef.current,
              ),
            };
            cameraRef.current.focus(definition.waypoint);
          }
          if (effect.type === 'close' && latched.current?.id === effect.id)
            latched.current = null;
          // A switch goes straight on to the next focus: the dive keeps the scroll position it
          // held before the first one, so releasing in between would only jolt the page.
          if (effect.type === 'close' && effect.reason !== 'switch')
            cameraRef.current.release();
          eventRef.current?.(toEvent(effect));
        },
      ),
    [registry],
  );

  // A provider torn down with an overlay open (route change, HMR) must not strand the camera.
  useEffect(
    () => () => {
      if (interaction.getState().phase === 'focused')
        cameraRef.current.release();
    },
    [interaction],
  );

  const value = useMemo<LandmarkContextValue>(
    () => ({
      registry,
      interaction,
      locale,
      presentationFor: (definition) =>
        latched.current?.id === definition.id
          ? latched.current.presentation
          : effectivePresentation(definition, inWorld),
      sceneLayer,
      setSceneLayer,
      reportModelError: (landmarkId, error) =>
        eventRef.current?.({ type: 'landmark_model_error', landmarkId, error }),
      reportSceneError: (landmarkId, error) =>
        eventRef.current?.({ type: 'landmark_scene_error', landmarkId, error }),
    }),
    [registry, interaction, locale, inWorld, sceneLayer],
  );

  return (
    <LandmarkContext.Provider value={value}>
      {children}
    </LandmarkContext.Provider>
  );
}

export function useLandmarkContext(): LandmarkContextValue {
  const value = useContext(LandmarkContext);
  if (!value)
    throw new Error(
      'Landmark components must be rendered inside <LandmarkProvider>.',
    );
  return value;
}

/**
 * Subscribes to part of the interaction state. The selector must return a primitive or a
 * stable reference; the component re-renders only when that value changes.
 */
export function useLandmarkState<T>(
  selector: (state: LandmarkInteractionState) => T,
): T {
  const { interaction } = useLandmarkContext();
  return useSyncExternalStore(
    interaction.subscribe,
    () => selector(interaction.getState()),
    () => selector(interaction.getState()),
  );
}

/** The interaction's commands: what pointer, keyboard and overlays call. */
export function useLandmarkActions() {
  const { interaction } = useLandmarkContext();
  return useMemo(
    () => ({
      hover: (id: string, source: InputSource) =>
        interaction.dispatch({ type: 'hover', id, source }),
      unhover: (id: string) => interaction.dispatch({ type: 'unhover', id }),
      activate: (id: string, source: InputSource) =>
        interaction.dispatch({ type: 'activate', id, source }),
      close: (reason: CloseReason = 'programmatic') =>
        interaction.dispatch({ type: 'close', reason }),
    }),
    [interaction],
  );
}

/** One landmark's phase, as a primitive so per-landmark subscribers stay cheap. */
export const useLandmarkPhase = (id: string): 'idle' | 'hovered' | 'focused' =>
  useLandmarkState((s) =>
    s.phase !== 'idle' && s.id === id ? s.phase : 'idle',
  );

/** The hovered or focused landmark id, or null. */
export const useActiveLandmarkId = (): string | null =>
  useLandmarkState((s) => (s.phase === 'idle' ? null : s.id));

/**
 * What opening `definition` shows on this page, with the in-world fallback applied (latched
 * while it is open).
 */
export function useEffectivePresentation(
  definition: Pick<LandmarkDefinition, 'id' | 'presentation' | 'overlay'>,
): LandmarkPresentation {
  const { presentationFor } = useLandmarkContext();
  // Re-evaluated when this landmark opens or closes, which moves the latch.
  useLandmarkState((s) => (s.phase === 'focused' ? s.id : null));
  return presentationFor(definition);
}

/**
 * The open landmark and how it presents, or null when none is open. For page chrome that
 * reacts to an in-world landmark opening (dimming the world, a transition), outside the canvas.
 */
export function useFocusedLandmark(): {
  readonly definition: LandmarkDefinition;
  readonly presentation: LandmarkPresentation;
} | null {
  const { registry, presentationFor } = useLandmarkContext();
  const id = useLandmarkState((s) => (s.phase === 'focused' ? s.id : null));
  const definition = id ? registry.get(id) : undefined;
  return useMemo(
    () =>
      definition
        ? { definition, presentation: presentationFor(definition) }
        : null,
    [definition, presentationFor],
  );
}
