/// <reference lib="dom" />
import type {
  ModerationAction,
  ModerationComplaint,
  ModerationPageResponse,
  ModerationStatus,
} from '@qa3elhamor/shared-api-interfaces';
import { act as act_, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModerationClient, ModerationFailure, ModerationResult } from './api';
import { ModerationApp } from './moderation-app';
import { sessionTokenStore, type TokenStore } from './token-store';

const complaint = (n: number, overrides: Partial<ModerationComplaint> = {}): ModerationComplaint => ({
  id: `id-${n}`,
  subject: `Subject ${n}`,
  body: `Body ${n}`,
  senderName: `Sender ${n}`,
  senderSpecies: null,
  submittedAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  status: 'pending',
  ...overrides,
});

const page = (items: ModerationComplaint[], nextCursor: string | null = null) =>
  ({ ok: true, value: { items, nextCursor } }) as ModerationResult<ModerationPageResponse>;

const fail = (kind: ModerationFailure['kind'], status: number | null, message = `${kind} message`) =>
  ({ ok: false, failure: { kind, status, message } }) as const;

const memoryStore = (initial: string | null = 'token-abc'): TokenStore & { value: string | null } => {
  const store = {
    persistent: true,
    value: initial,
    read: () => store.value,
    write: (token: string) => {
      store.value = token;
    },
    clear: () => {
      store.value = null;
    },
  };
  return store;
};

const fakeClient = (overrides: Partial<ModerationClient> = {}) => ({
  list: vi.fn<ModerationClient['list']>(async () => page([complaint(1), complaint(2)])),
  act: vi.fn<ModerationClient['act']>(async (id: string, action: ModerationAction) => ({
    ok: true,
    value: complaint(Number(id.slice(3)), { status: action === 'approve' ? 'approved' : 'rejected' }),
  })),
  ...overrides,
});

const renderApp = (client: ModerationClient, store = memoryStore(), confirm = vi.fn(() => true)) => {
  const createClient = vi.fn(() => client);
  render(<ModerationApp tokenStore={store} createClient={createClient} confirm={confirm} />);
  return { store, createClient, confirm };
};

/** Resolves only when the test says so, to observe the optimistic state. */
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

afterEach(() => {
  window.sessionStorage.clear();
});

describe('ModerationApp', () => {
  it('asks for the token in a password field and keeps it in the store once submitted', async () => {
    const client = fakeClient();
    const { store, createClient } = renderApp(client, memoryStore(null));

    const field = screen.getByLabelText('Moderation token');
    expect(field.getAttribute('type')).toBe('password');
    fireEvent.change(field, { target: { value: '  token-xyz  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Subject 1' })).toBeTruthy();
    expect(store.value).toBe('token-xyz');
    expect(createClient).toHaveBeenCalledWith('token-xyz');
    expect(client.list).toHaveBeenCalledWith('pending');
  });

  it('renders the body as text, never as markup', async () => {
    const hostile = complaint(1, { body: '<img src=x onerror=alert(1)>\nsecond line' });
    renderApp(fakeClient({ list: vi.fn(async () => page([hostile])) }));

    const card = (await screen.findByRole('heading', { name: 'Subject 1' })).closest('article') as HTMLElement;
    expect(card.querySelector('img')).toBeNull();
    expect(within(card).getByText(/<img src=x onerror=alert\(1\)>/)).toBeTruthy();
  });

  it('clears the token and shows "invalid token" when the server answers 401', async () => {
    const { store } = renderApp(fakeClient({ list: vi.fn(async () => fail('unauthorized', 401)) }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/invalid token/i);
    expect(screen.getByLabelText('Moderation token')).toBeTruthy();
    expect(store.value).toBeNull();
  });

  it('removes an approved complaint optimistically and confirms it', async () => {
    const pending = deferred<ModerationResult<ModerationComplaint>>();
    const client = fakeClient({ act: vi.fn(() => pending.promise) });
    renderApp(client);

    fireEvent.click(await screen.findByRole('button', { name: 'Approve: Subject 1' }));

    expect(screen.queryByRole('heading', { name: 'Subject 1' })).toBeNull();
    expect(client.act).toHaveBeenCalledWith('id-1', 'approve');
    await act_(async () => pending.resolve({ ok: true, value: complaint(1, { status: 'approved' }) }));
    expect(screen.getByText('"Subject 1" approved.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Subject 1' })).toBeNull();
  });

  it('rolls the complaint back into place when the action fails', async () => {
    renderApp(fakeClient({ act: vi.fn(async () => fail('network', null, 'Could not reach the server.')) }));

    fireEvent.click(await screen.findByRole('button', { name: 'Reject: Subject 1' }));

    expect(await screen.findByText('Could not reach the server.')).toBeTruthy();
    const subjects = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(subjects).toEqual(['Subject 1', 'Subject 2']);
  });

  it('refreshes the list and explains when someone else moderated first (409)', async () => {
    const list = vi
      .fn<ModerationClient['list']>()
      .mockResolvedValueOnce(page([complaint(1), complaint(2)]))
      .mockResolvedValueOnce(page([complaint(2)]));
    renderApp(fakeClient({ list, act: vi.fn(async () => fail('conflict', 409, 'Already moderated.')) }));

    fireEvent.click(await screen.findByRole('button', { name: 'Approve: Subject 1' }));

    expect(await screen.findByText('Already moderated.')).toBeTruthy();
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('heading', { name: 'Subject 1' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Subject 2' })).toBeTruthy();
  });

  it('keeps a card gone when a 409 refresh lands while its own action is still in flight', async () => {
    const second = deferred<ModerationResult<ModerationComplaint>>();
    // The refresh is read before the in-flight approval of Subject 2 commits, so it still lists it.
    const list = vi
      .fn<ModerationClient['list']>()
      .mockResolvedValueOnce(page([complaint(1), complaint(2), complaint(3)]))
      .mockResolvedValueOnce(page([complaint(2), complaint(3)]));
    const act = vi
      .fn<ModerationClient['act']>()
      .mockImplementationOnce(() => second.promise)
      .mockResolvedValueOnce(fail('conflict', 409, 'Already moderated.'));
    renderApp(fakeClient({ list, act }));

    fireEvent.click(await screen.findByRole('button', { name: 'Approve: Subject 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve: Subject 1' }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    await screen.findByRole('heading', { name: 'Subject 3' });
    expect(screen.queryByRole('heading', { name: 'Subject 2' })).toBeNull();

    await act_(async () => second.resolve({ ok: true, value: complaint(2, { status: 'approved' }) }));
    expect(screen.queryByRole('heading', { name: 'Subject 2' })).toBeNull();
    expect(screen.getByText('"Subject 2" approved.')).toBeTruthy();
  });

  it('hides an approved complaint from Pending but lists it under Approved', async () => {
    // The server's view after the approval: Pending still lists it (a stale read), Approved has it.
    const list = vi.fn<ModerationClient['list']>(async (status: ModerationStatus) =>
      status === 'approved'
        ? page([complaint(1, { status: 'approved' })])
        : page([complaint(1), complaint(2)])
    );
    renderApp(fakeClient({ list }));

    fireEvent.click(await screen.findByRole('button', { name: 'Approve: Subject 1' }));
    await screen.findByText('"Subject 1" approved.');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    await screen.findByRole('heading', { name: 'Subject 2' });
    expect(screen.queryByRole('heading', { name: 'Subject 1' })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Approved' }));

    expect(await screen.findByRole('heading', { name: 'Subject 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete: Subject 1' })).toBeTruthy();
    expect(list).toHaveBeenLastCalledWith('approved');
  });

  it('shows a fallback instead of crashing on an unreadable timestamp', async () => {
    renderApp(fakeClient({ list: vi.fn(async () => page([complaint(1, { submittedAt: 'not-a-date' })])) }));

    const card = (await screen.findByRole('heading', { name: 'Subject 1' })).closest('article') as HTMLElement;
    expect(within(card).getAllByText(/unknown time/).length).toBeGreaterThan(0);
  });

  it('keeps the token in memory, and says so, when session storage throws', async () => {
    const broken = {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      removeItem: () => undefined,
    } as unknown as Storage;
    const store = sessionTokenStore(broken);
    renderApp(fakeClient(), store as TokenStore & { value: string | null });

    fireEvent.change(screen.getByLabelText('Moderation token'), { target: { value: 'token-mem' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Subject 1' })).toBeTruthy();
    expect(store.read()).toBe('token-mem');
    expect(store.persistent).toBe(false);
    expect(screen.getByText(/kept in memory only/)).toBeTruthy();
  });

  it('asks before deleting and does nothing when the moderator cancels', async () => {
    const client = fakeClient();
    const confirm = vi.fn(() => false);
    renderApp(client, memoryStore(), confirm);

    fireEvent.click(await screen.findByRole('button', { name: 'Delete: Subject 1' }));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Subject 1'));
    expect(client.act).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Subject 1' })).toBeTruthy();
  });

  it('loads the next page with the cursor', async () => {
    const list = vi
      .fn<ModerationClient['list']>()
      .mockResolvedValueOnce(page([complaint(1)], 'cursor-2'))
      .mockResolvedValueOnce(page([complaint(2)]));
    renderApp(fakeClient({ list }));

    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));

    expect(await screen.findByRole('heading', { name: 'Subject 2' })).toBeTruthy();
    expect(list).toHaveBeenLastCalledWith('pending', 'cursor-2');
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('sends one page request however fast "Load more" is activated', async () => {
    const more = deferred<ModerationResult<ModerationPageResponse>>();
    const list = vi
      .fn<ModerationClient['list']>()
      .mockResolvedValueOnce(page([complaint(1)], 'cursor-2'))
      .mockImplementationOnce(() => more.promise);
    renderApp(fakeClient({ list }));

    const button = await screen.findByRole('button', { name: 'Load more' });
    fireEvent.click(button);
    fireEvent.click(button);
    await act_(async () => more.resolve(page([complaint(2)])));

    expect(list).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole('heading', { name: 'Subject 2' })).toHaveLength(1);
  });

  it('reloads from the first page when the server refuses the cursor', async () => {
    const list = vi
      .fn<ModerationClient['list']>()
      .mockResolvedValueOnce(page([complaint(1)], 'stale'))
      .mockResolvedValueOnce(fail('invalid-cursor', 400, 'The list changed while paging.'))
      .mockResolvedValueOnce(page([complaint(1), complaint(2)]));
    renderApp(fakeClient({ list }));

    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));

    expect(await screen.findByRole('heading', { name: 'Subject 2' })).toBeTruthy();
    expect(list).toHaveBeenLastCalledWith('pending');
  });

  it('switches status with the tabs, including by keyboard', async () => {
    const list = vi.fn<ModerationClient['list']>(async (status: ModerationStatus) =>
      page([complaint(9, { status, subject: `${status} one` })])
    );
    renderApp(fakeClient({ list }));
    const pendingTab = await screen.findByRole('tab', { name: 'Pending' });
    expect(pendingTab.getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(pendingTab, { key: 'ArrowRight' });

    expect(await screen.findByRole('heading', { name: 'approved one' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Approved' }).getAttribute('aria-selected')).toBe('true');
    expect(list).toHaveBeenLastCalledWith('approved');
    // An approved complaint can only be deleted.
    expect(screen.queryByRole('button', { name: /^Approve/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete: approved one' })).toBeTruthy();
  });

  it('forgets the token on sign out', async () => {
    const { store } = renderApp(fakeClient());

    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));

    expect(store.value).toBeNull();
    expect(screen.getByLabelText('Moderation token')).toBeTruthy();
  });
});

describe('sessionTokenStore', () => {
  it('uses sessionStorage only', () => {
    const store = sessionTokenStore();
    store.write('abc');
    expect(window.sessionStorage.length).toBe(1);
    expect(window.localStorage.length).toBe(0);
    expect(store.read()).toBe('abc');
    store.clear();
    expect(store.read()).toBeNull();
  });
});
