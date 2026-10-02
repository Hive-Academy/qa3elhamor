import type { Locale } from '@qa3elhamor/content-domain';
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  canAdvance,
  dialogueText,
  showsActions,
  visitStateOf,
  type DialogueScript,
  type DialogueState,
} from './dialogue';
import { fillCopy } from '../overlays/overlay-copy';
import { NARRATOR_COPY } from './narrator-copy';
import { objectKeyStep, type SelectSource } from './object-selection';
import { SpeechBubble } from './speech-bubble';
import type { VisitObject, VisitWords } from './visit-types';
import './visit-hud.css';

export interface VisitHudProps {
  readonly lang: Locale;
  readonly dir: 'ltr' | 'rtl';
  /** The viewport, in CSS pixels. */
  readonly width: number;
  readonly height: number;
  /**
   * Narrow screens: a selected object's detail shows in the narrator's bubble, under its
   * comment, rather than in a panel beside the object (which would cover the scene).
   */
  readonly compact: boolean;
  /** Seconds the farewell stays before it fades. */
  readonly farewellSeconds: number;
  /** Lines appear whole instead of typing out. */
  readonly reducedMotion?: boolean;
  /** True while the landmark is open; false while the visit plays its exit. */
  readonly open: boolean;
  readonly fullOpen: boolean;
  /** The objects are out (their labels are live). */
  readonly objectsOut: boolean;

  readonly speaker: string;
  readonly dialogue: DialogueState;
  readonly script: DialogueScript;
  readonly onTyped: () => void;
  readonly onAdvance: () => void;
  readonly onSkip: () => void;
  readonly onResume: () => void;
  readonly onOpenFull: () => void;
  readonly onLeave: () => void;

  readonly objects: readonly VisitObject[];
  readonly selected: string | null;
  readonly onPick: (id: string, source: SelectSource) => void;
  readonly onUnhover: () => void;

  /** The landmark's own words. */
  readonly words: VisitWords;
  /** A glyph on the "open the full view" action. */
  readonly fullIcon?: ReactNode;
  /** The labels' shape over the objects. */
  readonly shape?: 'round' | 'slab';

  /** Positioned by the scene every frame. */
  readonly speechRef: RefObject<HTMLDivElement | null>;
  readonly labelRefs: RefObject<(HTMLElement | null)[]>;
  readonly panelRef: RefObject<HTMLDivElement | null>;
}

/**
 * The DOM half of a narrated visit, in the landmark stage (outside the aria-hidden canvas): the
 * narrator's speech bubble, a label button over each content object (the list keyboard and
 * screen-reader users move through, mirroring the 3D objects), and the selected object's detail.
 * The scene positions all of it over the 3D objects every frame; nothing here knows where
 * things are.
 */
export function VisitHud({
  lang,
  dir,
  width,
  height,
  compact,
  farewellSeconds,
  reducedMotion = false,
  open,
  fullOpen,
  objectsOut,
  speaker,
  dialogue,
  script,
  onTyped,
  onAdvance,
  onSkip,
  onResume,
  onOpenFull,
  onLeave,
  objects,
  selected,
  onPick,
  onUnhover,
  words,
  fullIcon,
  shape = 'round',
  speechRef,
  labelRefs,
  panelRef,
}: VisitHudProps) {
  const kit = NARRATOR_COPY[lang];
  const ids = useId();
  const panelId = `${ids}-detail`;
  const text = dialogueText(dialogue, script);
  const actions = showsActions(dialogue, script);
  const commented =
    dialogue.stage === 'hint'
      ? objects.find((object) => object.id === dialogue.hint)
      : undefined;
  const topic = commented && (commented.topic ?? commented.label);
  // The selected object's detail shows whether or not the narrator has a comment on it (content
  // may add one without a line): beside it, or in the speech bubble on a phone.
  const chosen = objects.find((object) => object.id === selected) ?? null;
  const detailShown =
    chosen !== null &&
    open &&
    !fullOpen &&
    objectsOut &&
    (!compact || (text !== null && dialogue.stage !== 'farewell'));
  const inBubble =
    compact && detailShown && chosen ? (
      <BubbleDetail id={panelId} object={chosen} />
    ) : null;

  // Focus never falls to <body> when the control holding it goes away (the last line's "Next"
  // turning into the actions, the full view closing): it moves to the bubble's best control.
  const root = useRef<HTMLDivElement>(null);
  const hadFocus = useRef(false);
  const openFullRef = useRef<HTMLButtonElement>(null);
  const wasFullOpen = useRef(fullOpen);
  useEffect(() => {
    // Closing the full view hands focus back to the control that opened it.
    const fullClosed = wasFullOpen.current && !fullOpen;
    wasFullOpen.current = fullOpen;
    if (!open || fullOpen) return;
    if (!fullClosed && !hadFocus.current) return;
    const active = document.activeElement;
    if (!fullClosed && active && active !== document.body) return;
    const target =
      openFullRef.current ??
      root.current?.querySelector<HTMLElement>('.speech') ??
      null;
    target?.focus({ preventScroll: true });
  });

  const onLabelKeyDown =
    (index: number) => (event: KeyboardEvent<HTMLElement>) => {
      const next = objectKeyStep(index, event.key, objects.length, dir);
      if (next === null) return;
      event.preventDefault();
      labelRefs.current?.[next]?.focus();
    };

  const onward = <span aria-hidden="true">{dir === 'rtl' ? '‹' : '›'}</span>;
  const footer =
    dialogue.stage === 'farewell' ? null : actions ? (
      <>
        {inBubble}
        <div className="speech__actions">
          <button
            ref={openFullRef}
            type="button"
            className="speech__button speech__button--primary"
            onClick={onOpenFull}
          >
            {fullIcon}
            {words.openFull}
          </button>
          <button type="button" className="speech__button" onClick={onLeave}>
            {kit.leave}
          </button>
        </div>
      </>
    ) : (
      <>
        {dialogue.stage === 'tour' && (
          <ol
            className="speech__dots"
            aria-label={fillCopy(kit.lineOf, {
              n: dialogue.line + 1,
              total: script.lines.length,
            })}
          >
            {script.lines.map((_, i) => (
              <li
                key={i}
                className="speech__dot"
                data-on={i <= dialogue.line ? '' : undefined}
              />
            ))}
          </ol>
        )}
        {dialogue.stage === 'tour' && (
          <button
            type="button"
            className="speech__button speech__button--quiet"
            onClick={onSkip}
          >
            {kit.skip}
          </button>
        )}
        {inBubble}
        {dialogue.stage === 'hint' ? (
          <button type="button" className="speech__button" onClick={onResume}>
            {kit.resume} {onward}
          </button>
        ) : (
          canAdvance(dialogue, script) && (
            <button
              type="button"
              className="speech__button"
              onClick={onAdvance}
            >
              {kit.next} {onward}
            </button>
          )
        )}
      </>
    );

  return (
    <div
      ref={root}
      className="visit-hud"
      data-stage={dialogue.stage}
      data-visit-state={visitStateOf(dialogue)}
      data-full-open={fullOpen ? '' : undefined}
      dir={dir}
      lang={lang}
      style={{ width, height }}
      onFocusCapture={() => (hadFocus.current = true)}
      onBlurCapture={(event) => {
        const next = event.relatedTarget;
        // Null: the focused control was removed (handled above), or focus left the page.
        if (next instanceof Node)
          hadFocus.current = root.current?.contains(next) ?? false;
      }}
    >
      {fullOpen && <div className="visit-full-dim" aria-hidden="true" />}

      {text !== null && !fullOpen && (
        <SpeechBubble
          boxRef={speechRef}
          speaker={speaker}
          topic={topic}
          text={text}
          typing={dialogue.typing}
          take={dialogue.take}
          onTyped={onTyped}
          onAdvance={onAdvance}
          roleDescription={kit.bubbleRole}
          departing={!open}
          lingerSeconds={farewellSeconds}
          autofocus={open}
          reducedMotion={reducedMotion}
        >
          {footer}
        </SpeechBubble>
      )}

      <ul
        className="visit-objects"
        data-shape={shape}
        aria-label={words.objectsList}
        inert={!open || fullOpen || !objectsOut}
        data-dimmed={selected ? '' : undefined}
      >
        {objects.map((object, i) => (
          <li key={object.id}>
            <button
              ref={(element) => {
                if (labelRefs.current) labelRefs.current[i] = element;
              }}
              type="button"
              className="visit-object"
              // Read with pauses between the lines: "Co-Founder, Miramar Staffing, 2020 – now".
              aria-label={
                object.caption?.length
                  ? [object.label, ...object.caption].join(', ')
                  : undefined
              }
              data-selected={selected === object.id ? '' : undefined}
              aria-expanded={selected === object.id}
              aria-controls={
                selected === object.id && detailShown ? panelId : undefined
              }
              // A real mouse movement, not an object sliding under a resting pointer (the
              // narrator's bubble shrinking, say), nor a touch: those pick by tapping.
              onPointerMove={(event) => {
                if (event.pointerType !== 'mouse') return;
                if (event.movementX === 0 && event.movementY === 0) return;
                if (selected !== object.id) onPick(object.id, 'hover');
              }}
              onPointerLeave={onUnhover}
              onFocus={() => onPick(object.id, 'focus')}
              onClick={() => onPick(object.id, 'tap')}
              onKeyDown={onLabelKeyDown(i)}
            >
              <span className="visit-object__label" dir="auto">
                {object.label}
              </span>
              {object.caption?.map((line) => (
                <span key={line} className="visit-object__caption" dir="auto">
                  {line}
                </span>
              ))}
            </button>
          </li>
        ))}
      </ul>

      {!compact && detailShown && chosen && (
        <div
          ref={panelRef}
          id={panelId}
          className="visit-panel"
          role="group"
          aria-label={chosen.detailLabel}
        >
          {chosen.notes && chosen.notes.length > 0 && (
            <ul
              className="visit-panel__notes"
              // A list left in English (untranslated highlights) is laid out as English, its
              // bullets on the English side; `auto` reads that from the first note.
              dir="auto"
            >
              {chosen.notes.map((note) => (
                // `auto`: an untranslated (English) highlight keeps its own direction.
                <li key={note} dir="auto">
                  {note}
                </li>
              ))}
            </ul>
          )}
          <ul className="visit-panel__chips">
            {chosen.chips.map((chip) => (
              <li key={chip} className="visit-chip">
                <bdi>{chip}</bdi>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The selected object's detail inside the speech bubble (narrow screens). */
function BubbleDetail({
  id,
  object,
}: {
  readonly id: string;
  readonly object: VisitObject;
}) {
  const chips = (
    <ul
      id={object.notes?.length ? undefined : id}
      className="speech__chips"
      aria-label={object.notes?.length ? undefined : object.detailLabel}
    >
      {object.chips.map((chip) => (
        <li key={chip} className="speech__chip">
          <bdi>{chip}</bdi>
        </li>
      ))}
    </ul>
  );
  if (!object.notes?.length) return chips;
  return (
    <div
      id={id}
      className="speech__detail"
      role="group"
      aria-label={object.detailLabel}
    >
      <ul className="speech__notes" dir="auto">
        {object.notes.map((note) => (
          <li key={note} dir="auto">
            {note}
          </li>
        ))}
      </ul>
      {chips}
    </div>
  );
}
