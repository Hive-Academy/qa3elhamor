import type { Locale } from '@qa3elhamor/content-domain';

/** Code points of body shown on a pinned note before "Read more". */
export const EXCERPT_LENGTH = 140;

/**
 * The start of a complaint for its note: whole code points (an emoji is never cut in half), cut
 * at the last space when there is one near the end, with an ellipsis. `cut` says whether
 * anything was left out, so the note offers "Read more".
 */
export function excerptOf(
  text: string,
  length: number = EXCERPT_LENGTH,
): { readonly text: string; readonly cut: boolean } {
  const points = [...text];
  if (points.length <= length) return { text, cut: false };
  const head = points.slice(0, length).join('');
  const space = head.search(/\s\S*$/u);
  const trimmed = space > length * 0.6 ? head.slice(0, space) : head;
  return { text: `${trimmed.trimEnd()}…`, cut: true };
}

/** The day a complaint was filed, in the page's language; `null` for an unreadable instant. */
export function noteDate(iso: string, lang: Locale): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', {
    dateStyle: 'medium',
  }).format(date);
}
