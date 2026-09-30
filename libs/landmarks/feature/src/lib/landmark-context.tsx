import {
  LandmarkInteraction,
  type CloseReason,
  type InputSource,
  type LandmarkEffect,
  type LandmarkInteractionState,
  type LandmarkRegistry,
} from '@qa3elhamor/landmarks-domain';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
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
  onLandmarkEvent,
  children,
}: LandmarkProviderProps) {
  const cameraRef = useRef(camera);
  const eventRef = useRef(onLandmarkEvent);
  useLayoutEffect(() => {
    cameraRef.current = camera;
    eventRef.current = onLandmarkEvent;
  });

  const interaction = useMemo(
    () =>
      new LandmarkInteraction(
        (id) => registry.has(id),
        (effect) => {
          const definition = registry.get(effect.id);
          if (effect.type === 'open' && definition)
            cameraRef.current.focus(definition.waypoint);
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
      reportModelError: (landmarkId, error) =>
        eventRef.current?.({ type: 'landmark_model_error', landmarkId, error }),
      reportSceneError: (landmarkId, error) =>
        eventRef.current?.({ type: 'landmark_scene_error', landmarkId, error }),
    }),
    [registry, interaction, locale],
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
