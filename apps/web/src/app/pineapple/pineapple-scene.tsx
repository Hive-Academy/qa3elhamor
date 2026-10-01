import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { localize, type LandmarkNarration } from '@qa3elhamor/content-domain';
import { framingScale } from '@qa3elhamor/dive-feature';
import { textDirection } from '@qa3elhamor/landmarks-domain';
import type {
  HitShape,
  LandmarkSceneProps,
} from '@qa3elhamor/landmarks-feature';
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
import { PerspectiveCamera, Vector3, type Group, type Object3D } from 'three';
import { InWorldCard } from '../in-world/in-world-card';
import { facingPoint } from '../in-world/in-world-pose';
import {
  INITIAL_DIALOGUE,
  dialogueReducer,
  type DialogueEvent,
  type DialogueScript,
} from '../narrators/dialogue';
import {
  LandmarkNarrator,
  mouthOf,
  narratorRenderedHeight,
  speechAnchorOf,
} from '../narrators/landmark-narrator';
import { narratorName } from '../narrators/narrator-copy';
import {
  placeSpeechBubble,
  type ScreenInsets,
} from '../narrators/screen-placement';
import { TalkBubbles } from '../narrators/talk-bubbles';
import type { StopView } from '../narrators/stop-view';
import { typingSeconds } from '../narrators/typewriter';
import { viewFrame, type Vec3 } from '../narrators/view-layout';
import type { NarratorChoice } from '../narrators.config';
import {
  CitizenshipCardInWorld,
  type CitizenshipCardContent,
} from '../overlays/citizenship-card';
import { toContentLocale } from '../overlays/overlay-copy';
import { PINEAPPLE_VISIT_COPY } from './pineapple-copy';
import { PineappleHud, type SkillGroupView } from './pineapple-hud';
import { pineappleLayout } from './pineapple-layout';
import { pickDelay, type SelectSource } from './skill-selection';
import { SkillBubbles } from './skill-bubbles';

export interface PineappleSceneContent extends CitizenshipCardContent {
  readonly narration: LandmarkNarration;
  readonly narrator: NarratorChoice;
  readonly stop: StopView;
}

/** Screen space the page chrome keeps: the stage's "Back to the dive" bar at the bottom. */
const INSETS: ScreenInsets = { top: 14, right: 12, bottom: 86, left: 12 };
/** Below this width, a skill group's chips show in the narrator's bubble (see `PineappleHud`). */
const COMPACT_BELOW_PX = 640;
/** How long the narrator stays after the farewell is typed, before swimming off. */
const FAREWELL_LINGER_S = 1.2;

/** The script in the visitor's language. */
export function pineappleScript(
  narration: LandmarkNarration,
  lang: 'en' | 'ar',
): DialogueScript {
  const hints: Record<string, string> = {};
  for (const [id, text] of Object.entries(narration.hints ?? {}))
    hints[id] = localize(text, lang);
  return {
    lines: narration.lines.map((line) => localize(line, lang)),
    hints,
    farewell: narration.farewell && localize(narration.farewell, lang),
  };
}

/**
 * The Pineapple's in-world scene (`LANDMARK_SCENES`). Opening the landmark: a narrator swims
 * up beside the pineapple, turns to the visitor and gives a short tour in a speech bubble, while
 * the owner's skill groups drift out of the door as glowing bubbles. Pointing at (or tabbing to)
 * a bubble shows its skills and the narrator comments on it. The full Citizenship Card is one
 * tap away at the end of the tour. Leaving, the narrator says goodbye and swims off, and the
 * bubbles drift back in. The dialog card stays the fallback (`landmarks.config.ts`).
 */
export function createPineappleScene(
  content: PineappleSceneContent,
): ComponentType<LandmarkSceneProps> {
  function PineappleScene(props: LandmarkSceneProps) {
    return <PineappleVisit {...props} content={content} />;
  }
  return PineappleScene;
}

/** The HUD's DOM root sits at the stage's top left; the scene positions what is inside. */
const AT_ORIGIN = (): [number, number] => [0, 0];

function PineappleVisit({
  phase,
  sceneLayer,
  bounds,
  locale,
  reducedMotion,
  close,
  content,
}: LandmarkSceneProps & { readonly content: PineappleSceneContent }) {
  const { narration, narrator: choice, stop, profile } = content;
  const open = phase === 'focused';
  const lang = toContentLocale(locale);
  const dir = textDirection(locale);
  const script = useMemo(
    () => pineappleScript(narration, lang),
    [narration, lang],
  );
  const groups = useMemo<SkillGroupView[]>(
    () =>
      profile.skills.map((group) => ({
        id: group.id,
        label: localize(group.label, lang),
        skills: group.skills,
      })),
    [profile, lang],
  );
  const groupIds = useMemo(() => groups.map((group) => group.id), [groups]);

  // --- the visit's lifecycle: here (open), leaving (farewell, swim off), away -------------
  const [dialogue, dispatch] = useReducer(
    (state: typeof INITIAL_DIALOGUE, event: DialogueEvent) =>
      dialogueReducer(state, event, script),
    INITIAL_DIALOGUE,
  );
  const [mounted, setMounted] = useState(open);
  const [present, setPresent] = useState(open);
  const [cardOpen, setCardOpen] = useState(false);
  // The picked bubble lives in the dialogue state: one source of truth, cleared whenever the
  // narrator goes back to the tour, however the visitor got it there.
  const selected = dialogue.selected;
  // Who is actually on screen: the configured narrator, or its fallback cast.
  const [playing, setPlaying] = useState<NarratorChoice>(choice);
  const arrived = useRef(false);
  const isOpen = useRef(open);
  useLayoutEffect(() => {
    isOpen.current = open;
  }, [open]);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMounted(true);
      setPresent(true);
    } else {
      setCardOpen(false);
    }
  }

  useEffect(() => {
    if (open) {
      // Re-opened while it was still here (saying goodbye): straight back to the tour.
      if (arrived.current) dispatch({ type: 'arrive' });
      return undefined;
    }
    if (!mounted) return undefined;
    dispatch({ type: 'farewell' });
    const hold = script.farewell
      ? typingSeconds(script.farewell) + FAREWELL_LINGER_S
      : 0;
    const timer = window.setTimeout(() => setPresent(false), hold * 1000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on open/close only
  }, [open]);

  const onSettled = useCallback(() => {
    arrived.current = true;
    // Closed before it got here: it says goodbye instead of starting the tour.
    if (isOpen.current) dispatch({ type: 'arrive' });
  }, []);
  const onExited = useCallback(() => {
    arrived.current = false;
    dispatch({ type: 'reset' });
    setMounted(false);
  }, []);

  // --- picking a skill bubble: select it, and the narrator comments ----------------------
  const hoverTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);
  const onPick = useCallback((id: string, source: SelectSource) => {
    window.clearTimeout(hoverTimer.current);
    const apply = () => dispatch({ type: 'select', id });
    const delay = pickDelay(source);
    if (delay > 0) hoverTimer.current = window.setTimeout(apply, delay);
    else apply();
  }, []);
  const onUnhover = useCallback(
    () => window.clearTimeout(hoverTimer.current),
    [],
  );

  // The full card: Esc closes it before it closes the landmark.
  useEffect(() => {
    if (!cardOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setCardOpen(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [cardOpen]);

  // --- composition: designed for the stop's resting view, placed in the world -------------
  const size = useThree((state) => state.size);
  const camera = useThree((state) => state.camera);
  const fov = camera instanceof PerspectiveCamera ? camera.fov : 55;
  const layout = useMemo(() => {
    const view = viewFrame(
      stop.eye,
      stop.focus,
      fov,
      size,
      framingScale(size.width / size.height),
    );
    return pineappleLayout(view, groups.length, stop.ground);
  }, [stop, fov, size, groups.length]);
  const anchor = useMemo(
    () => speechAnchorOf(playing, layout.narrator.post, layout.narrator.height),
    [playing, layout],
  );
  const renderedHeight = narratorRenderedHeight(
    playing,
    layout.narrator.height,
  );
  const mouth = useMemo(
    () =>
      mouthOf(
        playing,
        layout.narrator.post,
        renderedHeight,
        layout.narrator.restYaw,
      ),
    [playing, layout, renderedHeight],
  );

  const speechRef = useRef<HTMLDivElement | null>(null);
  const labelRefs = useRef<(HTMLElement | null)[]>([]);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const portal = useMemo(() => ({ current: sceneLayer }), [sceneLayer]);
  const door = useRef<Vec3>([0, 0, 0]);

  useSpeechBubblePlacement(speechRef, anchor, INSETS, dir);

  if (!mounted || !sceneLayer) return null;

  const words = PINEAPPLE_VISIT_COPY[lang];
  const farewellSeconds = script.farewell
    ? typingSeconds(script.farewell) + FAREWELL_LINGER_S
    : 0;
  const bubblesOut = open && dialogue.stage !== 'waiting';

  return (
    <>
      <WorldFrame bounds={bounds} eye={stop.eye} door={door}>
        <LandmarkNarrator
          choice={choice}
          height={layout.narrator.height}
          onPlaying={setPlaying}
          position={layout.narrator.post}
          restYaw={layout.narrator.restYaw}
          enterFrom={layout.narrator.enterFrom}
          exitTo={layout.narrator.exitTo}
          talking={dialogue.typing}
          present={present}
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
        <SkillBubbles
          ids={groupIds}
          slots={layout.bubbles}
          door={door}
          out={bubblesOut}
          selected={selected}
          reducedMotion={reducedMotion}
          onPick={onPick}
          labels={labelRefs}
          panel={panelRef}
          insets={INSETS}
        />
      </WorldFrame>

      <Html
        portal={portal as RefObject<HTMLElement>}
        calculatePosition={AT_ORIGIN}
        zIndexRange={[2, 2]}
        wrapperClass="pa-hud-anchor"
        style={{ pointerEvents: 'none' }}
      >
        <PineappleHud
          lang={lang}
          dir={dir}
          width={size.width}
          height={size.height}
          compact={size.width < COMPACT_BELOW_PX}
          farewellSeconds={farewellSeconds}
          open={open}
          cardOpen={cardOpen}
          bubblesOut={bubblesOut}
          speaker={narratorName(playing, lang)}
          reducedMotion={reducedMotion}
          dialogue={dialogue}
          script={script}
          onTyped={() => dispatch({ type: 'typed' })}
          onAdvance={() => dispatch({ type: 'advance' })}
          onSkip={() => dispatch({ type: 'skip' })}
          onResume={() => dispatch({ type: 'resume' })}
          onOpenCard={() => setCardOpen(true)}
          onLeave={close}
          groups={groups}
          selected={selected}
          onPick={onPick}
          onUnhover={onUnhover}
          speechRef={speechRef}
          labelRefs={labelRefs}
          panelRef={panelRef}
        />
      </Html>

      <InWorldCard
        open={open && cardOpen}
        sceneLayer={sceneLayer}
        bounds={bounds}
        doorHeight={0.16}
        liftPx={40}
      >
        {() => (
          <CardView
            backLabel={words.backToGuide}
            dir={dir}
            onBack={() => setCardOpen(false)}
          >
            <CitizenshipCardInWorld {...content} locale={locale} dir={dir} />
          </CardView>
        )}
      </InWorldCard>
    </>
  );
}

/** The full card, focused as it arrives, with the way back to the guide under it. */
function CardView({
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
    <div ref={ref} className="pa-card-view" dir={dir}>
      {children}
      <button type="button" className="pa-card-back" onClick={onBack}>
        <span aria-hidden="true">{dir === 'rtl' ? '›' : '‹'}</span>
        {backLabel}
      </button>
    </div>
  );
}

const anchorWorld = new Vector3();
const anchorView = new Vector3();

/**
 * Keeps the speech bubble over the narrator: projects the anchor above its head each frame and
 * places the bubble (and its tail) with `placeSpeechBubble`.
 */
function useSpeechBubblePlacement(
  speechRef: RefObject<HTMLDivElement | null>,
  anchor: Vec3,
  insets: ScreenInsets,
  dir: 'ltr' | 'rtl',
) {
  useFrame(({ camera, size }) => {
    const box = speechRef.current;
    if (!box) return;
    anchorWorld.set(anchor[0], anchor[1], anchor[2]);
    const depth = -anchorView
      .copy(anchorWorld)
      .applyMatrix4(camera.matrixWorldInverse).z;
    anchorWorld.project(camera);
    const x = depth > 0 ? ((anchorWorld.x + 1) / 2) * size.width : Number.NaN;
    const y = depth > 0 ? ((1 - anchorWorld.y) / 2) * size.height : Number.NaN;
    const place = placeSpeechBubble({
      anchor: { x, y },
      size: { width: box.offsetWidth, height: box.offsetHeight },
      viewport: size,
      insets,
      // The bubble opens away from the pineapple (towards the screen edge the narrator is on).
      bias: dir === 'rtl' ? 0.4 : 0.6,
    });
    box.style.transform = `translate3d(${place.left}px, ${place.top}px, 0)`;
    box.style.opacity = place.visible ? '1' : '0';
    box.style.pointerEvents = place.visible ? '' : 'none';
    box.style.setProperty('--tail-x', `${place.tailX}px`);
    box.style.setProperty('--tail-len', `${place.tailLength}px`);
    const skew =
      (Math.atan2(place.tailLean, Math.max(place.tailLength, 1)) * 180) /
      Math.PI;
    box.style.setProperty('--tail-skew', `${(-skew).toFixed(2)}deg`);
  });
}

/**
 * A group whose children are in world units and world axes, whatever the landmark's frame
 * (which is in scene-world units): the visit is composed in world space against the camera.
 * It also keeps `door` up to date: the point on the model's footprint facing the stop's eye,
 * a sixth of the way up, where the bubbles come out.
 */
function WorldFrame({
  bounds,
  eye,
  door,
  children,
}: {
  readonly bounds: HitShape;
  readonly eye: Vec3;
  readonly door: { current: Vec3 };
  readonly children: ReactNode;
}) {
  const ref = useRef<Group>(null);
  const sync = useCallback(() => {
    const group = ref.current;
    const frame: Object3D | null | undefined = group?.parent;
    if (!group || !frame) return;
    frame.updateWorldMatrix(true, false);
    group.matrix.copy(frame.matrixWorld).invert();
    group.matrixWorldNeedsUpdate = true;
    door.current = doorOf(frame, bounds, eye);
  }, [bounds, eye, door]);
  useLayoutEffect(sync, [sync]);
  useFrame(sync, -1);
  return (
    <group ref={ref} matrixAutoUpdate={false}>
      {children}
    </group>
  );
}

const DOOR_HEIGHT = 0.16;
const local = new Vector3();

/** The door in world units: the footprint's side facing `eye`, `DOOR_HEIGHT` up the bounds. */
function doorOf(frame: Object3D, bounds: HitShape, eye: Vec3): Vec3 {
  const [cx, cy, cz] = bounds.center;
  const radius =
    bounds.kind === 'box'
      ? Math.min(bounds.size[0], bounds.size[2]) / 2
      : bounds.radius;
  const height = bounds.kind === 'box' ? bounds.size[1] : bounds.radius * 2;
  const viewer = frame.worldToLocal(local.set(eye[0], eye[1], eye[2]));
  const p = facingPoint({ x: cx, z: cz }, { x: viewer.x, z: viewer.z }, radius);
  const world = frame.localToWorld(
    local.set(p.x, cy - height / 2 + height * DOOR_HEIGHT, p.z),
  );
  return [world.x, world.y, world.z];
}
