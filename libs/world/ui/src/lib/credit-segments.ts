import type { ShippedCredit } from '@qa3elhamor/world-domain';

export type CreditSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'link'; readonly text: string; readonly href: string };

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Splits a credit's licence line into plain text and links, without restating its format:
 * every occurrence of one of the attribution's URLs becomes a link to itself. Joining the
 * segments' text gives back `credit.line` exactly, so the rendered credit cannot drift from
 * `creditLine()`.
 */
export function creditSegments(credit: ShippedCredit): readonly CreditSegment[] {
  const { sourceUrl, authorUrl, licenseUrl } = credit.attribution;
  const urls = [...new Set([sourceUrl, authorUrl, licenseUrl])]
    // Longest first, so a URL that prefixes another cannot split it.
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);
  const pattern = new RegExp(`(${urls.join('|')})`);

  // With one capture group, `split` alternates text (even) and matched URL (odd).
  return credit.line
    .split(pattern)
    .map((text, index): CreditSegment | null =>
      text === ''
        ? null
        : index % 2 === 1
          ? { kind: 'link', text, href: text }
          : { kind: 'text', text },
    )
    .filter((segment): segment is CreditSegment => segment !== null);
}
