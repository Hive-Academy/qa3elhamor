import { expect, test } from './support/fixtures';
import { BUREAU, DIVE_URL, VISITS, landmarkButton } from './support/site';

// With `prefers-reduced-motion: reduce` the camera does not fly and the narrators do not swim:
// every landmark opens as a modal dialog with its full view, and Escape gives the page back.
test.use({ reducedMotion: 'reduce' });

for (const visit of VISITS) {
  test(`reduced motion: ${visit.region} opens as a dialog`, async ({ page }) => {
    await page.goto(DIVE_URL);
    await landmarkButton(page, visit.nav).click();

    const dialog = page.getByRole('dialog', { name: visit.region });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('article', { name: visit.fullArticle }).first()).toBeVisible();
    // No narrator, no 3D objects: the dialog is the whole visit.
    await expect(page.getByRole('region', { name: visit.narrator })).toHaveCount(0);
    await expect(page.getByRole('list', { name: visit.objectsList })).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(landmarkButton(page, visit.nav)).toBeFocused();
  });
}

test('reduced motion: the Complaints Bureau opens its form as a dialog', async ({ page }) => {
  await page.goto(DIVE_URL);
  await landmarkButton(page, BUREAU.nav).click();

  const dialog = page.getByRole('dialog', { name: BUREAU.region });
  await expect(dialog.getByLabel('Subject of the complaint')).toBeVisible();
  await expect(page.getByRole('region', { name: BUREAU.narrator })).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(landmarkButton(page, BUREAU.nav)).toBeFocused();
});
