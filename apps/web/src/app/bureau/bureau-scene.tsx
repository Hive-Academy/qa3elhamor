import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { LandmarkNarration, SiteCopy } from '@qa3elhamor/content-domain';
import { framingScale } from '@qa3elhamor/dive-feature';
import { textDirection } from '@qa3elhamor/landmarks-domain';
import { isTextEntry } from '@qa3elhamor/landmarks-ui';
import type { LandmarkSceneProps } from '@qa3elhamor/landmarks-feature';
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ComponentType,
  type RefObject,
} from 'react';
import { PerspectiveCamera, type Group } from 'three';
import { InWorldCard } from '../in-world/in-world-card';
import {
  INITIAL_DIALOGUE,
  dialogueReducer,
  type DialogueEvent,
  type DialogueState,
} from '../narrators/dialogue';
import {
  LandmarkNarrator,
  mouthOf,
  narratorRenderedHeight,
  speechAnchorOf,
} from '../narrators/landmark-narrator';
import {
  COMPACT_BELOW_PX,
  FAREWELL_LINGER_S,
  VISIT_INSETS,
  useNarratorPost,
  useSpeechBubblePlacement,
} from '../narrators/narrated-visit';
import { narratorName } from '../narrators/narrator-copy';
import type { StopView } from '../narrators/stop-view';
import { TalkBubbles } from '../narrators/talk-bubbles';
import { typingSeconds } from '../narrators/typewriter';
import { viewFrame, worldPerPx, type Vec3 } from '../narrators/view-layout';
import type { VisitLayout } from '../narrators/visit-types';
import { useVisitLifecycle } from '../narrators/visit-hooks';
import { visitScript } from '../narrators/visit-script';
import { WorldFrame } from '../narrators/world-frame';
import type { NarratorChoice } from '../narrators.config';
import {
  EMPTY_COMPLAINT_FORM,
  singleFlight,
  type ComplaintDelivery,
  type ComplaintFormValues,
  type ComplaintSubmitter,
} from '../overlays/complaint-scroll';
import { copyReader, toContentLocale } from '../overlays/overlay-copy';
import { BUREAU_VISIT_COPY, FILED_LINES } from './bureau-copy';
import {
  INITIAL_FILING,
  filedLineOf,
  filingReducer,
  paperStateOf,
  scrollOut,
} from './bureau-filing';
import { BureauHud } from './bureau-hud';
import { scrollEscape } from './bureau-keys';
import { bureauLayout } from './bureau-layout';
import { BureauScroll } from './bureau-scroll';
import { BureauSheet } from './bureau-sheet';
import { ClerkWindow } from './clerk-window';
import { MessageBottle } from './message-bottle';

export interface BureauSceneContent {
  readonly copy: SiteCopy;
  /** The site's one contact submitter (`contact-submitter.ts`), shared with the dialog. */
  readonly submitter: ComplaintSubmitter;
  readonly narration: LandmarkNarration;
  readonly narrator: NarratorChoice;
  readonly stop: StopView;
}

/** Where the clerk window is on the Bureau (fraction of its height): the scroll comes out there. */
const WINDOW_HEIGHT = 0.5;
/** Screen pixels the unrolled paper (and the bottle after it) sits above the viewport centre. */
const PAPER_LIFT_PX = 36;
/** On a phone the bottle lets go below the screen's middle, to be seen rising past the bubble. */
const BOTTLE_FROM_SHEET_PX = -140;
/** How long the stamped paper holds still before it rolls up, and how long the roll takes. */
const STAMP_HOLD_MS = 2400;
const ROLL_MS = 820;
/** Short screens (a phone on its side) type on the sheet too. */
const SHEET_BELOW_HEIGHT_PX = 560;

/**
 * The Complaints Bureau's in-world scene (`LANDMARK_SCENES`). The Sardine President swims up
 * and invites the visitor to file a complaint (`narration.landmarks.bureau`) while the clerk
 * window lights up. "File a complaint": the paper scroll shoots out of the pneumatic tube and
 * unrolls in front of the visitor, carrying the real form (`ComplaintScroll`: same rules, same
 * shared submitter). On a phone the paper is a sheet over the scene, for comfortable typing.
 * Stamped: the Sardine Municipal Stamp slams down, the paper rolls up into a bottle that floats
 * to the surface, and the President says where it is going (honestly, when no post office is
 * wired up). A failed delivery keeps the text, with the form's own failure notice.
 *
 * It composes the narrated-visit kit's parts (`narrators/`) rather than its object tour: its
 * full view is a form, with a performance of its own. The dialog stays the fallback.
 */
export function createBureauScene(
  content: BureauSceneContent,
): ComponentType<LandmarkSceneProps> {
  function BureauScene(props: LandmarkSceneProps) {
    return <BureauVisit {...props} content={content} />;
  }
  return BureauScene;
}

/** The HUD's DOM root sits at the stage's top left; the scene positions what is inside. */
const AT_ORIGIN = (): [number, number] => [0, 0];

function BureauVisit({
  phase,
  sceneLayer,
  bounds,
  locale,
  title,
  reducedMotion,
  close,
  content,
}: LandmarkSceneProps & { readonly content: BureauSceneContent }) {
  const { copy, submitter, narration, narrator: choice, stop } = content;
  const open = phase === 'focused';
  const lang = toContentLocale(locale);
  const dir = textDirection(locale);
  const t = copyReader(copy, lang);
  const words = BUREAU_VISIT_COPY[lang];
  const script = useMemo(
    () => visitScript(narration, lang, FILED_LINES),
    [narration, lang],
  );

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
  const [playing, setPlaying] = useState<NarratorChoice>(choice);

  // --- filing: the scroll, the stamp, the bottle ------------------------------------------
  const [filing, file] = useReducer(filingReducer, INITIAL_FILING);
  const out = scrollOut(filing);
  // Leaving puts everything back for the next visit.
  useEffect(() => {
    if (!open) file({ type: 'reset' });
  }, [open]);
  // The site's submitter, with one submission in flight at most across the paper and the
  // phone sheet, and its outcome heard even after the form that sent it has gone.
  const sharedSubmitter = useMemo(
    () =>
      singleFlight(submitter, {
        onSending: () => file({ type: 'sending' }),
        onDelivered: () => file({ type: 'sent' }),
        onFailed: () => file({ type: 'send-failed' }),
      }),
    [submitter],
  );
  // The visitor's unsent text survives rolling the scroll back up (and leaving).
  const draft = useRef<ComplaintFormValues>(EMPTY_COMPLAINT_FORM);
  const onDraftChange = useCallback((values: ComplaintFormValues) => {
    draft.current = values;
  }, []);
  const onStamped = useCallback((delivery: ComplaintDelivery) => {
    draft.current = EMPTY_COMPLAINT_FORM;
    file({ type: 'stamped', delivery });
  }, []);
  const openScroll = useCallback(() => {
    // Back to the tour first, so the next filed line is said afresh.
    dispatch({ type: 'resume' });
    file({ type: 'unroll' });
  }, []);
  const rollBack = useCallback(() => file({ type: 'roll-back' }), []);

  useEffect(() => {
    if (filing.stage === 'stamped') {
      const timer = window.setTimeout(
        () => file({ type: 'stamp-held' }),
        STAMP_HOLD_MS,
      );
      return () => window.clearTimeout(timer);
    }
    if (filing.stage === 'rolling') {
      const timer = window.setTimeout(
        () => file({ type: 'corked' }),
        reducedMotion ? 0 : ROLL_MS,
      );
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [filing.stage, reducedMotion]);

  // Afloat: the President says where the bottle is going, once per bottle, as soon as he is
  // there to say it (a complaint stamped after the visitor left is told on their return).
  const announced = useRef(0);
  const narratorHere = dialogue.stage === 'tour' || dialogue.stage === 'hint';
  useEffect(() => {
    if (filing.stage !== 'afloat' || !filing.delivery || !narratorHere) return;
    if (announced.current === filing.bottle) return;
    announced.current = filing.bottle;
    dispatch({ type: 'select', id: filedLineOf(filing.delivery) });
  }, [filing.stage, filing.delivery, filing.bottle, narratorHere]);

  // Esc on the unrolled scroll (`scrollEscape`): out of a field first, then back into the
  // tube with the text kept; never during an IME composition, never while it is being sent.
  useEffect(() => {
    if (filing.stage !== 'unrolled') return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement;
      const paper = active?.closest('.bureau-scroll') ?? null;
      const action = scrollEscape(event, {
        sending: filing.sending,
        inField: paper !== null && isTextEntry(active),
      });
      if (action === 'ignore') return;
      event.preventDefault();
      if (action === 'leave-field')
        paper
          ?.querySelector<HTMLElement>('.bureau-scroll__back')
          ?.focus({ preventScroll: true });
      else if (action === 'roll-back') file({ type: 'roll-back' });
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [filing.stage, filing.sending]);

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
    () => bureauLayout(view, stop.ground),
    [view, stop.ground],
  );
  const windowWidth = layout.windowPx * worldPerPx(view, view.focusDepth);
  // The kit keeps the President seen: his spot, unless the town hides it or it leaves the
  // screen (`narrators/narrator-post.ts`).
  const postLayout = useMemo<VisitLayout<never>>(
    () => ({ narrator: layout.narrator, slots: [] }),
    [layout],
  );
  const visitRoot = useRef<Group>(null);
  // Re-checked while models stream in; held once he has arrived and started talking.
  const post = useNarratorPost(
    postLayout,
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
  const portal = useMemo(() => ({ current: sceneLayer }), [sceneLayer]);
  const door = useRef<Vec3>([0, 0, 0]);
  useSpeechBubblePlacement(speechRef, anchor, VISIT_INSETS, dir);

  if (!mounted || !sceneLayer) return null;

  const sheetMode =
    size.width < COMPACT_BELOW_PX || size.height < SHEET_BELOW_HEIGHT_PX;
  const scrollProps = {
    copy,
    submitter: sharedSubmitter,
    sending: filing.sending,
    initialFailed: filing.failedAway,
    locale,
    dir,
    title,
    words,
    initialValues: draft.current,
    onDraftChange,
    onStamped,
    onRollBack: rollBack,
  };

  return (
    <>
      <WorldFrame
        bounds={bounds}
        eye={stop.eye}
        door={door}
        doorHeight={WINDOW_HEIGHT}
      >
        <group ref={visitRoot}>
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
          <ClerkWindow
            door={door}
            eye={stop.eye}
            width={windowWidth}
            lit={open && dialogue.stage !== 'waiting'}
            busy={open && out}
            sign={title}
            reducedMotion={reducedMotion}
          />
          <MessageBottle
            launch={filing.stage === 'afloat' ? filing.bottle : null}
            heightPx={layout.bottlePx}
            liftPx={sheetMode ? BOTTLE_FROM_SHEET_PX : PAPER_LIFT_PX}
            reducedMotion={reducedMotion}
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
        <BureauHud
          lang={lang}
          dir={dir}
          width={size.width}
          height={size.height}
          farewellSeconds={farewellSeconds}
          reducedMotion={reducedMotion}
          open={open}
          speaker={narratorName(playing, lang)}
          dialogue={dialogue}
          script={script}
          onTyped={() => dispatch({ type: 'typed' })}
          onAdvance={() => dispatch({ type: 'advance' })}
          onSkip={() => dispatch({ type: 'skip' })}
          onLeave={close}
          scrollOut={open && out}
          onOpenScroll={openScroll}
          words={words}
          fileAnother={t('complaintAnotherLabel')}
          filedTopic={t('complaintSuccessTitle')}
          speechRef={speechRef}
          sheet={
            sheetMode && open && out ? (
              <BureauSheet
                key={filing.sheet}
                layoutHeight={size.height}
                state={paperStateOf(filing.stage, 'arrived')}
                {...scrollProps}
              />
            ) : null
          }
        />
      </Html>

      {!sheetMode && (
        <InWorldCard
          key={filing.sheet}
          open={open && out}
          sceneLayer={sceneLayer}
          bounds={bounds}
          doorHeight={WINDOW_HEIGHT}
          liftPx={PAPER_LIFT_PX}
        >
          {({ phase: card }) => (
            <BureauScroll
              {...scrollProps}
              state={paperStateOf(filing.stage, card)}
              presentation="in-world"
            />
          )}
        </InWorldCard>
      )}
    </>
  );
}
