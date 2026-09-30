import type { Branded } from '@qa3elhamor/shared-domain';
import type { LocalizedText } from './localized-text.js';
import type { Period } from './resume-entry.js';

export type ProjectItemId = Branded<'ProjectItem'>;

export const PROJECT_LINK_KINDS = ['repo', 'live', 'case-study'] as const;

export type ProjectLinkKind = (typeof PROJECT_LINK_KINDS)[number];

export interface ProjectLink {
  readonly kind: ProjectLinkKind;
  /** Overrides the default label for the kind, e.g. "Read the write-up". */
  readonly label?: LocalizedText;
  readonly url: string;
}

export interface ProjectMedia {
  /** A site-relative path (served from the app's public folder) or an absolute https URL. */
  readonly src: string;
  readonly alt: LocalizedText;
}

/** A piece of work the owner showcases: a product, an open-source library, a case study. */
export interface ProjectItem {
  readonly id: ProjectItemId;
  readonly title: LocalizedText;
  /** One or two sentences for cards and lists. */
  readonly summary: LocalizedText;
  /** Longer write-up for a detail view. */
  readonly description?: LocalizedText;
  readonly highlights: readonly LocalizedText[];
  /** The owner's part in it, e.g. "Lead developer". */
  readonly role?: LocalizedText;
  readonly period?: Period;
  readonly tech: readonly string[];
  readonly links: readonly ProjectLink[];
  readonly media?: ProjectMedia;
  readonly featured: boolean;
  /** Explicit position; lower comes first. Unordered projects follow in file order. */
  readonly order?: number;
}

/**
 * Display order: projects with an `order` first (ascending), then the rest in the order the
 * content file lists them. `Array.prototype.sort` is stable, so ties keep file order.
 */
export const sortProjects = (
  projects: readonly ProjectItem[]
): readonly ProjectItem[] =>
  [...projects].sort(
    (a, b) =>
      (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY) || 0
  );
