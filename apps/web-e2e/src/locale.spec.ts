import { expect, test } from './support/fixtures';

// The one Arabic smoke test. Everything else pins English (`locale: 'en-US'` in the config and
// `?lang=en` in every URL); this proves `?lang=ar` flips the document and the visits still open.
// Reduced motion: the landmark opens as a dialog straight away, without a camera flight.
test.use({ reducedMotion: 'reduce' });

test('?lang=ar: right-to-left, the language toggle, and a landmark opens in Arabic', async ({
  page,
}) => {
  await page.goto('/?quality=high&lang=ar');

  const html = page.locator('html');
  await expect(html).toHaveAttribute('lang', 'ar');
  await expect(html).toHaveAttribute('dir', 'rtl');

  const toggle = page.getByRole('group').filter({ has: page.getByRole('button', { name: /^EN/ }) });
  await expect(toggle).toBeVisible();
  await expect(toggle.getByRole('button', { name: /^عربي/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle.getByRole('button', { name: /^EN/ })).toHaveAttribute('aria-pressed', 'false');

  // The Pineapple, by its Arabic name (landmarks.config.ts), opens as a right-to-left dialog.
  await page.getByRole('navigation').getByRole('button', { name: /^بيت الأناناس/ }).click();
  const dialog = page.getByRole('dialog', { name: 'بيت الأناناس' });
  await expect(dialog).toBeVisible();

  // And back to English with the toggle, in place.
  await page.keyboard.press('Escape');
  await toggle.getByRole('button', { name: /^EN/ }).click();
  await expect(html).toHaveAttribute('dir', 'ltr');
  // Switching rewrites ?lang= in place and keeps the other parameters.
  await expect(page).toHaveURL(/lang=en/);
  await expect(page).toHaveURL(/quality=high/);
  await expect(page.getByRole('navigation', { name: 'Landmarks' })).toBeVisible();
});
