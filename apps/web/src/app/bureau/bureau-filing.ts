import type { InWorldCardPhase } from '../in-world/in-world-card';
import type { ComplaintDelivery } from '../overlays/complaint-scroll';
import type { FiledLineId } from './bureau-copy';
import type { ScrollPaperState } from './bureau-scroll';

/*
 * Filing a complaint at the Bureau, as a pure state machine around the form (which validates
 * and sends on its own): the scroll comes out of the pneumatic tube and unrolls, the Sardine
 * Municipal Stamp lands on it, it rolls up into a bottle, and the bottle floats to the surface
 * while the President says where it is going.
 */

/**
 * - `tube`: the scroll is in the tube (the narrator talks).
 * - `unrolled`: out on the counter; the visitor is typing.
 * - `stamped`: the stamp has landed; the paper holds still for a moment under it.
 * - `rolling`: it rolls up into the bottle.
 * - `afloat`: the bottle floats up; the narrator says the filed line.
 */
export type FilingStage =
  'tube' | 'unrolled' | 'stamped' | 'rolling' | 'afloat';

export interface Filing {
  readonly stage: FilingStage;
  /** How the last stamped complaint went, from `stamped` on. */
  readonly delivery: ComplaintDelivery | null;
  /** Bumped when a fresh sheet comes out after a stamped one: the paper is a new one. */
  readonly sheet: number;
  /** Bumped by every stamp: one bottle per complaint. */
  readonly bottle: number;
  /**
   * A submission is in flight. The scroll cannot be rolled back meanwhile: the visitor sees
   * how it went, on the paper they sent it from.
   */
  readonly sending: boolean;
  /**
   * The last submission failed while the scroll was not out (the visitor left mid-send). The
   * next paper opens with the failure notice over the kept draft.
   */
  readonly failedAway: boolean;
}

export type FilingEvent =
  /** "File a complaint" (or "File another"): out of the tube. */
  | { readonly type: 'unroll' }
  /** "Roll it back up" or Esc: back in the tube, unsent (the host keeps the draft). */
  | { readonly type: 'roll-back' }
  /** The form's submitter accepted it. It may have been put away while it was being sent. */
  | { readonly type: 'stamped'; readonly delivery: ComplaintDelivery }
  /** The stamp has been seen: roll up into the bottle. */
  | { readonly type: 'stamp-held' }
  /** Rolled up and corked: the bottle lets go. */
  | { readonly type: 'corked' }
  /** The site's submitter (shared by every place the form shows) took a submission. */
  | { readonly type: 'sending' }
  /** ...and it was delivered (or accepted, unwired): `stamped` follows from the form. */
  | { readonly type: 'sent' }
  /** ...and it failed. */
  | { readonly type: 'send-failed' }
  /** The visitor left: everything back for the next visit. */
  | { readonly type: 'reset' };

export const INITIAL_FILING: Filing = {
  stage: 'tube',
  delivery: null,
  sheet: 0,
  bottle: 0,
  sending: false,
  failedAway: false,
};

export function filingReducer(state: Filing, event: FilingEvent): Filing {
  switch (event.type) {
    case 'unroll':
      if (state.stage === 'afloat')
        return { ...state, stage: 'unrolled', sheet: state.sheet + 1 };
      return state.stage === 'tube' ? { ...state, stage: 'unrolled' } : state;
    case 'roll-back':
      return state.stage === 'unrolled' && !state.sending
        ? { ...state, stage: 'tube' }
        : state;
    case 'sending':
      return { ...state, sending: true, failedAway: false };
    case 'sent':
      return { ...state, sending: false };
    case 'send-failed':
      // On the paper, the form says so itself; away from it, the next paper will.
      return {
        ...state,
        sending: false,
        failedAway: state.stage !== 'unrolled',
      };
    case 'stamped':
      switch (state.stage) {
        case 'unrolled':
          return {
            ...state,
            stage: 'stamped',
            delivery: event.delivery,
            bottle: state.bottle + 1,
          };
        case 'tube':
          // Sent after the scroll was put away: nothing to stamp on screen, but it went (into
          // a bottle all the same), and the President says so. The next paper is a new one.
          return {
            ...state,
            stage: 'afloat',
            delivery: event.delivery,
            sheet: state.sheet + 1,
            bottle: state.bottle + 1,
          };
        default:
          return state;
      }
    case 'stamp-held':
      return state.stage === 'stamped' ? { ...state, stage: 'rolling' } : state;
    case 'corked':
      return state.stage === 'rolling' ? { ...state, stage: 'afloat' } : state;
    case 'reset':
      // A fresh paper next visit; the counters only ever go up (they key the paper and bottle).
      // A submission still in flight keeps travelling: its outcome is still told.
      return {
        ...INITIAL_FILING,
        sheet: state.sheet + 1,
        bottle: state.bottle,
        sending: state.sending,
        failedAway: state.failedAway,
      };
  }
}

/** The scroll is out of the tube (on the counter, under the stamp, or rolling up). */
export const scrollOut = (filing: Filing): boolean =>
  filing.stage === 'unrolled' ||
  filing.stage === 'stamped' ||
  filing.stage === 'rolling';

/** What the President says once the bottle is afloat. */
export const filedLineOf = (delivery: ComplaintDelivery): FiledLineId => {
  switch (delivery.status) {
    case 'delivered':
      return 'filed';
    case 'awaiting-moderation':
      return 'filed-public';
    case 'delivery-not-wired':
      return 'filed-unsent';
  }
};

/**
 * The paper's state, from the filing and where it is: in the world, the card's flight (it
 * unrolls once settled in front of the visitor); on a phone's sheet, `arrived` at once.
 */
export function paperStateOf(
  stage: FilingStage,
  card: InWorldCardPhase | 'arrived',
): ScrollPaperState {
  switch (stage) {
    case 'unrolled':
      return card === 'settled' || card === 'arrived' ? 'unrolled' : 'rolled';
    case 'stamped':
      return 'stamped';
    case 'rolling':
      return 'rolling';
    case 'afloat':
      return 'gone';
    case 'tube':
      return 'rolled';
  }
}
