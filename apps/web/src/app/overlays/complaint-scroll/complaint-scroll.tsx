import type { FieldIssue } from '@qa3elhamor/complaints-domain';
import type { SiteCopy, SiteCopyKey } from '@qa3elhamor/content-domain';
import type { LandmarkOverlayProps } from '@qa3elhamor/landmarks-ui';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
  type MouseEvent,
} from 'react';
import {
  copyReader,
  fillCopy,
  toContentLocale,
  type CopyReader,
} from '../overlay-copy';
import {
  COMPLAINT_FIELD_SPECS,
  COMPLAINT_FORM_FIELDS,
  EMPTY_COMPLAINT_FORM,
  complaintFormIssues,
  measuredLength,
  toComplaintDraft,
  type ComplaintFormField,
  type ComplaintFormValues,
} from './complaint-form-rules';
import type {
  ComplaintDelivery,
  ComplaintSubmitter,
} from './complaint-submitter';
import { SardineStamp } from './sardine-stamp';
import './complaint-scroll.css';

/** What the Bureau form is rendered and sent with, bound where the overlay is registered. */
export interface ComplaintScrollContent {
  readonly copy: SiteCopy;
  readonly submitter: ComplaintSubmitter;
}

/** How a host other than the landmark dialog presents the scroll (the Bureau's in-world visit). */
export interface ComplaintScrollOptions {
  /**
   * `dialog` (default): the stamped result replaces the form and offers its own way on.
   * `in-world`: the stamp lands on the filled-in paper, and the host offers what comes next.
   */
  readonly variant?: 'dialog' | 'in-world';
  /** The text the form starts with: a draft the host kept. Default empty. */
  readonly initialValues?: ComplaintFormValues;
  /** Every edit, so the host can keep the draft when the scroll is put away unsent. */
  readonly onDraftChange?: (values: ComplaintFormValues) => void;
  /** A stamped delivery. Called even when the scroll was put away while it was being sent. */
  readonly onStamped?: (delivery: ComplaintDelivery) => void;
  /**
   * Opens with the failure notice: the last attempt failed while the scroll was put away (the
   * host learned it from its submitter), and the draft it brings back is that attempt's text.
   */
  readonly initialFailed?: boolean;
}

export type ComplaintScrollProps = LandmarkOverlayProps &
  ComplaintScrollContent &
  ComplaintScrollOptions;

type Phase =
  | { readonly kind: 'editing'; readonly failed: boolean }
  | { readonly kind: 'sending' }
  | { readonly kind: 'stamped'; readonly delivery: ComplaintDelivery };

const issueMessage = (issue: FieldIssue, t: CopyReader): string => {
  switch (issue.reason) {
    case 'empty':
      return t('complaintErrorEmpty');
    case 'too-long':
      return fillCopy(t('complaintErrorTooLong'), { limit: issue.limit ?? '' });
    case 'control-character':
      return t('complaintErrorControlCharacter');
    case 'malformed':
    case 'not-allowed':
    case 'out-of-order':
      return t('complaintErrorMalformed');
  }
};

/** Each field's label, so the error summary names the field exactly as its label does. */
const FIELD_LABEL_KEYS: Readonly<Record<ComplaintFormField, SiteCopyKey>> = {
  subject: 'complaintSubjectLabel',
  body: 'complaintBodyLabel',
  senderName: 'complaintNameLabel',
  senderSpecies: 'complaintSpeciesLabel',
  replyEmail: 'complaintEmailLabel',
};

/** Datalist suggestions: one copy string, comma separated (Latin or Arabic comma), deduplicated. */
const speciesSuggestions = (text: string): string[] => [
  ...new Set(
    text
      .split(/[,،]/u)
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  ),
];

/**
 * The bureau's overlay: a paper-scroll complaint form (the site's contact form). Each field is
 * validated by the complaints domain's own value objects; a valid draft goes to the injected
 * `ComplaintSubmitter` under the Sardine Municipal Stamp. Private only: nothing here posts to
 * the public wall.
 */
export function ComplaintScroll({
  copy,
  submitter,
  locale,
  dir,
  onClose,
  variant = 'dialog',
  initialValues = EMPTY_COMPLAINT_FORM,
  onDraftChange,
  onStamped,
  initialFailed = false,
}: ComplaintScrollProps) {
  const t = copyReader(copy, toContentLocale(locale));
  const ids = useId();
  const fieldId = (field: ComplaintFormField) => `${ids}-${field}`;

  const [values, setValues] = useState<ComplaintFormValues>(initialValues);
  const hostCallbacks = useRef({ onDraftChange, onStamped });
  useEffect(() => {
    hostCallbacks.current = { onDraftChange, onStamped };
  });
  useEffect(() => {
    hostCallbacks.current.onDraftChange?.(values);
  }, [values]);
  const [touched, setTouched] = useState<ReadonlySet<ComplaintFormField>>(
    () => new Set(),
  );
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [phase, setPhase] = useState<Phase>({
    kind: 'editing',
    failed: initialFailed,
  });
  // Set synchronously: two presses before React re-renders into `sending` must not send twice.
  const sendingNow = useRef(false);

  const issues = useMemo(() => complaintFormIssues(values), [values]);
  const fieldRefs = useRef(
    new Map<ComplaintFormField, HTMLInputElement | HTMLTextAreaElement>(),
  );
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  // Bumped by every refused stamp, so a repeat refusal moves focus to the summary again.
  const [refusals, setRefusals] = useState(0);
  // A delivery that settles after the overlay closed must not touch unmounted state.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (phase.kind === 'stamped') resultHeadingRef.current?.focus();
  }, [phase.kind]);

  // A refused stamp moves focus to the error summary at the top of the form: it scrolls into
  // view and is read out, and each of its entries leads to the field it names.
  useEffect(() => {
    if (refusals > 0) summaryRef.current?.focus();
  }, [refusals]);

  const shownIssue = (field: ComplaintFormField): FieldIssue | undefined =>
    submitAttempted || touched.has(field) ? issues[field] : undefined;

  // Editing after a failed delivery retires the failure notice: it described the last attempt.
  const clearFailure = () =>
    setPhase((current) =>
      current.kind === 'editing' && current.failed
        ? { kind: 'editing', failed: false }
        : current,
    );

  const setValue = (field: ComplaintFormField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    clearFailure();
  };

  const markTouched = (field: ComplaintFormField) =>
    setTouched((current) =>
      current.has(field) ? current : new Set(current).add(field),
    );

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (phase.kind === 'sending' || sendingNow.current) return;
    setSubmitAttempted(true);
    // Each attempt reports only on itself: a refusal must not stack on the previous failure.
    clearFailure();
    const draft = toComplaintDraft(values);
    if (!draft) {
      setRefusals((count) => count + 1);
      return;
    }
    sendingNow.current = true;
    setPhase({ kind: 'sending' });
    submitter.submit(draft).then(
      (delivery) => {
        sendingNow.current = false;
        hostCallbacks.current.onStamped?.(delivery);
        if (mounted.current) setPhase({ kind: 'stamped', delivery });
      },
      (error: unknown) => {
        // The visitor sees the retry message; the cause is for whoever debugs the adapter.
        console.error('Complaint delivery failed.', error);
        sendingNow.current = false;
        if (mounted.current) setPhase({ kind: 'editing', failed: true });
      },
    );
  };

  const fileAnother = () => {
    setValues(EMPTY_COMPLAINT_FORM);
    setTouched(new Set());
    setSubmitAttempted(false);
    setPhase({ kind: 'editing', failed: false });
  };

  const result = (delivery: ComplaintDelivery) => (
    <>
      <SardineStamp
        legend={t('complaintStampText')}
        className="complaint-scroll__seal"
      />
      <h3
        ref={resultHeadingRef}
        tabIndex={-1}
        className="complaint-scroll__title"
      >
        {t('complaintSuccessTitle')}
      </h3>
      <p role="status">
        {delivery.status === 'delivered'
          ? t('complaintSuccessBody')
          : t('complaintPendingBody')}
      </p>
    </>
  );

  if (phase.kind === 'stamped' && variant === 'dialog') {
    return (
      <section className="complaint-scroll complaint-scroll--stamped" dir={dir}>
        {result(phase.delivery)}
        <div className="complaint-scroll__actions">
          <button
            type="button"
            className="complaint-scroll__secondary"
            onClick={fileAnother}
          >
            {t('complaintAnotherLabel')}
          </button>
          <button
            type="button"
            className="complaint-scroll__secondary"
            onClick={onClose}
          >
            {t('closeLabel')}
          </button>
        </div>
      </section>
    );
  }

  const sending = phase.kind === 'sending';
  // In the world the stamp lands on the filled-in paper, which stays (out of reach) under it.
  const stamped = phase.kind === 'stamped' ? phase.delivery : null;
  const invalidFields = COMPLAINT_FORM_FIELDS.filter((f) => issues[f]);

  const goToField = (
    event: MouseEvent<HTMLAnchorElement>,
    field: ComplaintFormField,
  ) => {
    event.preventDefault();
    const target = fieldRefs.current.get(field);
    target?.focus({ preventScroll: true });
    // The whole field, label included, not just the input's edge.
    target
      ?.closest('.complaint-scroll__field')
      ?.scrollIntoView?.({ block: 'nearest' });
  };
  const optionalMark = ` (${t('complaintOptional')})`;
  const suggestions = speciesSuggestions(t('complaintSpeciesSuggestions'));

  const describedBy = (
    field: ComplaintFormField,
    extras: readonly string[] = [],
  ): string | undefined => {
    const parts = [...extras, `${fieldId(field)}-count`];
    if (shownIssue(field)) parts.push(`${fieldId(field)}-error`);
    return parts.length > 0 ? parts.join(' ') : undefined;
  };

  const fieldProps = (
    field: ComplaintFormField,
    extras?: readonly string[],
  ) => ({
    id: fieldId(field),
    name: field,
    value: values[field],
    // What the visitor types follows its own script (an Arabic complaint in an English page,
    // and the reverse); the email field pins `ltr` over this.
    dir: 'auto' as const,
    required: !COMPLAINT_FIELD_SPECS[field].optional,
    'aria-invalid': shownIssue(field) ? (true as const) : undefined,
    'aria-describedby': describedBy(field, extras),
    onBlur: () => markTouched(field),
    ref: (element: HTMLInputElement | HTMLTextAreaElement | null) => {
      if (element) fieldRefs.current.set(field, element);
      else fieldRefs.current.delete(field);
    },
  });

  const counter = (field: ComplaintFormField) => {
    const { limit } = COMPLAINT_FIELD_SPECS[field];
    const count = measuredLength(field, values[field]);
    return (
      <span
        id={`${fieldId(field)}-count`}
        className="complaint-scroll__count"
        data-over={count > limit ? '' : undefined}
      >
        {fillCopy(t('complaintCounter'), { count, limit })}
      </span>
    );
  };

  const error = (field: ComplaintFormField) => {
    const issue = shownIssue(field);
    return issue ? (
      <p id={`${fieldId(field)}-error`} className="complaint-scroll__error">
        {issueMessage(issue, t)}
      </p>
    ) : null;
  };

  const label = (field: ComplaintFormField) => (
    <label htmlFor={fieldId(field)} className="complaint-scroll__label">
      {t(FIELD_LABEL_KEYS[field])}
      {COMPLAINT_FIELD_SPECS[field].optional && (
        <span className="complaint-scroll__optional">{optionalMark}</span>
      )}
    </label>
  );

  return (
    <section
      className={
        variant === 'in-world'
          ? 'complaint-scroll complaint-scroll--in-world'
          : 'complaint-scroll'
      }
      data-stamped={stamped ? '' : undefined}
      dir={dir}
    >
      <div className="complaint-scroll__rod" aria-hidden="true" />
      <div className="complaint-scroll__sheet" inert={stamped !== null}>
        <h3 className="complaint-scroll__title">{t('contactTitle')}</h3>
        <p className="complaint-scroll__intro">{t('complaintIntro')}</p>

        <form noValidate onSubmit={onSubmit} aria-busy={sending || undefined}>
          {submitAttempted && invalidFields.length > 0 && (
            // Not a live region: it is announced by taking focus when a stamp is refused,
            // and stays quiet while the visitor fixes fields one by one.
            <div
              ref={summaryRef}
              tabIndex={-1}
              className="complaint-scroll__summary"
              aria-labelledby={`${ids}-summary`}
              data-testid="complaint-error-summary"
            >
              <p id={`${ids}-summary`}>{t('complaintErrorSummary')}</p>
              <ul>
                {invalidFields.map((field) => {
                  const issue = issues[field];
                  return (
                    <li key={field}>
                      <a
                        href={`#${fieldId(field)}`}
                        onClick={(event) => goToField(event, field)}
                      >
                        {t(FIELD_LABEL_KEYS[field])}
                        {issue ? `: ${issueMessage(issue, t)}` : ''}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {phase.kind === 'editing' && phase.failed && (
            <p role="alert" className="complaint-scroll__summary">
              {t('complaintFailureBody')}
            </p>
          )}

          <div className="complaint-scroll__field">
            {label('subject')}
            <input
              {...fieldProps('subject')}
              type="text"
              onChange={(e) => setValue('subject', e.target.value)}
            />
            {counter('subject')}
            {error('subject')}
          </div>

          <div className="complaint-scroll__field">
            {label('body')}
            <textarea
              {...fieldProps('body')}
              rows={6}
              onChange={(e) => setValue('body', e.target.value)}
            />
            {counter('body')}
            {error('body')}
          </div>

          <div className="complaint-scroll__row">
            <div className="complaint-scroll__field">
              {label('senderName')}
              <input
                {...fieldProps('senderName')}
                type="text"
                autoComplete="name"
                onChange={(e) => setValue('senderName', e.target.value)}
              />
              {counter('senderName')}
              {error('senderName')}
            </div>

            <div className="complaint-scroll__field">
              {label('senderSpecies')}
              <input
                {...fieldProps('senderSpecies')}
                type="text"
                list={`${ids}-species-list`}
                autoComplete="off"
                onChange={(e) => setValue('senderSpecies', e.target.value)}
              />
              <datalist id={`${ids}-species-list`}>
                {suggestions.map((species) => (
                  <option key={species} value={species} />
                ))}
              </datalist>
              {counter('senderSpecies')}
              {error('senderSpecies')}
            </div>
          </div>

          <div className="complaint-scroll__field">
            {label('replyEmail')}
            <input
              {...fieldProps('replyEmail', [`${fieldId('replyEmail')}-hint`])}
              type="email"
              dir="ltr"
              autoComplete="email"
              inputMode="email"
              onChange={(e) => setValue('replyEmail', e.target.value)}
            />
            <span
              id={`${fieldId('replyEmail')}-hint`}
              className="complaint-scroll__hint"
            >
              {t('complaintEmailHint')}
            </span>
            {counter('replyEmail')}
            {error('replyEmail')}
          </div>

          <div className="complaint-scroll__submit-row">
            <button
              type="submit"
              className="complaint-scroll__stamp-button"
              aria-disabled={sending || undefined}
              data-pressing={sending ? '' : undefined}
            >
              <SardineStamp
                legend={t('complaintStampText')}
                className="complaint-scroll__stamp-icon"
              />
              <span>{t('contactSubmitLabel')}</span>
            </button>
            <span role="status" className="complaint-scroll__status">
              {sending ? t('complaintSending') : ''}
            </span>
          </div>
        </form>
      </div>
      <div
        className="complaint-scroll__rod complaint-scroll__rod--end"
        aria-hidden="true"
      />
      {stamped && (
        <div className="complaint-scroll__stamp-mark">{result(stamped)}</div>
      )}
    </section>
  );
}

/**
 * Binds copy and the delivery port into an overlay the kernel can register
 * (`LANDMARK_OVERLAYS.bureau`).
 */
export function createComplaintScrollOverlay(
  content: ComplaintScrollContent,
): ComponentType<LandmarkOverlayProps> {
  function BureauComplaintScroll(props: LandmarkOverlayProps) {
    return <ComplaintScroll {...props} {...content} />;
  }
  return BureauComplaintScroll;
}
