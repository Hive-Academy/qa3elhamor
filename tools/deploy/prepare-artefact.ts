/**
 * Turns a `web:build` output into the static GitHub Pages artefact, in place:
 *
 *   npm run deploy:prepare [-- --dist <dir>]
 *
 *   - removes `moderation.html` and the chunks only it uses (the moderation console talks to the
 *     complaints API, which a static deploy does not have, and it is not a public page),
 *   - removes `/admin` (the Decap CMS) unless PAGES_INCLUDE_ADMIN=true,
 *   - copies `index.html` to `404.html` so unknown paths load the app,
 *   - adds `.nojekyll` so Pages serves files whose names start with an underscore as-is,
 *   - fails unless `index.html` carries the build-time Content Security Policy <meta> (Pages
 *     cannot send a CSP header, so a build without the plugin would ship with no policy).
 *
 * Idempotent. Why each choice: docs/deploy.md.
 */
import { copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageLoad } from '../perf-budget/dist-graph';
import { CSP_META_PATTERN } from './csp';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const index = process.argv.indexOf('--dist');
const distDir = resolve(index === -1 ? resolve(repoRoot, 'apps/web/dist') : process.argv[index + 1]);
const siteBase = (process.env['SITE_BASE'] ?? '/').replace(/^\/+|\/+$/g, '');
const base = siteBase === '' ? '/' : `/${siteBase}/`;

if (!existsSync(resolve(distDir, 'index.html'))) {
  console.error(`prepare-artefact: ${distDir}/index.html not found. Run "npx nx run web:build" first.`);
  process.exit(2);
}

// The public site must ship with its policy; see tools/deploy/csp.ts and docs/security.md.
const policy = CSP_META_PATTERN.exec(readFileSync(resolve(distDir, 'index.html'), 'utf8'))?.[1];
if (policy === undefined || !policy.includes("default-src 'self'")) {
  console.error('prepare-artefact: index.html has no Content-Security-Policy <meta>. Was it built by web:build?');
  process.exit(2);
}

const removed: string[] = [];
const remove = (relativePath: string): void => {
  const target = resolve(distDir, relativePath);
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
    removed.push(relativePath);
  }
};

// Moderation: delete the page and every file that only it reaches.
if (existsSync(resolve(distDir, 'moderation.html'))) {
  const publicSet = new Set<string>();
  const main = pageLoad(distDir, 'index.html', base);
  for (const file of [...main.all, ...main.lazyJs]) publicSet.add(file);
  const moderation = pageLoad(distDir, 'moderation.html', base);
  for (const file of [...moderation.all, ...moderation.lazyJs]) {
    if (!publicSet.has(file)) remove(file);
  }
  remove('moderation.html');
}

if (process.env['PAGES_INCLUDE_ADMIN'] !== 'true') remove('admin');

copyFileSync(resolve(distDir, 'index.html'), resolve(distDir, '404.html'));
writeFileSync(resolve(distDir, '.nojekyll'), '');

console.log(`prepare-artefact: ${distDir}`);
console.log(`  removed: ${removed.length > 0 ? removed.join(', ') : '(nothing)'}`);
console.log('  added:   404.html, .nojekyll');
console.log(`  csp:     ${policy}`);
