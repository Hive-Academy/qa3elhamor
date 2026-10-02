import { expect, test, type Page, type Locator } from '@playwright/test';
import { resumeEntryCount, serviceCount, skillGroupCount } from './content';

/**
 * Pinned to the high tier: the tier is otherwise measured from frame times, and a software
 * rasteriser would be demoted to a tier with no in-world visits.
 */
export const DIVE_URL = '/?quality=high&lang=en';

/** The readable page, in English. */
export const PAGE_URL = '/?view=page&lang=en';

export const FLIGHT_TIMEOUT = 120_000;

export interface Visit {
  readonly id: 'pineapple' | 'tiki' | 'krusty-krab';
  /** The landmark's name on its `LandmarkNav` button. */
  readonly nav: RegExp;
  /** The accessible name of the open visit's region. */
  readonly region: string;
  readonly narrator: string;
  /** The list of 3D objects, by accessible name. */
  readonly objectsList: string;
  readonly objectCount: number;
  readonly openFull: string;
  /** Accessible name of the full view's article. */
  readonly fullArticle: RegExp;
}

export const VISITS: readonly Visit[] = [
  {
    id: 'pineapple',
    nav: /^The Pineapple/,
    region: 'The Pineapple',
    narrator: 'The Hamour',
    objectsList: 'His specialties, as bubbles',
    objectCount: skillGroupCount,
    openFull: 'Open the full Citizenship Card',
    fullArticle: /^Citizenship Card/,
  },
  {
    id: 'tiki',
    nav: /^Tiki Head/,
    region: 'Tiki Head',
    narrator: 'The Hamour',
    objectsList: 'Performance reviews, carved in stone',
    objectCount: resumeEntryCount,
    openFull: 'Read the full record',
    fullArticle: /^Experience$/,
  },
  {
    id: 'krusty-krab',
    nav: /^The Krusty Krab/,
    region: 'The Krusty Krab',
    narrator: 'The Crab Clerk',
    objectsList: "Today's menu: every dish is a service",
    objectCount: serviceCount,
    openFull: 'See the full menu',
    fullArticle: /^Services$/,
  },
];

export const BUREAU = {
  nav: /^Complaints Bureau/,
  region: 'Complaints Bureau',
  narrator: 'The Sardine President',
} as const;

/** The four landmark buttons, in dive order. */
export const landmarkButton = (page: Page, nav: RegExp): Locator =>
  page.getByRole('navigation', { name: 'Landmarks' }).getByRole('button', { name: nav });

/** The speech bubble of the open visit; named after whoever narrates. */
export const bubble = (page: Page, narrator: string): Locator =>
  page.getByRole('region', { name: narrator });

/**
 * Waits until the narrator's bubble has been placed over the scene (a software rasteriser
 * takes tens of seconds to fly the camera in). Opacity is the only signal the page gives; see
 * notes.md for the test id this wants.
 */
export async function bubblePlaced(page: Page): Promise<void> {
  await expect(page.locator('.speech-box')).toHaveCSS('opacity', '1', {
    timeout: FLIGHT_TIMEOUT,
  });
}

/** Opens `/` and flies to a landmark through its navigation button. */
export async function dive(page: Page, nav: RegExp, url = DIVE_URL): Promise<void> {
  // Software GL on a 2-core CI runner needs several times the local time for a camera flight.
  test.slow(Boolean(process.env['CI']), 'software GL on a 2-core runner');
  await page.goto(url);
  await openLandmark(page, nav);
  await bubblePlaced(page);
}

/**
 * Activates a control inside a narrator's bubble from the keyboard. The bubble follows a
 * swimming, bobbing narrator, so on a slow software rasteriser its buttons never hold still
 * for Playwright's "stable" actionability check (the cause of the first CI failures); a
 * focused button and Enter do what a keyboard visitor does and need no stillness.
 */
export async function press(control: Locator, timeout = 30_000): Promise<void> {
  await expect(control).toBeVisible({ timeout });
  await control.focus({ timeout });
  await control.press('Enter', { timeout });
}

/**
 * Opens a landmark from its navigation button. The button appears with the React shell, which
 * on a throttled runner can take a minute; it also pulses, so it is pressed from the keyboard.
 */
export async function openLandmark(page: Page, nav: RegExp): Promise<void> {
  await press(landmarkButton(page, nav), FLIGHT_TIMEOUT);
}

/** Skips the rest of the narration (the way a hurried visitor would). */
export async function skipDialogue(page: Page, narrator: string): Promise<void> {
  await press(bubble(page, narrator).getByRole('button', { name: 'Skip' }));
}

/**
 * The dive's canvas is mounted lazily after the first paint (the 3D shell loads on its own
 * chunk), and on a slow runner that takes a while: wait for it, never assume it at load.
 */
export async function canvasReady(page: Page): Promise<void> {
  await expect(page.locator('canvas')).toBeVisible({ timeout: FLIGHT_TIMEOUT });
}
