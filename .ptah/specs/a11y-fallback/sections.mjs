// Element screenshots of each page-view section: node sections.mjs <outDir> [port] [width]
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/abdal/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');
const [outDir = '.', port = '4407', width = '1440'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--disable-webgl', '--disable-3d-apis'] });
const page = await browser.newPage({ viewport: { width: Number(width), height: 900 } });
await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
for (const id of ['about', 'experience', 'projects', 'services', 'contact', 'narration', 'credits']) {
  await page.locator(`#page-${id}`).screenshot({ path: `${outDir}/section-${id}-${width}.jpg`, type: 'jpeg', quality: 80 });
}
await browser.close();
