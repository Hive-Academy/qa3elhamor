import { expect, test } from './support/fixtures';
import {
  COMPLAINT,
  FAKE_ACCESS_KEY,
  PROVIDER_ORIGIN,
  expectProviderCalls,
  expectComplaintKept,
  fillComplaint,
  mockProvider,
  stamp,
  stampButton,
} from './support/contact';
import { BUREAU, DIVE_URL, bubble, dive, landmarkButton, skipDialogue } from './support/site';

// Runs against the `wired` build (VITE_CONTACT_PROVIDER=web3forms with a fake key). Against a
// deployed site (E2E_BASE_URL) it only makes sense when that site is built with a provider.
test.skip(
  Boolean(process.env['E2E_BASE_URL']) && process.env['E2E_CONTACT_WIRED'] !== '1',
  'E2E_BASE_URL is set: export E2E_CONTACT_WIRED=1 if that deployment has a contact provider',
);

test.describe('Complaints Bureau, in the world', { tag: '@desktop-only' }, () => {
  test('filing a complaint: the scroll unrolls, the stamp lands, the provider gets it', async ({
    page,
  }) => {
    const calls = await mockProvider(page, 'delivered');
    await dive(page, BUREAU.nav);
    await skipDialogue(page, BUREAU.narrator);
    await bubble(page, BUREAU.narrator).getByRole('button', { name: 'File a complaint' }).click();

    const scroll = page.getByRole('group', { name: 'Complaint scroll' });
    await expect(scroll).toHaveAttribute('data-state', 'unrolled', { timeout: 120_000 });

    // Empty first: the form's own validation, on the paper, and nothing is sent.
    await stamp(scroll);
    await expect(scroll.getByTestId('complaint-error-summary')).toBeVisible();
    expect(calls).toHaveLength(0);

    await fillComplaint(scroll);
    await stamp(scroll);

    await expect(scroll).toHaveAttribute('data-state', 'stamped', { timeout: 120_000 });
    await expect(scroll.getByRole('heading', { name: 'Complaint stamped' })).toBeVisible();
    await expect(
      scroll.getByText('The Bureau has your complaint. Expect a reply before the next tide.'),
    ).toBeVisible();

    expectProviderCalls(calls, 1);
    expect(calls[0]?.payload).toMatchObject({
      access_key: FAKE_ACCESS_KEY,
      subject: COMPLAINT.subject,
      message: COMPLAINT.body,
      name: COMPLAINT.name,
      email: COMPLAINT.email,
    });
    // The provider's key goes to the provider, never onto the page.
    await expect(page.locator('body')).not.toContainText(FAKE_ACCESS_KEY);
  });

  test("a failed delivery keeps the visitor's text and says so", async ({ page, diagnostics }) => {
    diagnostics.allow(/Failed to load resource.*500/);
    diagnostics.allow(/Complaint delivery failed/);
    const calls = await mockProvider(page, 'failed');
    await dive(page, BUREAU.nav);
    await skipDialogue(page, BUREAU.narrator);
    await bubble(page, BUREAU.narrator).getByRole('button', { name: 'File a complaint' }).click();

    const scroll = page.getByRole('group', { name: 'Complaint scroll' });
    await expect(scroll).toHaveAttribute('data-state', 'unrolled', { timeout: 120_000 });
    await fillComplaint(scroll);
    await stamp(scroll);

    await expect(scroll.getByRole('alert')).toContainText(
      'The stamp slipped and your complaint was not sent. Your text is still here; try again.',
    );
    await expectComplaintKept(scroll);
    await expect(scroll).not.toHaveAttribute('data-state', 'stamped');
    expectProviderCalls(calls, 1);
  });
});

// The same form in its dialog presentation (reduced motion): the quick path to the delivery
// outcomes, with no camera flight in front of them.
test.describe('Complaints Bureau, as a dialog', () => {
  test.use({ reducedMotion: 'reduce' });

  test('delivered: the dialog shows the stamped complaint and offers another', async ({ page }) => {
    const calls = await mockProvider(page, 'delivered');
    await page.goto(DIVE_URL);
    await landmarkButton(page, BUREAU.nav).click();

    const dialog = page.getByRole('dialog', { name: BUREAU.region });
    await fillComplaint(dialog);
    await stampButton(dialog).click();

    await expect(dialog.getByRole('heading', { name: 'Complaint stamped' })).toBeVisible();
    await expect(dialog.getByRole('status')).toContainText('The Bureau has your complaint');
    expectProviderCalls(calls, 1);

    await dialog.getByRole('button', { name: 'File another complaint' }).click();
    await expect(dialog.getByLabel('Subject of the complaint')).toHaveValue('');
  });

  test('failed: a 500 keeps the text and a retry goes through', async ({ page, diagnostics }) => {
    diagnostics.allow(/Failed to load resource.*500/);
    diagnostics.allow(/Complaint delivery failed/);
    await mockProvider(page, 'failed');
    await page.goto(DIVE_URL);
    await landmarkButton(page, BUREAU.nav).click();

    const dialog = page.getByRole('dialog', { name: BUREAU.region });
    await fillComplaint(dialog);
    await stampButton(dialog).click();
    await expect(dialog.getByRole('alert')).toContainText('your complaint was not sent');
    await expectComplaintKept(dialog);

    // The provider recovers; the same text goes through on retry.
    await page.unroute(PROVIDER_ORIGIN);
    const calls = await mockProvider(page, 'delivered');
    await stampButton(dialog).click();
    await expect(dialog.getByRole('heading', { name: 'Complaint stamped' })).toBeVisible();
    expectProviderCalls(calls, 1);
  });

  test('empty form: validation errors and nothing is sent', async ({ page }) => {
    const calls = await mockProvider(page, 'delivered');
    await page.goto(DIVE_URL);
    await landmarkButton(page, BUREAU.nav).click();

    const dialog = page.getByRole('dialog', { name: BUREAU.region });
    await stampButton(dialog).click();
    await expect(dialog.getByTestId('complaint-error-summary')).toBeVisible();
    expect(calls).toHaveLength(0);
  });
});
