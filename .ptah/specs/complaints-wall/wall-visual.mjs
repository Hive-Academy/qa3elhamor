// Visual check for the complaints wall, against a Playwright-intercepted mock of the wall API
// (no Docker here, so no real API). Builds the site twice, wall ON (VITE_WALL_API_URL=/api) and
// OFF (unset, the GitHub Pages default), serves them with `vite preview` on 4431 / 4432, and
// writes JPEG screenshots next to this file.
//
//   node .ptah/specs/complaints-wall/wall-visual.mjs            (build + shots)
//   WALL_SKIP_BUILD=1 node .ptah/specs/complaints-wall/wall-visual.mjs
//   WALL_SERVE_ONLY=1 ...  keeps both servers up (for E2E_WALL_URL=http://localhost:4431)
import { build, preview } from 'vite';
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const here = import.meta.dirname;
const root = resolve(here, '../../../apps/web');
const shots = resolve(here, 'screenshots');
mkdirSync(shots, { recursive: true });

const VARIANTS = {
  on: { port: 4431, outDir: resolve(tmpdir(), 'qa3-wall-on'), env: { VITE_WALL_API_URL: '/api' } },
  off: { port: 4432, outDir: resolve(tmpdir(), 'qa3-wall-off'), env: {} },
};

for (const key of Object.keys(process.env)) {
  if (/^VITE_(CONTACT|WEB3FORMS|FORMSPREE|WALL)/.test(key)) delete process.env[key];
}

const servers = [];
for (const [name, variant] of Object.entries(VARIANTS)) {
  const skip = process.env.WALL_SKIP_BUILD === '1' && existsSync(resolve(variant.outDir, 'index.html'));
  if (!skip) {
    delete process.env.VITE_WALL_API_URL;
    Object.assign(process.env, variant.env);
    await build({ root, logLevel: 'warn', build: { outDir: variant.outDir, emptyOutDir: true } });
    delete process.env.VITE_WALL_API_URL;
    console.log(`[wall-visual] built ${name} -> ${variant.outDir}`);
  }
  servers.push(
    await preview({
      root,
      logLevel: 'warn',
      build: { outDir: variant.outDir },
      preview: { port: variant.port, strictPort: true, host: 'localhost' },
    }),
  );
}
if (process.env.WALL_SERVE_ONLY === '1') {
  console.log('[wall-visual] serving: on http://localhost:4431  off http://localhost:4432');
  await new Promise(() => undefined);
}

const NOTES = [
  {
    id: '0b1d1c1e-0000-4000-8000-000000000001',
    subject: 'The jellyfish fields are too loud',
    body: 'Every night, buzzing until the tide turns. I have filed this twice already and the Bureau keeps losing my bottles. Please send a quieter species, or at least earplugs for the whole reef.',
    senderName: 'Grumpy Grouper',
    senderSpecies: 'grouper',
    submittedAt: '2026-09-30T10:00:00.000Z',
  },
  {
    id: '0b1d1c1e-0000-4000-8000-000000000002',
    subject: '<img src=x onerror=alert(1)>',
    body: '<script>alert(2)</script> stays text on this wall.',
    senderName: 'Sneaky Squid',
    senderSpecies: null,
    submittedAt: '2026-09-29T09:00:00.000Z',
  },
  {
    id: '0b1d1c1e-0000-4000-8000-000000000003',
    subject: 'الأناناس بيسرّب مية تاني',
    body: 'كل ما المدّ يعلى، المطبخ يغرق. محتاجين سبّاك مستعجل.',
    senderName: 'سردينة سامي',
    senderSpecies: 'سردين',
    submittedAt: '2026-09-28T09:00:00.000Z',
  },
  {
    id: '0b1d1c1e-0000-4000-8000-000000000004',
    subject: 'Sand in the Krabby Patty',
    body: 'Again.',
    senderName: 'Sam',
    senderSpecies: 'sardine',
    submittedAt: '2026-09-20T09:00:00.000Z',
  },
];

const mockWall = async (page) => {
  let dialogs = 0;
  page.on('dialog', (d) => {
    dialogs += 1;
    void d.dismiss();
  });
  await page.route('**/api/complaints**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: '0b1d1c1e-0000-4000-8000-0000000000ff', status: 'pending' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: NOTES, nextCursor: 'OLDER' }),
    });
  });
  return () => dialogs;
};

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const shoot = (page, name) => page.screenshot({ path: resolve(shots, `${name}.jpg`), type: 'jpeg', quality: 80 });
const results = [];

async function withPage(viewport, fn) {
  const context = await browser.newContext({
    viewport,
    ...(viewport.width < 500 ? { isMobile: true, hasTouch: true } : {}),
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await fn(page);
  } finally {
    if (errors.length) results.push({ errors });
    await context.close();
  }
}

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const ON = 'http://localhost:4431';
const OFF = 'http://localhost:4432';

// 1-2. Page view, wall section: en desktop, ar phone.
for (const [lang, viewport, label] of [
  ['en', DESKTOP, 'desktop'],
  ['ar', PHONE, '390'],
  ['en', PHONE, '390'],
  ['ar', DESKTOP, 'desktop'],
]) {
  await withPage(viewport, async (page) => {
    const dialogs = await mockWall(page);
    await page.goto(`${ON}/?view=page&lang=${lang}`);
    const section = page.locator('#page-wall');
    await section.getByRole('button').first().waitFor();
    await section.scrollIntoViewIfNeeded();
    await section.screenshot({ path: resolve(shots, `page-wall-${lang}-${label}.jpg`), type: 'jpeg', quality: 80 });
    const imgs = await section.locator('img').count();
    results.push({ shot: `page-wall-${lang}-${label}`, imgsInWall: imgs, dialogs: dialogs() });
  });
}

// 3. Posting publicly from the page view -> awaiting moderation.
await withPage(DESKTOP, async (page) => {
  await mockWall(page);
  const posts = [];
  page.on('request', (r) => r.method() === 'POST' && r.url().includes('/api/complaints') && posts.push(r.postData()));
  await page.goto(`${ON}/?view=page&lang=en`);
  const contact = page.locator('#page-contact');
  await contact.getByLabel('Subject of the complaint').fill('The pineapple leaks again');
  await contact.getByLabel('Details of the complaint').fill('Water everywhere. Please send a developer.');
  await contact.getByLabel('Your name').fill('Sardine Sam');
  await contact.getByRole('radio', { name: /Pin it on the public wall/ }).check();
  await contact.scrollIntoViewIfNeeded();
  await contact.screenshot({ path: resolve(shots, 'post-public-form-en.jpg'), type: 'jpeg', quality: 80 });
  await contact.getByRole('button', { name: 'Stamp and send' }).press('Enter');
  await contact.getByText(/Pinned for moderation/).waitFor();
  await contact.screenshot({ path: resolve(shots, 'post-public-pending-en.jpg'), type: 'jpeg', quality: 80 });
  results.push({ shot: 'post-public', posts });
});

// 4. In the world: the Bureau, then "Read the public wall".
async function bureauWall(page, base, lang) {
  await page.goto(`${base}/?quality=high&lang=${lang}`);
  const nav = page.getByRole('navigation', { name: lang === 'ar' ? 'المعالم' : 'Landmarks' });
  await nav.getByRole('button', { name: lang === 'ar' ? /^مكتب الشكاوى/ : /^Complaints Bureau/ }).click();
  await page.locator('.speech-box').first().waitFor({ state: 'visible', timeout: 180_000 });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.speech-box')).opacity === '1', null, { timeout: 180_000 });
  await page.locator('.speech-box').getByRole('button', { name: lang === 'ar' ? 'تخطَّ' : 'Skip' }).click();
}

for (const [lang, viewport, label] of [
  ['en', DESKTOP, 'desktop'],
  ['ar', DESKTOP, 'desktop'],
  ['en', PHONE, '390'],
  ['ar', PHONE, '390'],
]) {
  await withPage(viewport, async (page) => {
    await mockWall(page);
    try {
      await bureauWall(page, ON, lang);
      await page
        .getByRole('button', { name: lang === 'ar' ? 'اقرا لوحة الشكاوى العامة' : 'Read the public wall' })
        .click();
      const board = page.locator('.notice-board');
      await board.getByRole('button').first().waitFor({ timeout: 60_000 });
      await page.waitForTimeout(2500);
      await shoot(page, `bureau-wall-${lang}-${label}`);
      // The board bobs until pointed at or focused: open the note from the keyboard.
      const first = board.locator('.notice-note').first();
      await first.focus();
      await first.press('Enter');
      await page.waitForTimeout(400);
      await shoot(page, `bureau-wall-note-${lang}-${label}`);
      results.push({ shot: `bureau-wall-${lang}-${label}`, ok: true });
    } catch (error) {
      await shoot(page, `bureau-wall-${lang}-${label}-FAILED`);
      results.push({ shot: `bureau-wall-${lang}-${label}`, error: String(error).slice(0, 300) });
    }
  });
}

// 5. Disabled build: no wall anywhere, no wall API call.
for (const viewport of [DESKTOP]) {
  await withPage(viewport, async (page) => {
    const calls = [];
    page.on('request', (r) => r.url().includes('/api/') && calls.push(r.url()));
    await page.goto(`${OFF}/?view=page&lang=en`);
    await page.locator('#page-contact').scrollIntoViewIfNeeded();
    await page.locator('#page-contact').screenshot({ path: resolve(shots, 'off-page-contact-en.jpg'), type: 'jpeg', quality: 80 });
    const wallHeadings = await page.getByRole('heading', { name: /wall/i }).count();
    const radios = await page.getByRole('radio').count();
    try {
      await bureauWall(page, OFF, 'en');
      await page.waitForTimeout(500);
      // A software rasteriser can take longer than the default 30 s for one full-page frame.
      await page.screenshot({ path: resolve(shots, 'off-bureau-en-desktop.jpg'), type: 'jpeg', quality: 80, timeout: 120_000 });
    } catch (error) {
      results.push({ off: 'bureau', error: String(error).slice(0, 300) });
    }
    const wallButtons = await page.getByRole('button', { name: /public wall/i }).count();
    results.push({ shot: 'off', wallHeadings, radios, wallButtons, wallCalls: calls });
  });
}

await browser.close();
for (const server of servers) await server.close();
console.log(JSON.stringify(results, null, 2));
