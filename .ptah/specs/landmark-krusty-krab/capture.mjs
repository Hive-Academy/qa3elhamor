// Capture for the narrated Krusty Krab visit (adapted from ../landmark-tiki/capture.mjs).
// node capture.mjs <outDir> [desktop|phone|all] [port] [bundled|original]
// Never run against the owner's port (4400).
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/abdal/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');

const [outDir = 'shots', only = 'all', port = '4412', cast = 'original'] = process.argv.slice(2);
if (port === '4400') throw new Error('4400 is the owner\'s port.');
const base = `http://localhost:${port}/`;
const query = `?quality=high&narrators=${cast}`;
const prefix = '';
const STOPS = { krusty: 0.6 };
const viewports = {
  desktop: { width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const facts = (page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    const speech = document.querySelector('.speech');
    const box = document.querySelector('.speech-box');
    const r = box?.getBoundingClientRect();
    const labels = [...document.querySelectorAll('.visit-object')].map((l) => {
      const b = l.getBoundingClientRect();
      return `${l.querySelector('.visit-object__label')?.textContent}@${Math.round(b.x + b.width / 2)},${Math.round(b.y + b.height / 2)}/${Math.round(b.width)}x${Math.round(b.height)}${l.style.visibility === 'visible' ? '' : ' hidden'}${l.dataset.selected === '' ? ' SELECTED' : ''}`;
    });
    return {
      active: a ? `${a.tagName.toLowerCase()}.${a.className}`.slice(0, 50) + ` "${(a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 50)}"` : null,
      region: document.querySelector('.lmk-stage[role="region"]')?.getAttribute('aria-label') ?? null,
      stage: document.querySelector('.visit-hud')?.dataset.stage ?? null,
      speaker: speech?.getAttribute('aria-label') ?? null,
      topic: document.querySelector('.speech__topic')?.textContent ?? null,
      spoken: document.querySelector('.speech__spoken')?.textContent?.slice(0, 80) ?? null,
      speechRect: r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null,
      labels,
      panel: document.querySelector('.visit-panel')?.getAttribute('aria-label') ?? document.querySelector('.speech__detail')?.getAttribute('aria-label') ?? null,
      dialog: document.querySelector('[role="dialog"] h2')?.textContent ?? null,
      menu: Boolean(document.querySelector('.krusty-menu')),
      scrollY: Math.round(scrollY),
    };
  });

async function scrollTo(page, fraction) {
  await page.evaluate((f) => {
    const max = document.documentElement.scrollHeight - innerHeight;
    window.scrollTo({ top: f * max, behavior: 'instant' });
  }, fraction);
}

const placed = (page) =>
  page.waitForFunction(() => document.querySelector('.speech-box')?.style.opacity === '1', null, { timeout: 90000 });
const tabletsUp = (page) =>
  page.waitForFunction(
    () => {
      const l = [...document.querySelectorAll('.visit-object')];
      return l.length > 0 && l.every((x) => x.style.pointerEvents === '' && x.style.visibility === 'visible');
    },
    null,
    { timeout: 120000 },
  );

for (const [name, vp] of Object.entries(viewports)) {
  if (only !== 'all' && only !== name) continue;
  const { width, height, ...rest } = vp;
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'no-preference', ...rest });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('console', m.text()));
  const shot = async (id, p = page) => {
    const file = `${outDir}/${prefix}${id}-${name}.jpg`;
    await p.screenshot({ path: file, type: 'jpeg', quality: 86 });
    console.log(name, cast, id, JSON.stringify(await facts(p)));
  };

  await page.goto(`${base}${query}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  await scrollTo(page, STOPS.krusty);
  await page.waitForTimeout(15000);
  await shot('a-arrival');

  await page.locator('[data-landmark-id="krusty-krab"]').click();
  await placed(page);
  await shot('b-narrator-arrives');
  await page.waitForTimeout(1200);
  await shot('b2-board-flipping');

  await tabletsUp(page);
  await page.waitForTimeout(800);
  await shot('c-crab-talking');

  // Select the second tablet: a real mouse movement on desktop, a tap on the phone.
  const second = page.locator('.visit-object').nth(1);
  if (name === 'desktop') {
    const box = await second.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2 - 6, box.y + box.height / 2);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
    }
  } else {
    await second.tap({ force: true });
  }
  await page.waitForFunction(() => document.querySelector('.visit-hud')?.dataset.stage === 'hint', null, { timeout: 30000 }).catch(() => console.log('no hint'));
  await page.waitForTimeout(4500);
  await shot('d-service-selected');

  // Keyboard: focus moves along the tablets with the arrow keys, and selects as it goes.
  await second.focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(3500);
  await shot('d2-arrow-key');

  const resume = page.locator('.speech__button', { hasText: 'Back to the tour' });
  if (await resume.count()) await resume.click();
  await page.waitForTimeout(600);
  const skip = page.locator('.speech__button', { hasText: 'Skip' });
  if (await skip.count()) await skip.click();
  await page.mouse.move(5, height / 2);
  await page.waitForTimeout(1800);
  await shot('e-last-line');

  const open = page.locator('.speech__button', { hasText: 'See the full menu' });
  if (await open.count()) await open.click();
  await page.waitForTimeout(4000);
  await shot('f-full-menu');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  console.log(name, 'after-esc-menu', JSON.stringify(await facts(page)));
  const leave = page.locator('.speech__button', { hasText: 'Back to the dive' });
  if (await leave.count()) await leave.click();
  await page.waitForTimeout(1300);
  await shot('g1-farewell');
  await page.waitForTimeout(7000);
  await shot('g2-after-leaving');
  await ctx.close();

  if (cast === 'bundled') {
    // Regression: the Pineapple on the kit, with SpongeBob.
    const sb = await browser.newContext({ viewport: { width, height }, reducedMotion: 'no-preference', ...rest });
    const sbPage = await sb.newPage();
    sbPage.on('pageerror', (e) => console.error('pageerror', e.message));
    await sbPage.goto(`${base}${query}`, { waitUntil: 'networkidle' });
    await sbPage.waitForTimeout(6000);
    await scrollTo(sbPage, STOPS.pineapple);
    await sbPage.waitForTimeout(2500);
    await sbPage.locator('[data-landmark-id="pineapple"]').click();
    await placed(sbPage);
    await sbPage.waitForFunction(() => document.querySelector('.speech')?.getAttribute('aria-label') === 'SpongeBob', null, { timeout: 60000 }).catch(() => console.log('not SpongeBob'));
    await tabletsUp(sbPage).catch(() => console.log('bubbles not out'));
    await sbPage.waitForTimeout(1500);
    await shot('p-pineapple-spongebob', sbPage);
    await sb.close();
  } else {
    // Fallback: reduced motion gets the full record in the dialog.
    const low = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', ...rest });
    const lowPage = await low.newPage();
    await lowPage.goto(`${base}?quality=high`, { waitUntil: 'networkidle' });
    await lowPage.waitForTimeout(5000);
    await scrollTo(lowPage, STOPS.krusty);
    await lowPage.waitForTimeout(2000);
    await lowPage.locator('[data-landmark-id="krusty-krab"]').click();
    await lowPage.waitForTimeout(2000);
    await shot('i-fallback-dialog', lowPage);
    await low.close();
  }
}
await browser.close();
