import { siteCopy } from '@qa3elhamor/content-data-access';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTACT_SUBMITTER } from '../contact-submitter';
import {
  ComplaintScroll,
  ComplaintSendError,
  routeByVisibility,
  type ComplaintDraft,
  type ComplaintSubmitter,
} from '../overlays/complaint-scroll';
import { buildPageContent } from '../page-view/page-content';
import { PageView } from '../page-view/page-view';
import { LANDMARK_OVERLAYS, LANDMARK_SCENES } from '../landmarks.config';
import type { WallClient } from './wall-client';
import { WALL_COPY } from './wall-copy';
import { COMPLAINT_SUBMITTER, WALL } from './wall-port';
import { wallSubmitter } from './wall-submitter';

const en = (key: keyof typeof siteCopy) => siteCopy[key].en;

afterEach(() => vi.restoreAllMocks());

describe('the wall is off by default', () => {
  it('has no wall and sends every complaint privately when VITE_WALL_API_URL is unset', () => {
    expect(import.meta.env.VITE_WALL_API_URL).toBeUndefined();
    expect(WALL).toBeNull();
    expect(COMPLAINT_SUBMITTER).toBe(CONTACT_SUBMITTER);
    expect(LANDMARK_OVERLAYS.bureau).toBeTruthy();
    expect(LANDMARK_SCENES.bureau).toBeTruthy();
  });

  it('renders no wall section and no public choice in the page view, and calls nothing', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    render(<PageView content={buildPageContent()} reason="requested" diveHref="/" baseUrl="/" />);
    expect(screen.queryByRole('heading', { name: /wall/i })).toBeNull();
    expect(screen.queryByRole('region', { name: /complaints wall/i })).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByText(/public wall/i)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

const fill = () => {
  const field = (key: keyof typeof siteCopy) => screen.getByLabelText(new RegExp(en(key)));
  fireEvent.change(field('complaintSubjectLabel'), { target: { value: 'The pineapple leaks' } });
  fireEvent.change(field('complaintBodyLabel'), { target: { value: 'Please send help.' } });
  fireEvent.change(field('complaintNameLabel'), { target: { value: 'Sardine Sam' } });
};
const stamp = () =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(en('contactSubmitLabel')) }));
  });

const scroll = (submitter: ComplaintSubmitter, wallOn: boolean) =>
  render(
    <ComplaintScroll
      landmarkId="bureau"
      title="Complaints Bureau"
      locale="en"
      dir="ltr"
      onClose={vi.fn()}
      copy={siteCopy}
      submitter={submitter}
      publicWall={wallOn ? WALL_COPY : undefined}
    />,
  );

describe('the Bureau form with the wall on', () => {
  it('offers no choice when the wall is off', () => {
    scroll(CONTACT_SUBMITTER, false);
    expect(screen.queryByRole('group', { name: 'Where should it go?' })).toBeNull();
    expect(screen.getByLabelText(new RegExp(en('complaintEmailLabel')))).toBeTruthy();
  });

  it('defaults to private, and keeps the reply address there', async () => {
    const submit = vi.fn<ComplaintSubmitter['submit']>().mockResolvedValue({ status: 'delivered' });
    scroll({ submit }, true);
    const group = screen.getByRole('group', { name: 'Where should it go?' });
    expect(
      within(group).getByRole('radio', { name: en('complaintPrivateLabel') }),
    ).toHaveProperty('checked', true);
    fill();
    fireEvent.change(screen.getByLabelText(new RegExp(en('complaintEmailLabel'))), {
      target: { value: 'sam@example.org' },
    });
    await stamp();
    expect(submit.mock.calls[0][0]).toMatchObject({ replyEmail: 'sam@example.org' });
    expect(submit.mock.calls[0][0].visibility).toBeUndefined();
  });

  it('pins it publicly: no reply address, moderation said up front and after', async () => {
    const submit = vi
      .fn<ComplaintSubmitter['submit']>()
      .mockResolvedValue({ status: 'awaiting-moderation' });
    scroll({ submit }, true);
    fill();
    fireEvent.change(screen.getByLabelText(new RegExp(en('complaintEmailLabel'))), {
      target: { value: 'not an address' },
    });
    const pin = screen.getByRole('radio', { name: /Pin it on the public wall/ });
    // The hints describe the choices without joining their labels (or any field's).
    expect(screen.getAllByLabelText(/your name/i)).toHaveLength(1);
    expect(pin.getAttribute('aria-describedby')).not.toBeNull();
    expect(pin.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText(/once a moderator approves it/)).toBeTruthy();
    fireEvent.click(pin);
    // A public complaint has no reply address: the (invalid) one is set aside, not sent.
    expect(screen.queryByLabelText(new RegExp(en('complaintEmailLabel')))).toBeNull();
    await stamp();
    const draft = submit.mock.calls[0][0];
    expect(draft).toMatchObject({ visibility: 'public', replyEmail: null });
    expect(screen.getByRole('status').textContent).toMatch(/awaiting|moderat/i);
    expect(screen.getByText(/Pinned for moderation/)).toBeTruthy();
  });

  it("keeps the form's intro true for both choices (it never promises privacy)", () => {
    for (const lang of ['en', 'ar'] as const) {
      expect(siteCopy.complaintIntro[lang] ?? '').not.toMatch(/privately|على انفراد|سرّ?ي/u);
    }
  });

  it('names a rate limit instead of the generic failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const submit = vi
      .fn<ComplaintSubmitter['submit']>()
      .mockRejectedValue(new ComplaintSendError('rate-limited'));
    scroll({ submit }, true);
    fill();
    fireEvent.click(screen.getByRole('radio', { name: /Pin it on the public wall/ }));
    await stamp();
    expect(screen.getByRole('alert').textContent).toBe(
      'Too many complaints from this reef for now. Try again later.',
    );
    expect(screen.getByDisplayValue('The pineapple leaks')).toBeTruthy();
  });
});

describe('routing and the wall submitter', () => {
  const draft: ComplaintDraft = {
    subject: 's',
    body: 'b',
    senderName: 'n',
    senderSpecies: null,
    replyEmail: null,
  };

  it('sends public drafts to the wall and everything else privately', async () => {
    const privately = { submit: vi.fn().mockResolvedValue({ status: 'delivered' }) };
    const publicly = { submit: vi.fn().mockResolvedValue({ status: 'awaiting-moderation' }) };
    const route = routeByVisibility({ private: privately, public: publicly });
    await route.submit(draft);
    await route.submit({ ...draft, visibility: 'private' });
    await route.submit({ ...draft, visibility: 'public' });
    expect(privately.submit).toHaveBeenCalledTimes(2);
    expect(publicly.submit).toHaveBeenCalledTimes(1);
  });

  it('turns the API outcome into a delivery or a named refusal', async () => {
    const submit = vi
      .fn<WallClient['submit']>()
      .mockResolvedValueOnce({ ok: true, value: { id: 'c', status: 'pending' } })
      .mockResolvedValueOnce({
        ok: false,
        failure: { kind: 'rate-limited', status: 429, code: 'rate-limited' },
      })
      .mockResolvedValueOnce({
        ok: false,
        failure: { kind: 'unavailable', status: 503, code: 'wall-unavailable' },
      })
      .mockResolvedValueOnce({ ok: false, failure: { kind: 'timeout', status: null, code: null } });
    const wall = wallSubmitter({ submit, list: vi.fn() });
    const publicDraft = { ...draft, replyEmail: 'x@example.org', visibility: 'public' as const };
    await expect(wall.submit(publicDraft)).resolves.toEqual({ status: 'awaiting-moderation' });
    expect(submit.mock.calls[0][0]).toEqual({
      subject: 's',
      body: 'b',
      senderName: 'n',
      senderSpecies: null,
    });
    await expect(wall.submit(publicDraft)).rejects.toMatchObject({ reason: 'rate-limited' });
    await expect(wall.submit(publicDraft)).rejects.toMatchObject({ reason: 'unavailable' });
    await expect(wall.submit(publicDraft)).rejects.toMatchObject({ reason: 'failed' });
  });
});
