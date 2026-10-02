import { profile } from '@qa3elhamor/content-data-access';
import { localize } from '@qa3elhamor/content-domain';
import { LANDMARK_AUTOFOCUS_ATTRIBUTE } from '@qa3elhamor/landmarks-ui';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  INITIAL_DIALOGUE,
  dialogueReducer,
  type DialogueEvent,
  type DialogueScript,
  type DialogueState,
} from '../narrators/dialogue';
import { NARRATOR_COPY } from '../narrators/narrator-copy';
import { typingSeconds } from '../narrators/typewriter';
import { VisitHud, type VisitHudProps } from '../narrators/visit-hud';
import type { VisitObject } from '../narrators/visit-types';
import { PINEAPPLE_VISIT_COPY } from './pineapple-copy';
import { skillGroupObjects } from './pineapple-scene';

/*
 * The Pineapple visit's DOM, on the narrated-visit kit: the behaviour the owner signed off,
 * pinned (the speech bubble, the skill bubbles' labels, the skills tray and in-bubble chips).
 */

const script: DialogueScript = {
  lines: [
    'Welcome to the pineapple.',
    'He builds platforms.',
    'Pick a bubble.',
  ],
  hints: { frontend: 'Signals and SSR.', backend: 'Queues and Prisma.' },
  farewell: 'Swim safe.',
};

const group = (id: string, label: string, chips: string[]): VisitObject => ({
  id,
  label,
  detailLabel: `${label}: skills`,
  chips,
});

const groups: VisitObject[] = [
  group('frontend', 'Frontend', ['Angular', 'RxJS']),
  group('backend', 'Backend', ['NestJS', 'Prisma']),
  group('databases', 'Databases', ['PostgreSQL']),
];

const stateAfter = (...events: DialogueEvent[]): DialogueState =>
  events.reduce(
    (state, event) => dialogueReducer(state, event, script),
    INITIAL_DIALOGUE,
  );

const handlers = () => ({
  onTyped: vi.fn(),
  onAdvance: vi.fn(),
  onSkip: vi.fn(),
  onResume: vi.fn(),
  onOpenFull: vi.fn(),
  onLeave: vi.fn(),
  onPick: vi.fn(),
  onUnhover: vi.fn(),
});

function renderHud(props: Partial<VisitHudProps> = {}) {
  const on = handlers();
  const view = render(
    <VisitHud
      lang="en"
      dir="ltr"
      width={1440}
      height={900}
      compact={false}
      farewellSeconds={2}
      open
      fullOpen={false}
      objectsOut
      speaker="The Hamour"
      dialogue={stateAfter({ type: 'arrive' }, { type: 'typed' })}
      script={script}
      objects={groups}
      selected={null}
      words={PINEAPPLE_VISIT_COPY.en}
      speechRef={createRef()}
      labelRefs={{ current: [] }}
      panelRef={createRef()}
      {...on}
      {...props}
    />,
  );
  return { ...view, on };
}

const words = { ...NARRATOR_COPY.en, ...PINEAPPLE_VISIT_COPY.en };
const bubble = () => screen.getByRole('region', { name: 'The Hamour' });

afterEach(() => vi.useRealTimers());

describe('Pineapple visit: the skill groups as objects', () => {
  it("maps the owner's skill groups to labelled objects with their skills", () => {
    const objects = skillGroupObjects(profile, 'en');
    expect(objects.map((o) => o.id)).toEqual(profile.skills.map((g) => g.id));
    const first = profile.skills[0];
    if (!first) return;
    const label = localize(first.label, 'en');
    expect(objects[0]).toEqual({
      id: first.id,
      label,
      detailLabel: `${label}: skills`,
      chips: first.skills,
    });
  });
});

describe('Pineapple visit: the speech bubble', () => {
  it('is a named bubble the stage moves focus onto, with the whole line for screen readers', () => {
    renderHud();
    const speech = bubble();
    expect(speech.getAttribute('aria-roledescription')).toBe(words.bubbleRole);
    expect(speech.hasAttribute(LANDMARK_AUTOFOCUS_ATTRIBUTE)).toBe(true);
    expect(speech.querySelector('[aria-live="polite"]')?.textContent).toBe(
      script.lines[0],
    );
    expect(
      within(speech).getByRole('list', { name: 'Line 1 of 3' }),
    ).toBeTruthy();
  });

  it('says nothing before the narrator arrives', () => {
    renderHud({ dialogue: INITIAL_DIALOGUE });
    expect(screen.queryByRole('region', { name: 'The Hamour' })).toBeNull();
  });

  it('types the line out, holding the untyped rest in place, then reports the end', () => {
    vi.useFakeTimers();
    const { on } = renderHud({ dialogue: stateAfter({ type: 'arrive' }) });
    const line = bubble().querySelector('.speech__line');
    expect(line?.querySelector('.speech__rest')?.textContent).toBe(
      script.lines[0],
    );
    act(() => vi.advanceTimersByTime(300));
    const typed = line?.firstElementChild?.textContent ?? '';
    expect(typed.length).toBeGreaterThan(0);
    expect(script.lines[0]?.startsWith(typed)).toBe(true);
    act(() =>
      vi.advanceTimersByTime(typingSeconds(script.lines[0] ?? '') * 1000 + 100),
    );
    expect(on.onTyped).toHaveBeenCalledTimes(1);
  });

  it('under reduced motion, shows each line whole and moves on at once', () => {
    const { on } = renderHud({ reducedMotion: true, dialogue: stateAfter({ type: 'arrive' }) });
    const line = bubble().querySelector('.speech__line');
    expect(line?.querySelector('.speech__rest')?.textContent).toBe('');
    expect(line?.textContent).toBe(script.lines[0]);
    expect(line?.querySelector('.speech__caret')).toBeNull();
    expect(on.onTyped).toHaveBeenCalledTimes(1);
  });

  it('advances on Space or Enter on the bubble, and on a click on it, but not twice from "Next"', () => {
    const { on } = renderHud();
    fireEvent.keyDown(bubble(), { key: ' ' });
    fireEvent.keyDown(bubble(), { key: 'Enter' });
    fireEvent.click(bubble());
    expect(on.onAdvance).toHaveBeenCalledTimes(3);
    fireEvent.click(within(bubble()).getByRole('button', { name: /Next/ }));
    expect(on.onAdvance).toHaveBeenCalledTimes(4);
    fireEvent.click(within(bubble()).getByRole('button', { name: words.skip }));
    expect(on.onSkip).toHaveBeenCalledTimes(1);
  });

  it('ends the tour with the full card one tap away, and a way back to the dive', () => {
    const { on } = renderHud({
      dialogue: stateAfter({ type: 'arrive' }, { type: 'skip' }),
    });
    expect(within(bubble()).queryByRole('button', { name: /Next/ })).toBeNull();
    fireEvent.click(
      within(bubble()).getByRole('button', { name: words.openFull }),
    );
    expect(on.onOpenFull).toHaveBeenCalled();
    fireEvent.click(
      within(bubble()).getByRole('button', { name: words.leave }),
    );
    expect(on.onLeave).toHaveBeenCalled();
  });

  it('comments on a skill group under its name, with a way back to the tour', () => {
    const { on } = renderHud({
      dialogue: stateAfter({ type: 'arrive' }, { type: 'select', id: 'backend' }),
      selected: 'backend',
    });
    expect(within(bubble()).getByText('Backend')).toBeTruthy();
    expect(bubble().querySelector('[aria-live="polite"]')?.textContent).toBe(
      script.hints['backend'],
    );
    fireEvent.click(
      within(bubble()).getByRole('button', { name: new RegExp(words.resume) }),
    );
    expect(on.onResume).toHaveBeenCalled();
  });

  it('says goodbye out of reach: no controls, inert, leaving the accessibility tree', () => {
    renderHud({
      open: false,
      dialogue: stateAfter({ type: 'arrive' }, { type: 'farewell' }),
    });
    const box = document.querySelector('.speech-box');
    expect(box?.hasAttribute('inert')).toBe(true);
    expect(box?.getAttribute('aria-hidden')).toBe('true');
    expect(box?.querySelector('button')).toBeNull();
    expect(box?.textContent).toContain(script.farewell);
  });

  it('steps aside while the full card is open', () => {
    renderHud({
      fullOpen: true,
      dialogue: stateAfter({ type: 'arrive' }, { type: 'skip' }),
    });
    expect(document.querySelector('.speech-box')).toBeNull();
    expect(
      screen
        .getByRole('list', { name: words.objectsList, hidden: true })
        .hasAttribute('inert'),
    ).toBe(true);
  });
});

describe('Pineapple visit: the skill bubbles', () => {
  it('lists every group as a button over its bubble', () => {
    renderHud();
    const list = screen.getByRole('list', { name: words.objectsList });
    expect(
      within(list)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Frontend', 'Backend', 'Databases']);
  });

  it('picks a group on focus and on a tap, and moves between them with the arrow keys', () => {
    const labelRefs = { current: [] as (HTMLElement | null)[] };
    const { on } = renderHud({ labelRefs });
    const [frontend, backend] = within(
      screen.getByRole('list', { name: words.objectsList }),
    ).getAllByRole('button');
    fireEvent.focus(frontend as HTMLElement);
    expect(on.onPick).toHaveBeenLastCalledWith('frontend', 'focus');
    fireEvent.click(backend as HTMLElement);
    expect(on.onPick).toHaveBeenLastCalledWith('backend', 'tap');
    (frontend as HTMLElement).focus();
    fireEvent.keyDown(frontend as HTMLElement, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(backend);
    fireEvent.keyDown(backend as HTMLElement, { key: 'End' });
    expect(document.activeElement?.textContent).toBe('Databases');
    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: 'ArrowRight',
    });
    expect(document.activeElement).toBe(frontend);
  });

  it('picks on a real mouse movement only, not a touch or a bubble sliding under the pointer', () => {
    const { on } = renderHud();
    const [frontend] = within(
      screen.getByRole('list', { name: words.objectsList }),
    ).getAllByRole('button');
    fireEvent.pointerMove(frontend as HTMLElement, {
      pointerType: 'touch',
      movementX: 3,
    });
    fireEvent.pointerMove(frontend as HTMLElement, {
      pointerType: 'mouse',
      movementX: 0,
      movementY: 0,
    });
    expect(on.onPick).not.toHaveBeenCalled();
    fireEvent.pointerMove(frontend as HTMLElement, {
      pointerType: 'mouse',
      movementX: 2,
    });
    expect(on.onPick).toHaveBeenCalledWith('frontend', 'hover');
    fireEvent.pointerLeave(frontend as HTMLElement);
    expect(on.onUnhover).toHaveBeenCalled();
  });

  it("shows the selected group's skills beside its bubble, controlled by its button", () => {
    renderHud({
      selected: 'backend',
      dialogue: stateAfter({ type: 'arrive' }, { type: 'select', id: 'backend' }),
    });
    const panel = screen.getByRole('group', { name: 'Backend: skills' });
    expect(
      within(panel)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['NestJS', 'Prisma']);
    const button = screen.getByRole('button', { name: 'Backend' });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-controls')).toBe(panel.id);
  });

  it("on a narrow screen, shows the skills in the narrator's bubble instead", () => {
    renderHud({
      compact: true,
      selected: 'backend',
      dialogue: stateAfter({ type: 'arrive' }, { type: 'select', id: 'backend' }),
    });
    expect(screen.queryByRole('group', { name: 'Backend: skills' })).toBeNull();
    const chips = within(bubble()).getByRole('list', {
      name: 'Backend: skills',
    });
    expect(within(chips).getAllByRole('listitem')).toHaveLength(2);
    expect(
      screen
        .getByRole('button', { name: 'Backend' })
        .getAttribute('aria-controls'),
    ).toBe(chips.id);
  });

  it('shows the skills of a group the narrator has nothing to say about, on desktop and phone', () => {
    // `databases` has no hint: selecting it keeps the tour line, but its skills still show.
    const quiet = stateAfter({ type: 'arrive' }, { type: 'typed' }, { type: 'select', id: 'databases' });
    expect(quiet).toMatchObject({ stage: 'tour', selected: 'databases' });
    const desktop = renderHud({ dialogue: quiet, selected: quiet.selected });
    expect(screen.getByRole('group', { name: 'Databases: skills' })).toBeTruthy();
    expect(bubble().querySelector('[aria-live="polite"]')?.textContent).toBe(script.lines[0]);
    desktop.unmount();
    renderHud({ compact: true, dialogue: quiet, selected: quiet.selected });
    const chips = within(bubble()).getByRole('list', { name: 'Databases: skills' });
    expect(within(chips).getByText('PostgreSQL')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Databases' }).getAttribute('aria-controls')).toBe(chips.id);
  });

  it('keeps the bubbles out of reach while they are inside the door', () => {
    renderHud({ objectsOut: false });
    expect(
      screen
        .getByRole('list', { name: words.objectsList, hidden: true })
        .hasAttribute('inert'),
    ).toBe(true);
  });
});
