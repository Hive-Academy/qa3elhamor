// Reduced-motion fallback on a phone: the Bureau opens its dialog form. node capture-fallback.mjs [port]
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/abdal/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');
const port = process.argv[2] ?? '4413';
if (port === '4400') throw new Error('4400 is the owner port.');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce' });
const page = await ctx.newPage();
await page.goto(`http://localhost:${port}/?quality=high`, { waitUntil: 'networkidle' });
await page.waitForTimeout(5000);
await page.locator('.lmk-index__item', { hasText: 'Complaints Bureau' }).click();
await page.waitForTimeout(2500);
const dir = new URL('./shots/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
await page.screenshot({ path: `${dir}delivered-z-fallback-dialog-phone.jpg`, type: 'jpeg', quality: 84 });
console.log(await page.evaluate(() => ({ dialog: Boolean(document.querySelector('[role=dialog]')), active: document.activeElement?.getAttribute('name') })));
await browser.close();
