// Prototype capture for the Pineapple in-world card.
// node capture.mjs <outDir> [desktop|phone] [port]
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/abdal/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');

const [outDir = '.', only, port = '4403'] = process.argv.slice(2);
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
    const card = document.querySelector('.citizen-pass');
    const rect = card?.getBoundingClientRect();
    const region = document.querySelector('.lmk-stage[role="region"]');
    return {
      active: a ? `${a.tagName.toLowerCase()}.${a.className}`.slice(0, 80) + (a.getAttribute('aria-label') ? ` [${a.getAttribute('aria-label')}]` : '') + ` "${(a.textContent || '').trim().slice(0, 40)}"` : null,
      region: region?.getAttribute('aria-label') ?? null,
      cardInRegion: card && region ? region.contains(card) : null,
      cardScreenScale: card && rect ? +(rect.width / card.offsetWidth).toFixed(4) : null,
      cardRect: rect ? [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)] : null,
      dialog: document.querySelector('[role="dialog"]')?.getAttribute('aria-labelledby') ? document.querySelector('[role="dialog"] h2')?.textContent : null,
      focusInDialog: Boolean(document.activeElement?.closest('[role="dialog"]')),
      moreHint: [...document.querySelectorAll('.citizen-pass__viewport')].map((v) => v.hasAttribute('data-more')),
      scrollRegions: [...document.querySelectorAll('.citizen-pass__scroll[role="region"]')].map((r) => r.getAttribute('aria-label')),
      scrollY: Math.round(scrollY),
    };
  });

async function scrollToPineapple(page) {
  await page.evaluate((f) => {
    const max = document.documentElement.scrollHeight - innerHeight;
    scrollTo({ top: f * max, behavior: 'instant' });
  }, PINEAPPLE_SCROLL);
}

// Slow motion for the transition frame: page clocks (R3F) and CSS animations run at `rate`.
async function slowMotion(page, rate) {
  await page.evaluate((r) => {
    const real = performance.now.bind(performance);
    if (!window.__clock) {
      window.__clock = { base: real(), virtual: real(), rate: 1 };
      performance.now = () => {
        const c = window.__clock;
        return c.virtual + (real() - c.base) * c.rate;
      };
    }
    const c = window.__clock;
    c.virtual = performance.now();
    c.base = real();
    c.rate = r;
  }, rate);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate', { playbackRate: rate });
}

const openPineapple = (page) => page.getByRole('button', { name: /The Pineapple/ }).click();

for (const [name, vp] of Object.entries(viewports)) {
  if (only && only !== name) continue;
  const { width, height, ...rest } = vp;
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'no-preference', ...rest });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('console', m.text()));
  const shot = async (id) => {
    const file = `${outDir}/${id}-${name}.jpg`;
    await page.screenshot({ path: file });
    console.log(name, id, JSON.stringify(await facts(page)));
  };

  await page.goto(`${base}?quality=high`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  await scrollToPineapple(page);
  await page.waitForTimeout(3000);
  await shot('a-before');

  await slowMotion(page, 0.12);
  await openPineapple(page);
  await page.waitForTimeout(4200);
  await shot('b-transition');
  await slowMotion(page, 1);
  await page.waitForTimeout(3500);
  // Point at the card: it calms and holds pixel-still for reading.
  const card = page.locator('.citizen-pass');
  if (await card.count()) await card.hover({ position: { x: 40, y: 40 }, force: true });
  await page.waitForTimeout(1200);
  await shot('c-front');

  await page.locator('.citizen-pass__flip').click({ force: true });
  await page.waitForTimeout(1600);
  await shot('d-back');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(3000);
  await shot('e-closed');

  // Switch: open the card, then another landmark (a dialog) straight from it. Focus must stay
  // in the new dialog, and return to its nav entry when that closes.
  await openPineapple(page);
  await page.waitForTimeout(3000);
  // Through the nav entry itself (on a phone the card covers it): keyboard focus, then activate.
  await page.locator('[data-landmark-id="tiki"]').focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1800);
  await shot('g-switch-to-dialog');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(2500);
  console.log(name, 'after-switch-close', JSON.stringify(await facts(page)));

  // Leave by scrolling: reopen, wheel the page, expect the card gone and focus on the nav.
  await openPineapple(page);
  await page.waitForTimeout(2500);
  await page.mouse.move(width / 2, height - 60);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(2500);
  console.log(name, 'after-scroll-away', JSON.stringify(await facts(page)));
  await ctx.close();

  // Fallback: the low tier keeps the dialog.
  const low = await browser.newContext({ viewport: { width, height }, reducedMotion: 'no-preference', ...rest });
  const lowPage = await low.newPage();
  await lowPage.goto(`${base}?quality=low`, { waitUntil: 'networkidle' });
  await lowPage.waitForTimeout(5000);
  await scrollToPineapple(lowPage);
  await lowPage.waitForTimeout(2000);
  await openPineapple(lowPage);
  await lowPage.waitForTimeout(1500);
  await lowPage.screenshot({ path: `${outDir}/f-low-fallback-${name}.jpg` });
  console.log(name, 'f-low-fallback', JSON.stringify(await facts(lowPage)));
  await low.close();
}
await browser.close();
