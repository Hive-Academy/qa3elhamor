const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['week', 7 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
];

/** Shown instead of a time the server sent in a shape `Date` cannot read. */
export const UNKNOWN_TIME = 'unknown time';

/** `null` for an unparseable string, so no formatter ever sees an invalid date. */
const parse = (iso: string): Date | null => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** "5 minutes ago", "yesterday", "just now". */
export const formatRelative = (iso: string, now: Date = new Date()): string => {
  const date = parse(iso);
  if (date === null) return UNKNOWN_TIME;
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return 'just now';
};

/** Absolute local time, e.g. "1 Oct 2026, 14:05". */
export const formatAbsolute = (iso: string): string => {
  const date = parse(iso);
  if (date === null) return UNKNOWN_TIME;
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};
