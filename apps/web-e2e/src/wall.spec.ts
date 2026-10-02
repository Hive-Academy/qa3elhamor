import { expect, test } from './support/fixtures';
import { DIVE_URL, PAGE_URL } from './support/site';

// The complaints wall is off unless the build sets VITE_WALL_API_URL, and the public wall UI is
// not built yet. Until then the contract is: nothing about it is on the page and the site never
// calls the wall API. A wall test against a mocked API belongs here once the UI exists.
test.describe('complaints wall (off by default)', () => {
  test('the dive has no wall and makes no wall API call', async ({ page }) => {
    const wallCalls: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/')) wallCalls.push(request.url());
    });

    await page.goto(DIVE_URL);
    await expect(page.locator('canvas')).toBeVisible();
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
