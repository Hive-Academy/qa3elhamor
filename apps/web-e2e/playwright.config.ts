import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

/**
 * End-to-end and visual-regression suite for the public site (docs/testing.md).
 *
 * Target: by default two `vite preview` servers over production builds (scripts/serve.mjs),
 * `wired` (contact provider configured, the tests intercept it) on WIRED_PORT and `bare`
 * (default build, no provider) on BARE_PORT. `E2E_BASE_URL=https://...` skips both and points
 * every project at an already-deployed site instead.
 */
const WIRED_PORT = Number(process.env['E2E_PORT'] ?? 4510);
const BARE_PORT = WIRED_PORT + 1;
const external = process.env['E2E_BASE_URL']?.trim() || undefined;
const isCi = Boolean(process.env['CI']);

// WebGL in headless Chromium has no GPU on a CI runner: ANGLE's software rasteriser
// (SwiftShader) provides it. It is slow (a few fps), which the suite budgets for.
const WEBGL_ARGS = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];
// The no-WebGL project: the page must fall back to the readable page view.
const NO_WEBGL_ARGS = ['--disable-webgl', '--disable-3d-apis'];

const wiredUrl = external ?? `http://localhost:${WIRED_PORT}`;
const bareUrl = `http://localhost:${BARE_PORT}`;

const NOT_WEBGL_SPECS = [
  '**/visual.spec.ts',
  '**/nowebgl.spec.ts',
  '**/bureau-pending.spec.ts',
];

export default defineConfig({
  testDir: './src',
  outputDir: './test-results',
  // One baseline per project and platform: pixels differ between Windows and Linux rasterisers,
  // so only the platform that generated a baseline compares against it (docs/testing.md).
  snapshotPathTemplate: '{testDir}/../snapshots/{arg}-{projectName}-{platform}{ext}',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  workers: Number(process.env['E2E_WORKERS'] ?? 2),
  // A swiftshader frame takes long enough that one scripted dive (camera flight, narrator,
  // typewriter) can run past a minute.
  timeout: 300_000,
  expect: {
    timeout: 30_000,
    toHaveScreenshot: {
      // Software rasterisers differ by a few pixels between runs and Chromium builds; a broken
      // material or missing asset moves far more than this.
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    },
  },
  reporter: isCi
    ? [['github'], ['list'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: wiredUrl,
    // The site picks its language from ?lang, then storage, then the browser; the specs assert
    // English names, so pin the browser language here and `?lang=en` in every URL.
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 30_000,
    navigationTimeout: 120_000,
    launchOptions: { args: WEBGL_ARGS },
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: NOT_WEBGL_SPECS,
      // @nightly: animation-driven in-world steps, run by the e2e-inworld job (E2E_NIGHTLY=1).
      grepInvert: process.env['E2E_NIGHTLY'] ? undefined : /@nightly/,
      use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } },
    },
    {
      // Touch-first narrow viewport. deviceScaleFactor 1: a software rasteriser pays per pixel.
      name: 'mobile',
      testMatch: /(smoke|dive|bureau|fallback)\.spec\.ts$/,
      // The long camera flights run once, on desktop; mobile keeps one visit (the Pineapple)
      // and the quick dialog paths.
      grepInvert: /@desktop-only|@nightly/,
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1,
      },
    },
    {
      name: 'nowebgl',
      testMatch: /nowebgl\.spec\.ts$/,
      use: {
        browserName: 'chromium',
        viewport: { width: 1440, height: 900 },
        launchOptions: { args: NO_WEBGL_ARGS },
      },
    },
    {
      name: 'visual',
      testMatch: /visual\.spec\.ts$/,
      use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } },
    },
    // The unconfigured build only exists locally; against a deployed URL the wired/unwired
    // state is whatever that deployment was built with.
    ...(external
      ? []
      : [
          {
            name: 'pending',
            testMatch: /bureau-pending\.spec\.ts$/,
            use: {
              browserName: 'chromium' as const,
              viewport: { width: 1440, height: 900 },
              baseURL: bareUrl,
            },
          },
        ]),
  ],
  webServer: external
    ? undefined
    : (['wired', 'bare'] as const).map((mode) => ({
        command: `node ${resolve(import.meta.dirname, 'scripts/serve.mjs')} ${mode} ${
          mode === 'wired' ? WIRED_PORT : BARE_PORT
        }`,
        url: `http://localhost:${mode === 'wired' ? WIRED_PORT : BARE_PORT}/`,
        reuseExistingServer: false,
        // Production build (~10 s) plus start-up.
        timeout: 180_000,
        stdout: 'pipe' as const,
        stderr: 'pipe' as const,
      })),
});
