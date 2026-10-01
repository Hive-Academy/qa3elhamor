// Throwaway: node capture.mjs <glb-url> <out-prefix> [raw=0] [views] [dist]
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/abdal/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');
const [glb, prefix, raw = '0', views = 'front,three-quarter,side,back,face', dist = '4.5'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 800, height: 700 } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('console', m.text().slice(0, 300)));
for (const view of views.split(',')) {
  await page.goto(`http://127.0.0.1:4731/.ptah/specs/narrators/lods/viewer.html?glb=${encodeURIComponent(glb)}&view=${view}&raw=${raw}&dist=${dist}`);
  await page.waitForFunction(() => document.title !== '', null, { timeout: 120000 });
  console.log(view, await page.title());
  await page.screenshot({ path: `${prefix}-${view}.jpg`, type: 'jpeg', quality: 85 });
}
await browser.close();
