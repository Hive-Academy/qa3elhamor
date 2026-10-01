import {
  DEFAULT_HIT_TARGET,
  presentationOf,
  resolveText,
  type LandmarkDefinition,
} from '@qa3elhamor/landmarks-domain';
import { Html, useCursor } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import {
  Component,
  Suspense,
  useMemo,
  useRef,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import {
  Mesh,
  type ColorRepresentation,
  type Group,
  type Object3D,
} from 'three';
import { useBeaconVisibility, useOccluders } from './beacon-visibility.js';
import {
  localBounds,
  resolveHitShape,
  topOf,
  type HitShape,
} from './landmark-bounds.js';
import {
  useEffectivePresentation,
  useLandmarkActions,
  useLandmarkContext,
  useLandmarkPhase,
} from './landmark-context.js';
import { useHoverTint, useInstanceMaterials } from './landmark-materials.js';
import './landmark-beacon.css';

/**
 * Loads a model reference (a definition's `model`) and returns an object to mount, suspending
 * while it loads and throwing if it cannot. Injected by the composition root, which owns asset
 * URLs and the decoder; the kernel never fetches anything itself. It is called as a hook, so
 * pass a stable function. Each call site mounts what it returns, so return a fresh instance
 * per caller (a clone) if two landmarks may share a model.
 */
export type UseLandmarkModel = (model: string) => Object3D;

/** What a landmark's in-scene component receives. It renders R3F children in the landmark's frame. */
export interface LandmarkSceneProps {
  readonly definition: LandmarkDefinition;
  /** `focused` while the landmark is open: an in-world landmark shows its content then. */
  readonly phase: 'idle' | 'hovered' | 'focused';
  readonly locale: string;
  /** The landmark's label in `locale`, for naming the scene's DOM. */
  readonly title: string;
  readonly reducedMotion: boolean;
  /**
   * The stage's scene slot: a full-viewport element outside the (aria-hidden) canvas, inside
   * the open landmark's named region. Mount real DOM there (drei `<Html portal>`) so it is
   * reachable by keyboard and screen readers. Null until the DOM side has mounted.
   */
  readonly sceneLayer: HTMLElement | null;
  /** The landmark's hit volume in this frame: where the model is, for placing content. */
  readonly bounds: HitShape;
  readonly activate: () => void;
  /** Closes the landmark and returns the camera to the dive. */
  readonly close: () => void;
}

/** In-scene components by key: a landmark's `scene` field names one. */
export type LandmarkSceneRegistry = Readonly<
  Record<string, ComponentType<LandmarkSceneProps>>
>;

export interface LandmarkLayerProps {
  readonly useModel: UseLandmarkModel;
  /** Drops a failed model from the loader's cache so a remount retries it. */
  readonly evictModel?: (model: string) => void;
  /** In-scene components (3D menus, boards) by key; see `LandmarkDefinition.scene`. */
  readonly scenes?: LandmarkSceneRegistry;
  /** No lift or bob on hover, no pulsing beacon. */
  readonly reducedMotion?: boolean;
  /** Emissive tint on hover. Default a warm lamplight. */
  readonly hoverTint?: ColorRepresentation;
  /** Floating name labels above each landmark. Default true. */
  readonly beacons?: boolean;
  /**
   * Camera distance (world units) over which beacons fade out: fully visible up to the first,
   * gone at the second. Default `[45, 80]`.
   */
  readonly beaconRange?: readonly [number, number];
  /** Hide beacons that scene geometry stands in front of. Default true. */
  readonly beaconOcclusion?: boolean;
}

/** Hover lift, in the landmark's own (scene-world) units: about 0.12 world units. */
const HOVER_LIFT = 0.006;
const BOB_AMPLITUDE = 0.0015;
const BEACON_GAP = 0.012;
const HOVER_EMISSIVE_INTENSITY = 0.35;
const DEFAULT_BEACON_RANGE = [45, 80] as const;
const NO_RAYCAST: Mesh['raycast'] = () => undefined;

type ShellOptions = Omit<LandmarkLayerProps, 'useModel' | 'evictModel'> & {
  readonly occluders?: () => readonly Object3D[];
};

/**
 * Every landmark in the registry, rendered from data. Mount it in scene-world space: as a
 * child of `<OceanWorld>` (or any `<WorldSpace>`), under a `<LandmarkProvider>`. Each
 * landmark loads behind its own Suspense and error boundary, so a slow or broken model never
 * blanks another; a landmark whose model fails keeps a clickable target and its beacon. A
 * landmark's `scene` component renders in the landmark's frame behind its own boundary too.
 */
export function LandmarkLayer({
  useModel,
  evictModel,
  beaconOcclusion = true,
  ...options
}: LandmarkLayerProps) {
  const { registry } = useLandmarkContext();
  const root = useRef<Group>(null);
  const occluders = useOccluders(root);
  return (
    <group ref={root} name="landmarks">
      {registry.all.map((definition) => (
        <Landmark
          key={definition.id}
          definition={definition}
          useModel={useModel}
          evictModel={evictModel}
          options={{
            ...options,
            occluders: beaconOcclusion ? occluders : undefined,
          }}
        />
      ))}
    </group>
  );
}

interface LandmarkProps {
  readonly definition: LandmarkDefinition;
  readonly useModel: UseLandmarkModel;
  readonly evictModel?: (model: string) => void;
  readonly options: ShellOptions;
}

function Landmark({
  definition,
  useModel,
  evictModel,
  options,
}: LandmarkProps) {
  const { reportModelError } = useLandmarkContext();
  const scale = definition.scale ?? 1;
  return (
    <group
      name={`landmark:${definition.id}`}
      position={[...definition.position]}
      rotation={definition.rotation ? [...definition.rotation] : undefined}
      scale={typeof scale === 'number' ? scale : [...scale]}
    >
      <ModelBoundary
        resetKey={definition.model}
        onError={(error) => {
          evictModel?.(definition.model);
          reportModelError(definition.id, error);
        }}
        fallback={
          <LandmarkShell
            definition={definition}
            model={null}
            options={options}
          />
        }
      >
        <Suspense fallback={null}>
          <LoadedLandmark
            definition={definition}
            useModel={useModel}
            options={options}
          />
        </Suspense>
      </ModelBoundary>
    </group>
  );
}

function LoadedLandmark({
  definition,
  useModel,
  options,
}: Omit<LandmarkProps, 'evictModel'>) {
  const model = useModel(definition.model);
  return (
    <LandmarkShell definition={definition} model={model} options={options} />
  );
}

interface ShellProps {
  readonly definition: LandmarkDefinition;
  readonly model: Object3D | null;
  readonly options: ShellOptions;
}

function LandmarkShell({ definition, model, options }: ShellProps) {
  const {
    reducedMotion = false,
    hoverTint = '#ffcf7a',
    beacons = true,
    beaconRange = DEFAULT_BEACON_RANGE,
    scenes,
    occluders,
  } = options;
  const { locale, sceneLayer, reportSceneError } = useLandmarkContext();
  const presentation = useEffectivePresentation(definition);
  const { hover, unhover, activate, close } = useLandmarkActions();
  const phase = useLandmarkPhase(definition.id);
  const lit = phase !== 'idle';
  const liftRef = useRef<Group>(null);
  const anchorRef = useRef<Group>(null);
  const beaconRef = useRef<HTMLButtonElement>(null);

  const shape = useMemo<HitShape>(
    () =>
      resolveHitShape(
        definition.hitTarget ?? DEFAULT_HIT_TARGET,
        model ? localBounds(model) : null,
      ),
    [definition.hitTarget, model],
  );

  useCursor(phase === 'hovered');
  useInstanceMaterials(model);
  useHoverTint(model, lit, hoverTint, HOVER_EMISSIVE_INTENSITY);
  useBeaconVisibility({
    anchor: anchorRef,
    element: beaconRef,
    range: beaconRange,
    occluders,
    pinned: lit,
  });

  useFrame(({ clock }) => {
    const group = liftRef.current;
    if (!group) return;
    const bob =
      lit && !reducedMotion
        ? Math.sin(clock.elapsedTime * 2.2) * BOB_AMPLITUDE
        : 0;
    const target = (lit ? HOVER_LIFT : 0) + bob;
    const y = group.position.y;
    if (y === target) return;
    group.position.y =
      reducedMotion || Math.abs(target - y) < 1e-5
        ? target
        : y + (target - y) * 0.15;
  });

  const onOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    hover(definition.id, 'pointer');
  };
  const onOut = () => unhover(definition.id);
  const onClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    activate(definition.id, 'pointer');
  };

  const label = resolveText(definition.label, locale);
  const caption = definition.caption
    ? resolveText(definition.caption, locale)
    : undefined;
  // An in-world landmark running on its fallback overlay does not mount its scene at all.
  const sceneRuns =
    presentationOf(definition) !== 'in-world' || presentation === 'in-world';
  const Scene =
    definition.scene && sceneRuns ? scenes?.[definition.scene] : undefined;

  return (
    <>
      <group ref={liftRef}>{model && <primitive object={model} />}</group>

      <mesh
        name={`landmark-hit:${definition.id}`}
        position={[...shape.center]}
        // While open, the landmark's own content (an in-world scene) gets the pointer.
        raycast={phase === 'focused' ? NO_RAYCAST : Mesh.prototype.raycast}
        onPointerOver={onOver}
        onPointerOut={onOut}
        onClick={onClick}
      >
        {shape.kind === 'box' ? (
          <boxGeometry args={[...shape.size]} />
        ) : (
          <sphereGeometry args={[shape.radius, 16, 12]} />
        )}
        {/* Raycast-only: drawn, but writes neither colour nor depth. */}
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          colorWrite={false}
        />
      </mesh>

      {Scene && (
        <ModelBoundary
          resetKey={definition.scene ?? ''}
          onError={(error) => reportSceneError(definition.id, error)}
          fallback={null}
        >
          <Suspense fallback={null}>
            <Scene
              definition={definition}
              phase={phase}
              locale={locale}
              title={label}
              reducedMotion={reducedMotion}
              sceneLayer={sceneLayer}
              bounds={shape}
              activate={() => activate(definition.id, 'pointer')}
              close={() => close('programmatic')}
            />
          </Suspense>
        </ModelBoundary>
      )}

      {beacons && (
        <group
          ref={anchorRef}
          position={[
            shape.center[0],
            topOf(shape) + BEACON_GAP,
            shape.center[2],
          ]}
        >
          {/* Below the landmark list (z-index 30) and dialogs, so beacons never cover them. */}
          <Html center zIndexRange={[9, 1]} wrapperClass="lmk-beacon-anchor">
            {/* The canvas is aria-hidden; keyboard and screen-reader access is <LandmarkNav>. */}
            <button
              ref={beaconRef}
              type="button"
              tabIndex={-1}
              className="lmk-beacon"
              data-state={phase}
              data-reduced-motion={reducedMotion ? '' : undefined}
              dir={locale === 'ar' ? 'rtl' : 'ltr'}
              onPointerEnter={() => hover(definition.id, 'pointer')}
              onPointerLeave={() => unhover(definition.id)}
              onClick={() => activate(definition.id, 'pointer')}
            >
              <span className="lmk-beacon__dot" aria-hidden="true" />
              <span className="lmk-beacon__label">{label}</span>
              {caption && (
                <span className="lmk-beacon__caption">{caption}</span>
              )}
            </button>
          </Html>
        </group>
      )}
    </>
  );
}

interface ModelBoundaryProps {
  /** A new key (model or scene reference) resets the boundary and tries again. */
  readonly resetKey: string;
  readonly onError: (error: unknown) => void;
  readonly fallback: ReactNode;
  readonly children?: ReactNode;
}

/** Contains one landmark's failed load (or failed scene component) to that landmark. */
export class ModelBoundary extends Component<
  ModelBoundaryProps,
  { readonly failed: string | null }
> {
  override state: { readonly failed: string | null } = { failed: null };

  static getDerivedStateFromError(): { failed: string } {
    return { failed: '' };
  }

  override componentDidCatch(error: unknown, _info: ErrorInfo): void {
    this.setState({ failed: this.props.resetKey });
    this.props.onError(error);
  }

  override componentDidUpdate(previous: ModelBoundaryProps): void {
    if (this.state.failed !== null && previous.resetKey !== this.props.resetKey)
      this.setState({ failed: null });
  }

  override render(): ReactNode {
    return this.state.failed === null
      ? this.props.children
      : this.props.fallback;
  }
}
