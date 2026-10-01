import type { ShippedCredit } from '@qa3elhamor/world-domain';

/** Width in pixels of `text` drawn in the CSS `font`. `ctx.measureText` in production. */
export type MeasureText = (text: string, font: string) => number;

/** Pixel geometry of the notice texture. The plaque's face has the same aspect ratio. */
export const NOTICE = {
  width: 2048,
  height: 1366,
  padding: 96,
  /** Space taken by the masthead (municipal header and rule) above the credits. */
  mastheadHeight: 250,
  /** Space kept for the footer line pointing at the page's Credits link. */
  footerHeight: 90,
  entryGap: 26,
  maxBodyPx: 40,
  minBodyPx: 14,
} as const;

export const NOTICE_FONT_FAMILY = "system-ui, -apple-system, 'Segoe UI', sans-serif";

export const bodyFont = (px: number): string => `${px}px ${NOTICE_FONT_FAMILY}`;
export const headingFont = (px: number): string => `700 ${px}px ${NOTICE_FONT_FAMILY}`;

export interface NoticeEntry {
  readonly credit: ShippedCredit;
  /** The model's title, drawn above its credit. */
  readonly heading: string;
  /** `credit.line`, word-wrapped. `lines.join(' ')` is `credit.line` exactly. */
  readonly lines: readonly string[];
}

export interface NoticeLayout {
  readonly bodyPx: number;
  readonly headingPx: number;
  readonly lineHeight: number;
  readonly entries: readonly NoticeEntry[];
}

/**
 * Greedy word wrap on single spaces. A word wider than `maxWidth` keeps a line to itself
 * rather than being broken, so `join(' ')` always restores the input.
 */
export function wrapWords(
  text: string,
  maxWidth: number,
  font: string,
  measure: MeasureText,
): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(' ')) {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (current !== '' && measure(candidate, font) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  lines.push(current);
  return lines;
}

const headingPxFor = (bodyPx: number): number => Math.round(bodyPx * 1.15);
const lineHeightFor = (bodyPx: number): number => Math.round(bodyPx * 1.35);

/**
 * Lays the credits out on the notice at the largest body size, from `maxBodyPx` down, where
 * every word fits the column (the long Sketchfab URLs decide this) and every entry fits the
 * board. Past `minBodyPx` it returns the minimum layout anyway: an overfull notice still
 * carries every credit, and the DOM list remains the complete, linked record.
 */
export function layoutNotice(
  credits: readonly ShippedCredit[],
  measure: MeasureText,
): NoticeLayout {
  const columnWidth = NOTICE.width - 2 * NOTICE.padding;
  const available =
    NOTICE.height - NOTICE.mastheadHeight - NOTICE.footerHeight - NOTICE.padding;

  const layoutAt = (bodyPx: number) => {
    const font = bodyFont(bodyPx);
    const headingPx = headingPxFor(bodyPx);
    const lineHeight = lineHeightFor(bodyPx);
    const entries = credits.map((credit) => ({
      credit,
      heading: credit.attribution.title,
      lines: wrapWords(credit.line, columnWidth, font, measure),
    }));
    const height = entries.reduce(
      (sum, entry) =>
        sum + Math.round(headingPx * 1.3) + entry.lines.length * lineHeight + NOTICE.entryGap,
      0,
    );
    const widest = Math.max(
      0,
      ...entries.flatMap((entry) => entry.lines.map((line) => measure(line, font))),
    );
    return {
      layout: { bodyPx, headingPx, lineHeight, entries },
      fits: height <= available && widest <= columnWidth,
    };
  };

  for (let px = NOTICE.maxBodyPx; px > NOTICE.minBodyPx; px -= 1) {
    const attempt = layoutAt(px);
    if (attempt.fits) return attempt.layout;
  }
  return layoutAt(NOTICE.minBodyPx).layout;
}
