/**
 * Starts a fork from neutral sample content: copies `content.example/*.json` over `content/`,
 * so the site you build is no longer the original owner's. Nothing else is touched.
 *
 *   npm run template:reset            refuses if content/ has uncommitted changes (or git
 *                                     cannot tell)
 *   npm run template:reset -- --force overwrites them anyway
 *
 * Then make it yours: docs/template.md.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const from = resolve(root, 'content.example');
const to = resolve(root, 'content');
const force = process.argv.includes('--force');

/** `git status` of content/, or null where git is unavailable (a downloaded zip). */
function uncommitted(): string | null {
  try {
    return execFileSync('git', ['status', '--porcelain', '--', 'content'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
}

const changes = uncommitted();
if (changes === null && !force) {
  // No git to ask (a downloaded zip, git missing): no way to know what would be lost.
  console.error(
    'template:reset: cannot check content/ for uncommitted changes (git is unavailable here).\n' +
      'If nothing in content/ needs keeping, run `npm run template:reset -- --force`.',
  );
  process.exit(1);
}
if (changes && !force) {
  console.error(
    `template:reset: content/ has uncommitted changes, which this would overwrite:\n${changes}\n` +
      'Commit them first, or run `npm run template:reset -- --force`.',
  );
  process.exit(1);
}

const files = readdirSync(from).filter((name) => name.endsWith('.json'));
// `content/package.json` only makes the folder importable; it is not content.
const expected = readdirSync(to).filter((name) => name.endsWith('.json') && name !== 'package.json');
const missing = expected.filter((name) => !files.includes(name));
if (missing.length > 0) {
  console.error(`template:reset: content.example/ has no ${missing.join(', ')}; nothing was copied.`);
  process.exit(1);
}

for (const name of files) copyFileSync(resolve(from, name), resolve(to, name));

console.log(
  [
    `template:reset: copied ${files.length} sample files into content/ (${files.join(', ')}).`,
    '',
    'Next (docs/template.md, "Make it yours in 30 minutes"):',
    '  1. Edit content/*.json: your name, bio, résumé, services, projects, narration, credits.',
    '     Delete each file\'s "_sample" note when you are done. Check: npx nx validate content-data-access',
    '  2. Edit apps/web/src/site.config.ts: brand, theme, languages, landmarks, dive, cast.',
    '  3. Point the CMS at your repository: apps/web/public/admin/config.yml → backend.repo.',
    '  4. Set your deploy variables (docs/deploy.md) and build: npx nx build web',
  ].join('\n'),
);
