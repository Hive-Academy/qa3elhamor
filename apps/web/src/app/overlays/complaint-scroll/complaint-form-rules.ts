import {
  COMPLAINT_LIMITS,
  ComplaintBody,
  ComplaintSubject,
  ReplyEmail,
  SenderName,
  SenderSpecies,
  codePointLength,
  normaliseText,
  type FieldIssue,
} from '@qa3elhamor/complaints-domain';
import type { ComplaintDraft } from './complaint-submitter';

/**
 * The Bureau form's rules are the complaints domain's rules: each field is checked by the same
 * value object the API builds a complaint from, so the form can never accept what the server
 * would refuse, nor refuse what it would accept.
 */
export const COMPLAINT_FORM_FIELDS = [
  'subject',
  'body',
  'senderName',
  'senderSpecies',
  'replyEmail',
] as const;

export type ComplaintFormField = (typeof COMPLAINT_FORM_FIELDS)[number];

export type ComplaintFormValues = Readonly<Record<ComplaintFormField, string>>;

export type ComplaintFormIssues = Readonly<
  Partial<Record<ComplaintFormField, FieldIssue>>
>;

export const EMPTY_COMPLAINT_FORM: ComplaintFormValues = {
  subject: '',
  body: '',
  senderName: '',
  senderSpecies: '',
  replyEmail: '',
};

type FieldCheck =
  | { readonly ok: true; readonly value: { readonly value: string } }
  | { readonly ok: false; readonly error: FieldIssue };

interface FieldSpec {
  /** Code-point limit after normalisation (the domain's `COMPLAINT_LIMITS`). */
  readonly limit: number;
  readonly multiline: boolean;
  /** Optional fields treat blank as absent, exactly as `submitComplaint` does. */
  readonly optional: boolean;
  readonly check: (raw: string) => FieldCheck;
}

export const COMPLAINT_FIELD_SPECS: Readonly<
  Record<ComplaintFormField, FieldSpec>
> = {
  subject: {
    limit: COMPLAINT_LIMITS.subject,
    multiline: false,
    optional: false,
    check: (raw) => ComplaintSubject.create(raw),
  },
  body: {
    limit: COMPLAINT_LIMITS.body,
    multiline: true,
    optional: false,
    check: (raw) => ComplaintBody.create(raw),
  },
  senderName: {
    limit: COMPLAINT_LIMITS.senderName,
    multiline: false,
    optional: false,
    check: (raw) => SenderName.create(raw),
  },
  senderSpecies: {
    limit: COMPLAINT_LIMITS.senderSpecies,
    multiline: false,
    optional: true,
    check: (raw) => SenderSpecies.create(raw),
  },
  replyEmail: {
    limit: COMPLAINT_LIMITS.replyEmail,
    multiline: false,
    optional: true,
    check: (raw) => ReplyEmail.create(raw),
  },
};

// The domain's `isBlank`: whitespace-only is absent.
const isBlank = (raw: string): boolean => raw.trim().length === 0;

/** The field's normalised value, or its issue; `null` for a blank optional field. */
const checkField = (
  field: ComplaintFormField,
  raw: string,
): FieldCheck | null => {
  const spec = COMPLAINT_FIELD_SPECS[field];
  if (spec.optional && isBlank(raw)) return null;
  return spec.check(raw);
};

/** One field's issue, or `null` when the domain accepts it. */
export const validateComplaintField = (
  field: ComplaintFormField,
  raw: string,
): FieldIssue | null => {
  const result = checkField(field, raw);
  return result && !result.ok ? result.error : null;
};

/** Every field's issue at once, so the form can mark them all. */
export const complaintFormIssues = (
  values: ComplaintFormValues,
): ComplaintFormIssues => {
  const issues: Partial<Record<ComplaintFormField, FieldIssue>> = {};
  for (const field of COMPLAINT_FORM_FIELDS) {
    const issue = validateComplaintField(field, values[field]);
    if (issue) issues[field] = issue;
  }
  return issues;
};

/** The normalised draft the submitter receives, or `null` while any field is invalid. */
export const toComplaintDraft = (
  values: ComplaintFormValues,
): ComplaintDraft | null => {
  const read = (field: ComplaintFormField): string | null | undefined => {
    const result = checkField(field, values[field]);
    if (result === null) return null;
    return result.ok ? result.value.value : undefined;
  };
  const subject = read('subject');
  const body = read('body');
  const senderName = read('senderName');
  const senderSpecies = read('senderSpecies');
  const replyEmail = read('replyEmail');
  if (
    !subject ||
    !body ||
    !senderName ||
    senderSpecies === undefined ||
    replyEmail === undefined
  ) {
    return null;
  }
  return { subject, body, senderName, senderSpecies, replyEmail };
};

/** The length the limit is measured on: code points of the normalised text. */
export const measuredLength = (
  field: ComplaintFormField,
  raw: string,
): number =>
  codePointLength(normaliseText(raw, COMPLAINT_FIELD_SPECS[field].multiline));
