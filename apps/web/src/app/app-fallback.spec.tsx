import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './app';

// What the stubbed canvas does on render, and what the WebGL probe reports, per test.
const stage = vi.hoisted(() => ({ throwOnRender: false, webgl: true }));

// jsdom cannot mount the R3F canvas (see app.spec.tsx); this stub can also fail like a broken scene.
vi.mock('@react-three/fiber', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@react-three/fiber')>()),
  Canvas: () => {
    if (stage.throwOnRender) throw new Error('scene failed');
    return <div data-testid="canvas" />;
  },
}));

vi.mock('@qa3elhamor/world-feature', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@qa3elhamor/world-feature')>();
  return {
    ...actual,
    readDeviceCapabilities: () => ({
      ...actual.readDeviceCapabilities(),
      webgl: stage.webgl,
    }),
  };
});

beforeEach(() => {
  stage.throwOnRender = false;
  stage.webgl = true;
  window.history.replaceState(null, '', '/');
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

const pageShown = () =>
  screen.queryByRole('navigation', { name: 'Sections' }) !== null;

describe('App: the page view as the alternative to the dive', () => {
  it('dives when WebGL is available', () => {
    render(<App />);
    expect(screen.getByTestId('canvas')).toBeTruthy();
    expect(pageShown()).toBe(false);
  });

  it('serves the page, and no canvas, when the browser has no WebGL', () => {
    stage.webgl = false;
    render(<App />);
    expect(screen.queryByTestId('canvas')).toBeNull();
    expect(pageShown()).toBe(true);
    expect(screen.getByText(/WebGL is not available/)).toBeTruthy();
  });

  it('serves the page when ?view=page asks for it', () => {
    window.history.replaceState(null, '', '/?view=page');
    render(<App />);
    expect(screen.queryByTestId('canvas')).toBeNull();
    expect(pageShown()).toBe(true);
  });

  it('falls back to the page when the scene throws', () => {
    stage.throwOnRender = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<App />);
    expect(pageShown()).toBe(true);
    expect(screen.getByText(/stopped working on this device/)).toBeTruthy();
  });

  it('lets anyone skip the dive and come back, recording both in history', () => {
    render(<App />);
    const skip = screen.getByRole('link', {
      name: 'Skip the dive: read it as a page',
    });
    expect(skip.getAttribute('href')).toBe('/?view=page');

    fireEvent.click(skip);
    expect(pageShown()).toBe(true);
    expect(window.location.search).toBe('?view=page');
    expect(document.activeElement?.tagName).toBe('H1');

    fireEvent.click(
      screen.getAllByRole('link', { name: 'Back to the dive' })[0],
    );
    expect(screen.getByTestId('canvas')).toBeTruthy();
    expect(window.location.search).toBe('');
    // The link that was clicked is gone; focus lands on the dive's way out, not on <body>.
    expect(document.activeElement).toBe(
      screen.getByRole('link', { name: 'Skip the dive: read it as a page' }),
    );
  });

  it('does not take focus on a first visit to the dive', () => {
    render(<App />);
    expect(document.activeElement).toBe(document.body);
  });

  const popTo = (url: string) =>
    act(() => {
      window.history.replaceState(null, '', url);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

  it('follows Back and Forward between the two, moving focus as a click does', () => {
    render(<App />);
    fireEvent.click(
      screen.getByRole('link', { name: 'Skip the dive: read it as a page' }),
    );
    expect(pageShown()).toBe(true);

    popTo('/');
    expect(screen.getByTestId('canvas')).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole('link', { name: 'Skip the dive: read it as a page' }),
    );

    popTo('/?view=page');
    expect(pageShown()).toBe(true);
    expect(document.activeElement?.tagName).toBe('H1');
  });

  it('treats an in-page anchor popstate as no switch', () => {
    window.history.replaceState(null, '', '/?view=page');
    render(<App />);
    const contact = document.querySelector<HTMLAnchorElement>(
      'a[href="#page-contact"]',
    );
    contact?.focus();
    popTo('/?view=page#page-contact');
    expect(pageShown()).toBe(true);
    expect(document.activeElement).toBe(contact);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('keeps a broken dive on the page when the visitor goes Back', () => {
    stage.throwOnRender = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<App />);
    popTo('/');
    expect(screen.queryByTestId('canvas')).toBeNull();
    expect(screen.getByText(/stopped working on this device/)).toBeTruthy();
  });
});
