// Visual capture for i18n-bilingual: both locales, desktop and 390 px.
// node capture.mjs <outDir> [en|ar|all] [desktop|phone|all] [port] [only-step]
// Selectors are locale-independent (classes, data attributes), so one flow drives both languages.
// Never run against the owner's port (4400).
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/abdal/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');

const [outDir = 'shots', onlyLocale = 'all', onlyViewport = 'all', port = '4417', onlyStep = 'all'] =
  process.argv.slice(2);
if (port === '4400') throw new Error('4400 is the owner port.');
const base = `http://127.0.0.1:${port}/`;
const STOPS = { pineapple: 0.2, tiki: 0.36, 'krusty-krab': 0.6, bureau: 0.82 };
const viewports = {
  desktop: { width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const facts = (page) =>
  page.evaluate(() => ({
    html: `${document.documentElement.lang}/${document.documentElement.dir}`,
    stage: document.querySelector('.visit-hud, .bureau-hud')?.dataset.stage ?? null,
    speaker: document.querySelector('.speech')?.getAttribute('aria-label') ?? null,
    spoken: document.querySelector('.speech__spoken')?.textContent?.slice(0, 80) ?? null,
    hudDir: document.querySelector('.visit-hud, .bureau-hud')?.getAttribute('dir') ?? null,
    toggle: [...document.querySelectorAll('.language-toggle__option')].map(
      (b) => `${b.textContent}:${b.getAttribute('aria-pressed')}`,
    ),
    overflowX: document.documentElement.scrollWidth > innerWidth,
  }));

const scrollTo = (page, f) =>
  page.evaluate(
    (f) => window.scrollTo({ top: f * (document.documentElement.scrollHeight - innerHeight), behavior: 'instant' }),
    f,
  );
const placed = (page) =>
  page.waitForFunction(() => document.querySelector('.speech-box')?.style.opacity === '1', null, { timeout: 120000 });
const objectsUp = (page) =>
  page.waitForFunction(
    () => {
      const l = [...document.querySelectorAll('.visit-object')];
      return l.length > 0 && l.every((x) => x.style.pointerEvents === '' && x.style.visibility === 'visible');
    },
    null,
    { timeout: 120000 },
  );

for (const locale of ['en', 'ar']) {
  if (onlyLocale !== 'all' && onlyLocale !== locale) continue;
  for (const [name, vp] of Object.entries(viewports)) {
    if (onlyViewport !== 'all' && onlyViewport !== name) continue;
    const { width, height, ...rest } = vp;
    const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'no-preference', ...rest });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.error('pageerror', e.message));
    page.on('console', (m) => m.type() === 'error' && console.error('console', m.text().slice(0, 200)));
    const shot = async (id, opts = {}) => {
      await page.screenshot({ path: `${outDir}/${locale}-${name}-${id}.jpg`, type: 'jpeg', quality: 80, timeout: 120000, ...opts });
      console.log(locale, name, id, JSON.stringify(await facts(page)));
    };
    const want = (step) => onlyStep === 'all' || onlyStep === step;
    const open = async (query) => {
      await page.goto(`${base}?quality=high&lang=${locale}${query}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(5000);
    };

    if (want('start')) {
      await open('');
      await shot('a-dive-start');
    }

    for (const landmark of ['pineapple', 'tiki', 'krusty-krab']) {
      if (!want(landmark)) continue;
      await open('');
      await scrollTo(page, STOPS[landmark]);
      await page.waitForTimeout(3000);
      await page.locator(`[data-landmark-id="${landmark}"]`).click({ force: true });
      await placed(page);
      await page.waitForTimeout(1500);
      await objectsUp(page).catch(() => console.log('objects not up'));
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
      await page
        .waitForFunction(() => document.querySelector('.visit-hud')?.dataset.stage === 'hint', null, { timeout: 30000 })
        .catch(() => console.log('no hint'));
      await page.waitForTimeout(4500);
      await shot(`b-${landmark}-selected`);
      // The full view, flown out of the landmark.
      const resume = page.locator('.speech__button').last();
      if (await resume.count()) await resume.click({ force: true });
      await page.waitForTimeout(600);
      const skip = page.locator('.speech__button--quiet');
      if (await skip.count()) await skip.click({ force: true });
      await page.mouse.move(5, height / 2);
      await page.waitForTimeout(1500);
      const full = page.locator('.speech__button--primary');
      if (await full.count()) {
        await full.click({ force: true });
        await page.waitForTimeout(4000);
        await shot(`c-${landmark}-full`);
      }
    }

    if (want('bureau')) {
      await open('');
      await scrollTo(page, STOPS.bureau);
      await page.waitForTimeout(3000);
      await page.locator('[data-landmark-id="bureau"]').click({ force: true });
      await placed(page);
      await page.waitForTimeout(2500);
      await shot('d-bureau-talking');
      const skip = page.locator('.speech__button--quiet');
      if (await skip.count()) await skip.click({ force: true });
      await page.waitForTimeout(1800);
      await page.locator('.speech__button--primary').click({ force: true });
      await page.waitForFunction(() => document.querySelector('.bureau-scroll')?.dataset.state === 'unrolled', null, {
        timeout: 90000,
      });
      await page.waitForTimeout(1500);
      await page.locator('.bureau-scroll .complaint-scroll__stamp-button').click({ force: true });
      await page.waitForTimeout(900);
      await shot('e-bureau-errors');
      await page.locator('.bureau-scroll input[name=subject]').fill('الأناناسة بتسرّب مية تاني');
      await page.locator('.bureau-scroll textarea[name=body]').fill(
        'المية في كل حتة من ٣ أيام. ابعتوا مطوّر قبل المدّ الجاي، وشكرًا للرئيس السرديني.',
      );
      await page.locator('.bureau-scroll input[name=senderName]').fill('سردينة سامي');
      await page.locator('.bureau-scroll input[name=replyEmail]').fill('not-an-email');
      await page.locator('.bureau-scroll input[name=subject]').focus();
      await page.waitForTimeout(400);
      await page.locator('.bureau-scroll .complaint-scroll__stamp-button').click({ force: true });
      await page.waitForTimeout(900);
      await shot('f-bureau-arabic-typed');
    }

    if (want('credits')) {
      await open('');
      await page.locator('.world-credits__trigger').click();
      await page.waitForTimeout(800);
      await shot('g-credits');
    }

    if (want('page')) {
      await open('&view=page');
      await shot('h-page-top');
      await page.locator('#page-experience').scrollIntoViewIfNeeded();
      await page.evaluate(() => document.querySelector('#page-experience')?.scrollIntoView());
      await page.waitForTimeout(500);
      await shot('i-page-experience');
      await page.evaluate(() => document.querySelector('#page-services')?.scrollIntoView());
      await page.waitForTimeout(500);
      await shot('j-page-services');
      await page.evaluate(() => document.querySelector('#page-contact')?.scrollIntoView());
      await page.waitForTimeout(500);
      await shot('k-page-contact');
    }
    await ctx.close();
  }
}
await browser.close();
