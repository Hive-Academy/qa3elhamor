import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './app';

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
});
