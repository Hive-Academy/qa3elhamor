import { expect, test } from './support/fixtures';
import { BUREAU, DIVE_URL, bubble, dive, openLandmark, press, skipDialogue } from './support/site';
import { fillComplaint, forbidProvider, stamp, stampButton } from './support/contact';

// Runs against the `bare` build: no VITE_CONTACT_PROVIDER, the default for a fork or a deploy
// that has not been given a provider yet. The Bureau must say so, and send nothing anywhere.
const PENDING_MESSAGE =
  "the Bureau's post office has not opened yet: your complaint was not sent anywhere";

test.describe('as a dialog', () => {
  test.use({ reducedMotion: 'reduce' });

  test('an unconfigured Bureau is honest that the post office is not open', async ({ page }) => {
    const sent = await forbidProvider(page);
    await page.goto(DIVE_URL);
    await openLandmark(page, BUREAU.nav);

    const dialog = page.getByRole('dialog', { name: BUREAU.region });
    await fillComplaint(dialog);
    await stampButton(dialog).click();

    await expect(dialog.getByRole('heading', { name: 'Complaint stamped' })).toBeVisible();
    await expect(dialog.getByRole('status')).toContainText(PENDING_MESSAGE);
    await expect(dialog.getByRole('status')).not.toContainText('The Bureau has your complaint');
    expect(sent).toEqual([]);
  });

  test('the unconfigured CSP does not allow any contact provider', async ({ page }) => {
    await page.goto(DIVE_URL);
    const policy = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content');
    expect(policy).not.toMatch(/web3forms|formspree/);
  });
});

test('in the world, the unrolled scroll says the same and sends nothing', { tag: '@nightly' }, async ({ page }) => {
  const sent = await forbidProvider(page);
  await dive(page, BUREAU.nav);
  await skipDialogue(page, BUREAU.narrator);
  await press(bubble(page, BUREAU.narrator).getByRole('button', { name: 'File a complaint' }));

  const scroll = page.getByRole('group', { name: 'Complaint scroll' });
  await expect(scroll).toHaveAttribute('data-state', 'unrolled', { timeout: 120_000 });
  await fillComplaint(scroll);
  await stamp(scroll);

  await expect(scroll).toHaveAttribute('data-state', 'stamped', { timeout: 120_000 });
  await expect(scroll.getByRole('status').filter({ hasText: PENDING_MESSAGE })).toBeVisible();
  expect(sent).toEqual([]);
});
