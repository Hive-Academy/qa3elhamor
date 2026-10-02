import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { framingScale } from '@qa3elhamor/dive-feature';
import { textDirection } from '@qa3elhamor/landmarks-domain';
import type { LandmarkSceneProps } from '@qa3elhamor/landmarks-feature';
import { useAudioDucking } from '@qa3elhamor/world-audio';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
  type RefObject,
} from 'react';
import { PerspectiveCamera, Vector3, type Group } from 'three';
import { InWorldCard } from '../in-world/in-world-card';
import {
  narratorPosePreviewFor,
  type NarratorChoice,
} from '../narrators.config';
import { toContentLocale } from '../overlays/overlay-copy';
import {
  INITIAL_DIALOGUE,
  dialogueReducer,
  type DialogueEvent,
  type DialogueState,
} from './dialogue';
import {
  LandmarkNarrator,
  ResidentNarrator,
  mouthOf,
  narratorRenderedHeight,
  speechAnchorOf,
} from './landmark-narrator';
import { NARRATOR_COPY, narratorName } from './narrator-copy';
import {
  chooseNarratorPlacement,
  inSight,
  narratorOnScreen,
  narratorProbePoints,
  nearerPlacement,
  sceneOccluders,
} from './narrator-post';
import {
  placeSpeechBubble,
  tailSkewDegrees,
  windowSafeInsets,
  type ScreenInsets,
} from './screen-placement';
import { TalkBubbles } from './talk-bubbles';
import { typingSeconds } from './typewriter';
import { viewFrame, type Vec3, type ViewFrame } from './view-layout';
import type { NarratorPlacement } from './visit-layout';
import {
  useFullView,
  useObjectPicking,
  useVisitLifecycle,
} from './visit-hooks';
import { VisitHud } from './visit-hud';
import { visitScript } from './visit-script';
import type { NarratedVisitDefinition, VisitLayout } from './visit-types';
import { WorldFrame } from './world-frame';

/** Screen space the page chrome keeps: the stage's "Back to the dive" bar at the bottom. */
export const VISIT_INSETS: ScreenInsets = {
  top: 14,
  right: 12,
  bottom: 86,
  left: 12,
};
/** Below this width, a selected object's detail shows in the narrator's bubble. */
export const COMPACT_BELOW_PX = 640;
/** How long the narrator stays after the farewell is typed, before swimming off. */
export const FAREWELL_LINGER_S = 1.2;
const DEFAULT_DOOR_HEIGHT = 0.16;

/** Development only (`?pose=wave&poseAt=0.3`): one clip held on every rigged narrator. */
const POSE_PREVIEW = import.meta.env.DEV
  ? narratorPosePreviewFor(
      typeof window === 'undefined' ? '' : window.location.search,
      true,
    )
  : null;

/**
 * A landmark's narrated visit, as its in-world scene (`LANDMARK_SCENES`). Opening the landmark:
 * a narrator swims up beside it, turns to the visitor and gives a short tour in a speech bubble,
 * while the landmark's content objects come out around it. Pointing at (or tabbing to) an object
 * shows its detail and the narrator comments on it. The landmark's full view is one tap away at
 * the end of the tour. Leaving, the narrator says goodbye and swims off, and the objects go
 * back. The landmark's dialog overlay stays the fallback (`landmarks.config.ts`).
 *
 * See `narrators/README.md` for what a landmark supplies.
 */
export function createNarratedVisitScene<Slot>(
  definition: NarratedVisitDefinition<Slot>,
): ComponentType<LandmarkSceneProps> {
  function NarratedVisitScene(props: LandmarkSceneProps) {
    return <NarratedVisit {...props} visit={definition} />;
  }
  return NarratedVisitScene;
}

/** The HUD's DOM root sits at the stage's top left; the scene positions what is inside. */
const AT_ORIGIN = (): [number, number] => [0, 0];

function NarratedVisit<Slot>({
  phase,
  sceneLayer,
  bounds,
  locale,
  reducedMotion,
  close,
  visit,
}: LandmarkSceneProps & {
  readonly visit: NarratedVisitDefinition<Slot>;
}) {
  const {
    narration,
    hints,
    narrator: choice,
    stop,
    Objects,
    fullView,
    shape,
    doorHeight = DEFAULT_DOOR_HEIGHT,
  } = visit;
  const open = phase === 'focused';
  const lang = toContentLocale(locale);
  const dir = textDirection(locale);
  const script = useMemo(
    () => visitScript(narration, lang, hints),
    [narration, lang, hints],
  );
  const objects = useMemo(() => visit.objects(lang), [visit, lang]);
  const ids = useMemo(() => objects.map((object) => object.id), [objects]);

  const [dialogue, dispatch] = useReducer(
    (state: DialogueState, event: DialogueEvent) =>
      dialogueReducer(state, event, script),
    INITIAL_DIALOGUE,
  );
  const farewellSeconds = script.farewell
    ? typingSeconds(script.farewell) + FAREWELL_LINGER_S
    : 0;
  const { mounted, present, onSettled, onExited } = useVisitLifecycle(
    open,
    farewellSeconds,
    dispatch,
  );
  // The ambient music steps back while the narrator talks (`@qa3elhamor/world-audio`).
  useAudioDucking(dialogue.typing);
  const [fullOpen, setFullOpen] = useFullView(open);
  const { onPick, onUnhover } = useObjectPicking(dispatch);
  // The picked object lives in the dialogue state: one source of truth, cleared whenever the
  // narrator goes back to the tour, however the visitor got it there.
  const selected = dialogue.selected;
  // Who is actually on screen: the configured narrator, or its fallback cast.
  const [playing, setPlaying] = useState<NarratorChoice>(choice);

  // --- composition: designed for the stop's resting view, placed in the world -------------
  const size = useThree((state) => state.size);
  const camera = useThree((state) => state.camera);
  const fov = camera instanceof PerspectiveCamera ? camera.fov : 55;
  const view = useMemo(
    () =>
      viewFrame(
        stop.eye,
        stop.focus,
        fov,
        size,
        framingScale(size.width / size.height),
      ),
    [stop, fov, size],
  );
  const layout = useMemo(
    () => visit.layout(view, ids.length, stop.ground),
    [visit, view, ids.length, stop.ground],
  );
  // Everything the visit draws: never counted as hiding its own narrator.
  const visitRoot = useRef<Group>(null);
  // Settled once the tour starts: the narrator has swum into place.
  const post = useNarratorPost(
    layout,
    view,
    mounted,
    visitRoot,
    dialogue.stage !== 'waiting',
  );
  const anchor = useMemo(
    () => speechAnchorOf(playing, post.post, post.height),
    [playing, post],
  );
  const renderedHeight = narratorRenderedHeight(playing, post.height);
  const mouth = useMemo(
    () => mouthOf(playing, post.post, renderedHeight, post.restYaw),
    [playing, post, renderedHeight],
  );

  const speechRef = useRef<HTMLDivElement | null>(null);
  const labelRefs = useRef<(HTMLElement | null)[]>([]);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const portal = useMemo(() => ({ current: sceneLayer }), [sceneLayer]);
  const door = useRef<Vec3>([0, 0, 0]);

  useSpeechBubblePlacement(speechRef, anchor, VISIT_INSETS, dir);

  // Before the visit (and after it), a rigged narrator idles at its post as the visitor dives
  // past: the landmark is inhabited. The visit itself is unchanged.
  if (!mounted)
    return (
      <WorldFrame
        bounds={bounds}
        eye={stop.eye}
        door={door}
        doorHeight={doorHeight}
      >
        <ResidentNarrator
          choice={choice}
          placement={post}
          eye={stop.eye}
          reducedMotion={reducedMotion}
          hold={POSE_PREVIEW}
        />
      </WorldFrame>
    );
  if (!sceneLayer) return null;

  const words = visit.words[lang];
  const objectsOut = open && dialogue.stage !== 'waiting';

  return (
    <>
      <WorldFrame
        bounds={bounds}
        eye={stop.eye}
        door={door}
        doorHeight={doorHeight}
      >
        <group ref={visitRoot} name="narrated-visit">
          <LandmarkNarrator
            choice={choice}
            height={post.height}
            onPlaying={setPlaying}
            position={post.post}
            restYaw={post.restYaw}
            enterFrom={post.enterFrom}
            exitTo={post.exitTo}
            talking={dialogue.typing}
            present={present}
            waving={dialogue.stage === 'farewell'}
            hold={POSE_PREVIEW}
            reducedMotion={reducedMotion}
            onSettled={onSettled}
            onExited={onExited}
          />
          <TalkBubbles
            from={mouth}
            size={renderedHeight}
            talking={dialogue.typing && present}
            reducedMotion={reducedMotion}
          />
          <Objects
            ids={ids}
            slots={layout.slots}
            door={door}
            out={objectsOut}
            selected={selected}
            reducedMotion={reducedMotion}
            onPick={onPick}
            labels={labelRefs}
            panel={panelRef}
            insets={VISIT_INSETS}
          />
        </group>
      </WorldFrame>

      <Html
        portal={portal as RefObject<HTMLElement>}
        calculatePosition={AT_ORIGIN}
        zIndexRange={[2, 2]}
        wrapperClass="visit-hud-anchor"
        style={{ pointerEvents: 'none' }}
      >
        <VisitHud
          lang={lang}
          dir={dir}
          width={size.width}
          height={size.height}
          compact={size.width < COMPACT_BELOW_PX}
          farewellSeconds={farewellSeconds}
          open={open}
          fullOpen={fullOpen}
          objectsOut={objectsOut}
          speaker={narratorName(playing, lang)}
          reducedMotion={reducedMotion}
          dialogue={dialogue}
          script={script}
          onTyped={() => dispatch({ type: 'typed' })}
          onAdvance={() => dispatch({ type: 'advance' })}
          onSkip={() => dispatch({ type: 'skip' })}
          onResume={() => dispatch({ type: 'resume' })}
          onOpenFull={() => setFullOpen(true)}
          onLeave={close}
          objects={objects}
          selected={selected}
          onPick={onPick}
          onUnhover={onUnhover}
          words={words}
          fullIcon={fullView.icon}
          shape={shape}
          speechRef={speechRef}
          labelRefs={labelRefs}
          panelRef={panelRef}
        />
      </Html>

      <InWorldCard
        open={open && fullOpen}
        sceneLayer={sceneLayer}
        bounds={bounds}
        doorHeight={fullView.doorHeight ?? DEFAULT_DOOR_HEIGHT}
        liftPx={fullView.liftPx ?? 40}
      >
        {() => (
          <FullView
            backLabel={NARRATOR_COPY[lang].backToGuide}
            dir={dir}
            onBack={() => setFullOpen(false)}
          >
            {fullView.render({ locale, dir })}
          </FullView>
        )}
      </InWorldCard>
    </>
  );
}

/** The full view, focused as it arrives, with the way back to the guide under it. */
function FullView({
  backLabel,
  dir,
  onBack,
  children,
}: {
  readonly backLabel: string;
  readonly dir: 'ltr' | 'rtl';
  readonly onBack: () => void;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current
      ?.querySelector<HTMLElement>('article')
      ?.focus({ preventScroll: true });
  }, []);
  return (
    <div ref={ref} className="visit-full-view" dir={dir}>
      {children}
      <button type="button" className="visit-full-back" onClick={onBack}>
        <span aria-hidden="true">{dir === 'rtl' ? '›' : '‹'}</span>
        {backLabel}
      </button>
    </div>
  );
}

/** Seconds between checks for models that streamed in after the narrator's spot was chosen. */
const RECHECK_SECONDS = 0.5;

/**
 * Where the narrator floats: the layout's spot unless the town hides it there or it would leave
 * the screen, in which case its next alternative, or the spot nearer the visitor
 * (`narrator-post.ts`). Chosen against the scene as the visit opens, and again when the viewport
 * changes. Models may still be streaming in then (a building that will hide the first spot):
 * until `settled`, the scene's occluders are counted twice a second and the choice is made again
 * when that count changes. The narrator is still swimming in meanwhile, so it just swims to the
 * better spot; once it has settled the choice holds, and nothing jumps.
 *
 * Exported for visits that compose the kit's parts themselves (the Bureau): wrap everything the
 * visit draws in `visitRoot`, so it never counts as hiding its own narrator, and pass `settled`
 * once the narrator is in place.
 */
export function useNarratorPost<Slot>(
  layout: VisitLayout<Slot>,
  view: ViewFrame,
  mounted: boolean,
  visitRoot: RefObject<Group | null>,
  settled = false,
): NarratorPlacement {
  const scene = useThree((state) => state.scene);
  const candidates = useMemo(
    () => [
      layout.narrator,
      ...(layout.narratorAlternatives ?? []),
      nearerPlacement(layout.narrator, view.eye),
    ],
    [layout, view],
  );
  const [post, setPost] = useState(layout.narrator);
  /** Returns how many occluders the choice was made against. */
  const choose = useCallback((): number => {
    const occluders = sceneOccluders(scene, visitRoot.current);
    const { placement } = chooseNarratorPlacement(candidates, {
      onScreen: (p) => narratorOnScreen(view, p, VISIT_INSETS),
      inSight: (p) =>
        inSight(view.eye, narratorProbePoints(p, view.right), occluders),
    });
    setPost(placement);
    return occluders.length;
  }, [candidates, scene, view, visitRoot]);
  const counted = useRef(-1);
  const sinceCheck = useRef(0);
  useLayoutEffect(() => {
    if (!mounted) return;
    counted.current = choose();
  }, [choose, mounted]);
  useFrame((_, delta) => {
    if (!mounted || settled) return;
    sinceCheck.current += delta;
    if (sinceCheck.current < RECHECK_SECONDS) return;
    sinceCheck.current = 0;
    if (sceneOccluders(scene, visitRoot.current).length !== counted.current)
      counted.current = choose();
  });
  return post;
}

const anchorWorld = new Vector3();
const anchorView = new Vector3();

/** What the bubble's placement needs from the layout: measured off the frame loop, not in it. */
interface BubbleGeometry {
  box: HTMLElement | null;
  width: number;
  height: number;
  /** The stage layer's box in the window, or null before it is measured. */
  layer: { left: number; top: number; right: number; bottom: number } | null;
  observer: ResizeObserver | null;
}

/**
 * Keeps the speech bubble's size and its layer's place in the window measured, without reading
 * layout every frame: the bubble and its layer are measured once when the bubble appears, then
 * again only when either resizes (ResizeObserver) or the window resizes or scrolls.
 */
function useBubbleGeometry(): {
  readonly geometry: { readonly current: BubbleGeometry };
  readonly track: (box: HTMLElement | null) => void;
} {
  const geometry = useRef<BubbleGeometry>({
    box: null,
    width: 0,
    height: 0,
    layer: null,
    observer: null,
  });
  const measure = useCallback(() => {
    const g = geometry.current;
    if (!g.box) return;
    g.width = g.box.offsetWidth;
    g.height = g.box.offsetHeight;
    const rect = (
      g.box.offsetParent ?? g.box.parentElement
    )?.getBoundingClientRect();
    g.layer = rect
      ? {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        }
      : null;
  }, []);
  const track = useCallback(
    (box: HTMLElement | null) => {
      const g = geometry.current;
      if (g.box === box) return;
      g.observer?.disconnect();
      g.observer = null;
      g.box = box;
      if (!box) return;
      measure();
      if (typeof ResizeObserver === 'undefined') return;
      g.observer = new ResizeObserver(measure);
      g.observer.observe(box);
      const layer = box.offsetParent ?? box.parentElement;
      if (layer) g.observer.observe(layer);
    },
    [measure],
  );
  useEffect(() => {
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, {
      capture: true,
      passive: true,
    });
    const g = geometry.current;
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, { capture: true });
      g.observer?.disconnect();
      g.observer = null;
    };
  }, [measure]);
  return { geometry, track };
}

/**
 * Keeps the speech bubble over the narrator: projects the anchor above its head each frame and
 * places the bubble (and its tail) with `placeSpeechBubble`. Exported for visits that compose
 * the kit's parts themselves (the Bureau, whose full view is a form). Writes styles only: its
 * measurements come from `useBubbleGeometry`.
 */
export function useSpeechBubblePlacement(
  speechRef: RefObject<HTMLDivElement | null>,
  anchor: Vec3,
  insets: ScreenInsets,
  dir: 'ltr' | 'rtl',
) {
  const { geometry, track } = useBubbleGeometry();
  useFrame(({ camera, size }) => {
    const box = speechRef.current;
    track(box);
    if (!box) return;
    anchorWorld.set(anchor[0], anchor[1], anchor[2]);
    const depth = -anchorView
      .copy(anchorWorld)
      .applyMatrix4(camera.matrixWorldInverse).z;
    anchorWorld.project(camera);
    const x = depth > 0 ? ((anchorWorld.x + 1) / 2) * size.width : Number.NaN;
    const y = depth > 0 ? ((1 - anchorWorld.y) / 2) * size.height : Number.NaN;
    const { width, height, layer } = geometry.current;
    const place = placeSpeechBubble({
      anchor: { x, y },
      size: { width, height },
      viewport: size,
      // Kept inside the browser window too, wherever the stage layer sits in it.
      insets: layer
        ? windowSafeInsets(insets, layer, {
            width: window.innerWidth,
            height: window.innerHeight,
          })
        : insets,
      // The bubble opens away from the landmark (towards the screen edge the narrator is on).
      bias: dir === 'rtl' ? 0.4 : 0.6,
    });
    box.style.transform = `translate3d(${place.left}px, ${place.top}px, 0)`;
    box.style.opacity = place.visible ? '1' : '0';
    box.style.pointerEvents = place.visible ? '' : 'none';
    box.style.setProperty('--tail-x', `${place.tailX}px`);
    box.style.setProperty('--tail-len', `${place.tailLength}px`);
    box.style.setProperty(
      '--tail-skew',
      `${tailSkewDegrees(place).toFixed(2)}deg`,
    );
  });
}
