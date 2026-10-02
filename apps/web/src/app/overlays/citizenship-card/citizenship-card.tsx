import {
  localize,
  type Avatar,
  type ContactLink,
  type Locale,
  type SiteCopy,
  type SiteProfile,
} from '@qa3elhamor/content-domain';
import type { LandmarkOverlayProps } from '@qa3elhamor/landmarks-ui';
import { useId, useState, type ComponentType } from 'react';
import {
  copyReader,
  textProps,
  toContentLocale,
  type CopyReader,
} from '../overlay-copy';
import './citizenship-card.css';

/** Any letter of the Arabic script. */
const ARABIC_SCRIPT = /[؀-ۿ]/u;

/** The content a Citizenship Card is rendered from, bound where the overlay is registered. */
export interface CitizenshipCardContent {
  readonly profile: SiteProfile;
  readonly copy: SiteCopy;
  /** Vite's deploy base, for site-relative avatar paths. Defaults to `import.meta.env.BASE_URL`. */
  readonly baseUrl?: string;
}

export type CitizenshipCardProps = LandmarkOverlayProps &
  CitizenshipCardContent;

/**
 * An avatar `src` is a site-relative path (served from `public/`) or an absolute https URL; the
 * content parser has already refused anything else. Relative paths are joined to the deploy base.
 */
export const resolveAvatarSrc = (src: string, baseUrl: string): string =>
  /^https:\/\//u.test(src)
    ? src
    : `${baseUrl.replace(/\/+$/u, '')}/${src.replace(/^\/+/u, '')}`;

/** What every part of the card renders from: the content, in one locale. */
export interface CitizenCardPartProps {
  readonly profile: SiteProfile;
  readonly t: CopyReader;
  readonly lang: Locale;
}

/** The card's issuer band and title; `headingId` names the card. */
export function CitizenCardBand({
  t,
  headingId,
}: {
  readonly t: CopyReader;
  readonly headingId: string;
}) {
  return (
    <header className="citizen-card__band">
      <p className="citizen-card__issuer">{t('citizenCardIssuer')}</p>
      <h3 id={headingId} className="citizen-card__title">
        {t('aboutTitle')}
      </h3>
    </header>
  );
}

/** Portrait, name, occupation, residence and status. */
export function CitizenIdentity({
  profile,
  t,
  lang,
  baseUrl,
}: CitizenCardPartProps & { readonly baseUrl: string }) {
  return (
    <div className="citizen-card__identity">
      {/* Keyed by source: a new photo gets a fresh load, not the last one's failure. */}
      <Portrait
        key={profile.avatar?.src ?? 'emblem'}
        avatar={profile.avatar}
        locale={lang}
        baseUrl={baseUrl}
      />
      <dl className="citizen-card__fields">
        <div className="citizen-card__field">
          <dt>{t('citizenNameLabel')}</dt>
          <dd className="citizen-card__name" {...textProps(profile.name, lang)}>
            {localize(profile.name, lang)}
          </dd>
        </div>
        <div className="citizen-card__field">
          <dt>{t('citizenOccupationLabel')}</dt>
          <dd {...textProps(profile.headline, lang)}>{localize(profile.headline, lang)}</dd>
        </div>
        <div className="citizen-card__field">
          <dt>{t('citizenResidenceLabel')}</dt>
          <dd dir="auto">
            {profile.location
              ? localize(profile.location, lang)
              : t('citizenResidenceDefault')}
          </dd>
        </div>
        <div className="citizen-card__field">
          <dt>{t('citizenStatusLabel')}</dt>
          <dd>
            {t('citizenStatusValue')}{' '}
            {/* A motto in its own script (the shipped one is the trend's Arabic words):
                isolated, with its own direction, so it cannot reorder the punctuation around
                it. Arabic is marked as Arabic for its face and joining. */}
            <bdi
              lang={ARABIC_SCRIPT.test(t('citizenStatusMotto')) ? 'ar' : undefined}
              dir="auto"
              className="citizen-card__motto"
            >
              {t('citizenStatusMotto')}
            </bdi>
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** The citizen's links; nothing when there are none. `id` prefixes the heading id. */
export function CitizenLinks({
  profile,
  t,
  lang,
  id,
}: CitizenCardPartProps & { readonly id: string }) {
  if (profile.links.length === 0) return null;
  return (
    <section className="citizen-card__section" aria-labelledby={`${id}-links`}>
      <h4 id={`${id}-links`} className="citizen-card__section-title">
        {t('citizenLinksTitle')}
      </h4>
      <ul className="citizen-card__links">
        {profile.links.map((link) => (
          <li key={`${link.kind}:${link.url}`}>
            <CitizenLink link={link} locale={lang} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The citizen's statement: every bio paragraph. */
export function CitizenBio({
  profile,
  t,
  lang,
  id,
}: CitizenCardPartProps & { readonly id: string }) {
  return (
    <section className="citizen-card__section" aria-labelledby={`${id}-bio`}>
      <h4 id={`${id}-bio`} className="citizen-card__section-title">
        {t('citizenBioTitle')}
      </h4>
      {profile.bio.map((paragraph, index) => (
        // Paragraphs have no id of their own; their order is their identity.
        <p key={index} {...textProps(paragraph, lang)}>
          {localize(paragraph, lang)}
        </p>
      ))}
    </section>
  );
}

/** Every skill as an ink stamp under its group's heading; nothing when there are none. */
export function CitizenStamps({
  profile,
  t,
  lang,
  id,
}: CitizenCardPartProps & { readonly id: string }) {
  if (profile.skills.length === 0) return null;
  return (
    <section className="citizen-card__section" aria-labelledby={`${id}-skills`}>
      <h4 id={`${id}-skills`} className="citizen-card__section-title">
        {t('citizenSkillsTitle')}
      </h4>
      {profile.skills.map((group) => (
        <div key={group.id} className="citizen-card__skill-group">
          <h5 className="citizen-card__group-title">
            {localize(group.label, lang)}
          </h5>
          <ul className="citizen-card__stamps">
            {group.skills.map((skill) => (
              <li key={skill} className="citizen-card__stamp" dir="auto">
                {skill}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/**
 * The pineapple's overlay: the visitor's "Citizenship Card for Qaa El-Hamour" (the About
 * section). Every word comes from `content/site.json`; `dir` flips the card for Arabic. The
 * in-world presentation (`citizenship-card-in-world.tsx`) is built from the same parts.
 */
export function CitizenshipCard({
  profile,
  copy,
  locale,
  dir,
  onClose,
  baseUrl = import.meta.env.BASE_URL,
}: CitizenshipCardProps) {
  const lang = toContentLocale(locale);
  const t = copyReader(copy, lang);
  const ids = useId();
  const headingId = `${ids}-card`;
  const parts = { profile, t, lang };

  return (
    <article className="citizen-card" dir={dir} aria-labelledby={headingId}>
      <CitizenCardBand t={t} headingId={headingId} />
      <CitizenIdentity {...parts} baseUrl={baseUrl} />
      {/* Links sit right under the identity: the dialog focuses the first link on open, so it
          must be near the top, and reaching the citizen is the card's one action. */}
      <CitizenLinks {...parts} id={ids} />
      <CitizenBio {...parts} id={ids} />
      <CitizenStamps {...parts} id={ids} />
      {/* A way back at the end of the card, so a visitor who read to the bottom need not
          scroll up to leave. Part of the card, so it travels with it to any presentation. */}
      <footer className="citizen-card__footer">
        <button type="button" className="citizen-card__back" onClick={onClose}>
          {t('closeLabel')}
        </button>
      </footer>
    </article>
  );
}

function CitizenLink({
  link,
  locale,
}: {
  readonly link: ContactLink;
  readonly locale: Locale;
}) {
  const label = localize(link.label, locale);
  // mailto: opens the mail client in place; web links leave the dive in a new tab.
  return link.url.startsWith('mailto:') ? (
    <a
      className="citizen-card__link"
      href={link.url}
      data-kind={link.kind}
      dir="auto"
    >
      {label}
    </a>
  ) : (
    <a
      className="citizen-card__link"
      href={link.url}
      data-kind={link.kind}
      dir="auto"
      target="_blank"
      rel="noopener noreferrer"
    >
      {label}
    </a>
  );
}

/** The photo, or the municipal grouper emblem when there is none or it fails to load. */
function Portrait({
  avatar,
  locale,
  baseUrl,
}: {
  readonly avatar: Avatar | undefined;
  readonly locale: Locale;
  readonly baseUrl: string;
}) {
  const [failed, setFailed] = useState(false);
  if (avatar && !failed) {
    return (
      <img
        className="citizen-card__portrait"
        src={resolveAvatarSrc(avatar.src, baseUrl)}
        alt={localize(avatar.alt, locale)}
        width={112}
        height={140}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div
      className="citizen-card__portrait citizen-card__portrait--emblem"
      data-testid="citizen-emblem"
    >
      <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <circle cx="32" cy="32" r="29" fill="none" strokeWidth="2" />
        <circle
          cx="32"
          cy="32"
          r="24"
          fill="none"
          strokeWidth="1"
          strokeDasharray="2 3"
        />
        {/* A grouper (hamour), the district's namesake. */}
        <path
          d="M14 33c5-8 15-11 24-8 4 1 7 3 9 5l6-5v16l-6-5c-2 2-5 4-9 5-9 3-19 0-24-8z"
          className="citizen-card__emblem-fish"
        />
        <circle cx="22" cy="31" r="1.8" className="citizen-card__emblem-eye" />
        <path d="M30 28c2 3 2 7 0 10" fill="none" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

/**
 * Binds content into an overlay the kernel can register (`LANDMARK_OVERLAYS.pineapple`). The
 * landmark libraries never see content; they only receive this component.
 */
export function createCitizenshipCardOverlay(
  content: CitizenshipCardContent,
): ComponentType<LandmarkOverlayProps> {
  function PineappleCitizenshipCard(props: LandmarkOverlayProps) {
    return <CitizenshipCard {...props} {...content} />;
  }
  return PineappleCitizenshipCard;
}
