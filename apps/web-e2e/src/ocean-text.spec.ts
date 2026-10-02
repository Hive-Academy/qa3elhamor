import type { Page } from '@playwright/test';
import { expect, test, type Diagnostics } from './support/fixtures';
import { DIVE_URL, VISITS, bubble, canvasReady, dive } from './support/site';

/*
 * The dive's words as underwater text (docs/ocean-text.md): SDF text and painted signage in the
 * scene, the DOM keeping every word for assistive technology, the buttons and the focus. The
 * mode is on once the SDF font has arrived (`html[data-ocean-text]`), off under reduced motion,
 * on the low tier and whenever the font cannot be had: then the DOM text simply shows.
 */

const SDF_FONT = '**/fonts/ibm-plex-sans-arabic/*.ttf';
const mode = (page: Page) => page.locator('html');

/** The font request fails, as offline or behind a filter: the page must keep its HTML text. */
async function blockFont(page: Page, diagnostics: Diagnostics): Promise<void> {
  diagnostics.allow(/Failed to load resource.*ERR_FAILED/);
  diagnostics.allow(/IBMPlexSansArabic-SemiBold\.ttf/);
  await page.route(SDF_FONT, (route) => route.abort('failed'));
}

/** The DOM line's drawn box: visually hidden is a 1 px clip, shown is the text's width. */
async function lineWidth(page: Page, narrator: string): Promise<number> {
  const box = await bubble(page, narrator).locator('.speech__line').boundingBox();
  return box?.width ?? 0;
}

test.describe('ocean text', () => {
  test('the dive draws its words in the water once the font is in', async ({ page }) => {
    await page.goto(DIVE_URL);
    await canvasReady(page);
    await expect(mode(page)).toHaveAttribute('data-ocean-text', 'on', {
      timeout: 60_000,
    });
  });

  test('without the font every word stays HTML', async ({ page, diagnostics }) => {
    await blockFont(page, diagnostics);
    await page.goto(DIVE_URL);
    await canvasReady(page);
    await expect(mode(page)).toHaveAttribute('data-ocean-text', 'off');
    // It stays off: the failed font is not retried into a half-drawn page.
    await page.waitForTimeout(1_500);
    await expect(mode(page)).toHaveAttribute('data-ocean-text', 'off');
  });

  test.describe('under reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });
    test('the words stay HTML', async ({ page }) => {
      await page.goto(DIVE_URL);
      await canvasReady(page);
      await expect(mode(page)).toHaveAttribute('data-ocean-text', 'off');
    });
  });

  // The narrator's bubble itself needs a whole visit (a camera flight, the narrator swimming in),
  // which on a software rasteriser runs past any push/PR budget: nightly, as dive.spec.ts.
  const pineapple = VISITS[0];
  if (!pineapple) throw new Error('No Pineapple visit to check.');

  test('the bubble is drawn in the water and its DOM stays readable and usable @nightly', async ({
    page,
  }) => {
    await dive(page, pineapple.nav);
    await expect(mode(page)).toHaveAttribute('data-ocean-text', 'on');
    const speech = bubble(page, pineapple.narrator);
    // Ocean mode: the box is the twin's, the line visually hidden but in the accessibility tree.
    await expect(page.locator('.speech-box')).toHaveAttribute('data-ocean', '');
    await expect.poll(() => lineWidth(page, pineapple.narrator)).toBeLessThanOrEqual(1);
    await expect(speech.locator('.speech__spoken')).not.toBeEmpty();
    // The buttons are still real buttons, on screen and reachable.
    await expect(speech.getByRole('button', { name: 'Skip' })).toBeVisible();
    await expect(speech.getByRole('button', { name: 'Say hi' })).toBeVisible();
  });

  test('without the font the bubble is the DOM bubble, fully shown @nightly', async ({
    page,
    diagnostics,
  }) => {
    await blockFont(page, diagnostics);
    await dive(page, pineapple.nav);
    await expect(mode(page)).toHaveAttribute('data-ocean-text', 'off');
    const speech = bubble(page, pineapple.narrator);
    await expect(page.locator('.speech-box')).not.toHaveAttribute('data-ocean', '');
    await expect.poll(() => lineWidth(page, pineapple.narrator)).toBeGreaterThan(40);
    await expect(speech.getByRole('button', { name: 'Skip' })).toBeVisible();
  });
});
