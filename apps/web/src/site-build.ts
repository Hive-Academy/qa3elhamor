import type { Plugin } from 'vite';
import type { LandmarkDefinition } from '@qa3elhamor/landmarks-domain';
import type { DiveConfig } from './app/dive.config';
import type { SiteConfig } from './site.config';

/*
 * Build-time half of `site.config.ts`: the page's <head> (title, description, theme colour,
 * favicon, social preview) and the theme's CSS custom properties, generated from the config and
 * the content so a fork never edits `index.html` or a stylesheet to rebrand. Used by
 * `vite.config.mts` (`siteTemplate()`); pure apart from the Vite hooks, and never shipped.
 *
 * The CSS is a virtual module (`virtual:site-theme.css`, imported by the entries) and so lands
 * in the built stylesheet: the Content Security Policy allows no inline <style>.
 */

/** Import this from an entry to get the theme's `:root` custom properties. */
export const THEME_MODULE_ID = 'virtual:site-theme.css';
const RESOLVED_THEME_ID = `\0${THEME_MODULE_ID}`;

/** Where each HTML entry wants the generated tags. A page without it fails the build. */
export const HEAD_MARKER = '<!-- site:head -->';

/** `SITE.theme` key → the custom property every stylesheet reads. */
export const THEME_PROPERTIES: Readonly<Record<keyof SiteConfig['theme'], string>> = {
  sea: '--theme-sea',
  seaLight: '--theme-sea-light',
  foam: '--theme-foam',
  accent: '--theme-accent',
  lagoon: '--theme-lagoon',
  lagoonDeep: '--theme-lagoon-deep',
  link: '--theme-link',
  paper: '--theme-paper',
  paperEdge: '--theme-paper-edge',
  ink: '--theme-ink',
  inkSoft: '--theme-ink-soft',
  rule: '--theme-rule',
  focus: '--theme-focus',
  fontUi: '--font-ui',
  fontPaper: '--font-paper',
};

/** Thrown for a config or content value the build cannot write safely. Fails the build. */
export class SiteConfigError extends Error {
  constructor(message: string) {
    super(`site.config: ${message}`);
    this.name = 'SiteConfigError';
  }
}

/** A CSS value from config: anything but what could close the declaration or the rule. */
const cssValue = (key: string, value: string): string => {
  const trimmed = value.trim();
  if (trimmed === '' || /[;{}<>\\]|\/\*/u.test(trimmed)) {
    throw new SiteConfigError(`theme.${key} must be one CSS value, got ${JSON.stringify(value)}`);
  }
  return trimmed;
};

/** The theme as a `:root` rule. */
export function themeCss(theme: SiteConfig['theme']): string {
  const lines = (Object.keys(THEME_PROPERTIES) as (keyof SiteConfig['theme'])[]).map(
    (key) => `  ${THEME_PROPERTIES[key]}: ${cssValue(key, theme[key])};`,
  );
  return `/* Generated from SITE.theme (apps/web/src/site.config.ts). */\n:root {\n${lines.join('\n')}\n}\n`;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');

/**
 * A public-folder path from config: relative to `apps/web/public` (which is served at the root,
 * so `public/...` or `apps/web/public/...` would 404), no scheme, no parent segments.
 */
const publicPath = (key: string, value: string): string => {
  const path = value.trim().replace(/^\/+/u, '');
  if (
    path === '' ||
    /^[a-z][a-z0-9+.-]*:/iu.test(path) ||
    path.split('/').includes('..') ||
    /^(?:apps\/web\/)?public\//u.test(path)
  ) {
    throw new SiteConfigError(`meta.${key} must be a path inside apps/web/public, got ${JSON.stringify(value)}`);
  }
  return path;
};

/**
 * The site's public address (`SITE_URL`), normalised to end in `/`, or `null` when unset. Only
 * https, or http on a local host, so a typo cannot publish a wrong preview URL.
 */
export function siteUrl(raw: string | undefined): URL | null {
  const value = (raw ?? '').trim();
  if (value === '') return null;
  let url: URL;
  try {
    url = new URL(value.endsWith('/') ? value : `${value}/`);
  } catch {
    throw new SiteConfigError(`SITE_URL must be an absolute URL, got ${JSON.stringify(raw)}`);
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new SiteConfigError(`SITE_URL must be https, got ${JSON.stringify(raw)}`);
  }
  return url;
}

/** Content text (`"plain"` or `{ en, ar? }`) in `locale`, falling back to English. */
export function contentText(value: unknown, locale: string, field: string): string {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    for (const candidate of [record[locale], record['en']]) {
      if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim();
    }
  }
  throw new SiteConfigError(`content/site.json → ${field} is missing (needed for the page <head>)`);
}

/** The words the <head> takes from `content/site.json` (`copy.siteTitle`, `copy.siteDescription`). */
export interface HeadContent {
  readonly title: string;
  readonly description: string;
}

/** Reads `HeadContent` from the raw (unvalidated) `content/site.json`, in `locale`. */
export function headContent(siteJson: unknown, locale: string): HeadContent {
  const copy =
    typeof siteJson === 'object' && siteJson !== null
      ? (siteJson as Record<string, unknown>)['copy']
      : undefined;
  const field = (key: string): unknown =>
    typeof copy === 'object' && copy !== null ? (copy as Record<string, unknown>)[key] : undefined;
  return {
    title: contentText(field('siteTitle'), locale, 'copy.siteTitle'),
    description: contentText(field('siteDescription'), locale, 'copy.siteDescription'),
  };
}

export type HtmlPage = 'index.html' | 'moderation.html';

export interface HeadInput {
  readonly site: SiteConfig;
  readonly content: HeadContent;
  /** Vite's `base`, with leading and trailing slashes. */
  readonly base: string;
  /** `siteUrl(process.env.SITE_URL)`. */
  readonly url: URL | null;
}

/** The generated <head> tags for one HTML entry. */
export function headTags(page: HtmlPage, { site, content, base, url }: HeadInput): string[] {
  const favicon = `${base}${publicPath('favicon', site.meta.favicon)}`;
  const common = [
    `<meta name="theme-color" content="${escapeHtml(cssValue('sea', site.theme.sea))}" />`,
    `<link rel="icon" href="${escapeHtml(favicon)}" />`,
  ];
  if (page === 'moderation.html') {
    return [`<title>${escapeHtml(`Moderation | ${site.meta.siteName}`)}</title>`, ...common];
  }

  const image =
    site.meta.ogImage && url ? new URL(publicPath('ogImage', site.meta.ogImage), url).href : null;
  const tags = [
    `<title>${escapeHtml(content.title)}</title>`,
    `<meta name="description" content="${escapeHtml(content.description)}" />`,
    ...common,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(site.meta.siteName)}" />`,
    `<meta property="og:title" content="${escapeHtml(content.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(content.description)}" />`,
    `<meta property="og:locale" content="${escapeHtml(site.locales[0])}" />`,
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
  ];
  if (url) tags.push(`<meta property="og:url" content="${escapeHtml(url.href)}" />`);
  if (image) tags.push(`<meta property="og:image" content="${escapeHtml(image)}" />`);
  return tags;
}

/**
 * `html` with the generated tags in place of `HEAD_MARKER`, and `<html lang dir>` set to the
 * site's default language (the app keeps it in step with the visitor's choice at run time).
 */
export function applyHead(html: string, page: HtmlPage, input: HeadInput): string {
  if (!html.includes(HEAD_MARKER)) {
    throw new SiteConfigError(`${page} has no ${HEAD_MARKER} for the generated <head> tags`);
  }
  const lang = input.site.locales[0];
  return html
    .replace(HEAD_MARKER, headTags(page, input).join('\n    '))
    .replace(/<html\b[^>]*>/u, `<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">`);
}

/**
 * What the build can check of the landmarks and the dive without loading the scene code: the
 * page refuses an inconsistent config at startup anyway (`buildLandmarkRegistry`), but only in
 * a browser, so the build fails first. Each problem is one line naming what to fix.
 */
export function landmarkConfigProblems(
  landmarks: readonly LandmarkDefinition[],
  dive: DiveConfig,
  placements: Readonly<Record<string, unknown>>,
): string[] {
  const problems: string[] = [];
  const stops = dive.route.flatMap((entry) => (entry.kind === 'stop' ? [entry] : []));
  const stopIds = stops.map((stop) => stop.landmark as string);
  const seen = new Set<string>();
  for (const landmark of landmarks) {
    const at = `LANDMARKS "${landmark.id}"`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(landmark.id)) problems.push(`${at}: id must be a lowercase slug`);
    if (seen.has(landmark.id)) problems.push(`${at}: id is used twice`);
    seen.add(landmark.id);
    if (!stopIds.includes(landmark.waypoint))
      problems.push(`${at}: waypoint "${landmark.waypoint}" is not a stop in DIVE_CONFIG.route`);
    const presentation = landmark.presentation ?? 'dialog';
    if (presentation === 'in-world' && !landmark.scene) problems.push(`${at}: an in-world landmark needs a scene`);
    if (presentation === 'dialog' && !landmark.overlay) problems.push(`${at}: a dialog landmark needs an overlay`);
  }
  let previous = 0;
  for (const stop of stops) {
    const at = `DIVE_CONFIG stop "${stop.landmark}"`;
    if (!(stop.landmark in placements)) problems.push(`${at}: no such spot in LANDMARK_PLACEMENTS`);
    if (!landmarks.some((landmark) => landmark.waypoint === stop.landmark))
      problems.push(`${at}: no landmark in LANDMARKS stops here (remove the stop, or add the landmark)`);
    if (!(stop.scroll > previous && stop.scroll < 1))
      problems.push(`${at}: scroll ${stop.scroll} must be between the previous stop's and 1`);
    previous = stop.scroll;
  }
  return problems;
}

export interface SiteTemplateOptions {
  readonly site: SiteConfig;
  /** `LANDMARKS`, `DIVE_CONFIG` and `LANDMARK_PLACEMENTS`, checked at build start. */
  readonly landmarks: readonly LandmarkDefinition[];
  readonly dive: DiveConfig;
  readonly placements: Readonly<Record<string, unknown>>;
  /** The raw `content/site.json`, read when the HTML is transformed (so dev picks up edits). */
  readonly readSiteJson: () => unknown;
  /** `process.env.SITE_URL`. */
  readonly siteUrl: string | undefined;
}

/** Vite plugin: the theme module and every HTML entry's generated <head>. */
export function siteTemplate({
  site,
  landmarks,
  dive,
  placements,
  readSiteJson,
  siteUrl: rawUrl,
}: SiteTemplateOptions): Plugin {
  let base = '/';
  let warn: (message: string) => void = console.warn;
  const url = siteUrl(rawUrl);
  return {
    name: 'qa3elhamor:site-template',
    configResolved(config) {
      base = config.base;
      warn = (message) => config.logger.warn(message);
    },
    buildStart() {
      const problems = landmarkConfigProblems(landmarks, dive, placements);
      if (problems.length > 0) {
        throw new SiteConfigError(`landmarks and dive disagree:\n  - ${problems.join('\n  - ')}`);
      }
      if (site.meta.ogImage && !url) {
        warn(
          `site.config: meta.ogImage is set but SITE_URL is not, so the page has no og:image ` +
            `(social previews need an absolute URL). Set SITE_URL, e.g. https://<you>.github.io/.`,
        );
      }
    },
    resolveId: (id) => (id === THEME_MODULE_ID ? RESOLVED_THEME_ID : null),
    load: (id) => (id === RESOLVED_THEME_ID ? themeCss(site.theme) : null),
    transformIndexHtml: {
      // After Vite's own processing, so the tags are written exactly as generated.
      order: 'post',
      handler(html, ctx) {
        const page = ctx.filename.replace(/\\/gu, '/').split('/').pop();
        if (page !== 'index.html' && page !== 'moderation.html') {
          throw new SiteConfigError(`no <head> recipe for ${page ?? ctx.filename}`);
        }
        const content = headContent(readSiteJson(), site.locales[0]);
        return applyHead(html, page, { site, content, base, url });
      },
    },
  };
}
