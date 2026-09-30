import { describe, expect, it } from 'vitest';
import {
  COMPLAINT_LIMITS,
  ComplaintBody,
  ComplaintSubject,
  ReplyEmail,
  SenderName,
  SenderSpecies,
} from './complaint-fields.js';
import { complaintId, COMPLAINT_ID_MAX_LENGTH } from './complaint-id.js';
import { codePointLength, normaliseText } from './text-rules.js';

/** Builds test characters from code points so the source stays plain ASCII. */
const cp = (code: number): string => String.fromCodePoint(code);

const TEXT_FIELDS = [
  { field: 'subject', create: ComplaintSubject.create, max: COMPLAINT_LIMITS.subject },
  { field: 'body', create: ComplaintBody.create, max: COMPLAINT_LIMITS.body },
  { field: 'senderName', create: SenderName.create, max: COMPLAINT_LIMITS.senderName },
  { field: 'senderSpecies', create: SenderSpecies.create, max: COMPLAINT_LIMITS.senderSpecies },
] as const;

describe.each(TEXT_FIELDS)('$field', ({ field, create, max }) => {
  it('accepts exactly the maximum length', () => {
    const result = create('a'.repeat(max));
    expect(result.ok && result.value.value.length).toBe(max);
  });

  it('refuses one over the maximum length', () => {
    expect(create('a'.repeat(max + 1))).toEqual({
      ok: false,
      error: { field, reason: 'too-long', limit: max },
    });
  });

  it('measures length after normalisation', () => {
    expect(create(`   ${'a'.repeat(max)}   `).ok).toBe(true);
  });

  it('counts an astral character (emoji) once', () => {
    expect(create('🐟'.repeat(max)).ok).toBe(true);
    expect(create('🐟'.repeat(max + 1)).ok).toBe(false);
  });

  it('accepts a single character', () => {
    expect(create('x').ok).toBe(true);
  });

  it.each(['', '   ', '\t\n  \r\n', cp(0xa0) + cp(0x2003)])(
    'refuses %j as empty after trim',
    (raw) => {
      expect(create(raw)).toEqual({ ok: false, error: { field, reason: 'empty' } });
    }
  );

  it.each([
    ['NUL', 0x00],
    ['BEL', 0x07],
    ['vertical tab', 0x0b],
    ['form feed', 0x0c],
    ['ESC', 0x1b],
    ['DEL', 0x7f],
    ['C1 NEL', 0x85],
    ['C1 CSI', 0x9b],
    ['bidi RLO', 0x202e],
    ['bidi LRE', 0x202a],
    ['bidi isolate', 0x2066],
    ['bidi pop isolate', 0x2069],
  ])('refuses a %s control character', (_name, code) => {
    expect(create(`bad${cp(code)}text`)).toEqual({
      ok: false,
      error: { field, reason: 'control-character' },
    });
  });

  it('keeps markup verbatim (escaping happens at render time)', () => {
    const result = create('<script>alert(1)</script> & "q"');
    expect(result.ok && result.value.value).toBe('<script>alert(1)</script> & "q"');
  });

  it('compares by value', () => {
    const a = create('same');
    const b = create('  same ');
    expect(a.ok && b.ok && a.value.equals(b.value)).toBe(true);
  });
});

describe('single-line normalisation', () => {
  it('trims and collapses every whitespace run, including newlines and tabs', () => {
    const result = ComplaintSubject.create('  The \t pineapple\r\n  is   leaking  ');
    expect(result.ok && result.value.value).toBe('The pineapple is leaking');
  });

  it('applies Unicode NFC', () => {
    // "e" + combining acute accent folds to the precomposed U+00E9.
    const result = SenderName.create(`Se${cp(0x301)}rgio`);
    expect(result.ok && result.value.value).toBe(`S${cp(0xe9)}rgio`);
  });
});

describe('multi-line normalisation (body)', () => {
  it('keeps paragraph breaks, trims lines and folds CRLF', () => {
    const result = ComplaintBody.create('  First  line  \r\nsecond\r\n\r\n\r\n\r\n  third\t\t ');
    expect(result.ok && result.value.value).toBe('First line\nsecond\n\nthird');
  });

  it('treats Unicode line separators as newlines', () => {
    expect(normaliseText(`a${cp(0x2028)}b${cp(0x2029)}c`, true)).toBe('a\nb\nc');
  });

  it('counts code points, not UTF-16 units', () => {
    expect(codePointLength('🦀🐟')).toBe(2);
  });
});

describe('ReplyEmail', () => {
  it('trims and lower-cases only the domain', () => {
    const result = ReplyEmail.create('  Sardine.President@Bikini-Bottom.GOV ');
    expect(result.ok && result.value.value).toBe('Sardine.President@bikini-bottom.gov');
  });

  it.each(['plain', '@no-local.com', 'no-domain@', 'no-dot@localhost', 'two@@at.com', 'sp ace@x.com', 'a@b..c', 'a@.b.c'])(
    'refuses malformed %j',
    (raw) => {
      expect(ReplyEmail.create(raw)).toEqual({
        ok: false,
        error: { field: 'replyEmail', reason: 'malformed' },
      });
    }
  );

  it('refuses empty after trim', () => {
    expect(ReplyEmail.create('   ')).toEqual({
      ok: false,
      error: { field: 'replyEmail', reason: 'empty' },
    });
  });

  it('refuses control characters', () => {
    expect(ReplyEmail.create(`a${cp(0)}@b.com`)).toEqual({
      ok: false,
      error: { field: 'replyEmail', reason: 'control-character' },
    });
  });

  it('accepts exactly 254 characters and refuses 255', () => {
    const domainOf = (length: number) => `${'d'.repeat(length - 4)}.com`;
    const local = 'l'.repeat(60);
    expect(ReplyEmail.create(`${local}@${domainOf(254 - 61)}`).ok).toBe(true);
    expect(ReplyEmail.create(`${local}@${domainOf(255 - 61)}`)).toEqual({
      ok: false,
      error: { field: 'replyEmail', reason: 'too-long', limit: 254 },
    });
  });

  it('accepts a 64-character local part and refuses 65', () => {
    expect(ReplyEmail.create(`${'l'.repeat(64)}@x.com`).ok).toBe(true);
    expect(ReplyEmail.create(`${'l'.repeat(65)}@x.com`)).toEqual({
      ok: false,
      error: { field: 'replyEmail', reason: 'too-long', limit: 64 },
    });
  });
});

describe('complaintId', () => {
  it('accepts uuid- and nanoid-shaped ids', () => {
    expect(complaintId('0f8fad5b-d9cb-469f-a165-70867728950e').ok).toBe(true);
    expect(complaintId('V1StGXR8_Z5jdHi6B-myT').ok).toBe(true);
  });

  it('refuses empty, over-long and unsafe ids', () => {
    expect(complaintId('')).toEqual({ ok: false, error: { field: 'id', reason: 'empty' } });
    expect(complaintId('a'.repeat(COMPLAINT_ID_MAX_LENGTH)).ok).toBe(true);
    expect(complaintId('a'.repeat(COMPLAINT_ID_MAX_LENGTH + 1))).toEqual({
      ok: false,
      error: { field: 'id', reason: 'too-long', limit: COMPLAINT_ID_MAX_LENGTH },
    });
    expect(complaintId('../etc')).toEqual({ ok: false, error: { field: 'id', reason: 'malformed' } });
  });
});
