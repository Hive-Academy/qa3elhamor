import { err, ok, type Result } from '@qa3elhamor/shared-domain';
import type { ComplaintField, FieldIssue } from './complaint-errors.js';

/**
 * Normalisation and validation for user-authored complaint text.
 *
 * The domain is the first line of defence for public UGC, so it refuses what should never be
 * stored. It does NOT HTML-escape: text is kept as the visitor wrote it and escaping happens
 * at render time, where the output context is known.
 */
export interface TextRule {
  readonly field: ComplaintField;
  /** Maximum length in Unicode code points, measured after normalisation. */
  readonly maxLength: number;
  /** Multi-line text keeps single and double line breaks; single-line text folds them. */
  readonly multiline: boolean;
}

/**
 * C0 controls other than tab/LF/CR, DEL and C1 controls, plus the bidi embedding, override
 * and isolate characters, which can make stored text render in a different order from the
 * order it is read in.
 */
const isForbiddenCodePoint = (codePoint: number): boolean =>
  (codePoint <= 0x1f && codePoint !== 0x09 && codePoint !== 0x0a && codePoint !== 0x0d) ||
  (codePoint >= 0x7f && codePoint <= 0x9f) ||
  (codePoint >= 0x202a && codePoint <= 0x202e) ||
  (codePoint >= 0x2066 && codePoint <= 0x2069);

export const containsForbiddenCharacter = (text: string): boolean => {
  for (const char of text) {
    if (isForbiddenCodePoint(char.codePointAt(0) ?? 0)) return true;
  }
  return false;
};

// Built from code points so the source stays ASCII: a literal U+2028 inside a regex literal
// terminates it in some parsers.
const LINE_SEPARATOR = String.fromCodePoint(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCodePoint(0x2029);

/** Length in code points, so an emoji counts once rather than as two UTF-16 units. */
export const codePointLength = (text: string): number => [...text].length;

/**
 * NFC-normalises, then trims and collapses whitespace. Single-line text becomes one line with
 * single spaces. Multi-line text keeps line structure: CRLF/CR and Unicode line separators
 * become LF, each line is trimmed and collapsed, and runs of blank lines shrink to one.
 */
export const normaliseText = (raw: string, multiline: boolean): string => {
  const text = raw.normalize('NFC');
  if (!multiline) return text.replace(/\s+/gu, ' ').trim();
  return text
    .replace(/\r\n?/gu, '\n')
    .split(LINE_SEPARATOR)
    .join('\n')
    .split(PARAGRAPH_SEPARATOR)
    .join('\n')
    .split('\n')
    .map((line) => line.replace(/\s+/gu, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
};

/** Normalises `raw` and checks it against `rule`, returning the normalised text. */
export const validateText = (raw: string, rule: TextRule): Result<string, FieldIssue> => {
  if (containsForbiddenCharacter(raw)) {
    return err({ field: rule.field, reason: 'control-character' });
  }
  const text = normaliseText(raw, rule.multiline);
  if (text.length === 0) return err({ field: rule.field, reason: 'empty' });
  if (codePointLength(text) > rule.maxLength) {
    return err({ field: rule.field, reason: 'too-long', limit: rule.maxLength });
  }
  return ok(text);
};
