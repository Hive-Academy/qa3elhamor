// Throwaway: node capture.mjs <prefix> "<query>[;<query>...]" [waitMs=2500] [port=4417]
//   e.g. node capture.mjs shots/r1 "view=lineup&mode=idle;view=lineup&mode=talking&angle=three-quarter"
// Each shot is saved as <prefix>-<query with & and = flattened>.jpg next to this script.
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire('C:/Users/abdal/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');

const here = dirname(fileURLToPath(import.meta.url));
const [prefix, queries = 'view=lineup', wait = '2500', port = '4417'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.error('console', m.text().slice(0, 600)));
for (const query of queries.split(';')) {
  await page.goto(`http://localhost:${port}/@fs/D:/projects/qa3elhamor/.ptah/specs/narrators/preview/preview.html?${query}`);
  await page.waitForTimeout(Number(wait));
  const name = query.replace(/view=|mode=|angle=/g, '').replace(/[&=]/g, '-');
  const path = resolve(here, `${prefix}-${name}.jpg`);
  await page.screenshot({ path, type: 'jpeg', quality: 85 });
  console.log('wrote', path);
}
await browser.close();
