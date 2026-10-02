import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  INITIAL_DIALOGUE,
  dialogueReducer,
  type DialogueEvent,
  type DialogueScript,
  type DialogueState,
} from './dialogue';
import { VisitHud, type VisitHudProps } from './visit-hud';
import type { VisitObject } from './visit-types';

/*
 * What the kit's HUD adds for landmarks beyond the Pineapple (whose behaviour is pinned in
 * `pineapple/pineapple-visit.spec.tsx`): captioned slab labels, notes in the detail, a topic
 * tag of the landmark's choosing, and comments supplied by the content.
 */

const script: DialogueScript = {
  lines: ['Welcome to Performance Reviews.', 'Pick a tablet.'],
  // As the Tiki supplies them: each job's review, from the content.
  hints: { prio: 'The types are grateful.' },
  farewell: 'Reviews filed.',
};

const jobs: VisitObject[] = [
  {
    id: 'prio',
    label: 'Lead Engineer',
    caption: ['Prio', '2019 – 2024'],
    topic: 'Review · Prio',
    detailLabel: 'Lead Engineer, Prio: highlights and tech',
    notes: ['Architected the platform.', 'Mentored engineers.'],
    chips: ['TypeScript', 'Angular'],
  },
  {
    id: 'khabeer',
    label: 'Web Developer',
    caption: ['Khabeer Group', '2015'],
    detailLabel: 'Web Developer, Khabeer Group: highlights and tech',
    notes: ['Built data-heavy apps.'],
    chips: ['AngularJS'],
  },
];

const words = { openFull: 'Read the full record', objectsList: 'Performance reviews' };

const stateAfter = (...events: DialogueEvent[]): DialogueState =>
  events.reduce((state, event) => dialogueReducer(state, event, script), INITIAL_DIALOGUE);

function renderHud(props: Partial<VisitHudProps> = {}) {
  const on = {
    onTyped: vi.fn(),
    onAdvance: vi.fn(),
    onSkip: vi.fn(),
    onResume: vi.fn(),
    onOpenFull: vi.fn(),
    onLeave: vi.fn(),
    onPick: vi.fn(),
    onUnhover: vi.fn(),
  };
  render(
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
      speaker="Patrick"
      dialogue={stateAfter({ type: 'arrive' }, { type: 'typed' })}
      script={script}
      objects={jobs}
      selected={null}
      words={words}
      shape="slab"
      speechRef={createRef()}
      labelRefs={{ current: [] }}
      panelRef={createRef()}
      {...on}
      {...props}
    />,
  );
  return on;
}

const bubble = () => screen.getByRole('region', { name: 'Patrick' });

describe('VisitHud: slab labels', () => {
  it('names each tablet by its role, company and years, read with pauses between', () => {
    renderHud();
    const list = screen.getByRole('list', { name: words.objectsList });
    expect(list.dataset['shape']).toBe('slab');
    expect(
      within(list).getByRole('button', { name: 'Lead Engineer, Prio, 2019 – 2024' }),
    ).toBeTruthy();
    expect(
      within(list).getByRole('button', { name: 'Web Developer, Khabeer Group, 2015' }),
    ).toBeTruthy();
  });

  it('moves between tablets with the arrow keys, selecting as focus lands', () => {
    const labelRefs = { current: [] as (HTMLElement | null)[] };
    const on = renderHud({ labelRefs });
    const [first, second] = within(
      screen.getByRole('list', { name: words.objectsList }),
    ).getAllByRole('button');
    (first as HTMLElement).focus();
    fireEvent.keyDown(first as HTMLElement, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(second);
    expect(on.onPick).toHaveBeenLastCalledWith('khabeer', 'focus');
  });
});

describe('VisitHud: a selected object with notes', () => {
  it("reads the content's comment under the landmark's topic tag", () => {
    renderHud({
      dialogue: stateAfter({ type: 'arrive' }, { type: 'select', id: 'prio' }),
      selected: 'prio',
    });
    expect(within(bubble()).getByText('Review · Prio')).toBeTruthy();
    expect(bubble().querySelector('[aria-live="polite"]')?.textContent).toBe(
      'The types are grateful.',
    );
  });

  it('shows the notes and the chips in the panel beside it', () => {
    renderHud({
      dialogue: stateAfter({ type: 'arrive' }, { type: 'select', id: 'prio' }),
      selected: 'prio',
    });
    const panel = screen.getByRole('group', { name: jobs[0]?.detailLabel });
    const [notes, chips] = within(panel).getAllByRole('list');
    expect(within(notes as HTMLElement).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Architected the platform.',
      'Mentored engineers.',
    ]);
    expect(within(chips as HTMLElement).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'TypeScript',
      'Angular',
    ]);
    expect(
      screen
        .getByRole('button', { name: /^Lead Engineer/ })
        .getAttribute('aria-controls'),
    ).toBe(panel.id);
  });

  it('on a narrow screen, puts the notes and chips in the bubble, under the comment', () => {
    renderHud({
      compact: true,
      dialogue: stateAfter({ type: 'arrive' }, { type: 'select', id: 'prio' }),
      selected: 'prio',
    });
    expect(document.querySelector('.visit-panel')).toBeNull();
    const detail = within(bubble()).getByRole('group', { name: jobs[0]?.detailLabel });
    expect(within(detail).getByText('Mentored engineers.')).toBeTruthy();
    expect(within(detail).getByText('Angular')).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: /^Lead Engineer/ })
        .getAttribute('aria-controls'),
    ).toBe(detail.id);
  });

  it('shows the detail of a job without a review, keeping the tour line', () => {
    const quiet = stateAfter({ type: 'arrive' }, { type: 'typed' }, { type: 'select', id: 'khabeer' });
    renderHud({ dialogue: quiet, selected: 'khabeer' });
    expect(screen.getByRole('group', { name: jobs[1]?.detailLabel })).toBeTruthy();
    expect(bubble().querySelector('[aria-live="polite"]')?.textContent).toBe(script.lines[0]);
    expect(bubble().querySelector('.speech__topic')).toBeNull();
  });
});

describe('VisitHud: the end of the tour', () => {
  it("offers the landmark's full view, with its glyph, and the way back to the dive", () => {
    const on = renderHud({
      dialogue: stateAfter({ type: 'arrive' }, { type: 'skip' }),
      fullIcon: <span data-testid="glyph" aria-hidden="true" />,
    });
    const open = within(bubble()).getByRole('button', { name: words.openFull });
    expect(within(open).getByTestId('glyph')).toBeTruthy();
    fireEvent.click(open);
    expect(on.onOpenFull).toHaveBeenCalled();
    fireEvent.click(within(bubble()).getByRole('button', { name: 'Back to the dive' }));
    expect(on.onLeave).toHaveBeenCalled();
  });
});
