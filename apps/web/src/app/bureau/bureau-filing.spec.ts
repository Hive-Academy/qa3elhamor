import { describe, expect, it } from 'vitest';
import {
  INITIAL_FILING,
  filedLineOf,
  filingReducer,
  paperStateOf,
  scrollOut,
  type Filing,
  type FilingEvent,
} from './bureau-filing';

const run = (
  events: readonly FilingEvent[],
  from: Filing = INITIAL_FILING,
): Filing => events.reduce(filingReducer, from);
const delivered = { status: 'delivered' } as const;
const unsent = { status: 'delivery-not-wired' } as const;

describe('filing a complaint at the Bureau', () => {
  it('unrolls, takes the stamp, rolls into a bottle and floats off', () => {
    const steps: FilingEvent[] = [
      { type: 'unroll' },
      { type: 'stamped', delivery: delivered },
      { type: 'stamp-held' },
      { type: 'corked' },
    ];
    const stages = steps.map((_, i) => run(steps.slice(0, i + 1)).stage);
    expect(stages).toEqual(['unrolled', 'stamped', 'rolling', 'afloat']);
    const afloat = run(steps);
    expect(afloat.delivery).toEqual(delivered);
    expect(afloat.bottle).toBe(1);
    expect(stages.map((stage) => scrollOut({ ...afloat, stage }))).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it('rolls back unsent, and cannot be rolled back once stamped', () => {
    expect(run([{ type: 'unroll' }, { type: 'roll-back' }]).stage).toBe('tube');
    const stamped = run([
      { type: 'unroll' },
      { type: 'stamped', delivery: delivered },
    ]);
    expect(filingReducer(stamped, { type: 'roll-back' })).toBe(stamped);
    expect(filingReducer(stamped, { type: 'unroll' })).toBe(stamped);
  });

  it('a fresh sheet of paper after a stamped one, the same sheet after rolling back', () => {
    const rolledBack = run([
      { type: 'unroll' },
      { type: 'roll-back' },
      { type: 'unroll' },
    ]);
    expect(rolledBack.sheet).toBe(INITIAL_FILING.sheet);
    const again = run([
      { type: 'unroll' },
      { type: 'stamped', delivery: delivered },
      { type: 'stamp-held' },
      { type: 'corked' },
      { type: 'unroll' },
    ]);
    expect(again.stage).toBe('unrolled');
    expect(again.sheet).toBe(INITIAL_FILING.sheet + 1);
  });

  it('a complaint sent after the scroll was put away still goes off in a bottle', () => {
    const late = run([
      { type: 'unroll' },
      { type: 'roll-back' },
      { type: 'stamped', delivery: unsent },
    ]);
    expect(late.stage).toBe('afloat');
    expect(late.bottle).toBe(1);
    expect(filedLineOf(late.delivery ?? delivered)).toBe('filed-unsent');
  });

  it('ignores the timers out of turn, and resets when the visitor leaves', () => {
    expect(filingReducer(INITIAL_FILING, { type: 'stamp-held' })).toBe(
      INITIAL_FILING,
    );
    expect(filingReducer(INITIAL_FILING, { type: 'corked' })).toBe(
      INITIAL_FILING,
    );
    const reset = run([{ type: 'unroll' }, { type: 'reset' }]);
    expect(reset.stage).toBe('tube');
    expect(reset.delivery).toBeNull();
  });

  it('says the honest line for each delivery', () => {
    expect(filedLineOf(delivered)).toBe('filed');
    expect(filedLineOf(unsent)).toBe('filed-unsent');
    expect(filedLineOf({ status: 'awaiting-moderation' })).toBe('filed-public');
  });

  it('unrolls the paper only once it has arrived in front of the visitor', () => {
    expect(paperStateOf('unrolled', 'emerging')).toBe('rolled');
    expect(paperStateOf('unrolled', 'settled')).toBe('unrolled');
    expect(paperStateOf('unrolled', 'arrived')).toBe('unrolled');
    // Going back into the tube unsent: it rolls up on the way.
    expect(paperStateOf('tube', 'leaving')).toBe('rolled');
    expect(paperStateOf('stamped', 'settled')).toBe('stamped');
    expect(paperStateOf('rolling', 'settled')).toBe('rolling');
    // In the bottle: nothing of the paper shows as the card goes.
    expect(paperStateOf('afloat', 'leaving')).toBe('gone');
  });

  it('cannot be rolled back while the complaint travels', () => {
    const sending = run([{ type: 'unroll' }, { type: 'sending' }]);
    expect(filingReducer(sending, { type: 'roll-back' })).toBe(sending);
    const back = run([{ type: 'sent' }, { type: 'roll-back' }], sending);
    expect(back.stage).toBe('tube');
  });

  it('remembers a failure that happened away from the paper, for the next one', () => {
    // On the paper: the form says so itself.
    const onPaper = run([
      { type: 'unroll' },
      { type: 'sending' },
      { type: 'send-failed' },
    ]);
    expect(onPaper.failedAway).toBe(false);
    expect(onPaper.sending).toBe(false);
    // The visitor left mid-send: the next paper opens with the notice.
    const away = run([
      { type: 'unroll' },
      { type: 'sending' },
      { type: 'reset' },
      { type: 'send-failed' },
    ]);
    expect(away.sending).toBe(false);
    expect(away.failedAway).toBe(true);
    expect(run([{ type: 'unroll' }], away).failedAway).toBe(true);
    // A new attempt clears it.
    expect(
      run([{ type: 'unroll' }, { type: 'sending' }], away).failedAway,
    ).toBe(false);
  });

  it('keeps a submission in flight across leaving', () => {
    const left = run([
      { type: 'unroll' },
      { type: 'sending' },
      { type: 'reset' },
    ]);
    expect(left.sending).toBe(true);
    expect(left.stage).toBe('tube');
  });
});
