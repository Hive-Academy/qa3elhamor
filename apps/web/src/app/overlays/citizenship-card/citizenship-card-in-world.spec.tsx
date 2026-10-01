import { profile, siteCopy } from '@qa3elhamor/content-data-access';
import { LANDMARK_AUTOFOCUS_ATTRIBUTE } from '@qa3elhamor/landmarks-ui';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  CitizenshipCardInWorld,
  IN_WORLD_CARD_COPY,
  machineReadableZone,
  overflowOf,
} from './citizenship-card-in-world';

const renderCard = (locale: 'en' | 'ar' = 'en') =>
  render(
    <CitizenshipCardInWorld
      profile={profile}
      copy={siteCopy}
      locale={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      baseUrl="/"
    />,
  );

const faces = (card: HTMLElement) => ({
  front: card.querySelector<HTMLElement>('.citizen-pass__face--front'),
  back: card.querySelector<HTMLElement>('.citizen-pass__face--back'),
});

describe('CitizenshipCardInWorld', () => {
  it('is a named article the landmark stage moves focus onto', () => {
    renderCard();
    const card = screen.getByRole('article', { name: siteCopy.aboutTitle.en });
    expect(card.hasAttribute(LANDMARK_AUTOFOCUS_ATTRIBUTE)).toBe(true);
    expect(card.tabIndex).toBe(-1);
  });

  it('shows the identity on the front, with the turned-away back inert', () => {
    renderCard();
    const card = screen.getByRole('article');
    const { front, back } = faces(card);
    expect(front?.hasAttribute('inert')).toBe(false);
    expect(back?.hasAttribute('inert')).toBe(true);
    expect(within(front as HTMLElement).getByText(profile.name.en)).toBeTruthy();
    for (const paragraph of profile.bio)
      expect(within(front as HTMLElement).getByText(paragraph.en)).toBeTruthy();
    for (const link of profile.links)
      expect(
        within(front as HTMLElement).getByRole('link', { name: link.label.en }),
      ).toBeTruthy();
  });

  it('turns over to the skills as visa stamps, and back, announcing each turn', () => {
    renderCard();
    const card = screen.getByRole('article');
    const { front, back } = faces(card);
    expect(screen.getByRole('status').textContent).toBe('');

    fireEvent.click(
      screen.getByRole('button', { name: IN_WORLD_CARD_COPY.en.flipToBack }),
    );
    expect(card.dataset['side']).toBe('back');
    expect(front?.hasAttribute('inert')).toBe(true);
    expect(back?.hasAttribute('inert')).toBe(false);
    for (const group of profile.skills) {
      const stamp = within(back as HTMLElement).getByRole('heading', {
        name: group.label.en,
      });
      expect(
        within(stamp.nextElementSibling as HTMLElement)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(group.skills);
    }
    expect(screen.getByRole('status').textContent).toBe(
      IN_WORLD_CARD_COPY.en.showingBack,
    );

    fireEvent.click(
      screen.getByRole('button', { name: IN_WORLD_CARD_COPY.en.flipToFront }),
    );
    expect(card.dataset['side']).toBe('front');
    expect(screen.getByRole('status').textContent).toBe(
      IN_WORLD_CARD_COPY.en.showingFront,
    );
  });

  it('turns over with the arrow keys while the card or its flip control has focus', () => {
    renderCard();
    const card = screen.getByRole('article');
    fireEvent.keyDown(card, { key: 'ArrowRight' });
    expect(card.dataset['side']).toBe('back');
    fireEvent.keyDown(screen.getByRole('button', { name: /Turn back/ }), {
      key: 'ArrowLeft',
    });
    expect(card.dataset['side']).toBe('front');
    // Arrows inside the card's content (a link) are left alone.
    const link = screen.getByRole('link', { name: profile.links[0]?.label.en });
    fireEvent.keyDown(link, { key: 'ArrowRight' });
    expect(card.dataset['side']).toBe('front');
  });

  it('renders Arabic right to left from the same content', () => {
    renderCard('ar');
    const card = screen.getByRole('article', {
      name: siteCopy.aboutTitle.ar ?? siteCopy.aboutTitle.en,
    });
    expect(card.getAttribute('dir')).toBe('rtl');
    expect(
      screen.getByRole('button', { name: IN_WORLD_CARD_COPY.ar.flipToBack }),
    ).toBeTruthy();
  });
});

describe('machineReadableZone', () => {
  const lines = (name: string) => machineReadableZone(name).split('\n');

  it('writes two fixed-width lines of Latin capitals and fillers', () => {
    const [first, second] = lines('Abdallah Khalil');
    expect(first).toMatch(/^IDQEHKHALIL<<ABDALLAH<+$/);
    expect(first?.length).toBe(second?.length);
    expect(lines('José María de la Peña')[0]).toMatch(
      /^IDQEHPENA<<JOSE<MARIA<DE<LA<+$/,
    );
    expect(lines('عبدالله')[0]).toMatch(/^IDQEH<<<+$/);
  });
});

describe('overflowOf', () => {
  it('flags more below until the end of an overflowing face is reached', () => {
    expect(overflowOf({ scrollHeight: 400, clientHeight: 400, scrollTop: 0 })).toEqual(
      { scrollable: false, more: false },
    );
    expect(overflowOf({ scrollHeight: 900, clientHeight: 400, scrollTop: 0 })).toEqual(
      { scrollable: true, more: true },
    );
    expect(
      overflowOf({ scrollHeight: 900, clientHeight: 400, scrollTop: 499.5 }),
    ).toEqual({ scrollable: true, more: false });
  });
});
