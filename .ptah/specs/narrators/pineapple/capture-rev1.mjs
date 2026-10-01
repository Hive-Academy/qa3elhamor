// Revision 1 shots: a bubble selected, then Space on the speech bubble back to the tour.
// node capture-rev1.mjs <outDir> [port]
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/abdal/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/');
const { chromium } = require('playwright');
const [outDir = 'shots', port = '4406'] = process.argv.slice(2);
const viewports = {
  desktop: { width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const facts = (page) => page.evaluate(() => ({
  stage: document.querySelector('.pa-hud')?.dataset.stage,
  selected: [...document.querySelectorAll('.pa-skill[data-selected]')].map((b) => b.textContent),
  panel: document.querySelector('.pa-skill-panel')?.getAttribute('aria-label') ?? null,
  chips: document.querySelector('.speech__chips')?.getAttribute('aria-label') ?? null,
  spoken: document.querySelector('.speech__spoken')?.textContent?.slice(0, 50),
  active: document.activeElement?.className,
}));
for (const [name, vp] of Object.entries(viewports)) {
  const { width, height, ...rest } = vp;
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'no-preference', ...rest });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`http://localhost:${port}/?quality=high`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  await page.evaluate(() => scrollTo({ top: 0.2 * (document.documentElement.scrollHeight - innerHeight), behavior: 'instant' }));
  await page.waitForTimeout(3000);
  await page.locator('[data-landmark-id="pineapple"]').click();
  await page.waitForSelector('.pa-hud[data-stage="tour"]', { timeout: 90000 });
  // Every bubble out of the door (pickable): swiftshader runs at 1-2 fps, so this takes a while.
  await page.waitForFunction(() => {
    const labels = [...document.querySelectorAll('.pa-skill')];
    return labels.length > 0 && labels.every((l) => l.style.visibility === 'visible' && l.style.pointerEvents === '');
  }, null, { timeout: 120000 });
  await page.waitForTimeout(1000);
  const label = page.locator('.pa-skill').nth(1);
  if (name === 'phone') await label.tap({ force: true });
  else await label.hover({ force: true });
  await page.waitForTimeout(4500);
  await page.screenshot({ path: `${outDir}/d-bubble-selected-${name}.jpg`, type: 'jpeg', quality: 88 });
  console.log(name, 'd', JSON.stringify(await facts(page)));
  await page.mouse.move(5, height / 2);
  await page.locator('.speech').focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${outDir}/d2-back-to-tour-${name}.jpg`, type: 'jpeg', quality: 88 });
  console.log(name, 'd2', JSON.stringify(await facts(page)));
  await ctx.close();
}
await browser.close();
