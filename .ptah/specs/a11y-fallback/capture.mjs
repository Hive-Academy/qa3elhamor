// Capture + axe for the a11y-fallback page view.
// node capture.mjs <outDir> [port] [axePath]
// Chromium runs with WebGL disabled for the no-WebGL path; a second, WebGL-capable browser
// covers ?view=page and the dive's "read it as a page" link.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire('C:/Users/abdal/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');

const [outDir = '.', port = '4407', axePath] = process.argv.slice(2);
const base = `http://localhost:${port}/`;
const axeSource = axePath ? readFileSync(axePath, 'utf8') : null;

const viewports = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

async function axe(page, label) {
  if (!axeSource) return;
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async () =>
    // eslint-disable-next-line no-undef
    axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }),
  );
  console.log(`AXE ${label}: ${result.violations.length} violations, ${result.passes.length} passes, ${result.incomplete.length} incomplete`);
  for (const v of result.violations) {
    console.log(`  - ${v.id} [${v.impact}] ${v.help} (${v.nodes.length})`);
    for (const n of v.nodes.slice(0, 4)) console.log(`      ${n.target.join(' ')} :: ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`);
  }
  for (const v of result.incomplete.filter((i) => i.id === 'color-contrast')) {
    console.log(`  ? ${v.id} needs review on ${v.nodes.length} nodes`);
  }
}

const facts = (page) =>
  page.evaluate(() => ({
    canvas: Boolean(document.querySelector('canvas')),
    page: Boolean(document.querySelector('.page-view')),
    notice: document.querySelector('.page-view__notice p')?.textContent ?? null,
    sections: [...document.querySelectorAll('.page-section h2')].map((h) => h.textContent),
    h1: [...document.querySelectorAll('h1')].map((h) => h.textContent),
    overflowX: document.documentElement.scrollWidth > innerWidth,
    search: location.search,
  }));

async function run(name, launchArgs, flows) {
  const browser = await chromium.launch({ args: launchArgs });
  for (const [vpName, vp] of Object.entries(viewports)) {
    const ctx = await browser.newContext({ ...vp, reducedMotion: 'no-preference' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.error('pageerror', e.message));
    page.on('console', (m) => m.type() === 'error' && console.error('console', m.text().slice(0, 200)));
    for (const flow of flows) await flow(page, `${name}-${vpName}`);
    await ctx.close();
  }
  await browser.close();
}

const shot = async (page, id, fullPage = false) => {
  const file = `${outDir}/${id}.jpg`;
  await page.screenshot({ path: file, type: 'jpeg', quality: 82, fullPage });
  console.log(id, JSON.stringify(await facts(page)));
};

// 1. No WebGL at all: the page must be what loads.
await run('nowebgl', ['--disable-webgl', '--disable-3d-apis'], [
  async (page, id) => {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForSelector('.page-view');
    await shot(page, `${id}-top`);
    await shot(page, `${id}-full`, true);
    await page.keyboard.press('Tab');
    await shot(page, `${id}-skiplink`);
    await axe(page, id);
  },
]);

// 2. ?view=page with WebGL available, and the dive's skip link.
await run('webgl', ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], [
  async (page, id) => {
    await page.goto(`${base}?view=page`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.page-view');
    await shot(page, `${id}-viewpage-top`);
    await page.locator('#page-contact').scrollIntoViewIfNeeded();
    await shot(page, `${id}-viewpage-contact`);
    await axe(page, `${id}-viewpage`);
  },
  async (page, id) => {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await page.keyboard.press('Tab');
    await shot(page, `${id}-dive-skiplink`);
    await page.keyboard.press('Enter');
    await page.waitForSelector('.page-view');
    await shot(page, `${id}-dive-to-page`);
    await page.locator('.page-view__notice .page-view__dive-link').click();
    await page.waitForSelector('canvas');
    console.log(id, 'back to dive', JSON.stringify(await facts(page)));
  },
]);
