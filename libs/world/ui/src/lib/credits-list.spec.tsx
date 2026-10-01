import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { shippedCredits } from '@qa3elhamor/world-domain';
import { beforeAll, describe, expect, it } from 'vitest';
import { creditSegments } from './credit-segments.js';
import { CreditsDialog } from './credits-dialog.js';
import { CreditsList } from './credits-list.js';

const credits = shippedCredits();

beforeAll(() => {
  // jsdom lacks the modal dialog API; model the part the component relies on.
  const proto = HTMLDialogElement.prototype;
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    proto.close = function (this: HTMLDialogElement) {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
});

describe('creditSegments', () => {
  it('reassembles to the licence line exactly', () => {
    for (const credit of credits) {
      expect(creditSegments(credit).map((s) => s.text).join('')).toBe(credit.line);
    }
  });

  it('links the source, author and licence URLs', () => {
    for (const credit of credits) {
      const hrefs = creditSegments(credit).flatMap((s) => (s.kind === 'link' ? [s.href] : []));
      const { sourceUrl, authorUrl, licenseUrl } = credit.attribution;
      expect(hrefs).toEqual([sourceUrl, authorUrl, licenseUrl]);
    }
  });
});

describe('CreditsList', () => {
  it('renders one item per credit whose text is the licence line verbatim', () => {
    render(<CreditsList credits={credits} />);
    const list = screen.getByRole('list', { name: 'Asset credits' });
    const items = within(list).getAllByRole('listitem');

    expect(items).toHaveLength(credits.length);
    items.forEach((item, index) => {
      expect(item.textContent).toBe(credits[index].line);
    });
  });

  it('uses real links that open in a new tab safely and say so', () => {
    render(<CreditsList credits={credits} />);
    const links = screen.getAllByRole('link');

    expect(links).toHaveLength(credits.length * 3);
    for (const link of links) {
      expect(link.getAttribute('href')).toBe(link.textContent);
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
      const hint = document.getElementById(link.getAttribute('aria-describedby') ?? '');
      expect(hint?.textContent).toBe('Opens in a new tab');
      // Must stay in the accessibility tree: visually hidden, never display:none.
      expect(hint?.hasAttribute('hidden')).toBe(false);
      expect(hint?.getAttribute('aria-hidden')).toBeNull();
      expect(getComputedStyle(hint as HTMLElement).display).not.toBe('none');
      expect(hint?.classList.contains('world-credits__visually-hidden')).toBe(true);
    }
    expect(links.map((l) => l.getAttribute('href'))).toContain(
      credits[0].attribution.sourceUrl,
    );
  });
});

describe('CreditsDialog', () => {
  it('opens the credits from an always-present trigger and returns focus on close', () => {
    render(<CreditsDialog credits={credits} />);
    const trigger = screen.getByRole('button', { name: 'Credits' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Credits' });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(credits.length);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps its state in step when the dialog closes natively (Esc)', () => {
    render(<CreditsDialog credits={credits} />);
    const trigger = screen.getByRole('button', { name: 'Credits' });
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog') as HTMLDialogElement;
    act(() => dialog.close());

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
