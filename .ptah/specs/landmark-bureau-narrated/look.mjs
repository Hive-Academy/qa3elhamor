// Quick look at the bureau stop: node look.mjs <port> <tag> [click]
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/abdal/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');
const [port = '4413', tag = 'look', click = ''] = process.argv.slice(2);
if (port === '4400') throw new Error('owner port');
const dir = new URL('./shots/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const vps = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
for (const [name, vp] of Object.entries(vps)) {
  const ctx = await browser.newContext({ ...vp, reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`http://localhost:${port}/?quality=high`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  await page.evaluate(() => window.scrollTo({ top: 0.82 * (document.documentElement.scrollHeight - innerHeight), behavior: 'instant' }));
  await page.waitForTimeout(Number(process.env.WAIT ?? 4000));
  if (click) { await page.locator('[data-landmark-id="bureau"]').click(); await page.waitForTimeout(Number(click) || 8000); }
  await page.screenshot({ path: `${dir}${tag}-${name}.jpg`, type: 'jpeg', quality: 80 });
  await ctx.close();
}
await browser.close();
