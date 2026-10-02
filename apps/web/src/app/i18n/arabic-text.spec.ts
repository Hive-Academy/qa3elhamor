import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { textProps } from '../overlays/overlay-copy';

const css = (path: string): string => readFileSync(resolve(import.meta.dirname, path), 'utf8');

describe('textProps: English shown in place of a missing translation is marked English', () => {
  it('marks a missing or blank translation, in Arabic only', () => {
    expect(textProps({ en: 'Only English' }, 'ar')).toEqual({ lang: 'en', dir: 'ltr' });
    expect(textProps({ en: 'Only English', ar: '  ' }, 'ar')).toEqual({ lang: 'en', dir: 'ltr' });
    expect(textProps({ en: 'Only English' }, 'en')).toEqual({});
  });

  it('leaves a real translation (even one spelt like the English) to the page', () => {
    expect(textProps({ en: 'Hi', ar: 'أهلًا' }, 'ar')).toEqual({});
    expect(textProps({ en: 'بقينا في القاع', ar: 'بقينا في القاع' }, 'ar')).toEqual({});
  });
});

/*
 * jsdom does not shape text, so these pin the CSS that keeps Arabic cursive (seen broken in the
 * visual review: letter-spaced, unjoined Arabic in the complaint fields).
 */
describe('Arabic stays joined', () => {
  it('never tracks Arabic text', () => {
    expect(css('../../styles.css')).toMatch(/:lang\(ar\)\s*\{\s*letter-spacing:\s*normal !important;/u);
  });

  it('gives the complaint fields a joining Arabic face ahead of Courier New, and drops it in Arabic', () => {
    const scroll = css('../overlays/complaint-scroll/complaint-scroll.css');
    expect(scroll).toMatch(/font-family: 'IBM Plex Sans Arabic', 'Courier New'/u);
    expect(scroll).toMatch(/\.complaint-scroll:lang\(ar\) textarea \{\s*font-family: var\(--font-paper\);/u);
  });

  it('puts the Arabic face first in every Courier New stack', () => {
    for (const path of [
      '../overlays/complaint-scroll/complaint-scroll.css',
      '../overlays/citizenship-card/citizenship-card.css',
      '../overlays/citizenship-card/citizenship-card-in-world.css',
    ]) {
      expect(css(path)).not.toMatch(/font-family: 'Courier New'/u);
    }
  });
});
