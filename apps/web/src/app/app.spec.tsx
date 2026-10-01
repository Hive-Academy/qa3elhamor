import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './app';
import { siteTelemetry } from './telemetry';

// jsdom has no WebGL context, so the R3F canvas cannot mount here. Stub `Canvas` and assert
// the DOM overlay instead; the scene itself is covered by the visual-regression suite in the
// `qa-smoke` roadmap item, which runs against a real browser. Children are deliberately not
// rendered: three.js primitives are not DOM elements and React warns on every one. The rest
// of the module stays real because `@qa3elhamor/world-feature` imports its hooks.
vi.mock('@react-three/fiber', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@react-three/fiber')>()),
  Canvas: () => <div data-testid="canvas" />,
}));

describe('App', () => {
  it('renders the ocean canvas', () => {
    render(<App />);
    expect(screen.getByTestId('canvas')).toBeTruthy();
  });

  it('titles the site in Arabic', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'قاع الهامور' })).toBeTruthy();
  });

  it('reports the manifested asset count from the world library', () => {
    render(<App />);
    expect(screen.getByText(/8 assets manifested/)).toBeTruthy();
  });

  it('shows the dive depth, near the surface on arrival', () => {
    render(<App />);
    expect(screen.getByText(/^−\d{1,2} m$/)).toBeTruthy();
  });

  it('lists every landmark for keyboard users and opens its overlay', () => {
    render(<App />);
    const nav = screen.getByRole('navigation', { name: 'Landmarks' });
    expect(nav.querySelectorAll('button')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: /Complaints Bureau/ }));
    const dialog = screen.getByRole('dialog', { name: 'Complaints Bureau' });
    expect(dialog.querySelector('form')).toBeTruthy();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('pins the quality tier from ?quality= and reports it to analytics once', () => {
    const resolved = vi.spyOn(siteTelemetry().session, 'qualityTierResolved');
    window.history.replaceState(null, '', '/?quality=low');
    try {
      const { container } = render(<App />);
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
