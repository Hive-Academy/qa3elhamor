import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './app';

// jsdom has no WebGL context, so the R3F canvas cannot mount here. Stub it and assert the
// DOM overlay instead; the scene itself is covered by the visual-regression suite in the
// `qa-smoke` roadmap item, which runs against a real browser. Children are deliberately not
// rendered — three.js primitives are not DOM elements and React warns on every one.
// `vi.mock` is hoisted above the imports, so the stub is in place before `app` loads.
vi.mock('@react-three/fiber', () => ({
  Canvas: () => <div data-testid="canvas" />,
}));

describe('App', () => {
  it('renders the shell', () => {
    render(<App />);
    expect(screen.getByTestId('canvas')).toBeTruthy();
  });

  it('reports the manifested asset count from the world library', () => {
    render(<App />);
    expect(screen.getByText(/8 assets manifested/)).toBeTruthy();
  });
});
