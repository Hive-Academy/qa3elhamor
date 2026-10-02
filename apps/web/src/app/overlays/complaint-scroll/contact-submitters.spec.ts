import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  contactConfigProblems,
  createContactSubmitter,
  formspreeSubmitter,
  web3formsSubmitter,
} from './contact-submitters';
import { pendingSubmitter, type ComplaintDraft } from './complaint-submitter';

const draft: ComplaintDraft = {
  subject: 'Services request',
  body: 'The pineapple leaks. Please send a developer.',
  senderName: 'Sardine Sam',
  senderSpecies: 'Sardine',
  replyEmail: 'sam@sea.example',
};

const ACCESS_KEY = 'test-web3forms-access-key-0000';
const FORM_ID = 'test-formspree-form-id-0000';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const lastFetch = (): [string, RequestInit] => {
  const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
  const calls = fetchMock.mock.calls as [string, RequestInit][];
  return calls[calls.length - 1];
};

const requestBody = (): Record<string, unknown> => {
  const [, init] = lastFetch();
  return JSON.parse(init.body as string) as Record<string, unknown>;
};

function stallingFetch(stalledBody = true): ReturnType<typeof vi.fn> {
  return vi.fn(() => {
    const response = new Response('{}');
    if (stalledBody) {
      response.json = () => new Promise<never>(() => undefined);
    }
    return Promise.resolve(response);
  });
}

describe('web3formsSubmitter', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ success: true }))),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('delivers the normalised draft on a successful submission', async () => {
    const result = await web3formsSubmitter({ accessKey: ACCESS_KEY }).submit(
      draft,
    );
    expect(result).toEqual({ status: 'delivered' });

    const [url, init] = lastFetch();
    expect(url).toBe('https://api.web3forms.com/submit');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });

    const body = requestBody();
    expect(body).toEqual({
      access_key: ACCESS_KEY,
      subject: draft.subject,
      name: draft.senderName,
      message: draft.body,
      from_name: 'Qaa El-Hamour Complaints Bureau',
      botcheck: false,
      species: draft.senderSpecies,
      email: draft.replyEmail,
    });
  });

  it('omits optional species and reply email when absent', async () => {
    await web3formsSubmitter({ accessKey: ACCESS_KEY }).submit({
      ...draft,
      senderSpecies: null,
      replyEmail: null,
    });
    const body = requestBody();
    expect(body).not.toHaveProperty('species');
    expect(body).not.toHaveProperty('email');
  });

  it('uses a custom endpoint when provided', async () => {
    await web3formsSubmitter({
      accessKey: ACCESS_KEY,
      endpoint: 'https://proxy.example.org/web3forms',
    }).submit(draft);
    const [url] = lastFetch();
    expect(url).toBe('https://proxy.example.org/web3forms');
  });

  it('fails safely when the provider reports an error body', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse({
        success: false,
        message: `Invalid access key ${ACCESS_KEY}`,
      }),
    );
    await expect(
      web3formsSubmitter({ accessKey: ACCESS_KEY }).submit(draft),
    ).rejects.toThrow('contact service could not deliver');
  });

  it('fails safely on a non-2xx response', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse({ message: 'Internal error' }, 500),
    );
    await expect(
      web3formsSubmitter({ accessKey: ACCESS_KEY }).submit(draft),
    ).rejects.toThrow('contact service is busy');
  });

  it('fails safely on a 429 response', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse({ error: 'rate limit' }, 429),
    );
    await expect(
      web3formsSubmitter({ accessKey: ACCESS_KEY }).submit(draft),
    ).rejects.toThrow('contact service is busy');
  });

  it('fails safely when the response body is not JSON', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response('not json', { status: 200 }),
    );
    await expect(
      web3formsSubmitter({ accessKey: ACCESS_KEY }).submit(draft),
    ).rejects.toThrow('contact service could not deliver');
  });

  it('fails safely on a network error', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new TypeError('fetch failed'),
    );
    await expect(
      web3formsSubmitter({ accessKey: ACCESS_KEY }).submit(draft),
    ).rejects.toThrow('Network error');
  });

  it('times out after 15 seconds and reports a safe message', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', stallingFetch());
    const promise = web3formsSubmitter({ accessKey: ACCESS_KEY }).submit(draft);
    vi.advanceTimersByTime(16_000);
    await expect(promise).rejects.toThrow('timed out');
  });

  it('clears the timeout timer after a successful submission', async () => {
    vi.useFakeTimers();
    await web3formsSubmitter({ accessKey: ACCESS_KEY }).submit(draft);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the timeout timer after a failed submission', async () => {
    vi.useFakeTimers();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse({ success: false }),
    );
    await expect(
      web3formsSubmitter({ accessKey: ACCESS_KEY }).submit(draft),
    ).rejects.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never includes the access key in an error message or cause', async () => {
    const run = async () => {
      try {
        await web3formsSubmitter({ accessKey: ACCESS_KEY }).submit(draft);
        return { message: '', cause: undefined };
      } catch (error) {
        return {
          message: error instanceof Error ? error.message : String(error),
          cause: error instanceof Error ? error.cause : undefined,
        };
      }
    };

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse({
        success: false,
        message: `key ${ACCESS_KEY} rejected`,
      }),
    );
    const first = await run();
    expect(first.message).not.toContain(ACCESS_KEY);
    expect(String(first.cause)).not.toContain(ACCESS_KEY);

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse({ error: ACCESS_KEY }, 500),
    );
    const second = await run();
    expect(second.message).not.toContain(ACCESS_KEY);
    expect(String(second.cause)).not.toContain(ACCESS_KEY);

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new TypeError(ACCESS_KEY),
    );
    const third = await run();
    expect(third.message).not.toContain(ACCESS_KEY);
    expect(String(third.cause)).not.toContain(ACCESS_KEY);
  });
});

describe('formspreeSubmitter', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ ok: true }))),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('delivers the normalised draft on a successful submission', async () => {
    const result = await formspreeSubmitter({ formId: FORM_ID }).submit(draft);
    expect(result).toEqual({ status: 'delivered' });

    const [url, init] = lastFetch();
    expect(url).toBe(`https://formspree.io/f/${FORM_ID}`);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Accept: 'application/json' });

    const body = requestBody();
    expect(body).toMatchObject({
      subject: draft.subject,
      _subject: draft.subject,
      name: draft.senderName,
      message: draft.body,
      email: draft.replyEmail,
      reply_to: draft.replyEmail,
      species: draft.senderSpecies,
      _gotcha: '',
    });
  });

  it('uses a custom endpoint when provided', async () => {
    await formspreeSubmitter({
      formId: FORM_ID,
      endpoint: 'https://proxy.example.org/formspree',
    }).submit(draft);
    const [url] = lastFetch();
    expect(url).toBe('https://proxy.example.org/formspree');
  });

  it('url-encodes the form id in the default endpoint', async () => {
    await formspreeSubmitter({ formId: 'a/b c' }).submit(draft);
    const [url] = lastFetch();
    expect(url).toBe('https://formspree.io/f/a%2Fb%20c');
  });

  it('fails safely when the provider returns an errors array', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse({ errors: [{ message: `Form ${FORM_ID} not found` }] }),
    );
    await expect(
      formspreeSubmitter({ formId: FORM_ID }).submit(draft),
    ).rejects.toThrow('contact service is busy');
  });

  it('fails safely on a 429 response', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse({ error: 'rate limit' }, 429),
    );
    await expect(
      formspreeSubmitter({ formId: FORM_ID }).submit(draft),
    ).rejects.toThrow('contact service is busy');
  });

  it('fails safely on a 5xx response', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse({ error: 'server error' }, 503),
    );
    await expect(
      formspreeSubmitter({ formId: FORM_ID }).submit(draft),
    ).rejects.toThrow('contact service is busy');
  });

  it('fails safely on an HTTP 200 with ok:false', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse({ ok: false }),
    );
    await expect(
      formspreeSubmitter({ formId: FORM_ID }).submit(draft),
    ).rejects.toThrow('Unexpected response');
  });

  it('fails safely when the response body is not JSON', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response('thanks', { status: 200 }),
    );
    await expect(
      formspreeSubmitter({ formId: FORM_ID }).submit(draft),
    ).rejects.toThrow('Unexpected response');
  });

  it('times out after 15 seconds', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', stallingFetch());
    const promise = formspreeSubmitter({ formId: FORM_ID }).submit(draft);
    vi.advanceTimersByTime(16_000);
    await expect(promise).rejects.toThrow('timed out');
  });

  it('never includes the form id in an error message or cause', async () => {
    const run = async () => {
      try {
        await formspreeSubmitter({ formId: FORM_ID }).submit(draft);
        return { message: '', cause: undefined };
      } catch (error) {
        return {
          message: error instanceof Error ? error.message : String(error),
          cause: error instanceof Error ? error.cause : undefined,
        };
      }
    };

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse({ errors: [{ message: `Form ${FORM_ID} disabled` }] }),
    );
    const first = await run();
    expect(first.message).not.toContain(FORM_ID);
    expect(String(first.cause)).not.toContain(FORM_ID);

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse({ error: FORM_ID }, 429),
    );
    const second = await run();
    expect(second.message).not.toContain(FORM_ID);
    expect(String(second.cause)).not.toContain(FORM_ID);
  });
});

describe('createContactSubmitter', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ success: true }))),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('selects the Web3Forms adapter with a valid access key', async () => {
    const submitter = createContactSubmitter({
      VITE_CONTACT_PROVIDER: 'web3forms',
      VITE_WEB3FORMS_ACCESS_KEY: ACCESS_KEY,
    });
    const result = await submitter.submit(draft);
    expect(result).toEqual({ status: 'delivered' });
    expect(requestBody()).toHaveProperty('access_key', ACCESS_KEY);
  });

  it('selects the Formspree adapter with a valid form id', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse({ ok: true }),
    );
    const submitter = createContactSubmitter({
      VITE_CONTACT_PROVIDER: 'formspree',
      VITE_FORMSPREE_FORM_ID: FORM_ID,
    });
    const result = await submitter.submit(draft);
    expect(result).toEqual({ status: 'delivered' });
    const [url] = lastFetch();
    expect(url).toBe(`https://formspree.io/f/${FORM_ID}`);
  });

  it('falls back to pendingSubmitter when provider is none or missing', () => {
    expect(createContactSubmitter({})).toBe(pendingSubmitter);
    expect(createContactSubmitter({ VITE_CONTACT_PROVIDER: 'none' })).toBe(
      pendingSubmitter,
    );
  });

  it('falls back to pendingSubmitter and warns in dev on missing credentials', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const web3Missing = createContactSubmitter({
      VITE_CONTACT_PROVIDER: 'web3forms',
      DEV: true,
    });
    expect(web3Missing).toBe(pendingSubmitter);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('VITE_WEB3FORMS_ACCESS_KEY is missing'),
    );

    warn.mockClear();
    const formspreeMissing = createContactSubmitter({
      VITE_CONTACT_PROVIDER: 'formspree',
      MODE: 'development',
    });
    expect(formspreeMissing).toBe(pendingSubmitter);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('VITE_FORMSPREE_FORM_ID is missing'),
    );

    warn.mockRestore();
  });

  it('does not warn in production when falling back', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const submitter = createContactSubmitter({
      VITE_CONTACT_PROVIDER: 'web3forms',
      DEV: false,
      MODE: 'production',
    });
    expect(submitter).toBe(pendingSubmitter);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('falls back to pendingSubmitter for an unknown provider', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const submitter = createContactSubmitter({
      VITE_CONTACT_PROVIDER: 'unknown',
      DEV: true,
    });
    expect(submitter).toBe(pendingSubmitter);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Unknown VITE_CONTACT_PROVIDER'),
    );
    warn.mockRestore();
  });

  it('trims whitespace from credentials and provider names', async () => {
    const submitter = createContactSubmitter({
      VITE_CONTACT_PROVIDER: '  WEB3FORMS  ',
      VITE_WEB3FORMS_ACCESS_KEY: `  ${ACCESS_KEY}  `,
    });
    await submitter.submit(draft);
    expect(requestBody()).toHaveProperty('access_key', ACCESS_KEY);
  });

  it('falls back when the form id contains invalid characters', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const submitter = createContactSubmitter({
      VITE_CONTACT_PROVIDER: 'formspree',
      VITE_FORMSPREE_FORM_ID: 'bad/id',
      DEV: true,
    });
    expect(submitter).toBe(pendingSubmitter);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('VITE_FORMSPREE_FORM_ID contains invalid'),
    );
    warn.mockRestore();
  });
});

describe('contactConfigProblems', () => {
  it('returns an empty array when the provider is missing, none, or fully wired', () => {
    expect(contactConfigProblems({})).toEqual([]);
    expect(contactConfigProblems({ VITE_CONTACT_PROVIDER: 'none' })).toEqual(
      [],
    );
    expect(
      contactConfigProblems({
        VITE_CONTACT_PROVIDER: 'web3forms',
        VITE_WEB3FORMS_ACCESS_KEY: ACCESS_KEY,
      }),
    ).toEqual([]);
    expect(
      contactConfigProblems({
        VITE_CONTACT_PROVIDER: 'formspree',
        VITE_FORMSPREE_FORM_ID: FORM_ID,
      }),
    ).toEqual([]);
  });

  it('reports an unknown provider', () => {
    expect(
      contactConfigProblems({ VITE_CONTACT_PROVIDER: 'mailchimp' }),
    ).toEqual([
      'Unknown VITE_CONTACT_PROVIDER "mailchimp"; expected "web3forms", "formspree", or "none".',
    ]);
  });

  it('reports missing or malformed Web3Forms credentials', () => {
    expect(
      contactConfigProblems({ VITE_CONTACT_PROVIDER: 'web3forms' }),
    ).toEqual(['VITE_WEB3FORMS_ACCESS_KEY is missing or empty.']);
    expect(
      contactConfigProblems({
        VITE_CONTACT_PROVIDER: 'web3forms',
        VITE_WEB3FORMS_ACCESS_KEY: '   ',
      }),
    ).toEqual(['VITE_WEB3FORMS_ACCESS_KEY is missing or empty.']);
    expect(
      contactConfigProblems({
        VITE_CONTACT_PROVIDER: 'web3forms',
        VITE_WEB3FORMS_ACCESS_KEY: 'key with space',
      }),
    ).toEqual(['VITE_WEB3FORMS_ACCESS_KEY contains whitespace.']);
  });

  it('reports missing or malformed Formspree credentials', () => {
    expect(
      contactConfigProblems({ VITE_CONTACT_PROVIDER: 'formspree' }),
    ).toEqual(['VITE_FORMSPREE_FORM_ID is missing or empty.']);
    expect(
      contactConfigProblems({
        VITE_CONTACT_PROVIDER: 'formspree',
        VITE_FORMSPREE_FORM_ID: '   ',
      }),
    ).toEqual(['VITE_FORMSPREE_FORM_ID is missing or empty.']);
    expect(
      contactConfigProblems({
        VITE_CONTACT_PROVIDER: 'formspree',
        VITE_FORMSPREE_FORM_ID: 'bad/id',
      }),
    ).toEqual([
      'VITE_FORMSPREE_FORM_ID contains invalid characters; only letters, numbers, underscores and hyphens are allowed.',
    ]);
  });

  it('trims and lowercases the provider name', () => {
    expect(
      contactConfigProblems({
        VITE_CONTACT_PROVIDER: '  WEB3FORMS  ',
        VITE_WEB3FORMS_ACCESS_KEY: ACCESS_KEY,
      }),
    ).toEqual([]);
  });
});
