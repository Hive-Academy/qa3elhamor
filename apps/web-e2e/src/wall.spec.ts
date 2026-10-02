import type { Page, Route } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { COMPLAINT, fillComplaint, stamp } from './support/contact';
import {
  BUREAU,
  DIVE_URL,
  PAGE_URL,
  bubble,
  canvasReady,
  dive,
  press,
  skipDialogue,
} from './support/site';

// The complaints wall is off unless the build sets VITE_WALL_API_URL (the GitHub Pages default
// leaves it unset). Off, the contract is: nothing about it is on the page and the site never
// calls the wall API.
test.describe('complaints wall (off by default)', () => {
  test('the dive has no wall and makes no wall API call', async ({ page }) => {
    const wallCalls: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/')) wallCalls.push(request.url());
    });

    await page.goto(DIVE_URL);
    await canvasReady(page);
    // Everything the page asks for on load has been asked by the time the network is idle.
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('region', { name: /complaints wall/i })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /wall/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /(post|pin).*(wall)/i })).toHaveCount(0);
    expect(wallCalls).toEqual([]);
  });

  test('the page view has no wall either', async ({ page }) => {
    await page.goto(PAGE_URL);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: /wall/i })).toHaveCount(0);
    await expect(
      page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: /wall/i }),
    ).toHaveCount(0);
  });
});

/*
 * The wall switched on, against a mocked API. Needs a preview of a build made with
 * VITE_WALL_API_URL=/api (the default e2e builds leave it off), passed as E2E_WALL_URL, e.g.
 * `.ptah/specs/complaints-wall/wall-visual.mjs` serves one. Skipped without it.
 */
const WALL_URL = process.env['E2E_WALL_URL']?.trim() || undefined;

const NOTES = [
  {
    id: '0b1d1c1e-0000-4000-8000-000000000001',
    subject: 'The jellyfish fields are too loud',
    body: 'Every night, buzzing. I have filed this twice. Please send a quieter species.',
    senderName: 'Grumpy Grouper',
    senderSpecies: 'grouper',
    submittedAt: '2026-09-30T10:00:00.000Z',
  },
  {
    id: '0b1d1c1e-0000-4000-8000-000000000002',
    subject: '<img src=x onerror=alert(1)>',
    body: '<script>alert(2)</script> is not a complaint, it is a test.',
    senderName: 'Sneaky Squid',
    senderSpecies: null,
    submittedAt: '2026-09-29T09:00:00.000Z',
  },
];
const OLDER = [
  {
    id: '0b1d1c1e-0000-4000-8000-000000000003',
    subject: 'Sand in the Krabby Patty',
    body: 'Again.',
    senderName: 'Sam',
    senderSpecies: 'sardine',
    submittedAt: '2026-09-01T09:00:00.000Z',
  },
];

interface WallCalls {
  readonly lists: string[];
  readonly posts: Record<string, unknown>[];
}

async function mockWall(page: Page): Promise<WallCalls> {
  const calls: WallCalls = { lists: [], posts: [] };
  await page.route('**/api/complaints**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'POST') {
      calls.posts.push(JSON.parse(request.postData() ?? '{}') as Record<string, unknown>);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: '0b1d1c1e-0000-4000-8000-0000000000ff', status: 'pending' }),
      });
      return;
    }
    calls.lists.push(url.search);
    const older = url.searchParams.get('cursor') === 'OLDER';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        older ? { items: OLDER, nextCursor: null } : { items: NOTES, nextCursor: 'OLDER' },
      ),
    });
  });
  return calls;
}

test.describe('complaints wall (on, mocked API)', () => {
  test.skip(!WALL_URL, 'E2E_WALL_URL is not set: no wall-enabled build to test');
  test.use({ baseURL: WALL_URL });

  test('the page view reads the wall as text and pins a complaint for moderation', async ({
    page,
  }) => {
    const calls = await mockWall(page);
    let dialogs = 0;
    page.on('dialog', (dialog) => {
      dialogs += 1;
      void dialog.dismiss();
    });
    await page.goto(PAGE_URL);

    const section = page.getByRole('region', { name: 'Public wall' });
    await expect(section.getByRole('button', { name: NOTES[0].subject })).toBeVisible();
    // Stored markup stays text: it is shown literally and nothing runs.
    await expect(section.getByRole('button', { name: NOTES[1].subject })).toBeVisible();
    await expect(section.locator('img')).toHaveCount(0);

    await section.getByRole('button', { name: /Older/ }).click();
    await expect(section.getByRole('button', { name: OLDER[0].subject })).toBeVisible();
    expect(calls.lists.some((query) => query.includes('cursor=OLDER'))).toBe(true);

    const contact = page.getByRole('region', { name: 'Contact' });
    // The reply address filled here is set aside once the complaint is public: it is never sent.
    await fillComplaint(contact);
    await contact.getByRole('radio', { name: /Pin it on the public wall/ }).check();
    await stamp(contact);
    await expect(contact.getByText(/Pinned for moderation/)).toBeVisible();
    expect(calls.posts).toEqual([
      {
        subject: COMPLAINT.subject,
        body: COMPLAINT.body,
        senderName: COMPLAINT.name,
        senderSpecies: null,
      },
    ]);
    expect(dialogs).toBe(0);
  });

  test('the Bureau offers the notice wall after the President', { tag: ['@desktop-only', '@nightly'] }, async ({
    page,
  }) => {
    await mockWall(page);
    await dive(page, BUREAU.nav, DIVE_URL);
    await skipDialogue(page, BUREAU.narrator);
    await press(
      bubble(page, BUREAU.narrator).getByRole('button', { name: 'Read the public wall' }),
    );
    const board = page.getByRole('region', { name: 'Public complaints wall' });
    await expect(board.getByRole('button', { name: NOTES[0].subject })).toBeVisible({
      timeout: 120_000,
    });
    await press(board.getByRole('button', { name: /Back to the President/ }));
    await expect(
      bubble(page, BUREAU.narrator).getByRole('button', { name: 'Read the public wall' }),
    ).toBeVisible();
  });
});
