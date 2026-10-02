import type { WallComplaint } from '@qa3elhamor/shared-api-interfaces';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NoticeBoard } from './notice-board';
import type { WallClient, WallResult } from './wall-client';
import type { WallPageResponse } from '@qa3elhamor/shared-api-interfaces';

const note = (id: string, extra: Partial<WallComplaint> = {}): WallComplaint => ({
  id,
  subject: `Subject ${id}`,
  body: `Body of ${id}`,
  senderName: `Sender ${id}`,
  senderSpecies: null,
  submittedAt: '2026-09-30T10:00:00.000Z',
  ...extra,
});

const page = (items: WallComplaint[], nextCursor: string | null): WallResult<WallPageResponse> => ({
  ok: true,
  value: { items, nextCursor },
});

const fakeClient = (...results: WallResult<WallPageResponse>[]) => {
  const list = vi.fn<WallClient['list']>();
  for (const result of results) list.mockResolvedValueOnce(result);
  const client: WallClient = { list, submit: vi.fn() };
  return { client, list };
};

const renderBoard = (client: WallClient, props: Partial<Parameters<typeof NoticeBoard>[0]> = {}) =>
  render(
    <NoticeBoard
      apiUrl="/api"
      client={client}
      lang="en"
      dir="ltr"
      presentation="in-world"
      {...props}
    />,
  );

afterEach(() => vi.restoreAllMocks());

describe('NoticeBoard', () => {
  it('pins the newest page of approved complaints, named as the wall', async () => {
    const { client, list } = fakeClient(
      page([note('a', { senderSpecies: 'grouper' }), note('b')], null),
    );
    renderBoard(client);
    const board = screen.getByRole('region', { name: 'Public complaints wall' });
    expect(within(board).getByRole('status').textContent).toBe('Reading the wall…');

    const notes = await within(board).findAllByRole('button', { name: /^Subject/ });
    expect(notes).toHaveLength(2);
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ cursor: null }));
    expect(within(board).getByText('Body of a')).toBeTruthy();
    expect(notes[0].textContent).toContain('From Sender a, grouper');
    expect(notes[0].querySelector('time')?.getAttribute('datetime')).toBe(
      '2026-09-30T10:00:00.000Z',
    );
  });

  it('renders complaint text literally, never as markup', async () => {
    const attack = '<img src=x onerror=alert(1)>';
    const { client } = fakeClient(
      page([note('x', { subject: attack, body: `${attack} <script>alert(2)</script>`, senderName: attack })], null),
    );
    const { container } = renderBoard(client);
    const button = await screen.findByRole('button', { name: attack });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(button.textContent).toContain(attack);

    fireEvent.click(button);
    const detail = screen.getByRole('article', { name: attack });
    expect(within(detail).getByText(`${attack} <script>alert(2)</script>`)).toBeTruthy();
    expect(container.querySelector('img, script, [onerror]')).toBeNull();
  });

  it('clamps a long complaint on its note and opens the whole of it, focus and all', async () => {
    const long = `${'The current took my hat again. '.repeat(12)}The end.`;
    const { client } = fakeClient(page([note('a', { body: long }), note('b')], null));
    renderBoard(client);
    const first = await screen.findByRole('button', { name: 'Subject a' });
    expect(first.textContent).toContain('Read more');
    expect(first.textContent).not.toContain('The end.');
    expect(screen.getByRole('button', { name: 'Subject b' }).textContent).not.toContain('Read more');

    fireEvent.click(first);
    expect(first.getAttribute('aria-expanded')).toBe('true');
    const detail = screen.getByRole('article', { name: 'Subject a' });
    expect(detail.textContent).toContain('The end.');
    await waitFor(() => expect(document.activeElement?.textContent).toBe('Subject a'));

    fireEvent.keyDown(detail, { key: 'Escape' });
    expect(screen.queryByRole('article')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(first));
  });

  it('moves between notes with the arrow keys, one tab stop for all', async () => {
    const { client } = fakeClient(page([note('a'), note('b'), note('c')], null));
    renderBoard(client);
    const [a, b, c] = await screen.findAllByRole('button', { name: /^Subject/ });
    expect([a.tabIndex, b.tabIndex, c.tabIndex]).toEqual([0, -1, -1]);
    a.focus();
    fireEvent.keyDown(a, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(b);
    fireEvent.keyDown(b, { key: 'End' });
    expect(document.activeElement).toBe(c);
    expect(c.tabIndex).toBe(0);
    fireEvent.keyDown(c, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(a);
  });

  it('mirrors the arrow keys in Arabic', async () => {
    const { client } = fakeClient(page([note('a'), note('b')], null));
    renderBoard(client, { lang: 'ar', dir: 'rtl' });
    const [a, b] = await screen.findAllByRole('button', { name: /^Subject/ });
    a.focus();
    fireEvent.keyDown(a, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(b);
    expect(screen.getByRole('region', { name: 'لوحة الشكاوى العامة' })).toBeTruthy();
  });

  it('pages older through the cursor and back newer without refetching', async () => {
    const { client, list } = fakeClient(page([note('a')], 'CUR'), page([note('b')], null));
    renderBoard(client);
    await screen.findByRole('button', { name: 'Subject a' });
    const pager = screen.getByRole('navigation', { name: 'Wall pages' });
    const newer = within(pager).getByRole('button', { name: /Newer/ });
    const older = within(pager).getByRole('button', { name: /Older/ });
    expect(newer.getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(older);
    await screen.findByRole('button', { name: 'Subject b' });
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'CUR' }));
    expect(within(pager).getByText('Page 2')).toBeTruthy();
    expect(older.getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(newer);
    await screen.findByRole('button', { name: 'Subject a' });
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('ignores a press on a pager button with nowhere to go, keeping the open note', async () => {
    const { client, list } = fakeClient(page([note('a')], null));
    renderBoard(client);
    fireEvent.click(await screen.findByRole('button', { name: 'Subject a' }));
    expect(screen.getByRole('article', { name: 'Subject a' })).toBeTruthy();
    const pager = screen.getByRole('navigation', { name: 'Wall pages', hidden: true });
    fireEvent.click(within(pager).getByRole('button', { name: /Newer/, hidden: true }));
    fireEvent.click(within(pager).getByRole('button', { name: /Older/, hidden: true }));
    expect(screen.getByRole('article', { name: 'Subject a' })).toBeTruthy();
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab on the open note: the rest of the board is inert meanwhile', async () => {
    const { client } = fakeClient(page([note('a')], 'CUR'));
    renderBoard(client, { onClose: vi.fn(), closeLabel: 'Back to the President' });
    fireEvent.click(await screen.findByRole('button', { name: 'Subject a' }));
    const pager = screen.getByRole('navigation', { name: 'Wall pages', hidden: true });
    // jsdom has no `inert` property; the attribute is what the browser honours.
    expect(pager.hasAttribute('inert')).toBe(true);
    expect(
      screen.getByRole('button', { name: /Back to the President/, hidden: true }).hasAttribute('inert'),
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Close the note' }));
    expect(pager.hasAttribute('inert')).toBe(false);
  });

  it('says so when the wall is empty', async () => {
    const { client } = fakeClient(page([], null));
    renderBoard(client);
    expect(await screen.findByText(/Nothing is pinned yet/)).toBeTruthy();
  });

  it('shows a failure with a retry that asks again', async () => {
    const { client, list } = fakeClient(
      { ok: false, failure: { kind: 'network', status: null, code: null } },
      page([note('a')], null),
    );
    renderBoard(client);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('The wall could not be read just now.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    await screen.findByRole('button', { name: 'Subject a' });
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('cancels its request when it goes away', async () => {
    const list = vi.fn<WallClient['list']>(() => new Promise(() => undefined));
    const { unmount } = renderBoard({ list, submit: vi.fn() });
    const signal = list.mock.calls[0][0]?.signal;
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('offers the way back in the Bureau, and takes focus on arrival', async () => {
    const onClose = vi.fn();
    const { client } = fakeClient(page([note('a')], null));
    renderBoard(client, { onClose, closeLabel: 'Back to the President', autoFocus: true });
    expect(document.activeElement?.textContent).toBe('Public complaints wall');
    fireEvent.click(screen.getByRole('button', { name: /Back to the President/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await screen.findByRole('button', { name: 'Subject a' });
  });
});
