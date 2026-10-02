/**
 * Vite plugin: writes each HTML entry's Content Security Policy into the page as the first
 * `<head>` element (`<meta http-equiv="Content-Security-Policy">`), at build time only.
 *
 * Why a build plugin rather than a deploy step: the allowed hosts depend on `VITE_*` values,
 * and Vite inlines those into the bundle during this same build. Reading them from the
 * resolved config (`config.env`, i.e. `.env` files plus the process environment, exactly what
 * `import.meta.env` sees) means the policy and the code can never disagree. A post-build step
 * would have to be handed the same variables again and could drift.
 *
 * Not applied by the dev server: Vite's dev client and React Fast Refresh need inline script
 * and `eval`-like HMR, so dev runs without a policy. `vite preview` serves the built files and
 * therefore does run under it.
 */
import { basename } from 'node:path';
import type { Plugin } from 'vite';
import { cspForPage, cspMetaTag, type BuildEnv } from './csp';

const CHARSET_META = /<meta\s+charset=["']?utf-8["']?\s*\/?>/i;

/**
 * Inserts the policy directly after `<meta charset>`: the charset declaration stays first, and
 * the policy precedes every script, stylesheet and preload Vite adds, so it governs all of
 * them (a meta CSP only applies to content after it).
 */
export const injectCsp = (html: string, page: string, env: BuildEnv): string => {
  const policy = cspForPage(page, env);
  if (policy === null) {
    // A new HTML entry must get a deliberate policy, never silently none.
    throw new Error(`content-security-policy: no policy defined for ${page} (tools/deploy/csp.ts)`);
  }
  const charset = CHARSET_META.exec(html);
  if (charset === null) {
    throw new Error(`content-security-policy: ${page} has no <meta charset="utf-8"> to anchor the policy`);
  }
  const at = charset.index + charset[0].length;
  return `${html.slice(0, at)}\n    ${cspMetaTag(policy)}${html.slice(at)}`;
};

export const contentSecurityPolicy = (): Plugin => {
  let env: BuildEnv = {};
  return {
    name: 'qa3elhamor:content-security-policy',
    apply: 'build',
    configResolved(config) {
      env = config.env;
    },
    transformIndexHtml: {
      order: 'post',
      handler: (html, ctx) => injectCsp(html, basename(ctx.filename), env),
    },
  };
};
