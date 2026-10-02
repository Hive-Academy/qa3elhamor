// Captures the ocean-text preview (served on 4470 by serve-preview.mjs) as JPEGs into ../screens.
// Usage: node .ptah/specs/ocean-text/tools/capture.mjs [shot ...]   (default: all en ar title reveal)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const out = resolve(import.meta.dirname, '../screens');
mkdirSync(out, { recursive: true });

const SHOTS = {
  all: 'shot=all',
  en: 'shot=en',
  ar: 'shot=ar',
  title: 'shot=title',
  // Mid-typewriter: the newest letters are caught surfacing (scaled, risen, fading in).
  reveal: 'shot=reveal&type=1',
  reduced: 'shot=all&rm=1',
};
const WAIT = { reveal: 1500 };
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : ['all', 'en', 'ar', 'title', 'reveal'];

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
for (const name of wanted) {
  await page.goto(`http://localhost:4470/ocean-text-preview.html?${SHOTS[name]}`);
  await page.waitForSelector('body[data-ocean-ready="1"]', { timeout: 60_000 });
  await page.waitForTimeout(WAIT[name] ?? 3500);
  // The typewriter shot is a short burst, to catch letters mid-surface.
  const frames = name === 'reveal' ? 4 : 1;
  for (let f = 0; f < frames; f++) {
    const path = resolve(out, frames > 1 ? `${name}-${f + 1}.jpg` : `${name}.jpg`);
    await page.screenshot({ path, type: 'jpeg', quality: 80, clip: name === 'reveal' ? { x: 200, y: 220, width: 900, height: 340 } : undefined });
    console.log('wrote', path);
  }
}
await browser.close();
const interesting = logs.filter((l) => !/Download the React DevTools|\[vite\]/u.test(l));
if (interesting.length) console.log(interesting.join('\n'));
