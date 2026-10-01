import { siteCopy } from '@qa3elhamor/content-data-access';
import { COMPLAINT_LIMITS } from '@qa3elhamor/complaints-domain';
import {
  act,
  fireEvent,
  within,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComplaintScroll } from './complaint-scroll';
import {
  pendingSubmitter,
  type ComplaintDelivery,
  type ComplaintSubmitter,
} from './complaint-submitter';

const en = (key: keyof typeof siteCopy) => siteCopy[key].en;

const renderScroll = (
  submitter: ComplaintSubmitter = pendingSubmitter,
  onClose = vi.fn(),
) =>
  render(
    <ComplaintScroll
      landmarkId="bureau"
      title="Complaints Bureau"
      locale="en"
      dir="ltr"
      onClose={onClose}
      copy={siteCopy}
      submitter={submitter}
    />,
  );

const field = (key: keyof typeof siteCopy) =>
  screen.getByLabelText(new RegExp(en(key))) as
    HTMLInputElement | HTMLTextAreaElement;

const type = (key: keyof typeof siteCopy, value: string) =>
  fireEvent.change(field(key), { target: { value } });

const fillValid = () => {
  type('complaintSubjectLabel', 'Request for web development services');
  type('complaintBodyLabel', 'The pineapple leaks. Please send a developer.');
  type('complaintNameLabel', 'Sardine Sam');
};

const stamp = () =>
  fireEvent.click(
    screen.getByRole('button', { name: en('contactSubmitLabel') }),
  );

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ComplaintScroll', () => {
  it('labels every field and marks only species and reply address optional', () => {
    renderScroll();
    expect(field('complaintSubjectLabel').required).toBe(true);
    expect(field('complaintBodyLabel').tagName).toBe('TEXTAREA');
    expect(field('complaintNameLabel').required).toBe(true);
    expect(field('complaintSpeciesLabel').required).toBe(false);
    const email = field('complaintEmailLabel');
    expect(email.required).toBe(false);
    expect(email.type).toBe('email');
    // The privacy hint is read with the field.
    const hint = document.getElementById(
      email.getAttribute('aria-describedby')?.split(' ')[0] ?? '',
    );
    expect(hint?.textContent).toBe(en('complaintEmailHint'));
  });

  it('offers the species suggestions from content', () => {
    renderScroll();
    const listId = field('complaintSpeciesLabel').getAttribute('list') ?? '';
    const options = [
      ...(document.getElementById(listId)?.querySelectorAll('option') ?? []),
    ].map((option) => option.value);
    expect(options).toContain('Sardine');
    expect(options.length).toBeGreaterThan(1);
  });

  it('counts characters against the domain limit, as the field describes them', () => {
    renderScroll();
    type('complaintSubjectLabel', '  🐟 leak  ');
    const subject = field('complaintSubjectLabel');
    const counterId = subject
      .getAttribute('aria-describedby')
      ?.split(' ')
      .find((id) => id.endsWith('-count'));
    expect(document.getElementById(counterId ?? '')?.textContent).toBe(
      `6 of ${COMPLAINT_LIMITS.subject} characters`,
    );
  });

  it('on an invalid stamp: focuses a summary that names each bad field, and marks and describes each one', () => {
    const submit = vi.fn();
    renderScroll({ submit });
    stamp();

    const summary = screen.getByTestId('complaint-error-summary');
    expect(document.activeElement).toBe(summary);
    expect(summary.textContent).toContain(en('complaintErrorSummary'));
    const entries = within(summary).getAllByRole('link');
    expect(entries.map((link) => link.textContent)).toEqual([
      `${en('complaintSubjectLabel')}: ${en('complaintErrorEmpty')}`,
      `${en('complaintBodyLabel')}: ${en('complaintErrorEmpty')}`,
      `${en('complaintNameLabel')}: ${en('complaintErrorEmpty')}`,
    ]);

    const subject = field('complaintSubjectLabel');
    expect(subject.getAttribute('aria-invalid')).toBe('true');
    const errorId = subject
      .getAttribute('aria-describedby')
      ?.split(' ')
      .find((id) => id.endsWith('-error'));
    expect(document.getElementById(errorId ?? '')?.textContent).toBe(
      en('complaintErrorEmpty'),
    );
    expect(
      field('complaintSpeciesLabel').getAttribute('aria-invalid'),
    ).toBeNull();
    expect(submit).not.toHaveBeenCalled();

    // Each summary entry leads to its field.
    fireEvent.click(entries[1]);
    expect(document.activeElement).toBe(field('complaintBodyLabel'));
  });

  it('refocuses the summary on every refused stamp', () => {
    renderScroll();
    stamp();
    field('complaintSubjectLabel').focus();
    stamp();
    expect(document.activeElement).toBe(
      screen.getByTestId('complaint-error-summary'),
    );
  });

  it('never stacks a refusal on an earlier delivery failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderScroll({ submit: () => Promise.reject(new Error('network down')) });
    fillValid();
    stamp();
    await screen.findByText(en('complaintFailureBody'));

    // Re-stamping with a now-invalid field reports only the refusal.
    type('complaintSubjectLabel', '');
    expect(screen.queryByText(en('complaintFailureBody'))).toBeNull();
    stamp();
    expect(screen.getByTestId('complaint-error-summary')).toBeTruthy();
    expect(screen.queryByText(en('complaintFailureBody'))).toBeNull();
  });

  it('shows a field error on blur, with the limit from the domain', () => {
    renderScroll();
    type('complaintNameLabel', 'n'.repeat(COMPLAINT_LIMITS.senderName + 1));
    expect(screen.queryByText(/Too long/)).toBeNull();
    fireEvent.blur(field('complaintNameLabel'));
    expect(
      screen.getByText(
        `Too long: the limit is ${COMPLAINT_LIMITS.senderName} characters.`,
      ),
    ).toBeTruthy();
  });

  it('refuses a malformed reply address and a hidden control character', () => {
    renderScroll();
    fillValid();
    type('complaintEmailLabel', 'sam@');
    type('complaintNameLabel', 'Sam‮');
    stamp();
    expect(screen.getByText(en('complaintErrorMalformed'))).toBeTruthy();
    expect(screen.getByText(en('complaintErrorControlCharacter'))).toBeTruthy();
  });

  it('sends the normalised draft, shows the stamping status, then the pending result', async () => {
    let resolve: (delivery: ComplaintDelivery) => void = () => undefined;
    const submit = vi.fn(
      () => new Promise<ComplaintDelivery>((done) => (resolve = done)),
    );
    renderScroll({ submit });
    fillValid();
    type('complaintSpeciesLabel', '   ');
    stamp();

    expect(submit).toHaveBeenCalledWith({
      subject: 'Request for web development services',
      body: 'The pineapple leaks. Please send a developer.',
      senderName: 'Sardine Sam',
      senderSpecies: null,
      replyEmail: null,
    });
    expect(screen.getByRole('status').textContent).toBe(en('complaintSending'));
    // A second press while stamping does not send twice.
    stamp();
    expect(submit).toHaveBeenCalledTimes(1);

    await act(async () => resolve({ status: 'delivery-not-wired' }));
    const heading = screen.getByRole('heading', {
      name: en('complaintSuccessTitle'),
    });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByText(en('complaintPendingBody'))).toBeTruthy();
  });

  it('pendingSubmitter never delivers: the visitor is told delivery is not wired', async () => {
    renderScroll();
    fillValid();
    stamp();
    expect(await screen.findByText(en('complaintPendingBody'))).toBeTruthy();
  });

  it('says so when delivered, and can start a fresh complaint or swim back', async () => {
    const onClose = vi.fn();
    renderScroll(
      { submit: () => Promise.resolve({ status: 'delivered' }) },
      onClose,
    );
    fillValid();
    stamp();
    expect(await screen.findByText(en('complaintSuccessBody'))).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: en('closeLabel') }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole('button', { name: en('complaintAnotherLabel') }),
    );
    expect(field('complaintSubjectLabel').value).toBe('');
  });

  it('keeps the text and announces the failure when delivery rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderScroll({ submit: () => Promise.reject(new Error('network down')) });
    fillValid();
    stamp();
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        en('complaintFailureBody'),
      ),
    );
    expect(field('complaintNameLabel').value).toBe('Sardine Sam');
  });

  it('renders right to left for Arabic with Arabic labels', () => {
    const { container } = render(
      <ComplaintScroll
        landmarkId="bureau"
        title="مكتب الشكاوى"
        locale="ar"
        dir="rtl"
        onClose={vi.fn()}
        copy={siteCopy}
        submitter={pendingSubmitter}
      />,
    );
    expect(container.querySelector('section')?.getAttribute('dir')).toBe('rtl');
    expect(
      screen.getByLabelText(siteCopy.complaintSubjectLabel.ar ?? ''),
    ).toBeTruthy();
    // Email addresses stay left to right inside the RTL form.
    expect(
      screen
        .getByLabelText(new RegExp(siteCopy.complaintEmailLabel.ar ?? ''))
        .getAttribute('dir'),
    ).toBe('ltr');
  });
});
