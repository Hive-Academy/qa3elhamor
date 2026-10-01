// Prototype capture for the narrated Pineapple visit.
// node capture.mjs <outDir> [desktop|phone] [port] [prefix]
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/abdal/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');

const [outDir = '.', only, port = '4405', prefix = ''] = process.argv.slice(2);
const base = `http://localhost:${port}/`;
const PINEAPPLE_SCROLL = 0.2;
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
    const line = document.querySelector('.speech__line');
    const box = document.querySelector('.speech-box');
    const r = box?.getBoundingClientRect();
    const labels = [...document.querySelectorAll('.pa-skill')].map((l) => {
      const b = l.getBoundingClientRect();
      return `${l.textContent}@${Math.round(b.x + b.width / 2)},${Math.round(b.y + b.height / 2)}/${Math.round(b.width)}${l.style.visibility === 'visible' ? '' : ' hidden'}`;
    });
    return {
      active: a ? `${a.tagName.toLowerCase()}.${a.className}`.slice(0, 60) + ` "${(a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 40)}"` : null,
      region: document.querySelector('.lmk-stage[role="region"]')?.getAttribute('aria-label') ?? null,
      stage: document.querySelector('.pa-hud')?.dataset.stage ?? null,
      speaker: speech?.getAttribute('aria-label') ?? null,
      spoken: document.querySelector('.speech__spoken')?.textContent?.slice(0, 60) ?? null,
      lineFont: line ? getComputedStyle(line).fontSize : null,
      speechRect: r ? [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] : null,
      labels,
      panel: document.querySelector('.pa-skill-panel')?.getAttribute('aria-label') ?? null,
      dialog: document.querySelector('[role="dialog"] h2')?.textContent ?? null,
      card: Boolean(document.querySelector('.citizen-pass')),
      scrollY: Math.round(scrollY),
    };
  });

async function scrollToPineapple(page) {
  await page.evaluate((f) => {
    const max = document.documentElement.scrollHeight - innerHeight;
    scrollTo({ top: f * max, behavior: 'instant' });
  }, PINEAPPLE_SCROLL);
}

const openPineapple = (page) => page.locator('[data-landmark-id="pineapple"]').click();

for (const [name, vp] of Object.entries(viewports)) {
  if (only && only !== 'all' && only !== name) continue;
  const { width, height, ...rest } = vp;
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'no-preference', ...rest });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('console', m.text()));
  const shot = async (id) => {
    const file = `${outDir}/${prefix}${id}-${name}.jpg`;
    await page.screenshot({ path: file, type: 'jpeg', quality: 88 });
    console.log(name, id, JSON.stringify(await facts(page)));
  };

  await page.goto(`${base}?quality=high`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  await scrollToPineapple(page);
  await page.waitForTimeout(3500);
  await shot('a-arrival');

  await openPineapple(page);
  // The first line typing: wait for the bubble to be placed (swiftshader runs at a few fps).
  await page.waitForFunction(() => document.querySelector('.speech-box')?.style.opacity === '1', null, { timeout: 60000 });
  await shot('b-narrator-arrives');

  await page.waitForTimeout(3000);
  const next = page.locator('.speech__button', { hasText: 'Next' });
  if (await next.count()) await next.click();
  await page.waitForTimeout(4500);
  await shot('c-mid-dialogue');

  const label = page.locator('.pa-skill').nth(1);
  if (await label.count()) await label.hover({ force: true });
  await page.waitForTimeout(4500);
  await shot('d-bubble-selected');

  const resume = page.locator('.speech__button', { hasText: 'Back to the tour' });
  if (await resume.count()) await resume.click();
  await page.waitForTimeout(600);
  const skip = page.locator('.speech__button', { hasText: 'Skip' });
  if (await skip.count()) await skip.click();
  await page.mouse.move(5, height / 2);
  await page.waitForTimeout(1800);
  await shot('e-last-line');

  const openCard = page.locator('.speech__button', { hasText: 'Open the full Citizenship Card' });
  if (await openCard.count()) await openCard.click();
  await page.waitForTimeout(3500);
  await shot('f-full-card');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  console.log(name, 'after-esc-card', JSON.stringify(await facts(page)));
  const leave = page.locator('.speech__button', { hasText: 'Back to the dive' });
  if (await leave.count()) await leave.click();
  await page.waitForTimeout(1300);
  await shot('g1-farewell');
  await page.waitForTimeout(6000);
  await shot('g2-after-leaving');

  // Leave by scrolling: reopen, wheel the page.
  await openPineapple(page);
  await page.waitForTimeout(3000);
  await page.mouse.move(width / 2, height - 140);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(2500);
  console.log(name, 'after-scroll-away', JSON.stringify(await facts(page)));
  await ctx.close();

  if (name === 'desktop') {
    const sb = await browser.newContext({ viewport: { width, height }, reducedMotion: 'no-preference', ...rest });
    const sbPage = await sb.newPage();
    sbPage.on('pageerror', (e) => console.error('pageerror', e.message));
    await sbPage.goto(`${base}?quality=high&narrators=bundled`, { waitUntil: 'networkidle' });
    await sbPage.waitForTimeout(6000);
    await scrollToPineapple(sbPage);
    await sbPage.waitForTimeout(2500);
    await openPineapple(sbPage);
    await sbPage.waitForFunction(() => document.querySelector('.speech-box')?.style.opacity === '1', null, { timeout: 90000 });
    await sbPage.waitForTimeout(5000);
    await sbPage.screenshot({ path: `${outDir}/${prefix}h-spongebob-${name}.jpg`, type: 'jpeg', quality: 88 });
    console.log(name, 'h-spongebob', JSON.stringify(await facts(sbPage)));
    await sb.close();
  }

  const low = await browser.newContext({ viewport: { width, height }, reducedMotion: 'no-preference', ...rest });
  const lowPage = await low.newPage();
  await lowPage.goto(`${base}?quality=low`, { waitUntil: 'networkidle' });
  await lowPage.waitForTimeout(5000);
  await scrollToPineapple(lowPage);
  await lowPage.waitForTimeout(2000);
  await openPineapple(lowPage);
  await lowPage.waitForTimeout(1500);
  await lowPage.screenshot({ path: `${outDir}/${prefix}i-low-fallback-${name}.jpg`, type: 'jpeg', quality: 88 });
  console.log(name, 'i-low-fallback', JSON.stringify(await facts(lowPage)));
  await low.close();
}
await browser.close();
