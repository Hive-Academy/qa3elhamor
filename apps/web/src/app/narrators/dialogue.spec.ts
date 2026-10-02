import { describe, expect, it } from 'vitest';
import {
  INITIAL_DIALOGUE,
  canAdvance,
  dialogueReducer,
  dialogueText,
  showsActions,
  visitStateOf,
  type DialogueEvent,
  type DialogueScript,
  type DialogueState,
} from './dialogue';

const script: DialogueScript = {
  lines: ['One.', 'Two.', 'Three.'],
  hints: { frontend: 'About the front.', backend: 'About the back.' },
  farewell: 'Bye.',
};

const run = (
  events: readonly DialogueEvent[],
  from: DialogueState = INITIAL_DIALOGUE,
  using: DialogueScript = script,
): DialogueState =>
  events.reduce((state, event) => dialogueReducer(state, event, using), from);

const arrive: DialogueEvent = { type: 'arrive' };
const typed: DialogueEvent = { type: 'typed' };
const advance: DialogueEvent = { type: 'advance' };

describe('dialogue', () => {
  it('says nothing while the narrator swims in, then types the first line', () => {
    expect(dialogueText(INITIAL_DIALOGUE, script)).toBeNull();
    expect(run([advance, { type: 'select', id: 'frontend' }])).toEqual(
      INITIAL_DIALOGUE,
    );
    const state = run([arrive]);
    expect(state).toMatchObject({ stage: 'tour', line: 0, typing: true });
    expect(dialogueText(state, script)).toBe('One.');
  });

  it('finishes a typing line on advance, then goes to the next line', () => {
    const typing = run([arrive]);
    const finished = run([advance], typing);
    expect(finished).toMatchObject({ line: 0, typing: false });
    expect(finished.take).toBe(typing.take);
    const next = run([advance], finished);
    expect(next).toMatchObject({ line: 1, typing: true });
    expect(next.take).toBe(typing.take + 1);
  });

  it('stops typing when the typewriter reaches the end', () => {
    expect(run([arrive, typed])).toMatchObject({ line: 0, typing: false });
    // A late `typed` for a line already finished changes nothing.
    const done = run([arrive, typed]);
    expect(run([typed], done)).toBe(done);
  });

  it('offers the closing actions only on the last line, typed out', () => {
    const last = run([arrive, typed, advance, typed, advance]);
    expect(last).toMatchObject({ line: 2, typing: true });
    expect(showsActions(last, script)).toBe(false);
    expect(canAdvance(last, script)).toBe(true);
    const done = run([typed], last);
    expect(showsActions(done, script)).toBe(true);
    expect(canAdvance(done, script)).toBe(false);
    expect(run([advance], done)).toBe(done);
  });

  it('skips straight to the last line, in full', () => {
    const skipped = run([arrive, { type: 'skip' }]);
    expect(skipped).toMatchObject({ stage: 'tour', line: 2, typing: false });
    expect(showsActions(skipped, script)).toBe(true);
    // From a hint too.
    expect(
      run([arrive, { type: 'select', id: 'backend' }, { type: 'skip' }]),
    ).toMatchObject({
      stage: 'tour',
      hint: null,
      line: 2,
    });
  });

  it('interrupts the tour with a hint, and resumes a finished line in full', () => {
    const reading = run([arrive, typed, advance, typed]);
    const hint = run([{ type: 'select', id: 'frontend' }], reading);
    expect(hint).toMatchObject({
      stage: 'hint',
      hint: 'frontend',
      line: 1,
      typing: true,
    });
    expect(dialogueText(hint, script)).toBe('About the front.');
    expect(canAdvance(hint, script)).toBe(true);
    const resumed = run([typed, { type: 'resume' }], hint);
    expect(resumed).toMatchObject({
      stage: 'tour',
      hint: null,
      line: 1,
      typing: false,
    });
    expect(dialogueText(resumed, script)).toBe('Two.');
  });

  it('retypes a line the hint interrupted mid-way', () => {
    const midLine = run([arrive, typed, advance]);
    const resumed = run(
      [{ type: 'select', id: 'backend' }, typed, advance],
      midLine,
    );
    expect(resumed).toMatchObject({ stage: 'tour', line: 1, typing: true });
    expect(resumed.take).toBeGreaterThan(midLine.take);
  });

  it('moves between hints, keeps the tour line, and ignores a repeated pick', () => {
    const first = run([arrive, typed, { type: 'select', id: 'frontend' }]);
    expect(run([{ type: 'select', id: 'frontend' }], first)).toBe(first);
    const second = run([{ type: 'select', id: 'backend' }], first);
    expect(second).toMatchObject({
      hint: 'backend',
      line: 0,
      lineDone: true,
      typing: true,
    });
    expect(run([advance, advance], second)).toMatchObject({
      stage: 'tour',
      line: 0,
      typing: false,
    });
  });

  it('selects with the hint, and clears the selection however the tour resumes', () => {
    const hint = run([arrive, typed, { type: 'select', id: 'frontend' }]);
    expect(hint.selected).toBe('frontend');
    // Space, Enter or a click on the bubble: finish the comment, then back to the tour.
    expect(run([advance], hint).selected).toBe('frontend');
    expect(run([advance, advance], hint)).toMatchObject({ stage: 'tour', selected: null });
    expect(run([{ type: 'resume' }], hint).selected).toBeNull();
    expect(run([{ type: 'skip' }], hint).selected).toBeNull();
    expect(run([{ type: 'farewell' }], hint).selected).toBeNull();
    expect(run([{ type: 'reset' }], hint).selected).toBeNull();
  });

  it('selects an object with no hint without a comment, staying on (or going back to) the tour', () => {
    const reading = run([arrive, typed]);
    const quiet = run([{ type: 'select', id: 'databases' }], reading);
    expect(quiet).toMatchObject({ stage: 'tour', line: 0, typing: false, selected: 'databases' });
    expect(quiet.take).toBe(reading.take);
    expect(dialogueText(quiet, script)).toBe('One.');
    // From another object's comment: back to the tour line, the new one selected.
    const fromHint = run([{ type: 'select', id: 'frontend' }, { type: 'select', id: 'databases' }], reading);
    expect(fromHint).toMatchObject({ stage: 'tour', hint: null, selected: 'databases', line: 0 });
    // Not before the narrator has arrived, nor while it says goodbye.
    expect(run([{ type: 'select', id: 'databases' }]).selected).toBeNull();
  });

  it('says goodbye on leaving, and starts over on the next visit', () => {
    const bye = run([arrive, typed, { type: 'farewell' }]);
    expect(bye).toMatchObject({ stage: 'farewell', typing: true });
    expect(dialogueText(bye, script)).toBe('Bye.');
    expect(run([advance, { type: 'select', id: 'frontend' }], bye)).toBe(bye);
    // Back before it left: the tour again, from the top.
    expect(run([arrive], bye)).toMatchObject({
      stage: 'tour',
      line: 0,
      typing: true,
    });
    expect(run([{ type: 'reset' }], bye)).toMatchObject({
      stage: 'waiting',
      line: 0,
    });
  });

  it('just stops talking when there is no farewell', () => {
    const silent: DialogueScript = { lines: ['A.', 'B.'], hints: {} };
    const gone = run([arrive, { type: 'farewell' }], INITIAL_DIALOGUE, silent);
    expect(gone.stage).toBe('waiting');
    expect(dialogueText(gone, silent)).toBeNull();
  });

  it('ignores a second arrival while talking', () => {
    const talking = run([arrive, typed, advance]);
    expect(run([arrive], talking)).toBe(talking);
  });
});

describe('visitStateOf', () => {
  it('follows the dialogue: arriving, talking, ready, leaving', () => {
    expect(visitStateOf(INITIAL_DIALOGUE)).toBe('arriving');
    const talking = run([arrive]);
    expect(visitStateOf(talking)).toBe('talking');
    expect(visitStateOf(run([typed], talking))).toBe('ready');
    expect(visitStateOf(run([{ type: 'farewell' }], talking))).toBe('leaving');
  });

  it('is talking again while a hint types, ready once it is typed', () => {
    const hinted = run([arrive, typed, { type: 'select', id: 'frontend' }]);
    expect(hinted.stage).toBe('hint');
    expect(visitStateOf(hinted)).toBe('talking');
    expect(visitStateOf(run([typed], hinted))).toBe('ready');
  });
});
