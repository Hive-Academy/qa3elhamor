import { profile, siteCopy } from '@qa3elhamor/content-data-access';
import type { SiteProfile } from '@qa3elhamor/content-domain';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  CitizenshipCard,
  createCitizenshipCardOverlay,
  resolveAvatarSrc,
} from './citizenship-card';

const overlayProps = {
  landmarkId: 'pineapple',
  title: 'The Pineapple',
  onClose: vi.fn(),
};

const renderCard = (
  locale: 'en' | 'ar' = 'en',
  cardProfile: SiteProfile = profile,
) =>
  render(
    <CitizenshipCard
      {...overlayProps}
      locale={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      profile={cardProfile}
      copy={siteCopy}
      baseUrl="/"
    />,
  );

describe('CitizenshipCard', () => {
  it('renders the profile from content: name, headline, every bio paragraph', () => {
    renderCard();
    const card = screen.getByRole('article', { name: siteCopy.aboutTitle.en });
    expect(within(card).getByText(profile.name.en)).toBeTruthy();
    expect(within(card).getByText(profile.headline.en)).toBeTruthy();
    for (const paragraph of profile.bio) {
      expect(within(card).getByText(paragraph.en)).toBeTruthy();
    }
    expect(within(card).getByText(siteCopy.citizenCardIssuer.en)).toBeTruthy();
  });

  it('lists every skill as a stamp under its group heading', () => {
    renderCard();
    for (const group of profile.skills) {
      const heading = screen.getByRole('heading', { name: group.label.en });
      const list = heading.nextElementSibling as HTMLElement;
      expect(
        within(list)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(group.skills);
    }
  });

  it('links out safely: web links open in a new tab without an opener, mailto stays', () => {
    renderCard();
    for (const link of profile.links) {
      const anchor = screen.getByRole('link', { name: link.label.en });
      expect(anchor.getAttribute('href')).toBe(link.url);
      if (link.url.startsWith('mailto:')) {
        expect(anchor.getAttribute('target')).toBeNull();
      } else {
        expect(anchor.getAttribute('target')).toBe('_blank');
        expect(anchor.getAttribute('rel')).toBe('noopener noreferrer');
      }
    }
  });

  it('shows the placeholder emblem when there is no avatar, and the photo when there is', () => {
    const { unmount } = renderCard('en', { ...profile, avatar: undefined });
    expect(screen.getByTestId('citizen-emblem')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    unmount();

    renderCard('en', {
      ...profile,
      avatar: { src: 'images/me.webp', alt: { en: 'The citizen, smiling' } },
    });
    const photo = screen.getByRole('img', { name: 'The citizen, smiling' });
    expect(photo.getAttribute('src')).toBe('/images/me.webp');
    // A broken photo falls back to the emblem instead of a broken-image icon.
    fireEvent.error(photo);
    expect(screen.getByTestId('citizen-emblem')).toBeTruthy();
  });

  it('falls back to the default residence copy when the profile has no location', () => {
    renderCard('en', { ...profile, location: undefined });
    expect(screen.getByText(siteCopy.citizenResidenceDefault.en)).toBeTruthy();
  });

  it('renders Arabic right to left from the same content', () => {
    renderCard('ar');
    const card = screen.getByRole('article', {
      name: siteCopy.aboutTitle.ar ?? siteCopy.aboutTitle.en,
    });
    expect(card.getAttribute('dir')).toBe('rtl');
    expect(
      within(card).getByText(profile.name.ar ?? profile.name.en),
    ).toBeTruthy();
    // A paragraph with no Arabic translation falls back to English rather than vanishing.
    for (const paragraph of profile.bio) {
      expect(within(card).getByText(paragraph.ar ?? paragraph.en)).toBeTruthy();
    }
  });

  it('binds content at registration into a plain overlay component', () => {
    const Overlay = createCitizenshipCardOverlay({
      profile,
      copy: siteCopy,
      baseUrl: '/',
    });
    render(<Overlay {...overlayProps} locale="en" dir="ltr" />);
    expect(screen.getByText(profile.name.en)).toBeTruthy();
  });
  it('offers a way back at the end of the card', () => {
    const onClose = vi.fn();
    render(
      <CitizenshipCard
        {...overlayProps}
        onClose={onClose}
        locale="en"
        dir="ltr"
        profile={profile}
        copy={siteCopy}
        baseUrl="/"
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: siteCopy.closeLabel.en }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('retries the photo when its source changes after a failure', () => {
    const withAvatar = (src: string): SiteProfile => ({
      ...profile,
      avatar: { src, alt: { en: 'The citizen' } },
    });
    const { rerender } = renderCard('en', withAvatar('broken.webp'));
    fireEvent.error(screen.getByRole('img', { name: 'The citizen' }));
    expect(screen.getByTestId('citizen-emblem')).toBeTruthy();
    rerender(
      <CitizenshipCard
        {...overlayProps}
        locale="en"
        dir="ltr"
        profile={withAvatar('fixed.webp')}
        copy={siteCopy}
        baseUrl="/"
      />,
    );
    expect(
      screen.getByRole('img', { name: 'The citizen' }).getAttribute('src'),
    ).toBe('/fixed.webp');
  });

  it('isolates the Arabic motto and the content-sourced text from the card direction', () => {
    renderCard();
    const motto = screen.getByText(siteCopy.citizenStatusMotto.en);
    expect(motto.tagName).toBe('BDI');
    expect(motto.getAttribute('dir')).toBe('rtl');
    expect(screen.getByText(profile.name.en).getAttribute('dir')).toBe('auto');
    for (const link of profile.links) {
      expect(
        screen.getByRole('link', { name: link.label.en }).getAttribute('dir'),
      ).toBe('auto');
    }
  });
});

describe('resolveAvatarSrc', () => {
  it('joins site-relative paths to the deploy base and keeps https URLs', () => {
    expect(resolveAvatarSrc('/me.webp', '/')).toBe('/me.webp');
    expect(resolveAvatarSrc('me.webp', '/site/')).toBe('/site/me.webp');
    expect(resolveAvatarSrc('https://cdn.example/me.webp', '/site/')).toBe(
      'https://cdn.example/me.webp',
    );
  });
});
