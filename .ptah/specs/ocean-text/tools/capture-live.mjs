// Captures the live dive (dev server on PORT, default 4497) as JPEGs into ../screens/live-*.jpg.
// Usage: node .ptah/specs/ocean-text/tools/capture-live.mjs [shot ...]
// Shots: bubble-en bubble-ar skills beacons tour tiki krusty bureau fallback reduced
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PORT = process.env.PORT ?? '4497';
const GL = process.env.GL ?? 'gl';
const out = resolve(import.meta.dirname, '../screens');
mkdirSync(out, { recursive: true });

const base = (lang, extra = '') => `http://localhost:${PORT}/?quality=high&lang=${lang}${extra}`;
const NAV = {
  pineapple: /^The Pineapple|^الأناناسة|أناناس/u,
  tiki: /^Tiki Head|تيكي/u,
  krusty: /^The Krusty Krab|كراستي/u,
  bureau: /^Complaints Bureau|شكاوى/u,
};

async function open(page, nav) {
  const button = page.getByRole('navigation').getByRole('button', { name: nav });
  await button.waitFor({ timeout: 120_000 });
  await page.waitForTimeout(3000);
  await button.focus();
  await button.press('Enter');
  await page.waitForSelector('[data-visit-state="talking"], [data-visit-state="ready"]', { timeout: 120_000 });
}

async function skip(page) {
  const skipButton = page.locator('.speech .speech__button--quiet').first();
  if (await skipButton.count()) {
    await skipButton.focus();
    await skipButton.press('Enter');
  }
}

const SHOTS = {
  'bubble-en': async (page) => {
    await page.goto(base('en'));
    await open(page, NAV.pineapple);
    await page.waitForTimeout(Number(process.env.AT ?? 1500));
  },
  'bubble-ar': async (page) => {
    await page.goto(base('ar'));
    await open(page, NAV.pineapple);
    await page.waitForTimeout(Number(process.env.AT ?? 1500));
  },
  talk: async (page) => {
    await page.goto(base(process.env.LANG_ ?? 'en'));
    await open(page, NAV[process.env.LANDMARK ?? 'tiki']);
    await page.waitForTimeout(Number(process.env.AT ?? 2500));
  },
  skills: async (page) => {
    await page.goto(base('en'));
    await open(page, NAV.pineapple);
    await skip(page);
    await page.waitForTimeout(6000);
  },
  beacons: async (page) => {
    await page.goto(base(process.env.LANG_ ?? 'en'));
    await page.waitForSelector('canvas', { timeout: 120_000 });
    const explore = page.locator('.tour-intro .tour-button--quiet');
    if (await explore.count()) await explore.click();
    await page.waitForTimeout(1500);
    await page.mouse.wheel(0, Number(process.env.SCROLL ?? 2600));
    await page.waitForTimeout(6000);
  },
  tour: async (page) => {
    await page.goto(base(process.env.LANG_ ?? 'en', '&tour=on'));
    const begin = page.locator('.tour-intro .tour-button--primary');
    await begin.waitFor({ timeout: 120_000 });
    await page.waitForTimeout(2500);
    await begin.click();
    await page.waitForTimeout(Number(process.env.AT ?? 3200));
  },
  tiki: async (page) => {
    await page.goto(base(process.env.LANG_ ?? 'en'));
    await open(page, NAV.tiki);
    await skip(page);
    await page.waitForTimeout(7000);
  },
  krusty: async (page) => {
    await page.goto(base(process.env.LANG_ ?? 'en'));
    await open(page, NAV.krusty);
    await skip(page);
    await page.waitForTimeout(7000);
  },
  bureau: async (page) => {
    await page.goto(base(process.env.LANG_ ?? 'en'));
    await open(page, NAV.bureau);
    await skip(page);
    await page.waitForTimeout(1500);
    const file = page.locator('.speech .speech__button--primary').first();
    if (await file.count()) {
      await file.focus();
      await file.press('Enter');
    }
    await page.waitForTimeout(5000);
  },
  fullview: async (page) => {
    await page.goto(base(process.env.LANG_ ?? 'en'));
    await open(page, NAV[process.env.LANDMARK ?? 'pineapple']);
    await skip(page);
    await page.waitForTimeout(2500);
    const full = page.locator('.speech .speech__button--primary').first();
    await full.focus();
    await full.press('Enter');
    await page.waitForTimeout(4000);
  },
  fallback: async (page) => {
    await page.goto(base('en', '&oceanText=off'));
    await open(page, NAV.pineapple);
    await page.waitForTimeout(2500);
  },
  reduced: async (page) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(base('en'));
    await page.waitForSelector('canvas', { timeout: 120_000 });
    const button = page.getByRole('navigation').getByRole('button', { name: NAV.pineapple });
    await button.focus();
    await button.press('Enter');
    await page.waitForTimeout(2500);
  },
};

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHOTS);
const args =
  GL === 'swiftshader'
    ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
    : [`--use-angle=${GL}`, '--enable-gpu', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args });
for (const name of wanted) {
  const shot = SHOTS[name];
  if (!shot) continue;
  const width = Number(process.env.W ?? 1440);
  const height = Number(process.env.H ?? 900);
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: Number(process.env.DPR ?? 1) });
  const logs = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  try {
    await shot(page);
    const mode = await page.locator('html').getAttribute('data-ocean-text');
    const path = resolve(out, `live-${name}${process.env.SUFFIX ?? ''}.jpg`);
    await page.screenshot({ path, type: 'jpeg', quality: 80 });
    console.log('wrote', path, 'ocean-text:', mode);
  } catch (error) {
    console.log('failed', name, error.message);
    await page.screenshot({ path: resolve(out, `live-${name}-error.jpg`), type: 'jpeg', quality: 70 }).catch(() => {});
  }
  const interesting = logs.filter((l) => !/Download the React DevTools|\[vite\]|THREE\.WebGLRenderer|GPU stall|Automatic fallback/u.test(l));
  if (interesting.length) console.log(interesting.slice(0, 12).join('\n'));
  await page.close();
}
await browser.close();
