import { fireEvent, render, screen, within } from '@testing-library/react';
import { profile } from '@qa3elhamor/content-data-access';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../app';
import { LOCALE_STORAGE_KEY } from './locale';

// jsdom cannot mount the R3F canvas, and reports no WebGL; see app.spec.tsx.
vi.mock('@react-three/fiber', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@react-three/fiber')>()),
  Canvas: () => <div data-testid="canvas" />,
}));

vi.mock('@qa3elhamor/world-feature', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@qa3elhamor/world-feature')>();
  return {
    ...actual,
    readDeviceCapabilities: () => ({
      ...actual.readDeviceCapabilities(),
      webgl: true,
    }),
  };
});

const html = document.documentElement;
const languageSwitch = () => screen.getByRole('group', { name: /^(Language|اللغة)$/ });
const option = (name: 'EN' | 'عربي') =>
  within(languageSwitch()).getByRole('button', { name: new RegExp(`^${name}`) });

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});

afterEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

describe('the language switch', () => {
  it('starts in English from an English browser, with EN pressed', () => {
    render(<App />);
    expect(html.lang).toBe('en');
    expect(html.dir).toBe('ltr');
    expect(option('EN').getAttribute('aria-pressed')).toBe('true');
    expect(option('عربي').getAttribute('aria-pressed')).toBe('false');
    expect(option('عربي').getAttribute('lang')).toBe('ar');
  });

  it('names each language in full, starting with its visible text', () => {
    render(<App />);
    expect(option('EN').getAttribute('aria-label')).toBe('EN, English');
    expect(option('عربي').getAttribute('aria-label')).toBe('عربي، العربية');
  });

  it('pins ?lang= on a switch, so the choice survives a reload where storage is refused', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    window.history.replaceState(null, '', '/?view=dive#top');
    render(<App />);
    fireEvent.click(option('عربي'));
    expect(html.dir).toBe('rtl');
    expect(window.location.search).toBe('?view=dive&lang=ar');
    expect(window.location.hash).toBe('#top');
  });

  it('is two real buttons, reachable with Tab', () => {
    render(<App />);
    for (const button of within(languageSwitch()).getAllByRole('button')) {
      expect(button.tagName).toBe('BUTTON');
      expect(button.tabIndex).toBe(0);
    }
  });

  it('flips <html lang dir>, persists, and re-renders the chrome in Arabic', () => {
    render(<App />);
    fireEvent.click(option('عربي'));

    expect(html.lang).toBe('ar');
    expect(html.dir).toBe('rtl');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('ar');
    expect(option('عربي').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('مرّر لتغوص.')).toBeTruthy();
    expect(screen.getByText('العمق')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'شكر وتقدير' })).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'المعالم' });
    expect(nav.getAttribute('dir')).toBe('rtl');
    expect(within(nav).getByRole('button', { name: /مكتب الشكاوى/ })).toBeTruthy();

    fireEvent.click(option('EN'));
    expect(html.dir).toBe('ltr');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
    expect(screen.getByRole('navigation', { name: 'Landmarks' })).toBeTruthy();
  });

  it('opens in the stored language', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'ar');
    render(<App />);
    expect(html.dir).toBe('rtl');
  });

  it('lets ?lang= win over the stored choice, and keeps the URL in step on a switch', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    window.history.replaceState(null, '', '/?lang=ar');
    render(<App />);
    expect(html.lang).toBe('ar');
    fireEvent.click(option('EN'));
    expect(window.location.search).toBe('?lang=en');
  });

  it('opens a landmark dialog right to left in Arabic', () => {
    window.history.replaceState(null, '', '/?lang=ar');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /مكتب الشكاوى/ }));
    const dialog = screen.getByRole('dialog', { name: 'مكتب الشكاوى' });
    expect(dialog.getAttribute('dir')).toBe('rtl');
    expect(dialog.getAttribute('lang')).toBe('ar');
    expect(within(dialog).getByRole('textbox', { name: /البريد|عنوان للرد/ }).getAttribute('dir')).toBe(
      'ltr',
    );
  });

  it('marks the credits dialog right to left in Arabic', () => {
    window.history.replaceState(null, '', '/?lang=ar');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'شكر وتقدير' }));
    const dialog = screen.getByRole('dialog', { name: 'شكر وتقدير', hidden: true });
    expect(dialog.getAttribute('dir')).toBe('rtl');
    expect(dialog.getAttribute('lang')).toBe('ar');
  });
});

describe('the page view in Arabic', () => {
  it('reads right to left with the switch in its masthead, and switches in place', () => {
    window.history.replaceState(null, '', '/?view=page&lang=ar');
    const { container } = render(<App />);
    const page = container.querySelector('.page-view');
    expect(page?.getAttribute('dir')).toBe('rtl');
    expect(page?.getAttribute('lang')).toBe('ar');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(profile.name.ar);

    const masthead = container.querySelector<HTMLElement>('.page-view__masthead');
    if (!masthead) throw new Error('no masthead');
    fireEvent.click(within(masthead).getByRole('button', { name: /^EN/ }));
    expect(container.querySelector('.page-view')?.getAttribute('dir')).toBe('ltr');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(profile.name.en);
    expect(screen.getByRole('navigation', { name: 'Sections' })).toBeTruthy();
  });

  it('marks English left without a translation as English, left to right', () => {
    window.history.replaceState(null, '', '/?view=page&lang=ar');
    const { container } = render(<App />);
    const highlights = container.querySelector('.page-highlights');
    expect(highlights?.getAttribute('lang')).toBe('en');
    expect(highlights?.getAttribute('dir')).toBe('ltr');
    // A translated field follows the page instead.
    const role = container.querySelector('.page-entry__title');
    expect(role?.hasAttribute('lang')).toBe(false);
  });
});
