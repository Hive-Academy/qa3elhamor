import type { ServiceItem, SiteCopy } from '@qa3elhamor/content-domain';
import type { LandmarkOverlayProps } from '@qa3elhamor/landmarks-ui';
import type { ComponentType } from 'react';
import { toContentLocale } from '../overlays/overlay-copy';
import { pageText } from '../page-view/page-copy';
import { PAGE_SECTION_IDS } from '../page-view/page-parts';
import { ServicesSection } from '../page-view/work-sections';
import '../page-view/page-view.css';
import './services-menu.css';

/** The content the full menu is rendered from, bound where it is registered. */
export interface ServicesMenuContent {
  readonly services: readonly ServiceItem[];
  readonly copy: SiteCopy;
}

/**
 * The Krusty Krab's full menu: every service with its dish name, description, price and tags.
 * It is the page view's Services section (`page-view/work-sections.tsx`), so the dive, its
 * fallback dialog and the page never disagree. `in-world`: a paper menu that scrolls inside
 * itself, for the narrated visit's "See the full menu"; `dialog`: flat, inside the overlay
 * host's paper.
 */
export function ServicesMenu({
  services,
  copy,
  locale,
  dir,
  variant,
}: ServicesMenuContent & {
  readonly locale: string;
  readonly dir: 'ltr' | 'rtl';
  readonly variant: 'in-world' | 'dialog';
}) {
  const lang = toContentLocale(locale);
  return (
    <article
      className={`krusty-menu krusty-menu--${variant}`}
      dir={dir}
      lang={lang}
      tabIndex={-1}
      aria-labelledby={`${PAGE_SECTION_IDS.services}-title`}
    >
      <ServicesSection
        services={services}
        copy={copy}
        t={pageText(lang)}
        lang={lang}
      />
    </article>
  );
}

/**
 * The Krusty Krab's dialog overlay: the full menu. It is the landmark's fallback where the
 * narrated visit is off (reduced motion, the low tier, no WebGL).
 */
export function createServicesMenuOverlay(
  content: ServicesMenuContent,
): ComponentType<LandmarkOverlayProps> {
  function ServicesMenuOverlay({ locale, dir }: LandmarkOverlayProps) {
    return (
      <ServicesMenu {...content} locale={locale} dir={dir} variant="dialog" />
    );
  }
  return ServicesMenuOverlay;
}
