import { expect, test as base } from '@playwright/test';

/**
 * Console and page errors the site is known to log that are not defects. Keep it short and
 * justify each entry: an allowlist that grows silently stops catching anything.
 */
const KNOWN_BENIGN: readonly RegExp[] = [
  // The site ships no favicon on some preview hosts; the browser logs the 404 at error level.
  /Failed to load resource.*favicon/i,
];

export interface Diagnostics {
  /** Console errors and uncaught page errors seen so far, minus the allowlist. */
  readonly errors: readonly string[];
  /** Declares an error this one test provokes on purpose (a mocked 500, say). */
  allow(pattern: RegExp): void;
}

interface Fixtures {
  diagnostics: Diagnostics;
}

declare global {
  interface Window {
    __cspViolations?: string[];
  }
}

/**
 * `test` with an automatic guard: every test fails if the page logged a console error, threw,
 * or broke the Content Security Policy (docs/security.md). Specs that expect an error call
 * `diagnostics.allow(...)`.
 */
export const test = base.extend<Fixtures>({
  diagnostics: [
    async ({ page }, use) => {
      const allowed = [...KNOWN_BENIGN];
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
      // E2E_CPU_THROTTLE=4 slows the page 4x (CDP), to reproduce a slow CI runner locally.
      const throttle = Number(process.env['E2E_CPU_THROTTLE'] ?? 1);
      if (throttle > 1) {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
      }
      await page.addInitScript(() => {
        window.__cspViolations = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          window.__cspViolations?.push(`${event.violatedDirective} ${event.blockedURI}`);
        });
      });

      await use({
        get errors() {
          return errors.filter((text) => !allowed.some((pattern) => pattern.test(text)));
        },
        allow: (pattern) => void allowed.push(pattern),
      });

      const unexpected = errors.filter((text) => !allowed.some((pattern) => pattern.test(text)));
      expect(unexpected, 'console errors / page errors during the test').toEqual([]);
      const csp = await page.evaluate(() => window.__cspViolations ?? []).catch(() => []);
      expect(csp, 'Content Security Policy violations during the test').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
