import { describe, expect, it } from 'vitest';
import {
  buildModerationCsp,
  buildSiteCsp,
  CspConfigError,
  CSP_META_PATTERN,
  cspForPage,
  cspMetaTag,
  publicSiteOrigins,
  UMAMI_CLOUD_GATEWAY,
  wallApiOrigin,
} from './csp';
import { injectCsp } from './csp-plugin';

const directives = (policy: string): Map<string, string[]> =>
  new Map(
    policy.split(';').map((part) => {
      const [name = '', ...sources] = part.trim().split(/\s+/);
      return [name, sources];
    })
  );

const UMAMI_ID = '3f1b2c4d-5e6f-4a1b-8c2d-9e0f1a2b3c4d';

describe('buildSiteCsp', () => {
  it('is self-only by default, with WebAssembly but never unsafe-inline or unsafe-eval', () => {
    const policy = buildSiteCsp({});
    const d = directives(policy);
    expect(d.get('default-src')).toEqual(["'self'"]);
    expect(d.get('script-src')).toEqual(["'self'", "'wasm-unsafe-eval'"]);
    expect(d.get('style-src')).toEqual(["'self'"]);
    expect(d.get('connect-src')).toEqual(["'self'", 'blob:', 'data:']);
    expect(d.get('worker-src')).toEqual(["'self'", 'blob:']);
    expect(d.get('object-src')).toEqual(["'none'"]);
    expect(d.get('frame-src')).toEqual(["'none'"]);
    expect(d.get('base-uri')).toEqual(["'self'"]);
    expect(policy).not.toContain("'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
    // Header-only directives are ignored in a <meta> policy; do not pretend otherwise.
    expect(policy).not.toMatch(/frame-ancestors|report-uri|report-to|sandbox/);
  });

  it('allows the configured analytics provider only, in script-src and connect-src', () => {
    const plausible = directives(
      buildSiteCsp({ VITE_ANALYTICS_PROVIDER: 'plausible', VITE_ANALYTICS_DOMAIN: 'example.org' })
    );
    expect(plausible.get('script-src')).toContain('https://plausible.io');
    expect(plausible.get('connect-src')).toContain('https://plausible.io');

    const umami = publicSiteOrigins({
      VITE_ANALYTICS_PROVIDER: 'umami',
      VITE_ANALYTICS_WEBSITE_ID: UMAMI_ID,
    });
    expect(umami.script).toEqual(['https://cloud.umami.is']);
    expect(umami.connect).toEqual(['https://cloud.umami.is', UMAMI_CLOUD_GATEWAY]);

    const selfHosted = publicSiteOrigins({
      VITE_ANALYTICS_PROVIDER: 'umami',
      VITE_ANALYTICS_WEBSITE_ID: UMAMI_ID,
      VITE_ANALYTICS_SCRIPT_SRC: 'https://stats.example.org/script.js',
    });
    expect(selfHosted).toEqual({
      script: ['https://stats.example.org'],
      connect: ['https://stats.example.org'],
    });
  });

  it('adds nothing for analytics that resolves to none (misconfigured or opted out)', () => {
    expect(publicSiteOrigins({ VITE_ANALYTICS_PROVIDER: 'plausible' })).toEqual({ script: [], connect: [] });
    expect(
      publicSiteOrigins({
        VITE_ANALYTICS_PROVIDER: 'umami',
        VITE_ANALYTICS_WEBSITE_ID: UMAMI_ID,
        VITE_ANALYTICS_SCRIPT_SRC: 'http://stats.example.org/script.js',
      })
    ).toEqual({ script: [], connect: [] });
  });

  it('allows the contact provider in connect-src only', () => {
    const web3forms = publicSiteOrigins({ VITE_CONTACT_PROVIDER: 'web3forms' });
    expect(web3forms).toEqual({ script: [], connect: ['https://api.web3forms.com'] });
    const formspree = publicSiteOrigins({ VITE_CONTACT_PROVIDER: ' Formspree ' });
    expect(formspree.connect).toEqual(['https://formspree.io']);
    expect(publicSiteOrigins({ VITE_CONTACT_PROVIDER: 'none' }).connect).toEqual([]);
    expect(publicSiteOrigins({ VITE_CONTACT_PROVIDER: 'carrier-pigeon' }).connect).toEqual([]);
  });

  it('allows a cross-origin wall API by origin only', () => {
    const d = directives(buildSiteCsp({ VITE_WALL_API_URL: 'https://wall.example.org/api/v1' }));
    expect(d.get('connect-src')).toContain('https://wall.example.org');
    expect(d.get('script-src')).not.toContain('https://wall.example.org');
  });
});

describe('directive injection', () => {
  it('fails the build when an env-derived source would break out of its directive', () => {
    expect(() => buildSiteCsp({ VITE_WALL_API_URL: 'https://api.example.com;sandbox' })).toThrow(
      /contains/,
    );
  });
});

describe('wallApiOrigin', () => {
  it('treats unset and same-origin paths as covered by self', () => {
    expect(wallApiOrigin({})).toBeNull();
    expect(wallApiOrigin({ VITE_WALL_API_URL: '/api' })).toBeNull();
    expect(wallApiOrigin({ VITE_WALL_API_URL: 'http://localhost:8787/api' })).toBe('http://localhost:8787');
  });

  it.each([
    'http://wall.example.org',
    '//wall.example.org/api',
    'javascript:alert(1)',
    'https://user:pass@wall.example.org',
    'wall.example.org',
  ])('fails the build for %s', (value) => {
    expect(() => wallApiOrigin({ VITE_WALL_API_URL: value })).toThrow(CspConfigError);
  });
});

describe('buildModerationCsp', () => {
  it('denies by default, allows only own scripts and the API, and enforces Trusted Types', () => {
    const d = directives(buildModerationCsp({ VITE_ANALYTICS_PROVIDER: 'plausible', VITE_ANALYTICS_DOMAIN: 'a.org' }));
    expect(d.get('default-src')).toEqual(["'none'"]);
    expect(d.get('script-src')).toEqual(["'self'"]);
    expect(d.get('connect-src')).toEqual(["'self'"]);
    expect(d.get('base-uri')).toEqual(["'none'"]);
    expect(d.get('require-trusted-types-for')).toEqual(["'script'"]);
    expect(d.get('trusted-types')).toEqual(["'none'"]);
    const withWall = directives(buildModerationCsp({ VITE_WALL_API_URL: 'https://wall.example.org/api' }));
    expect(withWall.get('connect-src')).toEqual(["'self'", 'https://wall.example.org']);
  });
});

describe('cspForPage', () => {
  it('maps every entry to a policy and refuses unknown pages', () => {
    expect(cspForPage('index.html', {})).toBe(buildSiteCsp({}));
    expect(cspForPage('404.html', {})).toBe(buildSiteCsp({}));
    expect(cspForPage('moderation.html', {})).toBe(buildModerationCsp({}));
    expect(cspForPage('admin.html', {})).toBeNull();
  });
});

describe('cspMetaTag / injectCsp', () => {
  const html = '<!doctype html>\n<html>\n  <head>\n    <meta charset="utf-8" />\n    <title>t</title>\n    <script type="module" src="/a.js"></script>\n  </head>\n</html>';

  it('places the policy right after the charset and before any script', () => {
    const out = injectCsp(html, 'index.html', {});
    const meta = out.indexOf('Content-Security-Policy');
    expect(meta).toBeGreaterThan(out.indexOf('charset'));
    expect(meta).toBeLessThan(out.indexOf('<script'));
    expect(CSP_META_PATTERN.exec(out)?.[1]).toBe(buildSiteCsp({}));
  });

  it('refuses a page without a policy or without a charset anchor', () => {
    expect(() => injectCsp(html, 'other.html', {})).toThrow(/no policy defined/);
    expect(() => injectCsp('<html><head></head></html>', 'index.html', {})).toThrow(/charset/);
  });

  it('refuses a policy that could break out of the attribute', () => {
    expect(() => cspMetaTag(`default-src 'self'" onload="x`)).toThrow(CspConfigError);
  });
});
