import type { Branded } from '@qa3elhamor/shared-domain';
import type { LocalizedText } from './localized-text.js';

export type SkillGroupId = Branded<'SkillGroup'>;

/** A labelled group of skills, e.g. "Frontend": TypeScript, React. Skill names are data, not prose. */
export interface SkillGroup {
  readonly id: SkillGroupId;
  readonly label: LocalizedText;
  readonly skills: readonly string[];
}

export const LINK_KINDS = [
  'email',
  'github',
  'linkedin',
  'x',
  'mastodon',
  'website',
  'other',
] as const;

export type LinkKind = (typeof LINK_KINDS)[number];

/** A social or contact link. `email` links must use a `mailto:` URL. */
export interface ContactLink {
  readonly kind: LinkKind;
  readonly label: LocalizedText;
  readonly url: string;
}

export interface Avatar {
  /** A site-relative path (served from the app's public folder) or an absolute https URL. */
  readonly src: string;
  readonly alt: LocalizedText;
}

/** The person the site is about: the "Citizenship Card" of Qaa El-Hamour. */
export interface SiteProfile {
  readonly name: LocalizedText;
  /** Role or one-line headline, e.g. "Full-stack developer". */
  readonly headline: LocalizedText;
  /** Bio paragraphs in reading order. At least one. */
  readonly bio: readonly LocalizedText[];
  readonly location?: LocalizedText;
  readonly avatar?: Avatar;
  readonly skills: readonly SkillGroup[];
  readonly links: readonly ContactLink[];
}

/**
 * Site-level copy that is not about the person: overlay titles, CTA labels, the page title.
 *
 * The key set is closed on purpose. A landmark that needs a new string adds its key here and
 * to `content/site.json`; the parser then rejects a content file that is missing it or carries
 * a misspelt key, so no string can silently render empty.
 */
export const SITE_COPY_KEYS = [
  'siteTitle',
  'siteDescription',
  'aboutTitle',
  'resumeTitle',
  'servicesTitle',
  'contactTitle',
  'contactSubmitLabel',
  'closeLabel',
  'creditsTitle',
  // Citizenship Card (landmark-pineapple)
  'citizenCardIssuer',
  'citizenNameLabel',
  'citizenOccupationLabel',
  'citizenResidenceLabel',
  'citizenResidenceDefault',
  'citizenStatusLabel',
  'citizenStatusValue',
  'citizenStatusMotto',
  'citizenBioTitle',
  'citizenSkillsTitle',
  'citizenLinksTitle',
  // Complaint scroll (landmark-bureau)
  'complaintIntro',
  'complaintSubjectLabel',
  'complaintBodyLabel',
  'complaintNameLabel',
  'complaintSpeciesLabel',
  'complaintSpeciesSuggestions',
  'complaintEmailLabel',
  'complaintEmailHint',
  'complaintOptional',
  'complaintCounter',
  'complaintSending',
  'complaintStampText',
  'complaintSuccessTitle',
  'complaintSuccessBody',
  'complaintPendingBody',
  'complaintFailureBody',
  'complaintAnotherLabel',
  'complaintErrorSummary',
  'complaintErrorEmpty',
  'complaintErrorTooLong',
  'complaintErrorControlCharacter',
  'complaintErrorMalformed',
] as const;

export type SiteCopyKey = (typeof SITE_COPY_KEYS)[number];

export type SiteCopy = Readonly<Record<SiteCopyKey, LocalizedText>>;
