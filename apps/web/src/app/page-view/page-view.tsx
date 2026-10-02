import { localize, type Locale } from '@qa3elhamor/content-domain';
import { useCallback, useEffect, useRef, type MouseEvent } from 'react';
import type { CreditsSource } from '../credits';
import { LanguageToggle } from '../i18n/language-toggle';
import { copyReader, textProps } from '../overlays/overlay-copy';
import { pageText, type PageText, type PageViewCopyKey } from './page-copy';
import type { PageContent } from './page-content';
import { PAGE_SECTION_IDS, type PageSectionKey } from './page-parts';
import type { PageReason } from './presentation';
import {
  AboutSection,
  ContactSection,
  CreditsSection,
  NarrationSection,
} from './site-sections';
import {
  ExperienceSection,
  ProjectsSection,
  ServicesSection,
} from './work-sections';
import './page-view.css';

export interface PageViewProps {
  readonly content: PageContent;
  /** Why the page is showing; picks the notice and the way back to the dive. */
  readonly reason: PageReason;
  /** `same document, ?view= removed`: where "Back to the dive" and "Try the dive again" go. */
  readonly diveHref: string;
  /** Switches to the dive in place; without it the link navigates (a full reload). */
  readonly onReturnToDive?: () => void;
  /** Move focus to the page's heading on mount: the visitor just switched views. */
  readonly focusOnMount?: boolean;
  readonly locale?: Locale;
  /** Vite's deploy base, for site-relative image paths. */
  readonly baseUrl?: string;
  /** The CC-BY model credits; the asset manifest by default. */
  readonly modelCredits?: CreditsSource;
}

const NOTICES: Readonly<Record<PageReason, PageViewCopyKey>> = {
  requested: 'noticeRequested',
  'no-webgl': 'noticeNoWebgl',
  'dive-failed': 'noticeFailed',
};

/** A plain click: modified clicks (new tab, new window) keep the link's own navigation. */
const isPlainClick = (event: MouseEvent<HTMLAnchorElement>) =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey;

/** The way back to the dive, or nothing when this browser has no dive to go back to. */
function DiveLink({
  reason,
  href,
  onReturn,
  t,
}: {
  readonly reason: PageReason;
  readonly href: string;
  readonly onReturn?: () => void;
  readonly t: PageText;
}) {
  if (reason === 'no-webgl') return null;
  // A dive that broke is retried with a fresh document, not remounted on the broken context.
  if (reason === 'dive-failed') {
    return (
      <a className="page-view__dive-link" href={href}>
        {t('retryDive')}
      </a>
    );
  }
  return (
    <a
      className="page-view__dive-link"
      href={href}
      onClick={(event) => {
        if (!onReturn || !isPlainClick(event)) return;
        event.preventDefault();
        onReturn();
      }}
    >
      {t('backToDive')}
    </a>
  );
}

/**
 * The whole site as one readable page: the alternative to the dive for visitors without WebGL,
 * on hardware that cannot hold the scene, or who simply prefer to read. Every piece of content
 * the dive carries is here, in the same words, from the same content module.
 */
export function PageView({
  content,
  reason,
  diveHref,
  onReturnToDive,
  focusOnMount = false,
  locale = 'en',
  baseUrl = import.meta.env.BASE_URL,
  modelCredits,
}: PageViewProps) {
  const t = pageText(locale);
  const lang = locale;
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const site = copyReader(content.copy, lang);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
  }, [focusOnMount]);

  const toTop = useCallback(() => {
    window.scrollTo(0, 0);
    headingRef.current?.focus();
  }, []);

  const sections: readonly {
    key: PageSectionKey;
    label: string;
    present: boolean;
  }[] = [
    { key: 'about', label: t('about'), present: true },
    {
      key: 'experience',
      label: t('experience'),
      present: content.resume.length > 0,
    },
    {
      key: 'projects',
      label: t('projects'),
      present: content.projects.length > 0,
    },
    {
      key: 'services',
      label: t('services'),
      present: content.services.length > 0,
    },
    { key: 'contact', label: t('contact'), present: true },
    {
      key: 'narration',
      label: t('narration'),
      present: content.narration.length > 0,
    },
    { key: 'credits', label: t('credits'), present: true },
  ];
  const parts = { t, lang };

  return (
    <div className="page-view" lang={lang} dir={dir}>
      <a className="page-view__skip" href="#page-main">
        {t('skipToContent')}
      </a>

      <header id="page-top" className="page-view__masthead">
        <div className="page-view__masthead-inner">
          <div className="page-view__topline">
            <p className="page-view__place">
              {/* The district's own name, always Arabic: isolated from the page direction. */}
              <bdi lang="ar" dir="rtl">
                قاع الهامور
              </bdi>
            </p>
            <LanguageToggle placement="inline" />
          </div>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="page-view__name"
            {...textProps(content.profile.name, lang)}
          >
            {localize(content.profile.name, lang)}
          </h1>
          <p className="page-view__headline" {...textProps(content.profile.headline, lang)}>
            {localize(content.profile.headline, lang)}
          </p>
          <p className="page-view__description" dir="auto">
            {site('siteDescription')}
          </p>
          <div className="page-view__notice" data-reason={reason}>
            <p>{t(NOTICES[reason])}</p>
            <DiveLink
              reason={reason}
              href={diveHref}
              onReturn={onReturnToDive}
              t={t}
            />
          </div>
        </div>
        <nav className="page-view__nav" aria-label={t('sectionsLabel')}>
          <ul>
            {sections
              .filter((section) => section.present)
              .map((section) => (
                <li key={section.key}>
                  <a href={`#${PAGE_SECTION_IDS[section.key]}`}>
                    {section.label}
                  </a>
                </li>
              ))}
          </ul>
        </nav>
      </header>

      <main id="page-main" className="page-view__main" tabIndex={-1}>
        <AboutSection
          profile={content.profile}
          copy={content.copy}
          baseUrl={baseUrl}
          {...parts}
        />
        <ExperienceSection
          entries={content.resume}
          copy={content.copy}
          {...parts}
        />
        <ProjectsSection
          projects={content.projects}
          baseUrl={baseUrl}
          {...parts}
        />
        <ServicesSection
          services={content.services}
          copy={content.copy}
          {...parts}
        />
        <ContactSection
          copy={content.copy}
          submitter={content.submitter}
          onDone={toTop}
          {...parts}
        />
        <NarrationSection
          stops={content.narration}
          profile={content.profile}
          {...parts}
        />
        <CreditsSection
          credits={content.credits}
          copy={content.copy}
          modelCredits={modelCredits}
          {...parts}
        />
      </main>

      <footer className="page-view__footer">
        <a
          href="#page-top"
          onClick={(event) => {
            if (!isPlainClick(event)) return;
            event.preventDefault();
            toTop();
          }}
        >
          {t('backToTop')}
        </a>
        <DiveLink
          reason={reason}
          href={diveHref}
          onReturn={onReturnToDive}
          t={t}
        />
      </footer>
    </div>
  );
}
