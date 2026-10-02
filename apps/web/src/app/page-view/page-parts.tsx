import {
  localize,
  type Locale,
  type LocalizedText,
  type Period,
} from '@qa3elhamor/content-domain';
import type { ReactNode } from 'react';
import { textProps } from '../overlays/overlay-copy';
import type { PageText } from './page-copy';

/** What every page section renders with: the page's copy and the content locale. */
export interface PagePartProps {
  readonly t: PageText;
  readonly lang: Locale;
}

/** The page's section ids, also the targets of the section nav. */
export const PAGE_SECTION_IDS = {
  about: 'page-about',
  experience: 'page-experience',
  projects: 'page-projects',
  services: 'page-services',
  contact: 'page-contact',
  wall: 'page-wall',
  narration: 'page-narration',
  credits: 'page-credits',
} as const;

export type PageSectionKey = keyof typeof PAGE_SECTION_IDS;

/** A titled region of the page: `<section>` named by its `<h2>`, with an optional playful kicker. */
export function PageSection({
  section,
  title,
  kicker,
  children,
}: {
  readonly section: PageSectionKey;
  readonly title: string;
  readonly kicker?: string;
  readonly children: ReactNode;
}) {
  const id = PAGE_SECTION_IDS[section];
  return (
    <section id={id} className="page-section" aria-labelledby={`${id}-title`}>
      <header className="page-section__header">
        <h2 id={`${id}-title`} className="page-section__title">
          {title}
        </h2>
        {kicker && (
          <p className="page-section__kicker" dir="auto">
            {kicker}
          </p>
        )}
      </header>
      {children}
    </section>
  );
}

/**
 * A link that leaves the site: new tab, no opener, and says so to assistive technology.
 * `mailto:` links open the mail client in place instead.
 */
export function OutboundLink({
  href,
  t,
  className,
  children,
}: {
  readonly href: string;
  readonly t: PageText;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  if (href.startsWith('mailto:')) {
    return (
      <a className={className} href={href} dir="auto">
        {children}
      </a>
    );
  }
  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      dir="auto"
    >
      {children}
      <span className="page-view__visually-hidden"> {t('newTab')}</span>
    </a>
  );
}

/** Technology or tag names: data, not prose, so each is isolated from the text direction. */
export function TagList({
  label,
  items,
}: {
  readonly label: string;
  readonly items: readonly string[];
}) {
  if (items.length === 0) return null;
  return (
    <ul className="page-tags" aria-label={label}>
      {items.map((item) => (
        <li key={item} className="page-tags__item">
          <bdi>{item}</bdi>
        </li>
      ))}
    </ul>
  );
}

const monthFormat = new Map<Locale, Intl.DateTimeFormat>();

const YEAR_MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/u;

/**
 * `2020-01` as "Jan 2020" in the content locale. The content parser already validates
 * `YYYY-MM`, but a page must never print "Invalid Date": anything else is shown as written.
 */
export function formatYearMonth(yearMonth: string, lang: Locale): string {
  const match = YEAR_MONTH.exec(yearMonth);
  if (!match) return yearMonth;
  let format = monthFormat.get(lang);
  if (!format) {
    format = new Intl.DateTimeFormat(lang, {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    monthFormat.set(lang, format);
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return Number.isNaN(date.getTime()) ? yearMonth : format.format(date);
}

/** A period as two machine-readable dates; an open end reads "Present". */
export function PeriodRange({
  period,
  t,
  lang,
}: PagePartProps & { readonly period: Period }) {
  return (
    <span className="page-period">
      <time dateTime={period.start}>{formatYearMonth(period.start, lang)}</time>
      {' – '}
      {period.end ? (
        <time dateTime={period.end}>{formatYearMonth(period.end, lang)}</time>
      ) : (
        t('present')
      )}
    </span>
  );
}

/** Highlights as a plain bullet list; nothing when there are none. */
export function Highlights({
  items,
  lang,
}: {
  readonly items: readonly LocalizedText[];
  readonly lang: Locale;
}) {
  if (items.length === 0) return null;
  // A list left wholly untranslated is one English list (its bullets on the English side), not
  // English items hanging in an Arabic list.
  const wholeList = items.every((item) => textProps(item, lang).lang !== undefined);
  return (
    <ul className="page-highlights" {...(wholeList ? textProps(items[0], lang) : {})}>
      {items.map((item, index) => (
        // Highlights have no id of their own; their order is their identity.
        <li key={index} {...(wholeList ? {} : textProps(item, lang))}>
          {localize(item, lang)}
        </li>
      ))}
    </ul>
  );
}
