import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from './support/fixtures';
import { canvasReady } from './support/site';
import type { Page } from '@playwright/test';

/**
 * Screenshot comparison of the canvas at fixed camera positions. A broken shader, a missing
 * texture or a model that fails to load changes pixels that no DOM assertion can see.
 *
 * Determinism: reduced motion freezes the ocean (waves, caustics, drift) and slows ambient life
 * to a crawl, `?quality=` pins the tier, the camera is set through the page scroll, the shot is
 * taken only once the depth readout has stopped changing, and `data-freeze-frames` then stops the
 * render loop so the canvas holds still. A software rasteriser still
 * differs by a few pixels from run to run: `maxDiffPixelRatio` (playwright.config.ts) absorbs
 * that and nothing close to a real regression.
 *
 * Baselines are per platform (pixels differ between a Windows and a Linux rasteriser): the
 * `{platform}` in `snapshotPathTemplate`. A platform with no baselines yet skips instead of
 * failing, so CI stays green until the `update-snapshots` workflow has committed Linux ones
 * (docs/testing.md). `E2E_REQUIRE_BASELINES=1` turns that skip into a failure.
 */
const SNAPSHOT_DIR = resolve(import.meta.dirname, '../snapshots');

const hasBaselines = (): boolean =>
  existsSync(SNAPSHOT_DIR) &&
  readdirSync(SNAPSHOT_DIR).some((file) => file.endsWith(`-${process.platform}.png`));

// Playwright requires the destructuring pattern for the fixtures argument, even when empty.
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  const updating = ['all', 'changed'].includes(testInfo.config.updateSnapshots);
  test.skip(
    !updating && process.env['E2E_REQUIRE_BASELINES'] !== '1' && !hasBaselines(),
    `no ${process.platform} baselines in apps/web-e2e/snapshots yet (run the update-snapshots workflow)`,
  );
});

test.use({ reducedMotion: 'reduce' });

/** Fractions of the page's scroll range (the dive's progress): the start, and the Pineapple stop. */
const CAMERA_STOPS = [
  { name: 'dive-start', progress: 0 },
  { name: 'pineapple-stop', progress: 0.2 },
] as const;

const TIERS = ['high', 'low'] as const;

/**
 * Only the stage (the canvas and what is drawn in it) is compared. The page chrome around it
 * (language toggle, depth gauge, landmark buttons, notes) changes with copy and is covered by
 * the DOM specs. Done through element styles, not an injected stylesheet: the site's CSP
 * forbids inline `<style>` and this suite does not bypass it.
 */
const hideChrome = (page: Page) =>
  page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('#root > :not(.stage)')) {
      el.style.setProperty('visibility', 'hidden', 'important');
    }
  });

/** Waits until the depth readout, which follows the camera, has stopped changing. */
async function cameraSettled(page: Page): Promise<void> {
  const depth = page.getByTestId('depth-value');
  let last = '';
  let stable = 0;
  await expect(async () => {
    const now = (await depth.textContent()) ?? '';
    stable = now === last ? stable + 1 : 0;
    last = now;
    expect(stable).toBeGreaterThanOrEqual(3);
  }).toPass({ intervals: [1_000], timeout: 120_000 });
}

for (const tier of TIERS) {
  for (const stop of CAMERA_STOPS) {
    test(`canvas at ${stop.name}, ${tier} tier`, async ({ page }) => {
      await page.goto(`/?quality=${tier}&lang=en`);
      await expect(page.locator('.stage')).toHaveAttribute('data-quality-tier', tier);
      await canvasReady(page);

      await page.evaluate((progress) => {
        const range = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo({ top: progress * range, behavior: 'instant' });
      }, stop.progress);
      await cameraSettled(page);
      // Models and textures stream in after the camera arrives; give the last of them time to
      // land on a rasteriser that draws a few frames per second.
      await page.waitForTimeout(8_000);
      await hideChrome(page);
      // Fish, residents and caustics never fully stop, even under reduced motion: stop drawing
      // frames (apps/web/src/app/frame-freeze.tsx) so the canvas holds one still picture.
      await page.evaluate(() =>
        document.documentElement.setAttribute('data-freeze-frames', ''),
      );
      await page.waitForTimeout(500);

      await expect(page.locator('canvas')).toHaveScreenshot(`${stop.name}-${tier}.png`, {
        timeout: 60_000,
      });
    });
  }
}
