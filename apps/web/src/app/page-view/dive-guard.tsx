import type { RootState } from '@react-three/fiber';
import {
  Component,
  useEffect,
  useMemo,
  useRef,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { WebGLRenderer, type WebGLRendererParameters } from 'three';

/**
 * How long a lost WebGL context may stay lost before the dive gives up. Browsers drop contexts
 * for ordinary reasons (a backgrounded mobile tab, a driver reset) and three.js restores them
 * itself, so a brief loss is not a failure; one that does not come back is.
 */
export const CONTEXT_RESTORE_GRACE_MS = 3000;

export type DiveFailureHandler = (error: Error) => void;

const asError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(String(value));

/**
 * Reports a WebGL context that is lost and not restored within `graceMs`. Returns the cleanup.
 * three.js already calls `preventDefault()` on the loss, which is what allows a restore.
 */
export function watchContextLoss(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  onFailure: DiveFailureHandler,
  graceMs: number = CONTEXT_RESTORE_GRACE_MS,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const lost = () => {
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      onFailure(
        new Error(`WebGL context lost and not restored within ${graceMs} ms.`),
      );
    }, graceMs);
  };
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', stop);
  return () => {
    stop();
    canvas.removeEventListener('webglcontextlost', lost);
    canvas.removeEventListener('webglcontextrestored', stop);
  };
}

/**
 * Creates the dive's renderer, reporting a failure before rethrowing it. R3F creates the
 * renderer inside an async effect, so a throw there never reaches a React error boundary: this
 * is the only place that sees a context the probe allowed but the GPU then refused.
 */
export function createGuardedRenderer(
  params: WebGLRendererParameters,
  onFailure: DiveFailureHandler,
): WebGLRenderer {
  try {
    return new WebGLRenderer(params);
  } catch (error) {
    onFailure(asError(error));
    throw error;
  }
}

export interface CanvasGuard {
  /** For `<Canvas gl={…}>`: the renderer factory, with the dive's own renderer options. */
  readonly renderer: (
    params: WebGLRendererParameters,
  ) => (defaults: WebGLRendererParameters) => WebGLRenderer;
  /** For `<Canvas onCreated={…}>`: starts watching the context for an unrecovered loss. */
  readonly onCreated: (state: RootState) => void;
}

/**
 * Wires a `<Canvas>` to report the failures an error boundary cannot see: renderer creation and
 * context loss. Pair it with `<DiveFailureBoundary>` for errors thrown by the scene.
 */
export function useCanvasGuard(onFailure: DiveFailureHandler): CanvasGuard {
  const report = useRef(onFailure);
  useEffect(() => {
    report.current = onFailure;
  }, [onFailure]);

  const unwatch = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => unwatch.current?.(), []);

  return useMemo<CanvasGuard>(
    () => ({
      renderer: (params) => (defaults) =>
        createGuardedRenderer({ ...defaults, ...params }, (error) =>
          report.current(error),
        ),
      onCreated: ({ gl }) => {
        unwatch.current?.();
        unwatch.current = watchContextLoss(gl.domElement, (error) => {
          console.error('The 3D dive lost its graphics context.', error);
          report.current(error);
        });
      },
    }),
    [],
  );
}

interface DiveFailureBoundaryProps {
  readonly onFailure: DiveFailureHandler;
  readonly children: ReactNode;
}

interface DiveFailureBoundaryState {
  readonly failed: boolean;
}

/**
 * Catches anything the canvas throws (R3F rethrows scene errors from `<Canvas>`) and hands the
 * page over to the 2D view instead of leaving a blank stage. React only offers boundaries as
 * class components.
 */
export class DiveFailureBoundary extends Component<
  DiveFailureBoundaryProps,
  DiveFailureBoundaryState
> {
  override state: DiveFailureBoundaryState = { failed: false };

  static getDerivedStateFromError(): DiveFailureBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(
      'The 3D dive failed; showing the page view.',
      error,
      info.componentStack,
    );
    this.props.onFailure(asError(error));
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
