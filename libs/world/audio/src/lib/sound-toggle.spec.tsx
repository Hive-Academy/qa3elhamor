import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioEngine } from './audio-engine.js';
import { AudioProvider, useAudioDepth, useAudioDucking } from './audio-context.js';
import { SOUND_STORAGE_KEY, type SoundStorage } from './audio-store.js';
import { SoundToggle } from './sound-toggle.js';

const fakeEngine = () =>
  ({
    start: vi.fn(),
    stop: vi.fn(),
    setDepth: vi.fn(),
    setDucked: vi.fn(),
    blip: vi.fn(),
    pop: vi.fn(),
    whoosh: vi.fn(),
    plip: vi.fn(),
    dispose: vi.fn(),
  }) satisfies AudioEngine;

function memoryStorage(initial: Record<string, string> = {}): SoundStorage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

function Mix({ depth, talking }: { readonly depth: number; readonly talking: boolean }) {
  useAudioDepth(depth);
  useAudioDucking(talking);
  return null;
}

function renderSound({
  presentation = 'dive' as 'dive' | 'page',
  storage = memoryStorage(),
  depth = 0,
  talking = false,
} = {}) {
  const engine = fakeEngine();
  const view = (props: { depth: number; talking: boolean }) => (
    <AudioProvider
      music={[{ url: '/a.opus', type: 'audio/ogg; codecs=opus' }]}
      ambience
      presentation={presentation}
      createEngine={() => engine}
      storage={storage}
    >
      <SoundToggle label="Sound" promptLabel="Sound on?" placement={presentation} />
      <Mix {...props} />
      <p>scene</p>
    </AudioProvider>
  );
  const result = render(view({ depth, talking }));
  return {
    engine,
    storage,
    rerender: (props: { depth: number; talking: boolean }) => result.rerender(view(props)),
    unmount: result.unmount,
  };
}

describe('SoundToggle with AudioProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('invites the visitor before any choice, as a keyboard-reachable toggle button', () => {
    renderSound();
    const toggle = screen.getByRole('button', { name: 'Sound on?' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.getAttribute('type')).toBe('button');
    expect(toggle.tabIndex).toBe(0);
    expect(toggle.dataset['placement']).toBe('dive');
  });

  it('starts in the dive at the first click anywhere, and the toggle then shows it on', () => {
    const { engine } = renderSound();
    act(() => {
      fireEvent.pointerDown(screen.getByText('scene'));
    });
    expect(engine.start).toHaveBeenCalledTimes(1);
    const toggle = screen.getByRole('button', { name: 'Sound' });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('does not count a wheel or scroll as an activation', () => {
    const { engine } = renderSound();
    act(() => {
      fireEvent.wheel(window);
      fireEvent.scroll(window);
    });
    expect(engine.start).not.toHaveBeenCalled();
  });

  it('turns sound on from the prompt itself, without the page gesture also toggling it', () => {
    const { engine, storage } = renderSound();
    const toggle = screen.getByRole('button', { name: 'Sound on?' });
    act(() => {
      fireEvent.pointerDown(toggle);
      fireEvent.click(toggle);
    });
    expect(engine.start).toHaveBeenCalledTimes(1);
    expect(engine.stop).not.toHaveBeenCalled();
    expect(storage.getItem(SOUND_STORAGE_KEY)).toBe('on');
  });

  it('mutes on press and persists the choice', () => {
    const { engine, storage } = renderSound({
      storage: memoryStorage({ [SOUND_STORAGE_KEY]: 'on' }),
    });
    act(() => {
      fireEvent.keyDown(document.body, { key: 'a' });
    });
    expect(engine.start).toHaveBeenCalledTimes(1);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Sound' }));
    });
    expect(engine.stop).toHaveBeenCalledTimes(1);
    expect(storage.getItem(SOUND_STORAGE_KEY)).toBe('off');
    expect(screen.getByRole('button', { name: 'Sound' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('never auto-starts on the page view: only the toggle starts it', () => {
    const { engine } = renderSound({ presentation: 'page' });
    act(() => {
      fireEvent.pointerDown(screen.getByText('scene'));
      fireEvent.keyDown(document.body, { key: 'Enter' });
    });
    expect(engine.start).not.toHaveBeenCalled();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Sound on?' }));
    });
    expect(engine.start).toHaveBeenCalledTimes(1);
  });

  it('never auto-starts with prefers-reduced-motion', () => {
    // jsdom has no matchMedia: stand one in that reports reduced motion.
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: query.includes('reduce'),
          media: query,
          onchange: null,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => false,
        }) satisfies MediaQueryList,
    );
    const { engine } = renderSound();
    act(() => {
      fireEvent.pointerDown(screen.getByText('scene'));
    });
    expect(engine.start).not.toHaveBeenCalled();
  });

  it('suspends while the tab is hidden', () => {
    const { engine } = renderSound();
    act(() => {
      fireEvent.pointerDown(screen.getByText('scene'));
    });
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(engine.stop).toHaveBeenCalledTimes(1);
    visibility.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(engine.start).toHaveBeenCalledTimes(2);
  });

  it('drives the depth filter and ducking from the mix hooks', () => {
    const { engine, rerender } = renderSound();
    act(() => {
      fireEvent.pointerDown(screen.getByText('scene'));
    });
    rerender({ depth: 0.6, talking: true });
    expect(engine.setDepth).toHaveBeenLastCalledWith(0.6);
    expect(engine.setDucked).toHaveBeenLastCalledWith(true);
    rerender({ depth: 0.6, talking: false });
    expect(engine.setDucked).toHaveBeenLastCalledWith(false);
  });

  it('disposes the engine on unmount', () => {
    const { engine, unmount } = renderSound();
    act(() => {
      fireEvent.pointerDown(screen.getByText('scene'));
    });
    unmount();
    expect(engine.dispose).toHaveBeenCalled();
  });

  it('renders no toggle without a provider, and the mix hooks are no-ops', () => {
    render(
      <>
        <SoundToggle label="Sound" promptLabel="Sound on?" placement="dive" />
        <Mix depth={0.5} talking />
      </>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders no toggle when nothing is configured to play', () => {
    render(
      <AudioProvider music={null} ambience={false} presentation="dive" createEngine={fakeEngine}>
        <SoundToggle label="Sound" promptLabel="Sound on?" placement="dive" />
      </AudioProvider>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
