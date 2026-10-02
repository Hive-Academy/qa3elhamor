import {
  localize,
  type ProjectItem,
  type ProjectLink,
  type ResumeEntry,
  type ServiceItem,
  type SiteCopy,
} from '@qa3elhamor/content-domain';
import { copyReader, textProps } from '../overlays/overlay-copy';
import { resolveAvatarSrc } from '../overlays/citizenship-card';
import type { PageViewCopyKey } from './page-copy';
import {
  Highlights,
  OutboundLink,
  PageSection,
  PeriodRange,
  TagList,
  type PagePartProps,
} from './page-parts';

/** Experience: every resume entry, newest first as the content lists it. */
export function ExperienceSection({
  entries,
  copy,
  t,
  lang,
}: PagePartProps & {
  readonly entries: readonly ResumeEntry[];
  readonly copy: SiteCopy;
}) {
  if (entries.length === 0) return null;
  return (
    <PageSection
      section="experience"
      title={t('experience')}
      kicker={copyReader(copy, lang)('resumeTitle')}
    >
      <ol className="page-list">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="page-entry"
            data-testid="page-resume-entry"
          >
            <article aria-labelledby={`page-resume-${entry.id}`}>
              <header className="page-entry__header">
                <h3
                  id={`page-resume-${entry.id}`}
                  className="page-entry__title"
                  {...textProps(entry.role, lang)}
                >
                  {localize(entry.role, lang)}
                </h3>
                <p className="page-entry__meta">
                  {entry.companyUrl ? (
                    <OutboundLink
                      href={entry.companyUrl}
                      t={t}
                      className="page-entry__org"
                    >
                      {localize(entry.company, lang)}
                    </OutboundLink>
                  ) : (
                    <span className="page-entry__org" {...textProps(entry.company, lang)}>
                      {localize(entry.company, lang)}
                    </span>
                  )}
                  {entry.location && (
                    <>
                      <span aria-hidden="true"> · </span>
                      <span {...textProps(entry.location, lang)}>{localize(entry.location, lang)}</span>
                    </>
                  )}
                  <span aria-hidden="true"> · </span>
                  <PeriodRange period={entry.period} t={t} lang={lang} />
                </p>
              </header>
              {entry.summary && (
                <p {...textProps(entry.summary, lang)}>{localize(entry.summary, lang)}</p>
              )}
              <Highlights items={entry.highlights} lang={lang} />
              <TagList label={t('tech')} items={entry.tech} />
              {entry.quip && (
                <p className="page-entry__quip">
                  <span className="page-entry__quip-label">
                    {t('review')}:{' '}
                  </span>
                  <q {...textProps(entry.quip, lang)}>{localize(entry.quip, lang)}</q>
                </p>
              )}
            </article>
          </li>
        ))}
      </ol>
    </PageSection>
  );
}

const PROJECT_LINK_LABELS: Readonly<
  Record<ProjectLink['kind'], PageViewCopyKey>
> = {
  repo: 'linkRepo',
  live: 'linkLive',
  'case-study': 'linkCaseStudy',
};

/** Projects in display order, with every link, highlight and the media when there is some. */
export function ProjectsSection({
  projects,
  baseUrl,
  t,
  lang,
}: PagePartProps & {
  readonly projects: readonly ProjectItem[];
  readonly baseUrl: string;
}) {
  if (projects.length === 0) return null;
  return (
    <PageSection section="projects" title={t('projects')}>
      <ul className="page-list page-list--cards">
        {projects.map((project) => (
          <li
            key={project.id}
            className="page-entry page-entry--card"
            data-testid="page-project"
          >
            <article aria-labelledby={`page-project-${project.id}`}>
              {project.media && (
                <img
                  className="page-entry__media"
                  src={resolveAvatarSrc(project.media.src, baseUrl)}
                  alt={localize(project.media.alt, lang)}
                  loading="lazy"
                  decoding="async"
                />
              )}
              <header className="page-entry__header">
                <h3
                  id={`page-project-${project.id}`}
                  className="page-entry__title"
                  {...textProps(project.title, lang)}
                >
                  {localize(project.title, lang)}
                </h3>
                {(project.role || project.period) && (
                  <p className="page-entry__meta">
                    {project.role && (
                      <span dir="auto">
                        <span className="page-view__visually-hidden">
                          {t('role')}:{' '}
                        </span>
                        {localize(project.role, lang)}
                      </span>
                    )}
                    {project.role && project.period && (
                      <span aria-hidden="true"> · </span>
                    )}
                    {project.period && (
                      <PeriodRange period={project.period} t={t} lang={lang} />
                    )}
                  </p>
                )}
              </header>
              <p className="page-entry__lead" {...textProps(project.summary, lang)}>
                {localize(project.summary, lang)}
              </p>
              {project.description && (
                <p {...textProps(project.description, lang)}>{localize(project.description, lang)}</p>
              )}
              <Highlights items={project.highlights} lang={lang} />
              <TagList label={t('tech')} items={project.tech} />
              {project.links.length > 0 && (
                <ul className="page-links">
                  {project.links.map((link) => (
                    <li key={link.url}>
                      <OutboundLink href={link.url} t={t} className="page-link">
                        {link.label
                          ? localize(link.label, lang)
                          : t(PROJECT_LINK_LABELS[link.kind])}
                      </OutboundLink>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </li>
        ))}
      </ul>
    </PageSection>
  );
}

/** The services menu: the real service name first, the in-world dish and price beside it. */
export function ServicesSection({
  services,
  copy,
  t,
  lang,
}: PagePartProps & {
  readonly services: readonly ServiceItem[];
  readonly copy: SiteCopy;
}) {
  if (services.length === 0) return null;
  return (
    <PageSection
      section="services"
      title={t('services')}
      kicker={copyReader(copy, lang)('servicesTitle')}
    >
      <ul className="page-list page-list--menu">
        {services.map((service) => (
          <li
            key={service.id}
            className="page-entry page-entry--menu"
            data-testid="page-service"
          >
            <article aria-labelledby={`page-service-${service.id}`}>
              <header className="page-entry__header">
                <p className="page-entry__eyebrow" {...textProps(service.menuName, lang)}>
                  {localize(service.menuName, lang)}
                </p>
                <h3
                  id={`page-service-${service.id}`}
                  className="page-entry__title"
                  {...textProps(service.title, lang)}
                >
                  {localize(service.title, lang)}
                </h3>
              </header>
              <p {...textProps(service.description, lang)}>{localize(service.description, lang)}</p>
              {service.price && (
                <p className="page-entry__price">
                  <span className="page-view__visually-hidden">
                    {t('price')}:{' '}
                  </span>
                  <span {...textProps(service.price, lang)}>{localize(service.price, lang)}</span>
                </p>
              )}
              <TagList label={t('tags')} items={service.tags} />
            </article>
          </li>
        ))}
      </ul>
    </PageSection>
  );
}
