import type { ResumeEntry, SiteCopy } from '@qa3elhamor/content-domain';
import type { LandmarkOverlayProps } from '@qa3elhamor/landmarks-ui';
import type { ComponentType } from 'react';
import { toContentLocale } from '../overlays/overlay-copy';
import { pageText } from '../page-view/page-copy';
import { PAGE_SECTION_IDS } from '../page-view/page-parts';
import { ExperienceSection } from '../page-view/work-sections';
import '../page-view/page-view.css';
import './experience-record.css';

/** The content the full record is rendered from, bound where it is registered. */
export interface ExperienceRecordContent {
  /** Newest first, as the content lists them. */
  readonly entries: readonly ResumeEntry[];
  readonly copy: SiteCopy;
}

/**
 * The Tiki's full record: every job with its highlights, tech and performance review. It is the
 * page view's Experience section (`page-view/work-sections.tsx`), so the dive, its fallback
 * dialog and the page never disagree. `in-world`: a paper slab that scrolls inside itself, for
 * the narrated visit's "Read the full record"; `dialog`: flat, inside the overlay host's paper.
 */
export function ExperienceRecord({
  entries,
  copy,
  locale,
  dir,
  variant,
}: ExperienceRecordContent & {
  readonly locale: string;
  readonly dir: 'ltr' | 'rtl';
  readonly variant: 'in-world' | 'dialog';
}) {
  const lang = toContentLocale(locale);
  return (
    <article
      className={`tiki-record tiki-record--${variant}`}
      dir={dir}
      lang={lang}
      tabIndex={-1}
      aria-labelledby={`${PAGE_SECTION_IDS.experience}-title`}
    >
      <ExperienceSection
        entries={entries}
        copy={copy}
        t={pageText(lang)}
        lang={lang}
      />
    </article>
  );
}

/**
 * The Tiki's dialog overlay: the full record. It is the landmark's fallback where the narrated
 * visit is off (reduced motion, the low tier, no WebGL).
 */
export function createExperienceRecordOverlay(
  content: ExperienceRecordContent,
): ComponentType<LandmarkOverlayProps> {
  function ExperienceRecordOverlay({ locale, dir }: LandmarkOverlayProps) {
    return (
      <ExperienceRecord {...content} locale={locale} dir={dir} variant="dialog" />
    );
  }
  return ExperienceRecordOverlay;
}
