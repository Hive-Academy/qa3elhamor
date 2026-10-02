import { fireEvent, render, screen } from '@testing-library/react';
import { resolveText } from '@qa3elhamor/landmarks-domain';
import { WEB_ASSETS } from '@qa3elhamor/world-domain';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import App from './app';
import { loadDiveShell } from './dive-shell-loader';
import { siteTelemetry } from './telemetry';
import { LANDMARKS, SITE } from '../site.config';

const bureau = LANDMARKS.find((landmark) => landmark.id === 'bureau');

// jsdom has no WebGL context, so the R3F canvas cannot mount here. Stub `Canvas` and assert
// the DOM overlay instead; the scene itself is covered by the visual-regression suite in the
// `qa-smoke` roadmap item, which runs against a real browser. Children are deliberately not
// rendered: three.js primitives are not DOM elements and React warns on every one. The rest
// of the module stays real because `@qa3elhamor/world-feature` imports its hooks.
vi.mock('@react-three/fiber', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@react-three/fiber')>()),
  Canvas: () => <div data-testid="canvas" />,
}));

// jsdom cannot create a WebGL context either, which would send the app to its page view
// (`page-view.spec.tsx`, `app-fallback.spec.tsx`). These tests are about the dive, so the probe
// reports WebGL; everything else about the device stays as jsdom reports it.
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

describe('App', () => {
  // The dive is a lazy chunk (`dive-shell-loader.tsx`); importing it once up front keeps each
  // test's wait down to React resolving the already-loaded module.
  // Its first import (three, R3F, drei under jsdom) can outlast the 10 s hook default.
  beforeAll(async () => {
    await loadDiveShell();
  }, 60_000);

  // Rendered by the entry outside the dive's <Suspense>, so they never wait for the 3D chunk.
  it('shows the title, the way out and the language switch outside the lazy dive', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: SITE.brand.mark.text })).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Skip the dive: read it as a page' }),
    ).toBeTruthy();
    // One language (`SITE.locales`), no switch.
    expect(Boolean(screen.queryByRole('group', { name: 'Language' }))).toBe(
      SITE.locales.length > 1,
    );
  });

  it('renders the ocean canvas', async () => {
    render(<App />);
    expect(await screen.findByTestId('canvas')).toBeTruthy();
  });

  it("titles the site with the brand's mark, in the mark's own language", () => {
    render(<App />);
    const heading = screen.getByRole('heading', { name: SITE.brand.mark.text });
    expect(heading.getAttribute('lang')).toBe(SITE.brand.mark.lang);
  });

  it('reports the manifested asset count from the world library', () => {
    render(<App />);
    expect(
      screen.getByText(new RegExp(`${WEB_ASSETS.length} assets manifested`)),
    ).toBeTruthy();
  });

  it('shows the dive depth, near the surface on arrival', async () => {
    render(<App />);
    expect(await screen.findByText(/^−\d{1,2} m$/)).toBeTruthy();
  });

  it('lists every landmark for keyboard users and opens its overlay', async () => {
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: 'Landmarks' });
    expect(nav.querySelectorAll('button')).toHaveLength(LANDMARKS.length);
    if (!bureau) return; // A site without the Bureau: the list is the whole check.
    const name = resolveText(bureau.label, 'en');
    fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
    const dialog = screen.getByRole('dialog', { name });
    expect(dialog.querySelector('form')).toBeTruthy();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('pins the quality tier from ?quality= and reports it to analytics once', async () => {
    const resolved = vi.spyOn(siteTelemetry().session, 'qualityTierResolved');
    window.history.replaceState(null, '', '/?quality=low');
    try {
      const { container } = render(<App />);
      await screen.findByTestId('canvas');
      const stage = container.querySelector('.stage');
      expect(stage?.getAttribute('data-quality-tier')).toBe('low');
      expect(stage?.getAttribute('data-quality-settled')).toBe('true');
      expect(resolved).toHaveBeenCalledTimes(1);
      expect(resolved).toHaveBeenCalledWith('low');
    } finally {
      window.history.replaceState(null, '', '/');
      resolved.mockRestore();
    }
  });
});
