import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import {
  DIVE_URL,
  FLIGHT_TIMEOUT,
  VISITS,
  bubblePlaced,
  canvasReady,
  landmarkButton,
  press,
} from './support/site';

/*
 * The cinematic tour (docs/tour.md). An automated browser (`navigator.webdriver`) gets the free
 * dive, so every other spec starts as before; `?tour=on` forces the intro here.
 */
const TOUR_URL = '/?tour=on&quality=high&lang=en';

/** The root element: its `data-tour-state` is the tour's phase (`off` when there is no tour). */
const tourState = (page: Page) => page.locator('html');

test('tour: an automated browser gets the free dive, with no intro and no replay button', async ({
  page,
}) => {
  await page.goto(DIVE_URL);
  await canvasReady(page);
  await expect(tourState(page)).toHaveAttribute('data-tour-state', 'off');
  await expect(
    page.getByRole('button', { name: 'Begin the journey' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Replay the journey' }),
  ).toHaveCount(0);
});

test('tour: ?tour=on shows the intro, and "Explore on my own" leaves it for the free dive', async ({
  page,
}) => {
  test.slow(Boolean(process.env['CI']), 'software GL on a 2-core runner');
  await page.goto(TOUR_URL);
  const intro = page.getByRole('region', { name: /^Qaa El-Hamour/ });
  await expect(intro).toBeVisible({ timeout: FLIGHT_TIMEOUT });
  await expect(tourState(page)).toHaveAttribute('data-tour-state', 'intro');
  // Nothing takes focus on a first visit; the choices are there to be reached.
  await expect(
    intro.getByRole('button', { name: 'Begin the journey' }),
  ).toBeVisible();

  await press(intro.getByRole('button', { name: 'Explore on my own' }));
  await expect(tourState(page)).toHaveAttribute('data-tour-state', 'free');
  await expect(intro).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Replay the journey' }),
  ).toBeVisible();
  // The choice is remembered for the next visit.
  expect(
    await page.evaluate(() => localStorage.getItem('qa3elhamor:tour')),
  ).toBe('skipped');
});

// Nightly with the other in-world flows: the flight and the narrator's swim-in are frame-driven,
// which a software-GL runner turns into minutes (docs/testing.md "Nightly in-world job").
test(
  'tour: "Begin the journey" flies to the first stop, the narrator talks, and Skip returns to free exploration',
  { tag: ['@nightly', '@desktop-only'] },
  async ({ page }) => {
    test.slow(Boolean(process.env['CI']), 'software GL on a 2-core runner');
    const first = VISITS[0];
    await page.goto(TOUR_URL);
    await press(
      page.getByRole('button', { name: 'Begin the journey' }),
      FLIGHT_TIMEOUT,
    );

    const bar = page.getByRole('region', { name: 'The journey' });
    await expect(bar).toBeVisible();
    await expect(bar.getByText('Stop 1 of 4')).toBeVisible();
    await expect(tourState(page)).toHaveAttribute(
      'data-tour-state',
      /^(flying|visiting)$/,
    );

    // The first stop opens by itself, and its narrator talks, as in a visit opened by hand.
    await expect(tourState(page)).toHaveAttribute(
      'data-tour-state',
      'visiting',
      {
        timeout: FLIGHT_TIMEOUT,
      },
    );
    await expect(
      page.getByRole('region', { name: first.region }),
    ).toBeVisible();
    await bubblePlaced(page);
    await expect(bar.getByRole('status')).toHaveText(`Now at ${first.region}`);

    // Pause and resume from the bar.
    await press(bar.getByRole('button', { name: 'Pause' }));
    await expect(tourState(page)).toHaveAttribute('data-tour-state', 'paused');
    await press(bar.getByRole('button', { name: 'Resume the journey' }));
    await expect(tourState(page)).toHaveAttribute(
      'data-tour-state',
      'visiting',
    );

    // Skip: the journey ends where it is; the visit stays open for the visitor to leave.
    await press(bar.getByRole('button', { name: 'Skip tour' }));
    await expect(tourState(page)).toHaveAttribute('data-tour-state', 'free');
    await expect(bar).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('region', { name: first.region })).toHaveCount(
      0,
    );
    await expect(landmarkButton(page, first.nav)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Replay the journey' }),
    ).toBeVisible();
  },
);
