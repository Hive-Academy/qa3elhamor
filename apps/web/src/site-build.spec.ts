import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  HEAD_MARKER,
  SiteConfigError,
  THEME_MODULE_ID,
  THEME_PROPERTIES,
  applyHead,
  headContent,
  landmarkConfigProblems,
  headTags,
  siteTemplate,
  siteUrl,
  themeCss,
  type HeadInput,
} from './site-build';
import { DIVE_CONFIG, LANDMARKS, LANDMARK_PLACEMENTS, SITE, type SiteConfig } from './site.config';

const html = (name: string): string =>
  readFileSync(resolve(import.meta.dirname, '..', name), 'utf8');

const input = (overrides: Partial<HeadInput> = {}): HeadInput => ({
  site: SITE,
  content: { title: 'Sam Doe, the Reef', description: 'A dive.' },
  base: '/',
  url: null,
  ...overrides,
});

const withMeta = (meta: Partial<SiteConfig['meta']>): SiteConfig => ({
  ...SITE,
  meta: { ...SITE.meta, ...meta },
});

describe('themeCss', () => {
  it('writes every theme value as its custom property on :root', () => {
    const css = themeCss(SITE.theme);
    expect(css).toMatch(/^\/\*[^]*\*\/\n:root \{\n/u);
    for (const [key, property] of Object.entries(THEME_PROPERTIES))
      expect(css).toContain(`  ${property}: ${SITE.theme[key as keyof SiteConfig['theme']]};`);
  });

  it.each(['red; } body { display: none', 'url(x) /* hi', '', '  ', '</style>'])(
    'refuses a value that is not one CSS value: %j',
    (value) => {
      expect(() => themeCss({ ...SITE.theme, accent: value })).toThrow(SiteConfigError);
    },
  );

  it("styles every surface from the tokens the site's stylesheets read", () => {
    const styles = readFileSync(resolve(import.meta.dirname, 'styles.css'), 'utf8');
    // With the shipped colours as fallbacks, for a first paint before the theme applies.
    expect(styles).toContain(`var(--theme-sea, ${SITE.theme.sea})`);
    expect(styles).toContain(`var(--theme-foam, ${SITE.theme.foam})`);
    // The faces moved to the theme: a second definition would shadow it.
    expect(styles).not.toMatch(/--font-ui\s*:/u);
  });
});

describe('the <head>', () => {
  it('takes the title and description from content, in the default language', () => {
    expect(
      headContent({ copy: { siteTitle: { en: 'Title', ar: 'عنوان' }, siteDescription: 'Plain' } }, 'ar'),
    ).toEqual({ title: 'عنوان', description: 'Plain' });
    expect(headContent({ copy: { siteTitle: { en: 'Title' }, siteDescription: 'D' } }, 'ar').title).toBe(
      'Title',
    );
    expect(() => headContent({ copy: {} }, 'en')).toThrow(/copy\.siteTitle/u);
  });

  it('escapes content into the markup', () => {
    const tags = headTags('index.html', input({ content: { title: 'A & B <x>', description: '"q" \'s\'' } }));
    expect(tags).toContain('<title>A &amp; B &lt;x&gt;</title>');
    expect(tags).toContain('<meta name="description" content="&quot;q&quot; &#39;s&#39;" />');
  });

  it('writes the theme colour and a base-relative favicon', () => {
    const tags = headTags('index.html', input({ base: '/reef/' }));
    expect(tags).toContain(`<meta name="theme-color" content="${SITE.theme.sea}" />`);
    expect(tags).toContain(`<link rel="icon" href="/reef/${SITE.meta.favicon}" />`);
  });

  it('writes a preview image only with the site address, as an absolute URL', () => {
    const site = withMeta({ ogImage: '/og.jpg' });
    expect(headTags('index.html', input({ site })).join('\n')).not.toContain('og:image');
    const tags = headTags('index.html', input({ site, url: siteUrl('https://sam.example/reef') }));
    expect(tags).toContain('<meta property="og:image" content="https://sam.example/reef/og.jpg" />');
    expect(tags).toContain('<meta property="og:url" content="https://sam.example/reef/" />');
    expect(tags).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });

  it.each(['https://x.example/../a', 'data:text/plain,x', '../secret', 'public/icon.svg', 'apps/web/public/icon.svg'])(
    'refuses a public path that leaves the public folder: %s',
    (favicon) => {
      expect(() => headTags('index.html', input({ site: withMeta({ favicon }) }))).toThrow(
        SiteConfigError,
      );
    },
  );

  it('accepts only an https (or local http) site address', () => {
    expect(siteUrl(undefined)).toBeNull();
    expect(siteUrl(' ')).toBeNull();
    expect(siteUrl('http://localhost:4620')?.href).toBe('http://localhost:4620/');
    expect(() => siteUrl('http://sam.example')).toThrow(SiteConfigError);
    expect(() => siteUrl('not a url')).toThrow(SiteConfigError);
  });

  it('gives the moderation page its own title and no description or preview', () => {
    const tags = headTags('moderation.html', input()).join('\n');
    expect(tags).toContain(`<title>Moderation | ${SITE.meta.siteName}</title>`);
    expect(tags).not.toContain('description');
    expect(tags).not.toContain('og:');
  });

  it('replaces the marker in both entries and sets the default language', () => {
    for (const page of ['index.html', 'moderation.html'] as const) {
      const source = html(page);
      expect(source).toContain(HEAD_MARKER);
      // Nothing the generator owns is hard-coded in the page any more.
      expect(source).not.toMatch(/<title>|name="theme-color"|rel="icon"/u);
      const out = applyHead(source, page, input());
      expect(out).not.toContain(HEAD_MARKER);
      expect(out).toMatch(new RegExp(`<html lang="${SITE.locales[0]}" dir="(ltr|rtl)">`, 'u'));
    }
    expect(() => applyHead('<html><head></head></html>', 'index.html', input())).toThrow(
      /site:head/u,
    );
  });
});

describe('landmarkConfigProblems: the build refuses landmarks and a dive that disagree', () => {
  it('passes the shipped config', () => {
    expect(landmarkConfigProblems(LANDMARKS, DIVE_CONFIG, LANDMARK_PLACEMENTS)).toEqual([]);
  });

  it('names a landmark removed without its stop, and a stop left without its landmark', () => {
    const problems = landmarkConfigProblems(LANDMARKS.slice(1), DIVE_CONFIG, LANDMARK_PLACEMENTS);
    expect(problems).toEqual([
      expect.stringMatching(/stop "landmark-pineapple": no landmark in LANDMARKS stops here/u),
    ]);
    const noStop = {
      ...DIVE_CONFIG,
      route: DIVE_CONFIG.route.filter((e) => e.kind !== 'stop' || e.landmark !== 'landmark-tiki'),
    };
    expect(landmarkConfigProblems(LANDMARKS, noStop, LANDMARK_PLACEMENTS)).toEqual([
      expect.stringMatching(/"tiki": waypoint "landmark-tiki" is not a stop/u),
    ]);
  });

  it('names bad ids, missing scenes and overlays, unknown spots and unordered scrolls', () => {
    const [first, ...rest] = LANDMARKS;
    const broken = [
      { ...first, id: 'Pineapple', scene: undefined },
      { ...rest[0], id: 'Pineapple', presentation: 'dialog' as const, overlay: undefined },
      ...rest.slice(1),
    ];
    const dive = {
      ...DIVE_CONFIG,
      route: DIVE_CONFIG.route.map((e) => (e.kind === 'stop' && e.landmark === 'landmark-bureau' ? { ...e, scroll: 0.1 } : e)),
    };
    const problems = landmarkConfigProblems(broken, dive, LANDMARK_PLACEMENTS).join('\n');
    expect(problems).toMatch(/"Pineapple": id must be a lowercase slug/u);
    expect(problems).toMatch(/"Pineapple": id is used twice/u);
    expect(problems).toMatch(/an in-world landmark needs a scene/u);
    expect(problems).toMatch(/a dialog landmark needs an overlay/u);
    expect(problems).toMatch(/stop "landmark-bureau": scroll 0.1/u);
    expect(landmarkConfigProblems(LANDMARKS, DIVE_CONFIG, {})).toContainEqual(
      expect.stringMatching(/no such spot in LANDMARK_PLACEMENTS/u),
    );
  });
});

describe('siteTemplate (Vite plugin)', () => {
  const options = {
    site: SITE,
    landmarks: LANDMARKS,
    dive: DIVE_CONFIG,
    placements: LANDMARK_PLACEMENTS,
    readSiteJson: () => ({ copy: { siteTitle: 'T', siteDescription: 'D' } }),
    siteUrl: undefined,
  };
  const plugin = siteTemplate(options);
  const buildStart = (p: ReturnType<typeof siteTemplate>) => p.buildStart as unknown as () => void;

  it('fails the build on landmarks and a dive that disagree', () => {
    expect(() => buildStart(plugin)()).not.toThrow();
    expect(() => buildStart(siteTemplate({ ...options, landmarks: LANDMARKS.slice(1) }))()).toThrow(
      /landmarks and dive disagree:\n {2}- DIVE_CONFIG stop "landmark-pineapple"/u,
    );
  });

  it('warns when a preview image is configured without the site address', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      buildStart(siteTemplate({ ...options, site: withMeta({ ogImage: 'og.jpg' }) }))();
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/meta\.ogImage is set but SITE_URL is not/u));
      warn.mockClear();
      buildStart(siteTemplate({ ...options, site: withMeta({ ogImage: 'og.jpg' }), siteUrl: 'https://x.example' }))();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('serves the theme as a virtual stylesheet', () => {
    const resolveId = plugin.resolveId as (id: string) => string | null;
    const load = plugin.load as (id: string) => string | null;
    const resolved = resolveId(THEME_MODULE_ID);
    expect(resolved).toMatch(/\.css$/u);
    expect(load(resolved ?? '')).toBe(themeCss(SITE.theme));
    expect(resolveId('./other.css')).toBeNull();
  });
});
