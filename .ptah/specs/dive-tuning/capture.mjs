// Throwaway capture: node capture.mjs <prefix> '<positions json>'
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/abdal/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');

const [prefix, json, only] = process.argv.slice(2);
const positions = JSON.parse(json);
const viewports = { desktop: { width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [name, vp] of Object.entries(viewports)) {
  if (only && only !== name) continue;
  const { width, height, ...rest } = vp;
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', ...rest });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto('http://localhost:4401/?quality=high', { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  for (const [id, frac] of Object.entries(positions)) {
    await page.evaluate((f) => {
      const max = document.documentElement.scrollHeight - innerHeight;
      scrollTo({ top: f * max, behavior: 'instant' });
    }, frac);
    await page.waitForTimeout(2500);
    const file = `${prefix}-${id}-${name}.jpg`;
    await page.screenshot({ path: file });
    console.log('wrote', file);
  }
  await ctx.close();
}
await browser.close();
