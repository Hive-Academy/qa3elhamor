/**
 * The Bureau form's only way out: a port the composition root injects. The form hands over an
 * already-validated, normalised draft; how it travels (a form service, the complaints API) is
 * the adapter's business. `complaints-contact-adapter` supplies the real one.
 */
export interface ComplaintDraft {
  readonly subject: string;
  readonly body: string;
  readonly senderName: string;
  /** Blank species is absent, as in the domain. */
  readonly senderSpecies: string | null;
  /** Blank reply address is absent, as in the domain. Private complaints only. */
  readonly replyEmail: string | null;
}

/**
 * What happened to a submitted draft.
 *
 * - `delivered`: the adapter handed it to its destination.
 * - `delivery-not-wired`: accepted by the form, deliberately sent nowhere (no adapter yet).
 *
 * A failed delivery is a rejected promise; the form keeps the visitor's text and offers a retry.
 */
export type ComplaintDelivery =
  { readonly status: 'delivered' } | { readonly status: 'delivery-not-wired' };

export interface ComplaintSubmitter {
  submit(draft: ComplaintDraft): Promise<ComplaintDelivery>;
}

/**
 * The stand-in until `complaints-contact-adapter` lands: it never reads the draft and never
 * sends anything anywhere; it only tells the form that delivery is not wired yet, so the
 * visitor is told the truth instead of a fake "sent".
 */
export const pendingSubmitter: ComplaintSubmitter = {
  submit: () => Promise.resolve({ status: 'delivery-not-wired' }),
};

/** Told about the one submission in flight, whoever started it and whether or not it is still on screen. */
export interface SubmissionWatcher {
  readonly onSending?: () => void;
  readonly onDelivered?: (delivery: ComplaintDelivery) => void;
  readonly onFailed?: (error: unknown) => void;
}

/**
 * `submitter` with at most one submission in flight: a submit while one is travelling joins it
 * (same result, no second request), wherever it comes from. A host that shows the form in more
 * than one place (the Bureau's paper in the world, or its sheet on a phone, remounting between
 * them) wraps the site's submitter once, and `watcher` hears every outcome, even after the form
 * that sent it has gone.
 */
export function singleFlight(
  submitter: ComplaintSubmitter,
  watcher: SubmissionWatcher = {},
): ComplaintSubmitter {
  let inFlight: Promise<ComplaintDelivery> | null = null;
  return {
    submit(draft) {
      if (inFlight) return inFlight;
      watcher.onSending?.();
      const travelling = submitter.submit(draft).then(
        (delivery) => {
          inFlight = null;
          watcher.onDelivered?.(delivery);
          return delivery;
        },
        (error: unknown) => {
          inFlight = null;
          watcher.onFailed?.(error);
          throw error;
        },
      );
      inFlight = travelling;
      return travelling;
    },
  };
}
