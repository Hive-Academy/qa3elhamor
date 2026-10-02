import type { SiteCopy } from '@qa3elhamor/content-domain';
import { useEffect, useRef } from 'react';
import {
  ComplaintScroll,
  type ComplaintDelivery,
  type ComplaintFormValues,
  type ComplaintSubmitter,
} from '../overlays/complaint-scroll';
import type { WallCopy } from '../wall/wall-copy';
import type { BureauWords } from './bureau-copy';
import './bureau-scroll.css';

/**
 * Where the paper is in its little performance:
 * - `rolled`: still rolled (coming out of the tube, or going back in unsent);
 * - `unrolled`: open on the counter, being typed on;
 * - `stamped`: the stamp has just landed on it;
 * - `rolling`: rolling up into the bottle;
 * - `gone`: in the bottle (nothing of it shows).
 */
export type ScrollPaperState =
  'rolled' | 'unrolled' | 'stamped' | 'rolling' | 'gone';

export interface BureauScrollProps {
  readonly copy: SiteCopy;
  readonly submitter: ComplaintSubmitter;
  readonly locale: string;
  readonly dir: 'ltr' | 'rtl';
  /** The landmark's label, for the form's host props. */
  readonly title: string;
  readonly words: BureauWords;
  readonly state: ScrollPaperState;
  /** On a phone the paper is a sheet over the scene, sized to what the keyboard leaves. */
  readonly presentation: 'in-world' | 'sheet';
  readonly initialValues: ComplaintFormValues;
  readonly onDraftChange: (values: ComplaintFormValues) => void;
  readonly onStamped: (delivery: ComplaintDelivery) => void;
  /** Put it back in the tube, unsent. */
  readonly onRollBack: () => void;
  /** A submission is in flight: it cannot be rolled back until the visitor sees how it went. */
  readonly sending?: boolean;
  /** The last attempt failed while the scroll was away: open with the failure notice. */
  readonly initialFailed?: boolean;
  /** The public wall's words when it is on: the form offers pinning the complaint on it. */
  readonly publicWall?: WallCopy;
  /**
   * The form's heading is painted on a board over the paper (ocean text mode): its DOM heading
   * stays for assistive technology, visually hidden.
   */
  readonly paintedHeading?: boolean;
}

/**
 * The Bureau's complaint scroll as a thing in the world: the real form (`ComplaintScroll`,
 * same rules, same submitter) on a paper that unrolls between two rods, takes the Sardine
 * Municipal Stamp with a thump, and rolls up again into the bottle. Typing happens in its own
 * fields: nothing here (or in the narrator's bubble) listens to keys on the page.
 */
export function BureauScroll({
  copy,
  submitter,
  locale,
  dir,
  title,
  words,
  state,
  presentation,
  initialValues,
  onDraftChange,
  onStamped,
  onRollBack,
  sending = false,
  initialFailed = false,
  publicWall,
  paintedHeading = false,
}: BureauScrollProps) {
  const root = useRef<HTMLDivElement>(null);
  // Unrolled: the visitor is here to type, so the first field takes focus (without scrolling
  // the page, which would close the landmark).
  useEffect(() => {
    if (state !== 'unrolled') return;
    root.current
      ?.querySelector<HTMLElement>('input, textarea')
      ?.focus({ preventScroll: true });
  }, [state]);

  // Still reachable while it rolls up: the stamped result keeps focus until the President's
  // bubble comes back and takes it, so focus never drops to <body> in between.
  const reachable =
    state === 'unrolled' || state === 'stamped' || state === 'rolling';
  return (
    <div
      ref={root}
      className="bureau-scroll"
      data-state={state}
      data-presentation={presentation}
      data-painted-heading={paintedHeading ? '' : undefined}
      role="group"
      aria-label={words.scrollLabel}
      dir={dir}
      inert={!reachable}
      aria-hidden={state === 'gone' ? true : undefined}
    >
      <ComplaintScroll
        variant="in-world"
        copy={copy}
        submitter={submitter}
        landmarkId="bureau"
        title={title}
        locale={locale}
        dir={dir}
        onClose={onRollBack}
        initialValues={initialValues}
        onDraftChange={onDraftChange}
        onStamped={onStamped}
        initialFailed={initialFailed}
        publicWall={publicWall}
      />
      {state === 'unrolled' && (
        <button
          type="button"
          className="visit-full-back bureau-scroll__back"
          aria-disabled={sending || undefined}
          onClick={sending ? undefined : onRollBack}
        >
          <span aria-hidden="true">{dir === 'rtl' ? '›' : '‹'}</span>
          {words.rollUp}
        </button>
      )}
    </div>
  );
}
