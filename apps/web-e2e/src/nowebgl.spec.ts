import { expect, test } from './support/fixtures';
import { expectEverySection } from './support/page-view';

// This project launches Chromium with WebGL switched off (`--disable-webgl --disable-3d-apis`),
// like a locked-down or very old browser. The site must not show a blank stage: the readable
// page is what loads.
test.describe('no WebGL', () => {
  test('the page view loads with every section and says why', async ({ page }) => {
    // No error allowlist: the capability probe fails quietly, so any console error is a defect.

    await page.goto('/?lang=en');
    await expect(page.getByText('This browser cannot run the 3D dive')).toBeVisible();
    await expectEverySection(page);
    await expect(page.locator('canvas')).toHaveCount(0);
    // There is no dive to go back to.
    await expect(page.getByRole('link', { name: 'Back to the dive' })).toHaveCount(0);
  });

  test('the first Tab stop is the skip link, and it works', async ({ page }) => {
    await page.goto('/?lang=en');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#page-main$/);
  });
});
