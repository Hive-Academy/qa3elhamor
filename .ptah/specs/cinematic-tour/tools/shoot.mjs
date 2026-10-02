// Screenshots of the cinematic tour against the dev server (port 4490). Not part of any build.
//   node shoot.mjs <shot> [more shots...]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:4490';
const OUT = resolve(import.meta.dirname, '..', 'screens');
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tourState = (page) => page.evaluate(() => document.documentElement.dataset.tourState ?? null);
async function waitTour(page, pattern, timeout = 120_000) {
  const start = Date.now();
  for (;;) {
    const s = await tourState(page);
    if (s && pattern.test(s)) return s;
    if (Date.now() - start > timeout) throw new Error(`tour state ${s} never matched ${pattern}`);
    await sleep(200);
  }
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 80 });

const SHOTS = {
  async intro(browser, viewport = { width: 1440, height: 900 }, name = 'intro-title', lang = 'en') {
    const page = await browser.newPage({ viewport });
    page.on('console', (m) => m.type() === 'error' && console.log('console error:', m.text()));
    page.on('pageerror', (e) => console.log('page error:', e.message));
    await page.goto(`${BASE}/?tour=on&quality=high&lang=${lang}`);
    await waitTour(page, /^intro$/);
    await sleep(Number(process.env.SETTLE ?? 6000));
    await shot(page, name);
    return page;
  },
  async closeup(browser) {
    const page = await SHOTS.intro(browser, undefined, 'intro-title');
    await page.screenshot({ path: `${OUT}/title-closeup.jpg`, type: 'jpeg', quality: 85, clip: { x: 340, y: 220, width: 760, height: 320 } });
    return page;
  },
  async 'dive-under'(browser) {
    const page = await SHOTS.intro(browser, undefined, 'intro-title');
    await page.getByRole('button', { name: 'Begin the journey' }).click();
    await sleep(Number(process.env.AFTER ?? 1300));
    await shot(page, 'dive-under');
    return page;
  },
  async 'rm-journey'(browser) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('page error:', e.message));
    await page.goto(`${BASE}/?tour=on&quality=high&lang=en`);
    await waitTour(page, /^intro$/);
    await page.getByRole('button', { name: 'Begin the journey' }).click();
    for (let i = 0; i < 4; i++) {
      await waitTour(page, /^visiting$/);
      await page.getByRole('dialog').waitFor({ timeout: 30_000 });
      await sleep(600);
      if (i === 0) await shot(page, 'rm-stop-dialog');
      console.log('stop', i, await tourState(page), await page.getByRole('dialog').getAttribute('aria-label'));
      if (i === 3) break;
      await page.keyboard.press('Escape');
      await sleep(150);
      if (i === 0) await shot(page, 'rm-cut');
    }
    console.log('end', await tourState(page));
    return page;
  },
  async 'intro-ar'(browser) {
    return SHOTS.intro(browser, undefined, 'intro-arabic', 'ar');
  },
  async 'intro-mobile'(browser) {
    return SHOTS.intro(browser, { width: 390, height: 844 }, 'intro-mobile');
  },
  async 'reduced-motion'(browser) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(`${BASE}/?tour=on&quality=high&lang=en`);
    await waitTour(page, /^intro$/);
    await sleep(3000);
    await shot(page, 'intro-reduced-motion');
    return page;
  },
  async journey(browser) {
    const page = await SHOTS.intro(browser, undefined, 'intro-title');
    await page.getByRole('button', { name: 'Begin the journey' }).click();
    await waitTour(page, /^flying$/);
    await sleep(Number(process.env.MID ?? 2200));
    await shot(page, 'mid-flight');
    await waitTour(page, /^visiting$/);
    await page.waitForSelector('[data-visit-state="talking"], [data-visit-state="ready"]', { timeout: 120_000 });
    await sleep(Number(process.env.LINE ?? 2500));
    await shot(page, 'stop-narration');
    // Wait for the hands-free advance to the next line, then shoot again.
    await sleep(Number(process.env.NEXT ?? 6000));
    await shot(page, 'stop-narration-2');
    return page;
  },
  async timeline(browser) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log(m.type(), m.text().slice(0, 200)));
    page.on('pageerror', (e) => console.log('page error:', e.message));
    await page.goto(`${BASE}/?tour=on&quality=high&lang=${process.env.LANG_ ?? 'en'}`);
    await waitTour(page, /^intro$/);
    await sleep(2500);
    await page.getByRole('button', { name: process.env.BEGIN ?? 'Begin the journey' }).click();
    const start = Date.now();
    let last = '';
    let n = 0;
    while (Date.now() - start < Number(process.env.FOR ?? 150_000)) {
      const s = await page.evaluate(() => {
        const v = document.querySelector('[data-visit-state]');
        const status = document.querySelector('.tour-bar__status')?.textContent ?? '';
        return `${document.documentElement.dataset.tourState}|${v?.getAttribute('data-visit-state') ?? '-'}|${status}`;
      });
      if (s !== last) {
        console.log(((Date.now() - start) / 1000).toFixed(1), s);
        if (process.env.SNAP) await shot(page, `t-${String(n++).padStart(2, '0')}`);
        last = s;
      }
      if (s.startsWith('finale') || s.startsWith('free')) break;
      await sleep(250);
    }
    await sleep(1500);
    await shot(page, process.env.END ?? 'finale');
    return page;
  },
};

const browser = await chromium.launch({
  args: (process.env.GL ?? '--use-angle=d3d11,--enable-gpu,--ignore-gpu-blocklist').split(','),
});
try {
  for (const name of process.argv.slice(2)) {
    console.log('shot', name);
    const page = await SHOTS[name](browser);
    await page.close();
  }
} finally {
  await browser.close();
}
