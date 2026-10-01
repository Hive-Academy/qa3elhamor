import type {
  ComplaintDelivery,
  ComplaintDraft,
  ComplaintSubmitter,
} from './complaint-submitter';
import { pendingSubmitter } from './complaint-submitter';

const REQUEST_TIMEOUT_MS = 15_000;

const MESSAGES = {
  network:
    'Network error. Please check your connection and try again.',
  timeout: 'The request timed out. Please try again.',
  providerBusy: 'The contact service is busy. Please try again later.',
  unexpected:
    'Unexpected response from the contact service. Please try again later.',
  web3formsFailed:
    'The contact service could not deliver the message. Please try again later.',
} as const;

/**
 * Internal failure type. The message is always user-safe: it never contains the provider
 * access key, form id, or raw response body.
 */
class ContactSubmitterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContactSubmitterError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Races `promise` against an abort signal. If the signal is already aborted, rejects
 * immediately; otherwise the listener is removed as soon as the promise settles so it does
 * not leak.
 */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
      return;
    }
    const onAbort = (): void => {
      cleanup();
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };
    const cleanup = (): void => {
      signal.removeEventListener('abort', onAbort);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (reason) => {
        cleanup();
        reject(reason);
      },
    );
  });
}

/**
 * POST JSON with a 15 s timeout that covers the whole exchange: connection, headers, and
 * body parsing. The timer is only cleared after the body has been read and parsed, so a
 * stalled body cannot leave the Bureau stuck in "sending".
 */
async function postJson(
  url: string,
  body: Record<string, unknown>,
): Promise<{ readonly response: Response; readonly data: unknown }> {
  const controller = new AbortController();
  const { signal } = controller;
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await abortable(
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      }),
      signal,
    );
    let data: unknown;
    try {
      data = await abortable(response.json(), signal);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }
      data = null;
    }
    return { response, data };
  } finally {
    clearTimeout(timeout);
  }
}

function handleSubmitError(error: unknown): never {
  if (error instanceof ContactSubmitterError) throw error;
  if (error instanceof DOMException && error.name === 'AbortError') {
    throw new ContactSubmitterError(MESSAGES.timeout);
  }
  throw new ContactSubmitterError(MESSAGES.network);
}

export interface Web3FormsSubmitterConfig {
  /** Web3Forms access key (public by design, safe in the client bundle). */
  readonly accessKey: string;
  readonly endpoint?: string;
}

/**
 * Adapter for Web3Forms: POST JSON to `https://api.web3forms.com/submit`.
 * @see https://web3forms.com/
 */
export function web3formsSubmitter({
  accessKey,
  endpoint = 'https://api.web3forms.com/submit',
}: Web3FormsSubmitterConfig): ComplaintSubmitter {
  return {
    async submit(draft: ComplaintDraft): Promise<ComplaintDelivery> {
      const body: Record<string, unknown> = {
        access_key: accessKey,
        subject: draft.subject,
        name: draft.senderName,
        message: draft.body,
        from_name: 'Qaa El-Hamour Complaints Bureau',
        botcheck: false,
      };
      if (draft.senderSpecies) body.species = draft.senderSpecies;
      if (draft.replyEmail) body.email = draft.replyEmail;

      try {
        const { response, data } = await postJson(endpoint, body);
        if (!response.ok) {
          throw new ContactSubmitterError(MESSAGES.providerBusy);
        }
        if (!isRecord(data) || data.success !== true) {
          throw new ContactSubmitterError(MESSAGES.web3formsFailed);
        }
        return { status: 'delivered' };
      } catch (error) {
        return handleSubmitError(error);
      }
    },
  };
}

export interface FormspreeSubmitterConfig {
  /** Formspree form id (public by design, safe in the client bundle). */
  readonly formId: string;
  readonly endpoint?: string;
}

/**
 * Adapter for Formspree: POST JSON to `https://formspree.io/f/<formId>`.
 * @see https://formspree.io/
 */
export function formspreeSubmitter({
  formId,
  endpoint = `https://formspree.io/f/${encodeURIComponent(formId)}`,
}: FormspreeSubmitterConfig): ComplaintSubmitter {
  return {
    async submit(draft: ComplaintDraft): Promise<ComplaintDelivery> {
      const body: Record<string, unknown> = {
        subject: draft.subject,
        _subject: draft.subject,
        name: draft.senderName,
        message: draft.body,
        _gotcha: '',
      };
      if (draft.senderSpecies) body.species = draft.senderSpecies;
      if (draft.replyEmail) {
        body.email = draft.replyEmail;
        body.reply_to = draft.replyEmail;
      }

      try {
        const { response, data } = await postJson(endpoint, body);
        if (
          !response.ok ||
          (isRecord(data) &&
            Array.isArray(data.errors) &&
            data.errors.length > 0)
        ) {
          throw new ContactSubmitterError(MESSAGES.providerBusy);
        }
        if (!isRecord(data) || data.ok !== true) {
          throw new ContactSubmitterError(MESSAGES.unexpected);
        }
        return { status: 'delivered' };
      } catch (error) {
        return handleSubmitError(error);
      }
    },
  };
}

/**
 * Build-time contact form configuration. `DEV`/`MODE` are only used to gate the single
 * `console.warn` when configuration is missing; the adapter itself is fully defined by the
 * other keys.
 */
export interface ContactEnv {
  readonly VITE_CONTACT_PROVIDER?: string;
  readonly VITE_WEB3FORMS_ACCESS_KEY?: string;
  readonly VITE_FORMSPREE_FORM_ID?: string;
  readonly DEV?: boolean;
  readonly MODE?: string;
}

type ContactProviderName = 'web3forms' | 'formspree' | 'none';

const FORM_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Returns a list of configuration problems. Empty means the env is either deliberately off
 * (`none`/missing) or fully wired. Non-empty means `createContactSubmitter` will fall back to
 * `pendingSubmitter` at runtime. Deploy workflows can call this at build time to fail loudly
 * before shipping a dead form.
 */
export function contactConfigProblems(env: ContactEnv): string[] {
  const provider = text(env.VITE_CONTACT_PROVIDER).toLowerCase() as
    | ContactProviderName
    | string;

  if (provider === '' || provider === 'none') return [];

  const problems: string[] = [];

  if (provider !== 'web3forms' && provider !== 'formspree') {
    problems.push(
      `Unknown VITE_CONTACT_PROVIDER "${provider}"; expected "web3forms", "formspree", or "none".`,
    );
    return problems;
  }

  if (provider === 'web3forms') {
    const accessKey = text(env.VITE_WEB3FORMS_ACCESS_KEY);
    if (!accessKey) {
      problems.push('VITE_WEB3FORMS_ACCESS_KEY is missing or empty.');
    } else if (/\s/.test(accessKey)) {
      problems.push('VITE_WEB3FORMS_ACCESS_KEY contains whitespace.');
    }
  }

  if (provider === 'formspree') {
    const formId = text(env.VITE_FORMSPREE_FORM_ID);
    if (!formId) {
      problems.push('VITE_FORMSPREE_FORM_ID is missing or empty.');
    } else if (!FORM_ID_PATTERN.test(formId)) {
      problems.push(
        'VITE_FORMSPREE_FORM_ID contains invalid characters; only letters, numbers, underscores and hyphens are allowed.',
      );
    }
  }

  return problems;
}

function isDev(env: ContactEnv): boolean {
  return env.DEV === true || env.MODE === 'development';
}

function warnAndFallback(
  env: ContactEnv,
  reason: string,
): ComplaintSubmitter {
  if (isDev(env)) {
    console.warn(`Contact submitter fallback: ${reason}`);
  }
  return pendingSubmitter;
}

/**
 * Factory that selects a `ComplaintSubmitter` from build-time environment variables.
 * Missing or invalid configuration resolves to `pendingSubmitter`, so the site always builds
 * and the form always works.
 */
export function createContactSubmitter(env: ContactEnv): ComplaintSubmitter {
  const problems = contactConfigProblems(env);
  if (problems.length > 0) {
    return warnAndFallback(env, problems[0]);
  }

  const provider = text(env.VITE_CONTACT_PROVIDER).toLowerCase();

  if (provider === '' || provider === 'none') return pendingSubmitter;

  if (provider === 'web3forms') {
    return web3formsSubmitter({
      accessKey: text(env.VITE_WEB3FORMS_ACCESS_KEY),
    });
  }

  return formspreeSubmitter({
    formId: text(env.VITE_FORMSPREE_FORM_ID),
  });
}
