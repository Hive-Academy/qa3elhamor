// Capture for the narrated Bureau visit (adapted from ../landmark-tiki/capture.mjs).
// node capture.mjs <outDir> [desktop|phone|all] [port] [delivered|failed|pending]
// The provider request is intercepted by Playwright (no dev-only switch in the app): with a
// dev server started with VITE_CONTACT_PROVIDER=web3forms (+ a dummy key), `delivered` answers
// 200 success and `failed` answers 500. `pending` expects a server with no provider.
// Never run against the owner's port (4400).
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/abdal/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');

const [outDir = 'shots', only = 'all', port = '4413', outcome = 'delivered'] = process.argv.slice(2);
if (port === '4400') throw new Error('4400 is the owner port.');
const base = `http://localhost:${port}/`;
const query = '?quality=high';
const STOP = 0.82;
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
    const box = document.querySelector('.speech-box')?.getBoundingClientRect();
    const scroll = document.querySelector('.bureau-scroll');
    const s = scroll?.getBoundingClientRect();
    return {
      active: a
        ? `${a.tagName.toLowerCase()}${a.name ? `[name=${a.name}]` : ''}.${String(a.className).slice(0, 30)} "${(a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 40)}"`
        : null,
      stage: document.querySelector('.bureau-hud')?.dataset.stage ?? null,
      speaker: document.querySelector('.speech')?.getAttribute('aria-label') ?? null,
      topic: document.querySelector('.speech__topic')?.textContent ?? null,
      spoken: document.querySelector('.speech__spoken')?.textContent?.slice(0, 90) ?? null,
      speech: box ? [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)] : null,
      scroll: scroll
        ? `${scroll.dataset.state}/${scroll.dataset.presentation} @${Math.round(s.x)},${Math.round(s.y)} ${Math.round(s.width)}x${Math.round(s.height)}`
        : null,
      status: document.querySelector('.bureau-scroll [role=status]')?.textContent?.slice(0, 60) ?? null,
      alert: document.querySelector('.bureau-scroll [role=alert]')?.textContent?.slice(0, 60) ?? null,
      summary: Boolean(document.querySelector('.bureau-scroll [data-testid=complaint-error-summary]')),
      subject: document.querySelector('.bureau-scroll input[name=subject]')?.value ?? null,
      dialog: document.querySelector('[role="dialog"]') ? 'dialog open' : null,
      scrollY: Math.round(scrollY),
    };
  });

const toStop = (p) =>
  p.evaluate(
    (f) => window.scrollTo({ top: f * (document.documentElement.scrollHeight - innerHeight), behavior: 'instant' }),
    STOP,
  );
const placed = (page) =>
  page.waitForFunction(() => document.querySelector('.speech-box')?.style.opacity === '1', null, { timeout: 120000 });
const paper = (page, state) =>
  page.waitForFunction((s) => document.querySelector('.bureau-scroll')?.dataset.state === s, state, { timeout: 90000, polling: 30 });
// The stamp, the roll and the bottle are quicker than a swiftshader screenshot. Once the stamp is
// pressed, page time (timers, rAF, the R3F clock) is Playwright's: paused, and stepped by hand
// between shots. CSS animations still run in real time.
const step = async (page, ms, id, outcome, name) => {
  // In steps of a few frames, so swiftshader keeps up.
  for (let left = ms; left > 0; left -= 100) await page.clock.runFor(Math.min(left, 100));
  await page.waitForTimeout(2000);
  const seen = await facts(page);
  await page.screenshot({ path: `${outDir}/${outcome}-${id}-${name}.jpg`, type: 'jpeg', quality: 84, timeout: 120000 });
  console.log(name, outcome, id, JSON.stringify(seen));
};

for (const [name, vp] of Object.entries(viewports)) {
  if (only !== 'all' && only !== name) continue;
  const { width, height, ...rest } = vp;
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'no-preference', ...rest });
  const page = await ctx.newPage();
  let posted = 0;
  await page.route(/api\.web3forms\.com|formspree\.io/, (route) => {
    posted += 1;
    return outcome === 'failed'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"success":false}' })
      : route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true,"message":"ok"}' });
  });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('console', m.text().slice(0, 200)));
  const shot = async (id, p = page) => {
    await p.screenshot({ path: `${outDir}/${outcome}-${id}-${name}.jpg`, type: 'jpeg', quality: 84 });
    console.log(name, outcome, id, JSON.stringify(await facts(p)));
  };

  await page.goto(`${base}${query}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  await toStop(page);
  await page.waitForTimeout(14000);
  await shot('a-arrival');

  await page.locator('[data-landmark-id="bureau"]').click({ force: true });
  await placed(page);
  await page.waitForTimeout(2500);
  await shot('b-president-talking');

  // On the bubble itself, Space advances the line (the control for the typing check below).
  await page.locator('.speech').focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  const skip = page.locator('.speech__button', { hasText: 'Skip' });
  if (await skip.count()) await skip.click({ force: true });
  await page.waitForTimeout(1800);
  await shot('c-last-line');

  await page.locator('.speech__button', { hasText: 'File a complaint' }).click({ force: true });
  await paper(page, 'unrolled');
  await page.waitForTimeout(1600);
  await shot('d-scroll-unrolled');

  // Empty stamp: the form's own validation, on the paper.
  await page.locator('.bureau-scroll .complaint-scroll__stamp-button').click({ force: true });
  await page.waitForTimeout(900);
  await shot('e-validation-errors');

  // Typing: Space and Enter go into the fields; the President stays quiet.
  await page.locator('.bureau-scroll input[name=subject]').focus();
  await page.keyboard.type('The pineapple leaks again');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  console.log(name, 'after Enter in subject', JSON.stringify(await facts(page)));
  await page.locator('.bureau-scroll textarea[name=body]').focus();
  await page.keyboard.type('Water everywhere.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Please send a developer before the next tide.');
  await page.locator('.bureau-scroll input[name=senderName]').focus();
  await page.keyboard.type('Sardine Sam');
  await page.locator('.bureau-scroll input[name=replyEmail]').focus();
  await page.keyboard.type('sam@sea.example');
  await page.waitForTimeout(800);
  await shot('f-typing');

  await page.clock.install();
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 50);
  await page.locator('.bureau-scroll .complaint-scroll__stamp-button').click({ force: true });
  if (outcome === 'failed') {
    await page.clock.runFor(500);
    await page.waitForTimeout(1500);
    await step(page, 100, 'g-failed', outcome, name);
  } else {
    await paper(page, 'stamped');
    await step(page, 150, 'g1-stamp-slam', outcome, name);
    await step(page, 1200, 'g2-stamped', outcome, name);
    await step(page, 1400, 'h1-rolling', outcome, name);
    await step(page, 1000, 'h2-bottle-floating', outcome, name);
    await step(page, 900, 'h2b-bottle-higher', outcome, name);
    await step(page, 5000, 'h3-filed-line', outcome, name);
    const leave = page.locator('.speech__button', { hasText: 'Back to the dive' });
    if (await leave.count()) await leave.click({ force: true });
    await step(page, 1500, 'i-farewell', outcome, name);
  }
  console.log(name, outcome, 'provider requests', posted);
  await ctx.close();

  if (outcome === 'delivered') {
    const low = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', ...rest });
    const lowPage = await low.newPage();
    await lowPage.goto(`${base}${query}`, { waitUntil: 'networkidle' });
    await lowPage.waitForTimeout(5000);
    await toStop(lowPage);
    await lowPage.waitForTimeout(3000);
    await lowPage.locator('[data-landmark-id="bureau"]').click({ force: true });
    await lowPage.waitForTimeout(2000);
    await shot('z-fallback-dialog', lowPage);
    await low.close();
  }
}
await browser.close();
