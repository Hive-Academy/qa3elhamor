import { siteCopy } from '@qa3elhamor/content-data-access';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  INITIAL_DIALOGUE,
  dialogueReducer,
  type DialogueEvent,
  type DialogueScript,
  type DialogueState,
} from '../narrators/dialogue';
import {
  EMPTY_COMPLAINT_FORM,
  pendingSubmitter,
  singleFlight,
  type ComplaintDelivery,
  type ComplaintFormValues,
  type ComplaintSubmitter,
} from '../overlays/complaint-scroll';
import { INITIAL_FILING, filingReducer, type Filing } from './bureau-filing';
import { BUREAU_VISIT_COPY } from './bureau-copy';
import { BureauHud, type BureauHudProps } from './bureau-hud';
import { BureauScroll, type BureauScrollProps } from './bureau-scroll';
import { sheetHeightFor } from './bureau-sheet';

/*
 * The Bureau's narrated visit, its DOM half: the President's bubble and the complaint scroll.
 * The scroll is the dialog's own form (`complaint-scroll.spec.tsx` pins its rules); these pin
 * what the visit adds: typing never reaches the narrator, the stamp hands over to the visit,
 * a failure keeps the text, an unwired post office is told honestly, and focus never drops.
 */

const en = (key: keyof typeof siteCopy) => siteCopy[key].en;
const words = BUREAU_VISIT_COPY.en;

const script: DialogueScript = {
  lines: [
    'This is the Municipal Complaints Bureau.',
    'We still answer the mail.',
  ],
  hints: { filed: 'Stamped, bottled and off on the current.' },
  farewell: 'Swim safe.',
};
const stateAfter = (...events: DialogueEvent[]): DialogueState =>
  events.reduce(
    (state, event) => dialogueReducer(state, event, script),
    INITIAL_DIALOGUE,
  );
const lastLine = stateAfter(
  { type: 'arrive' },
  { type: 'typed' },
  { type: 'advance' },
  { type: 'typed' },
);
const firstLine = stateAfter({ type: 'arrive' }, { type: 'typed' });

function hudProps(props: Partial<BureauHudProps> = {}): BureauHudProps {
  return {
    lang: 'en',
    dir: 'ltr',
    width: 1440,
    height: 900,
    farewellSeconds: 2,
    reducedMotion: true,
    open: true,
    speaker: 'The Sardine President',
    dialogue: lastLine,
    script,
    onTyped: vi.fn(),
    onAdvance: vi.fn(),
    onSkip: vi.fn(),
    onLeave: vi.fn(),
    scrollOut: false,
    onOpenScroll: vi.fn(),
    words,
    fileAnother: en('complaintAnotherLabel'),
    filedTopic: en('complaintSuccessTitle'),
    speechRef: createRef<HTMLDivElement>(),
    ...props,
  };
}

function scrollProps(
  props: Partial<BureauScrollProps> = {},
): BureauScrollProps {
  return {
    copy: siteCopy,
    submitter: pendingSubmitter,
    locale: 'en',
    dir: 'ltr',
    title: 'Complaints Bureau',
    words,
    state: 'unrolled',
    presentation: 'in-world',
    initialValues: EMPTY_COMPLAINT_FORM,
    onDraftChange: vi.fn(),
    onStamped: vi.fn(),
    onRollBack: vi.fn(),
    ...props,
  };
}

const field = (key: keyof typeof siteCopy) =>
  screen.getByLabelText(new RegExp(en(key))) as
    HTMLInputElement | HTMLTextAreaElement;
const type = (key: keyof typeof siteCopy, value: string) =>
  fireEvent.change(field(key), { target: { value } });
const fillValid = () => {
  type('complaintSubjectLabel', 'The pineapple leaks');
  type('complaintBodyLabel', 'Please send a developer.');
  type('complaintNameLabel', 'Sardine Sam');
};
const stamp = () =>
  fireEvent.click(
    screen.getByRole('button', { name: en('contactSubmitLabel') }),
  );

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the Bureau visit: keystrokes', () => {
  it('Space and Enter typed into the scroll never advance the President', () => {
    // As on a desktop: the bubble and the unrolled paper are both on the page.
    const hud = hudProps({ dialogue: firstLine });
    render(
      <>
        <BureauHud {...hud} />
        <BureauScroll {...scrollProps()} />
      </>,
    );
    const subject = field('complaintSubjectLabel');
    const body = field('complaintBodyLabel');
    for (const target of [subject, body]) {
      fireEvent.keyDown(target, { key: ' ' });
      fireEvent.keyDown(target, { key: 'Enter' });
    }
    expect(hud.onAdvance).not.toHaveBeenCalled();
    // The control: on the bubble itself, Space does advance.
    fireEvent.keyDown(
      screen.getByRole('region', { name: 'The Sardine President' }),
      {
        key: ' ',
      },
    );
    expect(hud.onAdvance).toHaveBeenCalledTimes(1);
  });

  it('takes the bubble away while the scroll is out, so nothing in it listens', () => {
    render(<BureauHud {...hudProps({ scrollOut: true })} />);
    expect(
      screen.queryByRole('region', { name: 'The Sardine President' }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: words.openScroll })).toBeNull();
  });
});

describe('the Bureau visit: the bubble', () => {
  it('offers "File a complaint" and "Back to the dive" on the last line', () => {
    const hud = hudProps();
    render(<BureauHud {...hud} />);
    fireEvent.click(screen.getByRole('button', { name: words.openScroll }));
    expect(hud.onOpenScroll).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the dive' }));
    expect(hud.onLeave).toHaveBeenCalled();
  });

  it('says where the bottle went under a "Complaint stamped" tag, then offers another', () => {
    const filed = dialogueReducer(
      lastLine,
      { type: 'select', id: 'filed' },
      script,
    );
    render(<BureauHud {...hudProps({ dialogue: filed })} />);
    const bubble = screen.getByRole('region', {
      name: 'The Sardine President',
    });
    expect(within(bubble).getByText(en('complaintSuccessTitle'))).toBeTruthy();
    expect(bubble.querySelector('[aria-live="polite"]')?.textContent).toBe(
      script.hints['filed'],
    );
    expect(
      within(bubble).getByRole('button', { name: en('complaintAnotherLabel') }),
    ).toBeTruthy();
  });

  it('hands focus back to its way on when the scroll is put away', () => {
    const { rerender } = render(
      <BureauHud {...hudProps({ scrollOut: true })} />,
    );
    rerender(<BureauHud {...hudProps({ scrollOut: false })} />);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: words.openScroll }),
    );
  });
});

describe('the Bureau visit: the scroll', () => {
  it('puts the visitor in the first field once unrolled, not before', () => {
    const { rerender } = render(
      <BureauScroll {...scrollProps({ state: 'rolled' })} />,
    );
    expect(document.activeElement).not.toBe(field('complaintSubjectLabel'));
    rerender(<BureauScroll {...scrollProps({ state: 'unrolled' })} />);
    expect(document.activeElement).toBe(field('complaintSubjectLabel'));
  });

  it('keeps a draft: starts from it, and reports every edit', () => {
    const props = scrollProps({
      initialValues: { ...EMPTY_COMPLAINT_FORM, subject: 'Half a complaint' },
    });
    render(<BureauScroll {...props} />);
    expect(field('complaintSubjectLabel').value).toBe('Half a complaint');
    type('complaintNameLabel', 'Sardine Sam');
    expect(props.onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        subject: 'Half a complaint',
        senderName: 'Sardine Sam',
      }),
    );
  });

  it('rolls back up unsent from its own button', () => {
    const props = scrollProps();
    render(<BureauScroll {...props} />);
    fireEvent.click(screen.getByRole('button', { name: words.rollUp }));
    expect(props.onRollBack).toHaveBeenCalled();
  });

  it('refuses an empty stamp with the form rules, and sends nothing', () => {
    const submit = vi.fn();
    const props = scrollProps({ submitter: { submit } });
    render(<BureauScroll {...props} />);
    stamp();
    expect(screen.getByTestId('complaint-error-summary')).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
    expect(props.onStamped).not.toHaveBeenCalled();
  });

  it('stamped and delivered: the stamp lands on the paper and the visit takes over', async () => {
    const submitter: ComplaintSubmitter = {
      submit: vi.fn(() => Promise.resolve({ status: 'delivered' } as const)),
    };
    const props = scrollProps({ submitter });
    const { rerender } = render(<BureauScroll {...props} />);
    fillValid();
    stamp();
    await waitFor(() =>
      expect(props.onStamped).toHaveBeenCalledWith({ status: 'delivered' }),
    );
    expect(submitter.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'The pineapple leaks',
        senderName: 'Sardine Sam',
      }),
    );
    expect(
      screen.getByText(en('complaintSuccessBody')).getAttribute('role'),
    ).toBe('status');
    // Focus on the result, the filled-in paper out of reach under the stamp.
    expect(document.activeElement?.textContent).toBe(
      en('complaintSuccessTitle'),
    );
    expect(field('complaintSubjectLabel').closest('[inert]')).not.toBeNull();
    // No dialog actions on the paper: the President offers what comes next.
    expect(
      screen.queryByRole('button', { name: en('complaintAnotherLabel') }),
    ).toBeNull();
    rerender(<BureauScroll {...props} state="stamped" />);
    expect(screen.queryByRole('button', { name: words.rollUp })).toBeNull();
  });

  it('no post office wired up: says so honestly, and still hands the stamp over', async () => {
    const props = scrollProps({ submitter: pendingSubmitter });
    render(<BureauScroll {...props} />);
    fillValid();
    stamp();
    await waitFor(() =>
      expect(props.onStamped).toHaveBeenCalledWith({
        status: 'delivery-not-wired',
      }),
    );
    expect(
      screen.getByText(en('complaintPendingBody')).getAttribute('role'),
    ).toBe('status');
  });

  it('a failed delivery keeps the text and says so, with no stamp', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const props = scrollProps({
      submitter: { submit: () => Promise.reject(new Error('Network error.')) },
    });
    render(<BureauScroll {...props} />);
    fillValid();
    stamp();
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        en('complaintFailureBody'),
      ),
    );
    expect(props.onStamped).not.toHaveBeenCalled();
    expect(field('complaintSubjectLabel').value).toBe('The pineapple leaks');
    expect(field('complaintBodyLabel').value).toBe('Please send a developer.');
    expect(field('complaintSubjectLabel').closest('[inert]')).toBeNull();
  });

  it('a stamp that comes back after the scroll was put away still reaches the visit', async () => {
    let deliver: (value: { status: 'delivered' }) => void = () => undefined;
    const props = scrollProps({
      submitter: {
        submit: () => new Promise((resolve) => (deliver = resolve)),
      },
    });
    const { unmount } = render(<BureauScroll {...props} />);
    fillValid();
    stamp();
    unmount();
    await act(async () => deliver({ status: 'delivered' }));
    expect(props.onStamped).toHaveBeenCalledWith({ status: 'delivered' });
  });
});

describe('the Bureau visit: a complaint in flight', () => {
  it('cannot be rolled back while it travels', () => {
    const props = scrollProps({ sending: true });
    render(<BureauScroll {...props} />);
    const back = screen.getByRole('button', { name: words.rollUp });
    expect(back.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(back);
    expect(props.onRollBack).not.toHaveBeenCalled();
  });

  it('a failure after the visitor left is shown on the next paper, over the kept draft', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let filing: Filing = filingReducer(INITIAL_FILING, { type: 'unroll' });
    const step = (
      type: 'sending' | 'sent' | 'send-failed' | 'reset' | 'roll-back',
    ) => (filing = filingReducer(filing, { type }));
    let fail: (reason: unknown) => void = () => undefined;
    const shared = singleFlight(
      {
        submit: () =>
          new Promise<ComplaintDelivery>((_, reject) => (fail = reject)),
      },
      {
        onSending: () => step('sending'),
        onDelivered: () => step('sent'),
        onFailed: () => step('send-failed'),
      },
    );
    let draft: ComplaintFormValues = EMPTY_COMPLAINT_FORM;
    const { unmount } = render(
      <BureauScroll
        {...scrollProps({
          submitter: shared,
          onDraftChange: (v) => (draft = v),
        })}
      />,
    );
    fillValid();
    stamp();
    expect(filing.sending).toBe(true);
    // Rolling back is refused while it travels.
    expect(step('roll-back').stage).toBe('unrolled');
    // The visitor leaves the Bureau; then the delivery fails.
    unmount();
    step('reset');
    await act(async () => fail(new Error('Network error.')));
    expect(filing.failedAway).toBe(true);
    // Back again: the paper says so, and the text is all there.
    step('roll-back');
    filing = filingReducer(filing, { type: 'unroll' });
    render(
      <BureauScroll
        {...scrollProps({
          initialValues: draft,
          initialFailed: filing.failedAway,
        })}
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe(
      en('complaintFailureBody'),
    );
    expect(field('complaintSubjectLabel').value).toBe('The pineapple leaks');
    expect(field('complaintBodyLabel').value).toBe('Please send a developer.');
  });

  it('two paper instances (the world and the phone sheet) share one submission', async () => {
    let deliver: (value: ComplaintDelivery) => void = () => undefined;
    const submit = vi.fn(
      () => new Promise<ComplaintDelivery>((resolve) => (deliver = resolve)),
    );
    const shared = singleFlight({ submit });
    const first = render(
      <BureauScroll {...scrollProps({ submitter: shared })} />,
    );
    fillValid();
    stamp();
    first.unmount();
    // The viewport changed mid-send: the other presentation mounts and is pressed again.
    render(<BureauScroll {...scrollProps({ submitter: shared })} />);
    fillValid();
    stamp();
    expect(submit).toHaveBeenCalledTimes(1);
    await act(async () => deliver({ status: 'delivered' }));
  });
});

describe('the Bureau visit: the phone sheet', () => {
  it('fits between the top and the stage bar, and shrinks under the keyboard', () => {
    // 390 × 844, no keyboard: the stage bar (86 px) and a margin at each end.
    expect(sheetHeightFor(844, 844)).toBe(844 - 86 - 16);
    // Keyboard up: only the visual viewport is left.
    expect(sheetHeightFor(844, 420)).toBe(420 - 16);
    // Never collapsed to nothing: its paper scrolls inside instead.
    expect(sheetHeightFor(844, 120)).toBe(220);
  });
});

describe('the Bureau visit: the public wall', () => {
  it('offers "Read the public wall" only when the wall is on', () => {
    const { rerender } = render(<BureauHud {...hudProps()} />);
    expect(screen.queryByRole('button', { name: words.openWall })).toBeNull();

    const onOpenWall = vi.fn();
    rerender(<BureauHud {...hudProps({ onOpenWall })} />);
    fireEvent.click(screen.getByRole('button', { name: words.openWall }));
    expect(onOpenWall).toHaveBeenCalledTimes(1);
  });

  it('steps the bubble aside while the board is out, and takes focus back after', () => {
    const { rerender } = render(
      <BureauHud {...hudProps({ onOpenWall: vi.fn(), wallOut: true })} />,
    );
    expect(screen.queryByRole('button', { name: words.openWall })).toBeNull();
    rerender(<BureauHud {...hudProps({ onOpenWall: vi.fn(), wallOut: false })} />);
    expect(document.activeElement?.textContent).toContain(words.openScroll);
  });
});
