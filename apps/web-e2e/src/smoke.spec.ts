import { expect, test } from './support/fixtures';
import { DIVE_URL, VISITS, BUREAU, landmarkButton } from './support/site';

test.describe('smoke', () => {
  test('the dive loads with a canvas, the landmark navigation and no errors', async ({ page }) => {
    await page.goto(DIVE_URL);

    await expect(page).toHaveTitle(/Qaa El-Hamour/);
    await expect(page.getByRole('heading', { level: 1, name: 'قاع الهامور' })).toBeVisible();
    await expect(page.locator('canvas')).toBeVisible();
    // The quality tier is pinned by `?quality=high`; "settled" means the world has booted.
    await expect(page.locator('.stage')).toHaveAttribute('data-quality-tier', 'high');

    const nav = page.getByRole('navigation', { name: 'Landmarks' });
    await expect(nav.getByRole('button')).toHaveCount(VISITS.length + 1);
    for (const landmark of [...VISITS.map((v) => v.nav), BUREAU.nav]) {
      await expect(landmarkButton(page, landmark)).toBeVisible();
    }
    await expect(
      page.getByRole('link', { name: 'Skip the dive: read it as a page' }),
    ).toBeVisible();
    // Console errors and page errors fail the test through the `diagnostics` fixture.
  });

  test('the Content Security Policy is the strict one and nothing violates it', async ({ page }) => {
    await page.goto(DIVE_URL);
    await expect(page.locator('canvas')).toBeVisible();
    // Wait for the scene's models, decoders and workers to finish loading: that is where a
    // too-tight policy bites.
    await page.waitForLoadState('networkidle');

    const policy = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content');
    expect(policy, 'a build-time CSP <meta> exists').toBeTruthy();
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-src 'none'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain("'unsafe-inline'");

    const violations = await page.evaluate(() => window.__cspViolations ?? []);
    expect(violations).toEqual([]);
  });
});
