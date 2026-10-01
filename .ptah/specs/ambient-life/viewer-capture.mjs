// Throwaway: node viewer-capture.mjs <prefix> [views=side,front,three-quarter,top,fish,kelp]
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/abdal/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');

const [prefix, viewsArg = 'side,front,three-quarter,top,fish,kelp'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('console', m.text().slice(0, 400)));
for (const view of viewsArg.split(',')) {
  await page.goto(`http://localhost:4402/@fs/D:/projects/qa3elhamor/.ptah/specs/ambient-life/viewer.html?view=${view}`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${prefix}-${view}.jpg` });
  console.log('wrote', `${prefix}-${view}.jpg`);
}
await browser.close();
