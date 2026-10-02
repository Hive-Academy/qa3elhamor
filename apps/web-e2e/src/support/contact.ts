import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The provider the wired build is configured for (`scripts/serve.mjs`, docs/contact.md).
 * Everything the wired build may send to its host; only POST /submit is correct.
 */
export const PROVIDER_ORIGIN = /^https:\/\/api\.web3forms\.com\//;
export const SUBMIT_URL = 'https://api.web3forms.com/submit';
export const FAKE_ACCESS_KEY = 'e2e-fake-access-key';

export const COMPLAINT = {
  subject: 'The pineapple leaks again',
  body: 'Water everywhere. Please send a developer before the next tide.',
  name: 'Sardine Sam',
  email: 'sam@sea.example',
} as const;

export interface ProviderCall {
  readonly method: string;
  readonly url: string;
  readonly payload: Record<string, unknown>;
}

/**
 * Stands in for the contact provider. Nothing leaves the machine: the request is answered
 * here, and every call is recorded for the test to inspect.
 */
export async function mockProvider(
  page: Page,
  outcome: 'delivered' | 'failed',
): Promise<ProviderCall[]> {
  const calls: ProviderCall[] = [];
  await page.route(PROVIDER_ORIGIN, async (route) => {
    const request = route.request();
    // Anything but POST /submit is recorded (and fails `expectProviderCalls`) and refused.
    if (request.method() !== 'POST' || request.url() !== SUBMIT_URL) {
      calls.push({ method: request.method(), url: request.url(), payload: {} });
      await route.fulfill({ status: 404, body: 'not the submit endpoint' });
      return;
    }
    calls.push({
      method: request.method(),
      url: request.url(),
      payload: JSON.parse(request.postData() ?? '{}') as Record<string, unknown>,
    });
    await (outcome === 'delivered'
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, message: 'ok' }),
        })
      : route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ success: false }),
        }));
  });
  return calls;
}

/**
 * Every call the provider mock saw was a POST to the exact submit endpoint with a body of the
 * shape the provider documents (access_key, subject, message), and there were `count` of them.
 */
export function expectProviderCalls(calls: readonly ProviderCall[], count: number): void {
  expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(
    Array.from({ length: count }, () => `POST ${SUBMIT_URL}`),
  );
  for (const call of calls) {
    expect(call.payload).toEqual(
      expect.objectContaining({
        access_key: expect.any(String),
        subject: expect.any(String),
        message: expect.any(String),
      }),
    );
  }
}

/** Records (and refuses) any request to a contact provider: the "not wired" build sends none. */
export async function forbidProvider(page: Page): Promise<string[]> {
  const seen: string[] = [];
  await page.route(/api\.web3forms\.com|formspree\.io/, async (route) => {
    seen.push(route.request().url());
    await route.abort();
  });
  return seen;
}

/** Fills the complaint form inside `form` (the dialog, or the unrolled scroll). */
export async function fillComplaint(form: Locator): Promise<void> {
  await form.getByLabel('Subject of the complaint').fill(COMPLAINT.subject);
  await form.getByLabel('Details of the complaint').fill(COMPLAINT.body);
  await form.getByLabel('Your name').fill(COMPLAINT.name);
  await form.getByLabel('Reply address').fill(COMPLAINT.email);
}

export const stampButton = (form: Locator): Locator =>
  form.getByRole('button', { name: 'Stamp and send' });

/**
 * Presses the stamp button from the keyboard. The unrolled scroll is still settling and the
 * button sits in its inner scroll area, where a pointer click can miss ("element is not
 * stable"); focus scrolls it into view and Enter submits like a real keyboard user.
 */
export async function stamp(form: Locator): Promise<void> {
  const button = stampButton(form);
  await button.focus();
  await button.press('Enter');
}

/** The visitor's text is still in the fields. */
export async function expectComplaintKept(form: Locator): Promise<void> {
  await expect(form.getByLabel('Subject of the complaint')).toHaveValue(COMPLAINT.subject);
  await expect(form.getByLabel('Details of the complaint')).toHaveValue(COMPLAINT.body);
}
