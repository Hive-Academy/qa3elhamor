import {
  COMPLAINT_LIMITS,
  submitComplaint,
} from '@qa3elhamor/complaints-domain';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_COMPLAINT_FORM,
  complaintFormIssues,
  measuredLength,
  toComplaintDraft,
  validateComplaintField,
  type ComplaintFormValues,
} from './complaint-form-rules';

const valid: ComplaintFormValues = {
  subject: 'Request for web development services',
  body: 'The pineapple leaks.\n\nPlease send a developer.',
  senderName: 'Sardine Sam',
  senderSpecies: 'Sardine',
  replyEmail: 'sam@Sea.Example',
};

/** What the server would say about the same input: the domain's own aggregate factory. */
const domainAccepts = (values: ComplaintFormValues): boolean =>
  submitComplaint(
    {
      id: '0192f5d6-7a1b-7c3d-8e4f-5a6b7c8d9e0f',
      visibility: 'private',
      ...values,
    },
    new Date('2026-10-01T00:00:00Z'),
  ).ok;

describe('complaint form rules', () => {
  it('accepts a valid complaint and hands over the normalised draft', () => {
    expect(complaintFormIssues(valid)).toEqual({});
    expect(
      toComplaintDraft({ ...valid, subject: '  Request   for\tservices ' }),
    ).toEqual({
      subject: 'Request for services',
      body: valid.body,
      senderName: 'Sardine Sam',
      senderSpecies: 'Sardine',
      // Only the domain folds case, exactly as the domain does.
      replyEmail: 'sam@sea.example',
    });
  });

  it('treats blank species and reply address as absent, like the domain', () => {
    const draft = toComplaintDraft({
      ...valid,
      senderSpecies: '   ',
      replyEmail: '',
    });
    expect(draft?.senderSpecies).toBeNull();
    expect(draft?.replyEmail).toBeNull();
  });

  it('requires subject, body and name', () => {
    expect(complaintFormIssues(EMPTY_COMPLAINT_FORM)).toEqual({
      subject: { field: 'subject', reason: 'empty' },
      body: { field: 'body', reason: 'empty' },
      senderName: { field: 'senderName', reason: 'empty' },
    });
    expect(toComplaintDraft(EMPTY_COMPLAINT_FORM)).toBeNull();
  });

  it('measures limits in code points after normalisation, as the domain does', () => {
    const atLimit = 'ب'.repeat(COMPLAINT_LIMITS.subject);
    expect(validateComplaintField('subject', `  ${atLimit}  `)).toBeNull();
    expect(validateComplaintField('subject', `${atLimit}x`)).toEqual({
      field: 'subject',
      reason: 'too-long',
      limit: COMPLAINT_LIMITS.subject,
    });
    // An emoji is one code point but two UTF-16 units.
    expect(measuredLength('senderName', '🐟🐟')).toBe(2);
    expect(measuredLength('body', 'a   b\r\n\r\n\r\nc')).toBe(
      'a b\n\nc'.length,
    );
  });

  it('refuses control and bidi-override characters', () => {
    expect(validateComplaintField('senderName', 'Sam‮evil')).toEqual({
      field: 'senderName',
      reason: 'control-character',
    });
    expect(validateComplaintField('body', 'line\u0007bell')?.reason).toBe(
      'control-character',
    );
  });

  it('refuses a malformed reply address', () => {
    expect(validateComplaintField('replyEmail', 'not-an-email')?.reason).toBe(
      'malformed',
    );
  });

  it.each<[string, Partial<ComplaintFormValues>]>([
    ['valid', {}],
    ['blank optionals', { senderSpecies: ' ', replyEmail: '' }],
    ['empty subject', { subject: '   ' }],
    ['long body', { body: 'x'.repeat(COMPLAINT_LIMITS.body + 1) }],
    [
      'long species',
      { senderSpecies: 's'.repeat(COMPLAINT_LIMITS.senderSpecies + 1) },
    ],
    ['bidi override in name', { senderName: '⁦Sam' }],
    ['malformed email', { replyEmail: 'sam@' }],
    ['tab in subject', { subject: 'a\tb' }],
  ])('agrees with the domain aggregate: %s', (_case, change) => {
    const values = { ...valid, ...change };
    expect(toComplaintDraft(values) !== null).toBe(domainAccepts(values));
  });
});
