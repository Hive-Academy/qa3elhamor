import { describe, expect, it } from 'vitest';
import { scrollEscape } from './bureau-keys';

const esc = { key: 'Escape', isComposing: false, keyCode: 27 };
const idle = { sending: false, inField: false };

describe('Escape on the unrolled scroll', () => {
  it('belongs to the input method while it composes', () => {
    expect(scrollEscape({ ...esc, isComposing: true }, idle)).toBe('ignore');
    // Some browsers report a composition only by keyCode 229.
    expect(scrollEscape({ ...esc, keyCode: 229 }, idle)).toBe('ignore');
    expect(scrollEscape({ ...esc, key: 'Enter' }, idle)).toBe('ignore');
  });

  it('first leaves the field (closing a datalist or select popup), never the text', () => {
    expect(scrollEscape(esc, { sending: false, inField: true })).toBe(
      'leave-field',
    );
  });

  it('then rolls the scroll back, the draft kept by the host', () => {
    expect(scrollEscape(esc, idle)).toBe('roll-back');
  });

  it('does nothing while the complaint travels, and keeps the Bureau open', () => {
    expect(scrollEscape(esc, { sending: true, inField: true })).toBe('swallow');
    expect(scrollEscape(esc, { sending: true, inField: false })).toBe(
      'swallow',
    );
  });
});
