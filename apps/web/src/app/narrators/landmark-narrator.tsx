import type { NarrationLandmarkId } from '@qa3elhamor/content-domain';
import { assetAllowed, type QualityTier } from '@qa3elhamor/world-domain';
import {
  NARRATOR_CAST,
  NARRATOR_SPEECH_HEADROOM,
  Narrator,
  assetUrl,
  createNarratorSnapshot,
  takeNarratorSnapshot,
  useCompressedModel,
  useQuality,
  type NarratorCastId,
  type NarratorClipHold,
  type NarratorProps,
  type NarratorRigSpec,
  type NarratorSnapshot,
} from '@qa3elhamor/world-feature';
import { useFrame } from '@react-three/fiber';
import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Vector3, type Group, type Object3D } from 'three';
import {
  NARRATOR_RIGS,
  type NarratorChoice,
  type ResidentPlacement,
  type ResidentSetup,
} from '../narrators.config';
import { PLACEMENT_EDITS, UNPLACED, placeModeFor } from './placement-edit';
import { createResidentState, stepResident } from './resident';
import { addScaled, yawTowards, type Vec3 } from './view-layout';
import type { NarratorPlacement } from './visit-layout';
import { landmarkFrameOf } from './world-frame';

/** Everything a landmark tells its narrator, whoever plays it. */
export type LandmarkNarratorProps = Omit<NarratorProps, 'cast' | 'scale'> & {
  readonly choice: NarratorChoice;
  /** How tall the narrator should look, in the parent's units (the original cast's height). */
  readonly height: number;
  /**
   * Who actually plays: `choice` itself, or its fallback cast when the tier does not allow the
   * model or it fails to load. Lets the bubble's name tag (and anything sized to the narrator)
   * follow what is on screen.
   */
  readonly onPlaying?: (playing: NarratorChoice) => void;
};

/** The original cast member standing in for a bundled model. */
export const fallbackOf = (choice: NarratorChoice): NarratorChoice =>
  choice.kind === 'cast' ? choice : { kind: 'cast', cast: choice.fallback };

/** The rendered height of `choice` when asked to look `height` tall. */
export const narratorRenderedHeight = (
  choice: NarratorChoice,
  height: number,
): number => (choice.kind === 'model' ? height * choice.heightFactor : height);

/**
 * The point a speech bubble's tail points at: just above the narrator's head, clear of its bob
 * and talk hop. Fixed (it ignores the animation), so the bubble does not jitter.
 */
export const speechAnchorOf = (
  choice: NarratorChoice,
  post: Vec3,
  height: number,
): Vec3 =>
  addScaled(
    post,
    [0, 1, 0],
    narratorRenderedHeight(choice, height) * (1 + NARRATOR_SPEECH_HEADROOM),
  );

/**
 * Where its breath bubbles rise from: in front of its face, towards `restYaw` (the visitor).
 * `height` is the rendered height (`narratorRenderedHeight`). A fish's mouth is low on its body
 * and well forward (it is twice as long as it is high); a standing character's is high and near.
 */
export function mouthOf(
  choice: NarratorChoice,
  post: Vec3,
  height: number,
  restYaw: number,
): Vec3 {
  const [up, forward] = choice.kind === 'model' ? [0.78, 0.22] : [0.55, 0.7];
  return [
    post[0] + Math.sin(restYaw) * height * forward,
    post[1] + height * up,
    post[2] + Math.cos(restYaw) * height * forward,
  ];
}

/**
 * What a landmark's resident and its guide share, so one takes over from the other where it
 * stands: the resident's spot and height (world units) once it has been placed, and the last
 * frame of whichever of the two was on screen (`NarratorSnapshot`). One per narrator choice.
 */
export interface ResidentLink {
  spot: Vec3 | null;
  /** Its resting heading there, world radians. */
  restYaw: number;
  height: number;
  readonly snapshot: NarratorSnapshot;
}

const LINKS = new WeakMap<NarratorChoice, ResidentLink>();

export function residentLinkOf(choice: NarratorChoice): ResidentLink {
  let link = LINKS.get(choice);
  if (!link) {
    link = { spot: null, restYaw: 0, height: 0, snapshot: createNarratorSnapshot() };
    LINKS.set(choice, link);
  }
  return link;
}

/**
 * The guide's way in from (and back to) the resident's spot, relative to its post in multiples
 * of its rendered height, and the resident's size as a fraction of the guide's. Null before the
 * resident has been placed (or for a zero-size guide).
 */
export function residentTravel(
  link: Pick<ResidentLink, 'spot' | 'height'>,
  post: Vec3,
  renderedHeight: number,
): { readonly offset: Vec3; readonly scale: number } | null {
  const { spot } = link;
  if (!spot || !(renderedHeight > 0) || !(link.height > 0)) return null;
  return {
    offset: [
      (spot[0] - post[0]) / renderedHeight,
      (spot[1] - post[1]) / renderedHeight,
      (spot[2] - post[2]) / renderedHeight,
    ],
    scale: link.height / renderedHeight,
  };
}

/** Whether residents show on this tier: a bundled model where its asset is allowed, the cast from medium up. */
export const residentAllowed = (choice: NarratorChoice, tier: QualityTier): boolean =>
  choice.kind === 'model' ? assetAllowed(choice.asset, tier) : tier !== 'low';

/**
 * A landmark's narrator as configured (`NARRATOR_CAST` in `site.config.ts`, `narrators.config.ts`): one of the original cast, or a
 * bundled character model. The model is lazy and tier-gated (`assetAllowed`): where the tier
 * does not allow it, or it fails to load, the original cast plays instead; while it loads,
 * nothing shows and it swims in once it arrives. A narrator with a resident (`ResidentNarrator`)
 * comes out from where the resident stood (taking over its pose) and goes back there when it
 * leaves, where the resident takes over again.
 */
export function LandmarkNarrator({
  choice,
  height,
  onPlaying,
  ...props
}: LandmarkNarratorProps) {
  const { tier } = useQuality();
  const report = useRef(onPlaying);
  useEffect(() => {
    report.current = onPlaying;
  });
  const gated = choice.kind === 'model' && !assetAllowed(choice.asset, tier);
  useEffect(() => {
    if (choice.kind === 'cast' || gated) report.current?.(fallbackOf(choice));
  }, [choice, gated]);
  // A resident only lives where the tier shows it (`ResidentNarrator`).
  const lives = choice.resident !== undefined && residentAllowed(choice, tier);
  // Read once, at mount: the resident's last frame, if it was on screen.
  const [handOver] = useState(() =>
    lives ? takeNarratorSnapshot(residentLinkOf(choice).snapshot) : null,
  );
  const link = lives ? residentLinkOf(choice) : null;
  const rendered = narratorRenderedHeight(choice, height);
  const home = link ? residentTravel(link, props.position, rendered) : null;
  // Out from the resident's spot (from nothing there if it was not on screen), and back to
  // it, at its size, where the resident takes over again.
  const fromHome = home
    ? { enterFrom: home.offset, exitTo: home.offset, exitScale: home.scale }
    : {};
  const shared = link ? { handOver, snapshot: link.snapshot } : {};

  if (choice.kind === 'cast' || gated) {
    const cast = choice.kind === 'cast' ? choice.cast : choice.fallback;
    return (
      <CastNarrator
        cast={cast}
        height={height}
        {...props}
        {...(choice.kind === 'cast' ? { ...fromHome, ...shared } : {})}
      />
    );
  }
  const fallback = (
    <CastNarrator cast={choice.fallback} height={height} {...props} />
  );
  return (
    <NarratorModelBoundary
      fallback={fallback}
      onFallback={() => report.current?.(fallbackOf(choice))}
    >
      <Suspense fallback={null}>
        <ModelNarrator
          url={assetUrl(choice.asset, import.meta.env.BASE_URL)}
          rig={NARRATOR_RIGS[choice.asset]}
          height={rendered}
          onLoaded={() => report.current?.(choice)}
          {...props}
          {...fromHome}
          {...shared}
        />
      </Suspense>
    </NarratorModelBoundary>
  );
}

/** Where a resident shows up from: a short hop in from beside its post (x its height). */
const RESIDENT_ENTER_FROM: Vec3 = [-0.9, 0, -0.5];
const RESIDENT_EXIT_TO: Vec3 = [0.9, 0, -0.5];
const NOTHING = (): void => undefined;

/** Development only (`?place=resident[&landmark=id]`): the placement tool, a lazy chunk never built for production. */
const PLACE_MODE = import.meta.env.DEV
  ? placeModeFor(typeof window === 'undefined' ? '' : window.location.search, true)
  : null;
/** Whether the tool places `landmark`'s resident: every one, or the one `&landmark=` names. */
const placingAt = (landmark: NarrationLandmarkId): boolean =>
  PLACE_MODE !== null && (PLACE_MODE.landmark === null || PLACE_MODE.landmark === landmark);
const ResidentPlacementTool =
  import.meta.env.DEV && PLACE_MODE ? lazy(() => import('./placement-tool')) : null;

export interface ResidentNarratorProps {
  readonly choice: NarratorChoice;
  /** The visit's narrator post (`useNarratorPost`), world units: its size, and its spot when unplaced. */
  readonly placement: NarratorPlacement;
  /** The landmark's stop eye, world units: distances are measured against the stop's. */
  readonly eye: Vec3;
  readonly reducedMotion: boolean;
  readonly hold?: NarratorClipHold | null;
  /** Bumped by `onPoke`: each change makes it react (`useNarratorPoke`). */
  readonly poke?: number;
  /** A click or tap on it: it reacts, and the landmark does not open. */
  readonly onPoke?: () => void;
}

/**
 * The landmark's narrator idling at home before the visit, while the visitor dives past
 * (`resident.ts`): a rigged bundled model where the tier allows the model, or the original cast
 * (jointed, animated the same way) from medium up. It stands where `RESIDENT_PLACEMENTS` puts it
 * (beside the landmark; the visit's post when unplaced), loads when the camera comes near,
 * unmounts when it goes far, and waves as the camera passes close. A click or tap on it only
 * makes it react (`onPoke`): it never opens the visit, and has nothing to focus (the visit's
 * "Say hi" is the keyboard's way). A model that fails to load shows nothing here (the visit has
 * its own fallback). Rendered inside a `WorldFrame`.
 */
export function ResidentNarrator(props: ResidentNarratorProps) {
  const { tier } = useQuality();
  const { choice } = props;
  const resident = choice.resident;
  if (!resident || !residentAllowed(choice, tier)) return null;
  if (choice.kind === 'cast')
    return <ResidentPresence {...props} resident={resident} play={{ cast: choice.cast }} />;
  const rig = NARRATOR_RIGS[choice.asset];
  if (!rig) return null;
  return (
    <ResidentPresence
      {...props}
      resident={resident}
      play={{ url: assetUrl(choice.asset, import.meta.env.BASE_URL), rig }}
    />
  );
}

/** Who plays the resident: a bundled model (lazy), or one of the original cast. */
type ResidentPlay =
  | { readonly url: string; readonly rig: NarratorRigSpec }
  | { readonly cast: NarratorCastId };

const cameraAt = new Vector3();
const spotAt = new Vector3();
const DEG = Math.PI / 180;

const subscribeEdits = (listener: () => void) => PLACEMENT_EDITS.subscribe(listener);

/** Where it stands and faces, world units: from the landmark's frame, or the visit's post. */
interface ResidentPose {
  readonly spot: Vec3;
  readonly restYaw: number;
  /** Its resting heading in the landmark's frame, degrees (for the placement tool). */
  readonly facingInFrame: number;
}

const samePose = (a: ResidentPose | null, b: ResidentPose): boolean =>
  !!a &&
  Math.abs(a.spot[0] - b.spot[0]) < 1e-5 &&
  Math.abs(a.spot[1] - b.spot[1]) < 1e-5 &&
  Math.abs(a.spot[2] - b.spot[2]) < 1e-5 &&
  Math.abs(a.restYaw - b.restYaw) < 1e-5;

/** The heading (about +y, world) the frame's own +z points along. */
const frameYawOf = (frame: Object3D): number => {
  const e = frame.matrixWorld.elements;
  return Math.atan2(e[8] ?? 0, e[10] ?? 1);
};

function residentPoseOf(
  placement: ResidentPlacement | null,
  frame: Object3D | null,
  fallback: NarratorPlacement,
  eye: Vec3,
): ResidentPose {
  if (!placement || !frame) {
    return {
      spot: fallback.post,
      restYaw: fallback.restYaw,
      facingInFrame: frame ? (fallback.restYaw - frameYawOf(frame)) / DEG : 0,
    };
  }
  frame.updateWorldMatrix(true, false);
  const [x, y, z] = placement.offset;
  frame.localToWorld(spotAt.set(x, y, z));
  const spot: Vec3 = [spotAt.x, spotAt.y, spotAt.z];
  const frameYaw = frameYawOf(frame);
  const restYaw =
    placement.facing === 'camera'
      ? yawTowards(spot, eye)
      : frameYaw + placement.facing * DEG;
  return { spot, restYaw, facingInFrame: (restYaw - frameYaw) / DEG };
}

function ResidentPresence({
  choice,
  placement: post,
  eye,
  reducedMotion,
  hold,
  poke,
  onPoke,
  resident: setup,
  play,
}: ResidentNarratorProps & {
  readonly resident: ResidentSetup;
  readonly play: ResidentPlay;
}) {
  const { landmark } = setup;
  const edit = useSyncExternalStore(subscribeEdits, () =>
    PLACEMENT_EDITS.get(landmark),
  );
  const configured = setup.placement;
  const placing = placingAt(landmark);
  const placement = placing ? (edit ?? configured ?? UNPLACED) : configured;
  const height =
    narratorRenderedHeight(choice, post.height) * (placement?.scale ?? 1);

  const link = residentLinkOf(choice);
  // The guide that just left (hopping back here) hands over: it is shown from the first frame.
  const [handOver] = useState(() => takeNarratorSnapshot(link.snapshot));
  const probe = useRef<Group>(null);
  // Where it stood last time (known once it has been placed): no blank first frame on return.
  const [pose, setPose] = useState<ResidentPose | null>(() =>
    link.spot
      ? { spot: link.spot, restYaw: link.restYaw, facingInFrame: 0 }
      : null,
  );
  const resident = useRef(createResidentState());
  const [view, setView] = useState({
    shown: handOver !== null || placing,
    waving: false,
  });

  useFrame(({ camera }, delta) => {
    const frame = landmarkFrameOf(probe.current);
    const next = residentPoseOf(placement, frame, post, eye);
    if (!samePose(pose, next)) setPose(next);
    link.spot = next.spot;
    link.restYaw = next.restYaw;
    link.height = height;
    const [sx, sy, sz] = next.spot;
    camera.getWorldPosition(cameraAt);
    const step = stepResident(
      resident.current,
      cameraAt.distanceTo(spotAt.set(sx, sy, sz)),
      Math.hypot(eye[0] - sx, eye[1] - sy, eye[2] - sz),
      delta,
    );
    const shown = placing || step.shown;
    // Hidden by distance: its last frame is stale for a hand-over.
    if (!shown) link.snapshot.fresh = false;
    // React state only on a change (show / hide, wave on / off), never per frame.
    if (shown !== view.shown || step.waving !== view.waving)
      setView({ shown, waving: step.waving });
  });

  const living = pose && {
    position: pose.spot,
    restYaw: pose.restYaw,
    enterFrom: RESIDENT_ENTER_FROM,
    exitTo: RESIDENT_EXIT_TO,
    talking: false,
    present: true,
    waving: view.waving,
    reducedMotion,
    hold,
    poke,
    onPoke,
    handOver,
    snapshot: link.snapshot,
  };
  return (
    <>
      <group ref={probe} />
      {view.shown &&
        living &&
        ('cast' in play ? (
          <CastNarrator cast={play.cast} height={height} {...living} />
        ) : (
          <NarratorModelBoundary fallback={null} onFallback={NOTHING}>
            <Suspense fallback={null}>
              <ModelNarrator
                url={play.url}
                rig={play.rig}
                height={height}
                onLoaded={NOTHING}
                {...living}
              />
            </Suspense>
          </NarratorModelBoundary>
        ))}
      {ResidentPlacementTool && placing && pose && placement && (
        <Suspense fallback={null}>
          <ResidentPlacementTool
            landmark={landmark}
            placement={placement}
            frame={landmarkFrameOf(probe.current)}
            spot={pose.spot}
            facingNow={pose.facingInFrame}
          />
        </Suspense>
      )}
    </>
  );
}

type PlayProps = Omit<NarratorProps, 'cast' | 'scale'> & {
  readonly height: number;
};

function CastNarrator({
  cast,
  height,
  ...props
}: PlayProps & { readonly cast: NarratorCastId }) {
  return (
    <Narrator
      cast={cast}
      scale={height / NARRATOR_CAST[cast].height}
      {...props}
    />
  );
}

function ModelNarrator({
  url,
  rig,
  height,
  onLoaded,
  ...props
}: PlayProps & {
  readonly url: string;
  readonly rig: NarratorRigSpec | undefined;
  readonly onLoaded: () => void;
}) {
  // Each call gets its own clone of the cached scene (shared geometry and materials).
  const object = useCompressedModel(url);
  const loaded = useRef(onLoaded);
  useEffect(() => {
    loaded.current = onLoaded;
  });
  useEffect(() => {
    loaded.current();
  }, [object]);
  return <Narrator cast={{ object, height, rig }} {...props} />;
}

/** A bundled model that fails to load gives way to the original cast. */
class NarratorModelBoundary extends Component<
  {
    readonly fallback: ReactNode;
    readonly onFallback: () => void;
    readonly children: ReactNode;
  },
  { readonly failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    console.error(
      'Narrator model failed to load; the original cast plays instead.',
      error,
    );
    this.props.onFallback();
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
