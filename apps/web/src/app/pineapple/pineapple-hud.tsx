import type { Locale } from '@qa3elhamor/content-domain';
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import {
  canAdvance,
  dialogueText,
  showsActions,
  type DialogueScript,
  type DialogueState,
} from '../narrators/dialogue';
import { NARRATOR_COPY } from '../narrators/narrator-copy';
import { SpeechBubble } from '../narrators/speech-bubble';
import { fillCopy } from '../overlays/overlay-copy';
import { PINEAPPLE_VISIT_COPY } from './pineapple-copy';
import { bubbleKeyStep, type SelectSource } from './skill-selection';
import './pineapple-hud.css';

/** A skill group, in the visitor's language. */
export interface SkillGroupView {
  readonly id: string;
  readonly label: string;
  readonly skills: readonly string[];
}

export interface PineappleHudProps {
  readonly lang: Locale;
  readonly dir: 'ltr' | 'rtl';
  /** The viewport, in CSS pixels. */
  readonly width: number;
  readonly height: number;
  /**
   * Narrow screens: a selected group's skills show in the narrator's bubble, under its comment,
   * rather than in a tray beside the skill bubble (which would cover the scene).
   */
  readonly compact: boolean;
  /** Seconds the farewell stays before it fades. */
  readonly farewellSeconds: number;
  /** Lines appear whole instead of typing out. */
  readonly reducedMotion?: boolean;
  /** True while the landmark is open; false while the visit plays its exit. */
  readonly open: boolean;
  readonly cardOpen: boolean;
  /** The bubbles are out in the water (their labels are live). */
  readonly bubblesOut: boolean;

  readonly speaker: string;
  readonly dialogue: DialogueState;
  readonly script: DialogueScript;
  readonly onTyped: () => void;
  readonly onAdvance: () => void;
  readonly onSkip: () => void;
  readonly onResume: () => void;
  readonly onOpenCard: () => void;
  readonly onLeave: () => void;

  readonly groups: readonly SkillGroupView[];
  readonly selected: string | null;
  readonly onPick: (id: string, source: SelectSource) => void;
  readonly onUnhover: () => void;

  /** Positioned by the scene every frame. */
  readonly speechRef: RefObject<HTMLDivElement | null>;
  readonly labelRefs: RefObject<(HTMLElement | null)[]>;
  readonly panelRef: RefObject<HTMLDivElement | null>;
}

/**
 * The DOM half of the Pineapple visit, in the landmark stage (outside the aria-hidden canvas):
 * the narrator's speech bubble, a label button over each skill bubble (the list keyboard and
 * screen-reader users move through), and the selected group's skills. The scene positions all
 * of it over the 3D objects every frame; nothing here knows where things are.
 */
export function PineappleHud({
  lang,
  dir,
  width,
  height,
  compact,
  farewellSeconds,
  reducedMotion = false,
  open,
  cardOpen,
  bubblesOut,
  speaker,
  dialogue,
  script,
  onTyped,
  onAdvance,
  onSkip,
  onResume,
  onOpenCard,
  onLeave,
  groups,
  selected,
  onPick,
  onUnhover,
  speechRef,
  labelRefs,
  panelRef,
}: PineappleHudProps) {
  const words = { ...NARRATOR_COPY[lang], ...PINEAPPLE_VISIT_COPY[lang] };
  const ids = useId();
  const panelId = `${ids}-skills`;
  const text = dialogueText(dialogue, script);
  const actions = showsActions(dialogue, script);
  const topic =
    dialogue.stage === 'hint'
      ? groups.find((group) => group.id === dialogue.hint)?.label
      : undefined;
  // The selected group's skills show whether or not the narrator has a comment on it (content
  // may add a group without a hint): beside its bubble, or in the speech bubble on a phone.
  const selectedGroup = groups.find((group) => group.id === selected) ?? null;
  const panelShown =
    selectedGroup !== null &&
    open &&
    !cardOpen &&
    bubblesOut &&
    (!compact || (text !== null && dialogue.stage !== 'farewell'));
  const chips =
    compact && panelShown && selectedGroup ? (
      <ul
        id={panelId}
        className="speech__chips"
        aria-label={fillCopy(words.skillsOf, { group: selectedGroup.label })}
      >
        {selectedGroup.skills.map((skill) => (
          <li key={skill} className="speech__chip">
            {skill}
          </li>
        ))}
      </ul>
    ) : null;

  // Focus never falls to <body> when the control holding it goes away (the last line's "Next"
  // turning into the actions, the card closing): it moves to the bubble's best control.
  const root = useRef<HTMLDivElement>(null);
  const hadFocus = useRef(false);
  const openCardRef = useRef<HTMLButtonElement>(null);
  const wasCardOpen = useRef(cardOpen);
  useEffect(() => {
    // Closing the card hands focus back to the control that opened it.
    const cardClosed = wasCardOpen.current && !cardOpen;
    wasCardOpen.current = cardOpen;
    if (!open || cardOpen) return;
    if (!cardClosed && !hadFocus.current) return;
    const active = document.activeElement;
    if (!cardClosed && active && active !== document.body) return;
    const target =
      openCardRef.current ??
      root.current?.querySelector<HTMLElement>('.speech') ??
      null;
    target?.focus({ preventScroll: true });
  });

  const onLabelKeyDown =
    (index: number) => (event: KeyboardEvent<HTMLElement>) => {
      const next = bubbleKeyStep(index, event.key, groups.length, dir);
      if (next === null) return;
      event.preventDefault();
      labelRefs.current?.[next]?.focus();
    };

  const footer =
    dialogue.stage === 'farewell' ? null : actions ? (
      <>
        {chips}
        <div className="speech__actions">
          <button
            ref={openCardRef}
            type="button"
            className="speech__button speech__button--primary"
            onClick={onOpenCard}
          >
            <span className="pa-card-icon" aria-hidden="true" />
            {words.openCard}
          </button>
          <button type="button" className="speech__button" onClick={onLeave}>
            {words.leave}
          </button>
        </div>
      </>
    ) : (
      <>
        {dialogue.stage === 'tour' && (
          <ol
            className="speech__dots"
            aria-label={fillCopy(words.lineOf, {
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
            {words.skip}
          </button>
        )}
        {chips}
        {dialogue.stage === 'hint' ? (
          <button type="button" className="speech__button" onClick={onResume}>
            {words.resume}{' '}
            <span aria-hidden="true">{dir === 'rtl' ? '‹' : '›'}</span>
          </button>
        ) : (
          canAdvance(dialogue, script) && (
            <button
              type="button"
              className="speech__button"
              onClick={onAdvance}
            >
              {words.next}{' '}
              <span aria-hidden="true">{dir === 'rtl' ? '‹' : '›'}</span>
            </button>
          )
        )}
      </>
    );

  return (
    <div
      ref={root}
      className="pa-hud"
      data-stage={dialogue.stage}
      data-card-open={cardOpen ? '' : undefined}
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
      {cardOpen && <div className="pa-card-dim" aria-hidden="true" />}

      {text !== null && !cardOpen && (
        <SpeechBubble
          boxRef={speechRef}
          speaker={speaker}
          topic={topic}
          text={text}
          typing={dialogue.typing}
          take={dialogue.take}
          onTyped={onTyped}
          onAdvance={onAdvance}
          roleDescription={words.bubbleRole}
          departing={!open}
          lingerSeconds={farewellSeconds}
          autofocus={open}
          reducedMotion={reducedMotion}
        >
          {footer}
        </SpeechBubble>
      )}

      <ul
        className="pa-skills"
        aria-label={words.skillsList}
        inert={!open || cardOpen || !bubblesOut}
        data-dimmed={selected ? '' : undefined}
      >
        {groups.map((group, i) => (
          <li key={group.id}>
            <button
              ref={(element) => {
                if (labelRefs.current) labelRefs.current[i] = element;
              }}
              type="button"
              className="pa-skill"
              data-selected={selected === group.id ? '' : undefined}
              aria-expanded={selected === group.id}
              aria-controls={
                selected === group.id && panelShown ? panelId : undefined
              }
              // A real mouse movement, not a bubble sliding under a resting pointer (the
              // narrator's bubble shrinking, say), nor a touch: those pick by tapping.
              onPointerMove={(event) => {
                if (event.pointerType !== 'mouse') return;
                if (event.movementX === 0 && event.movementY === 0) return;
                if (selected !== group.id) onPick(group.id, 'hover');
              }}
              onPointerLeave={onUnhover}
              onFocus={() => onPick(group.id, 'focus')}
              onClick={() => onPick(group.id, 'tap')}
              onKeyDown={onLabelKeyDown(i)}
            >
              <span className="pa-skill__label">{group.label}</span>
            </button>
          </li>
        ))}
      </ul>

      {!compact && panelShown && selectedGroup && (
        <div
          ref={panelRef}
          id={panelId}
          className="pa-skill-panel"
          role="group"
          aria-label={fillCopy(words.skillsOf, { group: selectedGroup.label })}
        >
          <ul className="pa-skill-panel__chips">
            {selectedGroup.skills.map((skill) => (
              <li key={skill} className="pa-chip">
                {skill}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
