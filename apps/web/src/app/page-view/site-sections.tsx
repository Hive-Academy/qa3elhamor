import {
  localize,
  type Credit,
  type SiteCopy,
  type SiteProfile,
} from '@qa3elhamor/content-domain';
import { useId } from 'react';
import { SiteCreditsList, type CreditsSource } from '../credits';
import {
  CitizenBio,
  CitizenCardBand,
  CitizenIdentity,
  CitizenLinks,
  CitizenStamps,
} from '../overlays/citizenship-card/citizenship-card';
import {
  ComplaintScroll,
  type ComplaintSubmitter,
} from '../overlays/complaint-scroll';
import { copyReader, textProps } from '../overlays/overlay-copy';
import type { NarrationStop } from './page-content';
import { OutboundLink, PageSection, type PagePartProps } from './page-parts';

/** About: the Citizenship Card itself, the same parts the dive's card is built from. */
export function AboutSection({
  profile,
  copy,
  baseUrl,
  t,
  lang,
}: PagePartProps & {
  readonly profile: SiteProfile;
  readonly copy: SiteCopy;
  readonly baseUrl: string;
}) {
  const ids = useId();
  const parts = { profile, t: copyReader(copy, lang), lang };
  return (
    <PageSection section="about" title={t('about')}>
      <article
        className="citizen-card page-card"
        aria-labelledby={`${ids}-card`}
      >
        <CitizenCardBand t={parts.t} headingId={`${ids}-card`} />
        <CitizenIdentity {...parts} baseUrl={baseUrl} />
        <CitizenLinks {...parts} id={ids} />
        <CitizenBio {...parts} id={ids} />
        <CitizenStamps {...parts} id={ids} />
      </article>
    </PageSection>
  );
}

/**
 * Contact: the Bureau's complaint scroll, sent through the same injected submitter as the dive's.
 * Its "close" after a stamped complaint returns the visitor to the top of the page.
 */
export function ContactSection({
  copy,
  submitter,
  onDone,
  t,
  lang,
}: PagePartProps & {
  readonly copy: SiteCopy;
  readonly submitter: ComplaintSubmitter;
  readonly onDone: () => void;
}) {
  return (
    <PageSection section="contact" title={t('contact')}>
      <div className="page-scroll">
        <ComplaintScroll
          landmarkId="bureau"
          title={copyReader(copy, lang)('contactTitle')}
          locale={lang}
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
          onClose={onDone}
          copy={copy}
          submitter={submitter}
        />
      </div>
    </PageSection>
  );
}

/** What the narrators say at each landmark: lines, remarks about what is there, the farewell. */
export function NarrationSection({
  stops,
  profile,
  t,
  lang,
}: PagePartProps & {
  readonly stops: readonly NarrationStop[];
  readonly profile: SiteProfile;
}) {
  if (stops.length === 0) return null;
  // Hints at the pineapple are keyed by skill group id; name them as the card does.
  const topic = (id: string): string => {
    const group = profile.skills.find((g) => g.id === id);
    return group ? localize(group.label, lang) : id;
  };
  return (
    <PageSection
      section="narration"
      title={t('narration')}
      kicker={t('narrationIntro')}
    >
      <div className="page-list">
        {stops.map(({ id, label, narration }) => {
          const hints = Object.entries(narration.hints ?? {});
          return (
            <article
              key={id}
              className="page-entry page-entry--narration"
              aria-labelledby={`page-narration-${id}`}
              data-testid="page-narration-stop"
            >
              <h3
                id={`page-narration-${id}`}
                className="page-entry__title"
                {...textProps(label, lang)}
              >
                {localize(label, lang)}
              </h3>
              <div className="page-narration__lines">
                {narration.lines.map((line, index) => (
                  // Lines have no id; their order is the dialogue.
                  <p key={index} {...textProps(line, lang)}>
                    {localize(line, lang)}
                  </p>
                ))}
              </div>
              {hints.length > 0 && (
                <dl className="page-narration__hints">
                  {hints.map(([hintId, hint]) => (
                    <div key={hintId}>
                      <dt dir="auto">
                        {t('hintOn', { topic: topic(hintId) })}
                      </dt>
                      <dd {...textProps(hint, lang)}>{localize(hint, lang)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {narration.farewell && (
                <p className="page-narration__farewell">
                  <span className="page-narration__farewell-label">
                    {t('farewell')}:{' '}
                  </span>
                  <span {...textProps(narration.farewell, lang)}>{localize(narration.farewell, lang)}</span>
                </p>
              )}
            </article>
          );
        })}
      </div>
    </PageSection>
  );
}

/** Credits: the editorial ones from content, then every CC-BY model credit from the manifest. */
export function CreditsSection({
  credits,
  copy,
  modelCredits,
  t,
  lang,
}: PagePartProps & {
  readonly credits: readonly Credit[];
  readonly copy: SiteCopy;
  readonly modelCredits?: CreditsSource;
}) {
  return (
    <PageSection
      section="credits"
      title={copyReader(copy, lang)('creditsTitle')}
    >
      {credits.length > 0 && (
        <>
          <h3 className="page-subtitle">{t('siteCredits')}</h3>
          <ul className="page-credits" data-testid="page-site-credits">
            {credits.map((credit) => (
              <li key={credit.id}>
                {credit.url ? (
                  <OutboundLink href={credit.url} t={t}>
                    {localize(credit.title, lang)}
                  </OutboundLink>
                ) : (
                  <span {...textProps(credit.title, lang)}>{localize(credit.title, lang)}</span>
                )}
                {credit.author && (
                  <>
                    {' '}
                    <span dir="auto">{t('by', { author: credit.author })}</span>
                  </>
                )}
                {credit.license && (
                  <>
                    {'. '}
                    <span dir="auto">
                      {t('licence', { licence: credit.license })}
                    </span>
                  </>
                )}
                {credit.note && (
                  <>
                    {'. '}
                    <span {...textProps(credit.note, lang)}>{localize(credit.note, lang)}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <h3 className="page-subtitle">{t('modelCredits')}</h3>
      <p className="page-section__intro">{t('modelCreditsIntro')}</p>
      <div className="page-model-credits">
        <SiteCreditsList source={modelCredits} label={t('modelCreditsLabel')} />
      </div>
    </PageSection>
  );
}
