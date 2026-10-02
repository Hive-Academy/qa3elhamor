import { expect, test } from './support/fixtures';
import { DIVE_URL, PAGE_URL, canvasReady } from './support/site';
import { expectEverySection } from './support/page-view';

// The readable page, reached with WebGL available: `?view=page` and the dive's own link. (The
// no-WebGL path, where the page is what loads, is nowebgl.spec.ts.)
test.describe('page view', () => {
  test('?view=page renders every section and no canvas', async ({ page }) => {
    await page.goto(PAGE_URL);
    await expectEverySection(page);
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(
      page.getByText('You are reading Qaa El-Hamour as a page', { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to the dive' }).first()).toBeVisible();
  });

  test('the "skip to content" link jumps past the masthead', async ({ page }) => {
    await page.goto(PAGE_URL);
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await skip.focus();
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#page-main$/);
  });

  test('the dive links to the page and the page links back, with focus returning', async ({
    page,
  }) => {
    await page.goto(DIVE_URL);
    const readAsPage = page.getByRole('link', { name: 'Skip the dive: read it as a page' });
    await readAsPage.focus();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/view=page/);
    await expectEverySection(page);
    // The visitor switched views: focus lands on the page's heading, not on <body>.
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();

    await page.getByRole('link', { name: 'Back to the dive' }).first().click();
    await canvasReady(page);
    await expect(page).not.toHaveURL(/view=page/);
    // And the dive puts focus back on the link the visitor used to leave it.
    await expect(readAsPage).toBeFocused();
  });
});
