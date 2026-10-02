import type { LandmarkNarration } from '@qa3elhamor/content-domain';
import { describe, expect, it } from 'vitest';
import { visitScript } from './visit-script';

const narration: LandmarkNarration = {
  lines: [{ en: 'Welcome.', ar: 'أهلاً.' }, { en: 'Pick one.' }],
  hints: { frontend: { en: 'Signals.', ar: 'إشارات.' } },
  farewell: { en: 'Bye.' },
};

describe('visitScript', () => {
  it("reads the narration's lines, hints and farewell in the visitor's language", () => {
    expect(visitScript(narration, 'en')).toEqual({
      lines: ['Welcome.', 'Pick one.'],
      hints: { frontend: 'Signals.' },
      farewell: 'Bye.',
    });
    expect(visitScript(narration, 'ar')).toEqual({
      lines: ['أهلاً.', 'Pick one.'],
      hints: { frontend: 'إشارات.' },
      farewell: 'Bye.',
    });
  });

  it('takes the comments from the content instead, when the landmark supplies them', () => {
    const script = visitScript(narration, 'en', {
      prio: { en: 'The types are grateful.' },
      freelance: undefined,
    });
    // The narration's own hints are not mixed in; an object without a line has no comment.
    expect(script.hints).toEqual({ prio: 'The types are grateful.' });
    expect(script.lines).toEqual(['Welcome.', 'Pick one.']);
  });

  it('has no hints and no farewell when the narration has none', () => {
    expect(visitScript({ lines: [{ en: 'Hi.' }] }, 'en')).toEqual({
      lines: ['Hi.'],
      hints: {},
      farewell: undefined,
    });
  });
});
