import { err, mapResult, ok, ValueObject, type Result } from '@qa3elhamor/shared-domain';
import type { FieldIssue } from './complaint-errors.js';
import { containsForbiddenCharacter, validateText, type TextRule } from './text-rules.js';

/** Limits in Unicode code points, applied after normalisation. */
export const COMPLAINT_LIMITS = {
  subject: 120,
  body: 2000,
  senderName: 60,
  senderSpecies: 40,
  /** RFC 5321 path limit. */
  replyEmail: 254,
  /** RFC 5321 local-part limit. */
  replyEmailLocalPart: 64,
} as const;

const SUBJECT_RULE: TextRule = {
  field: 'subject',
  maxLength: COMPLAINT_LIMITS.subject,
  multiline: false,
};
const BODY_RULE: TextRule = {
  field: 'body',
  maxLength: COMPLAINT_LIMITS.body,
  multiline: true,
};
const SENDER_NAME_RULE: TextRule = {
  field: 'senderName',
  maxLength: COMPLAINT_LIMITS.senderName,
  multiline: false,
};
const SENDER_SPECIES_RULE: TextRule = {
  field: 'senderSpecies',
  maxLength: COMPLAINT_LIMITS.senderSpecies,
  multiline: false,
};

interface TextProps {
  readonly value: string;
}

/** The complaint's one-line headline. */
export class ComplaintSubject extends ValueObject<TextProps> {
  private constructor(props: TextProps) {
    super(props);
  }

  static create(raw: string): Result<ComplaintSubject, FieldIssue> {
    return mapResult(validateText(raw, SUBJECT_RULE), (value) => new ComplaintSubject({ value }));
  }

  get value(): string {
    return this.props.value;
  }
}

/** The complaint itself; multi-line, paragraph breaks preserved. */
export class ComplaintBody extends ValueObject<TextProps> {
  private constructor(props: TextProps) {
    super(props);
  }

  static create(raw: string): Result<ComplaintBody, FieldIssue> {
    return mapResult(validateText(raw, BODY_RULE), (value) => new ComplaintBody({ value }));
  }

  get value(): string {
    return this.props.value;
  }
}

/** What the complainant calls themselves. */
export class SenderName extends ValueObject<TextProps> {
  private constructor(props: TextProps) {
    super(props);
  }

  static create(raw: string): Result<SenderName, FieldIssue> {
    return mapResult(validateText(raw, SENDER_NAME_RULE), (value) => new SenderName({ value }));
  }

  get value(): string {
    return this.props.value;
  }
}

/** The playful "species" line of the Bureau form (sardine, grouper, disgruntled clam). */
export class SenderSpecies extends ValueObject<TextProps> {
  private constructor(props: TextProps) {
    super(props);
  }

  static create(raw: string): Result<SenderSpecies, FieldIssue> {
    return mapResult(
      validateText(raw, SENDER_SPECIES_RULE),
      (value) => new SenderSpecies({ value })
    );
  }

  get value(): string {
    return this.props.value;
  }
}

// Deliberately shallow: one @, no whitespace, a dotted domain. Deliverability is proven by the
// form service, not by a regex; this only refuses what is obviously not an address.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/u;

/** An optional address the owner can answer a private complaint at. Never published. */
export class ReplyEmail extends ValueObject<TextProps> {
  private constructor(props: TextProps) {
    super(props);
  }

  static create(raw: string): Result<ReplyEmail, FieldIssue> {
    if (containsForbiddenCharacter(raw)) {
      return err({ field: 'replyEmail', reason: 'control-character' });
    }
    const trimmed = raw.trim();
    if (trimmed.length === 0) return err({ field: 'replyEmail', reason: 'empty' });
    if (trimmed.length > COMPLAINT_LIMITS.replyEmail) {
      return err({ field: 'replyEmail', reason: 'too-long', limit: COMPLAINT_LIMITS.replyEmail });
    }
    if (!EMAIL_PATTERN.test(trimmed)) return err({ field: 'replyEmail', reason: 'malformed' });
    const at = trimmed.lastIndexOf('@');
    const local = trimmed.slice(0, at);
    if (local.length > COMPLAINT_LIMITS.replyEmailLocalPart) {
      return err({
        field: 'replyEmail',
        reason: 'too-long',
        limit: COMPLAINT_LIMITS.replyEmailLocalPart,
      });
    }
    // Domains are case-insensitive; local parts technically are not, so only the domain folds.
    return ok(new ReplyEmail({ value: `${local}@${trimmed.slice(at + 1).toLowerCase()}` }));
  }

  get value(): string {
    return this.props.value;
  }
}
