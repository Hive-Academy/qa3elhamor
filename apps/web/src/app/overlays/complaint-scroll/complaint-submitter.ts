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
