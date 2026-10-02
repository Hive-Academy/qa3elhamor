import { expect, test } from './support/fixtures';
import {
  BUREAU,
  VISITS,
  bubble,
  FLIGHT_TIMEOUT,
  dive,
  landmarkButton,
  press,
  skipDialogue,
} from './support/site';

// Each landmark: fly in from the top of the dive, meet the narrator, advance and skip the
// dialogue, select a 3D object by keyboard, open the full view, leave with Escape, and end up
// back on the landmark's navigation button.
for (const visit of VISITS) {
  // Mobile runs the first visit only; the other flights are desktop-only to keep the run short.
  const tag = visit.id === 'pineapple' ? [] : ['@desktop-only'];
  test(`dive: ${visit.region} opens, its content is there and it can be left`, { tag }, async ({ page }) => {
    await dive(page, visit.nav);

    // The visit's region and its narrator.
    await expect(page.getByRole('region', { name: visit.region })).toBeVisible();
    const speech = bubble(page, visit.narrator);
    await expect(speech).toBeVisible();
    await expect(speech.getByRole('button', { name: 'Skip' })).toBeVisible();

    // Advance a line, then skip the rest. "Next" completes a half-typed line before it advances
    // (and a line may advance on its own), so retry until the dots show line 2 or later.
    const next = speech.getByRole('button', { name: /^Next/ });
    await expect(async () => {
      if (await next.isVisible()) await press(next);
      await expect(speech.getByRole('list', { name: /^Line ([2-9]|\d\d+) of \d+$/ })).toBeVisible({
        timeout: 2_000,
      });
    }).toPass({ timeout: 90_000 });
    await skipDialogue(page, visit.narrator);

    // The content as the kit's list of objects: one button per object, rendered from data when
    // the visit opens (the skill bubbles, tablets, dishes). Counted through the accessibility
    // mirror, `includeHidden`, because the 3D labels only become visible after frame-driven
    // fly-out animations, which crawl on a software rasteriser.
    // (Their flight and keyboard selection are the nightly test below.)
    const list = page.getByRole('list', { name: visit.objectsList, includeHidden: true });
    await expect(list.getByRole('button', { includeHidden: true })).toHaveCount(visit.objectCount);

    // The full view, and Escape back to the guide with focus on the button that opened it.
    const openFull = speech.getByRole('button', { name: visit.openFull });
    await press(openFull);
    await expect(page.getByRole('button', { name: 'Back to the guide' })).toBeVisible();
    await expect(page.getByRole('article', { name: visit.fullArticle }).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Back to the guide' })).toHaveCount(0);
    await expect(openFull).toBeFocused();

    // Leave: the narrator says goodbye and focus goes back to the landmark's nav button.
    await press(speech.getByRole('button', { name: 'Back to the dive' }));
    await expect(landmarkButton(page, visit.nav)).toBeFocused();
  });
}

// The part of a visit that depends on frame-driven animation: the objects fly out of the model
// and only then are their labels visible and focusable. On a software rasteriser on a shared
// runner that can take minutes, so it runs in the nightly `e2e-inworld` job (E2E_NIGHTLY=1,
// docs/testing.md), not on every pull request.
for (const visit of VISITS) {
  test(`dive: ${visit.region} objects fly out and can be picked by keyboard @nightly`, async ({
    page,
  }) => {
    await dive(page, visit.nav);
    const speech = bubble(page, visit.narrator);
    await skipDialogue(page, visit.narrator);

    // One 3D label must show up eventually (the objects really flew out); long, as it is
    // animation-driven. The keyboard steps below need a label that can take focus.
    const objects = page.getByRole('list', { name: visit.objectsList }).getByRole('button');
    await expect(objects.first()).toBeVisible({ timeout: FLIGHT_TIMEOUT * 1.5 });
    await expect(objects.last()).toBeVisible({ timeout: FLIGHT_TIMEOUT });

    // Keyboard: focusing an object selects it and the arrow keys move along, selecting as they go.
    await objects.first().focus();
    await expect(objects.first()).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(objects.nth(1)).toBeFocused();
    await expect(objects.nth(1)).toHaveAttribute('aria-expanded', 'true');
    await press(speech.getByRole('button', { name: /^Back to the tour/ }));
    await expect(objects.nth(1)).toHaveAttribute('aria-expanded', 'false');

  });
}

test('dive: the Complaints Bureau opens and offers the complaint scroll', { tag: '@desktop-only' }, async ({ page }) => {
  await dive(page, BUREAU.nav);
  await expect(page.getByRole('region', { name: BUREAU.region })).toBeVisible();
  const speech = bubble(page, BUREAU.narrator);
  await expect(speech).toBeVisible();

  await skipDialogue(page, BUREAU.narrator);
  await expect(speech.getByRole('button', { name: 'File a complaint' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(landmarkButton(page, BUREAU.nav)).toBeFocused();
});
