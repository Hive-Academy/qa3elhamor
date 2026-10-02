// Builds the public site for the e2e run and serves it with `vite preview`, in this one process
// (Playwright's webServer starts it and kills it). Usage: node scripts/serve.mjs <wired|bare> <port>
//
//   wired  the contact form is configured (Web3Forms with a fake access key). The tests intercept
//          the provider's request, so nothing leaves the machine.
//   bare   no provider configured: the default build, whose form says honestly it is not wired.
//
// Two builds because the provider is chosen at build time (docs/contact.md). Each is ~10 s.
// E2E_SKIP_BUILD=1 reuses the last build in .dist/<mode>.
import { build, preview } from 'vite';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const [mode, rawPort] = process.argv.slice(2);
const port = Number(rawPort);
if (!['wired', 'bare'].includes(mode) || !Number.isInteger(port)) {
  throw new Error('usage: node scripts/serve.mjs <wired|bare> <port>');
}

const root = resolve(import.meta.dirname, '../../web');
const outDir = resolve(import.meta.dirname, '../.dist', mode);

// Never inherit a provider (or wall) from the caller's shell: the mode decides.
for (const key of Object.keys(process.env)) {
  if (/^VITE_(CONTACT|WEB3FORMS|FORMSPREE|WALL)/.test(key)) delete process.env[key];
}
if (mode === 'wired') {
  process.env['VITE_CONTACT_PROVIDER'] = 'web3forms';
  process.env['VITE_WEB3FORMS_ACCESS_KEY'] = 'e2e-fake-access-key';
}

if (process.env['E2E_SKIP_BUILD'] === '1' && existsSync(resolve(outDir, 'index.html'))) {
  console.log(`[serve:${mode}] reusing ${outDir}`);
} else {
  await build({ root, logLevel: 'warn', build: { outDir, emptyOutDir: true } });
}

const server = await preview({
  root,
  logLevel: 'info',
  build: { outDir },
  preview: { port, strictPort: true, host: 'localhost' },
});
server.printUrls();
