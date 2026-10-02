// Throwaway capture for template-config: serves a built `dist` folder on its own port and takes
// JPEG screenshots of the dive start and the pineapple stop (plus the page view).
//   node .ptah/specs/template-config/capture.mjs <distDir> <outPrefix> [port] [base]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from '@playwright/test';

const [distDir, prefix, portArg = '4620', baseArg = '/'] = process.argv.slice(2);
const port = Number(portArg);
const base = baseArg.endsWith('/') ? baseArg : `${baseArg}/`;
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm',
  '.webp': 'image/webp', '.jpg': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (!path.startsWith(base)) { res.writeHead(404); return res.end(); }
  path = path.slice(base.length) || 'index.html';
  let file = normalize(join(distDir, path));
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise((resolve) => server.listen(port, 'localhost', resolve));

const url = `http://localhost:${port}${base}`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console ${m.text()}`); });

await page.goto(`${url}?quality=high&lang=en`, { waitUntil: 'networkidle' });
await page.waitForTimeout(7000);
console.log('title:', await page.title());
console.log('theme-color:', await page.locator('meta[name="theme-color"]').getAttribute('content'));
await page.screenshot({ path: `${prefix}-start.jpg`, type: 'jpeg', quality: 80 });
await page.evaluate(() => {
  const max = document.documentElement.scrollHeight - innerHeight;
  scrollTo({ top: 0.2 * max, behavior: 'instant' });
});
await page.waitForTimeout(3500);
await page.screenshot({ path: `${prefix}-pineapple.jpg`, type: 'jpeg', quality: 80 });

await page.goto(`${url}?view=page&lang=en`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${prefix}-page.jpg`, type: 'jpeg', quality: 80 });
if (process.env.CAPTURE_AR === '1') {
  await page.goto(`${url}?lang=ar&quality=high`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${prefix}-start-ar.jpg`, type: 'jpeg', quality: 80 });
}
if (process.env.CAPTURE_KRUSTY === '1') {
  await page.goto(`${url}?quality=high&lang=en`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  await page.evaluate(() => {
    const max = document.documentElement.scrollHeight - innerHeight;
    scrollTo({ top: 0.6 * max, behavior: 'instant' });
  });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${prefix}-krusty.jpg`, type: 'jpeg', quality: 80 });
}
if (process.env.CAPTURE_OPEN) {
  // Opens a landmark from the nav, in-world (motion allowed), and captures its visit.
  const live = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const visit = await live.newPage();
  visit.on('pageerror', (e) => problems.push(`pageerror ${e.message}`));
  await visit.goto(`${url}?quality=high&lang=en`, { waitUntil: 'networkidle' });
  await visit.waitForTimeout(6000);
  await visit.getByRole('navigation', { name: 'Landmarks' }).getByRole('button', { name: new RegExp(process.env.CAPTURE_OPEN) }).click();
  await visit.waitForTimeout(9000);
  await visit.screenshot({ path: `${prefix}-open.jpg`, type: 'jpeg', quality: 80 });
  await live.close();
}
console.log(problems.length ? problems.join('\n') : 'no page errors');
await browser.close();
server.close();
