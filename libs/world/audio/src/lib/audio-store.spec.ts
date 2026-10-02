import { VOICE_PROFILES } from '@qa3elhamor/world-domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioEngine } from './audio-engine.js';
import { SOUND_STORAGE_KEY, createAudioStore, type SoundStorage } from './audio-store.js';

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

function memoryStorage(initial: Record<string, string> = {}): SoundStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

function setup({
  stored,
  autoStart = true,
  storage = memoryStorage(stored === undefined ? {} : { [SOUND_STORAGE_KEY]: stored }),
}: { stored?: string; autoStart?: boolean; storage?: SoundStorage | null } = {}) {
  const engine = fakeEngine();
  const createEngine = vi.fn(() => engine);
  const store = createAudioStore({ storage, autoStart, createEngine });
  return { store, engine, createEngine, storage };
}

describe('createAudioStore', () => {
  afterEach(() => vi.restoreAllMocks());

  it('creates no engine until sound is wanted, and starts it at the first activation', () => {
    const { store, engine, createEngine } = setup();
    expect(store.getSnapshot()).toEqual({ on: false, prompt: true, playing: false });
    expect(createEngine).not.toHaveBeenCalled();

    store.activate();
    expect(createEngine).toHaveBeenCalledTimes(1);
    expect(engine.start).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toEqual({ on: true, prompt: false, playing: true });
  });

  it('never auto-starts where auto-start is off, until the toggle', () => {
    const { store, engine, createEngine, storage } = setup({ autoStart: false });
    store.activate();
    expect(createEngine).not.toHaveBeenCalled();

    store.toggle();
    expect(engine.start).toHaveBeenCalledTimes(1);
    expect(storage?.getItem(SOUND_STORAGE_KEY)).toBe('on');
  });

  it('mutes and persists off, then resumes and persists on', () => {
    const { store, engine, storage } = setup();
    store.activate();
    store.toggle();
    expect(engine.stop).toHaveBeenCalledTimes(1);
    expect(storage?.getItem(SOUND_STORAGE_KEY)).toBe('off');
    expect(store.getSnapshot().on).toBe(false);

    store.toggle();
    expect(engine.start).toHaveBeenCalledTimes(2);
    expect(storage?.getItem(SOUND_STORAGE_KEY)).toBe('on');
  });

  it('reads a stored choice: off stays silent at activation, on resumes', () => {
    const muted = setup({ stored: 'off' });
    muted.store.activate();
    expect(muted.createEngine).not.toHaveBeenCalled();
    expect(muted.store.getSnapshot()).toEqual({ on: false, prompt: false, playing: false });

    const on = setup({ stored: 'on', autoStart: false });
    expect(on.store.getSnapshot().on).toBe(true);
    on.store.activate();
    expect(on.engine.start).toHaveBeenCalledTimes(1);
  });

  it('treats an unreadable or unknown stored value as no choice', () => {
    expect(setup({ stored: 'garbage' }).store.getSnapshot().prompt).toBe(true);
    const throwing: SoundStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => undefined,
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { store, engine } = setup({ storage: throwing });
    expect(store.getSnapshot().prompt).toBe(true);
    store.toggle();
    expect(engine.start).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('works without storage at all', () => {
    const { store, engine } = setup({ storage: null });
    store.toggle();
    expect(engine.start).toHaveBeenCalled();
  });

  it('suspends while hidden and resumes when visible', () => {
    const { store, engine } = setup();
    store.activate();
    store.setHidden(true);
    expect(engine.stop).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toEqual({ on: true, prompt: false, playing: false });
    store.setHidden(false);
    expect(engine.start).toHaveBeenCalledTimes(2);
  });

  it('stops an auto-started sound when auto-start is withdrawn (to the page view)', () => {
    const { store, engine } = setup();
    store.activate();
    store.setAutoStart(false);
    expect(engine.stop).toHaveBeenCalledTimes(1);
  });

  it('hands depth and ducking to the engine, including values set before it existed', () => {
    const { store, engine } = setup();
    store.setDepth(0.4);
    const release = store.duck();
    store.activate();
    expect(engine.setDepth).toHaveBeenCalledWith(0.4);
    expect(engine.setDucked).toHaveBeenLastCalledWith(true);
    release();
    expect(engine.setDucked).toHaveBeenLastCalledWith(false);
  });

  it('keeps the music ducked until every narrator has stopped talking', () => {
    const { store, engine } = setup();
    store.activate();
    const first = store.duck();
    const second = store.duck();
    first();
    first();
    expect(engine.setDucked).toHaveBeenLastCalledWith(true);
    second();
    expect(engine.setDucked).toHaveBeenLastCalledWith(false);
  });

  it('notifies subscribers only when the view changes, with a stable snapshot otherwise', () => {
    const { store } = setup();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const before = store.getSnapshot();
    store.setDepth(0.7);
    store.setHidden(false);
    expect(listener).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toBe(before);

    store.activate();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.toggle();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('plays voice blips and UI sounds only while audible, never creating the engine', () => {
    const { store, engine, createEngine } = setup();
    const voice = VOICE_PROFILES.patrick;
    store.blip(voice, 'a');
    store.pop();
    expect(createEngine).not.toHaveBeenCalled();

    store.activate();
    store.blip(voice, 'a', 0.05);
    store.pop();
    store.whoosh();
    store.plip();
    expect(engine.blip).toHaveBeenCalledWith(voice, 'a', 0.05);
    expect(engine.pop).toHaveBeenCalledTimes(1);
    expect(engine.whoosh).toHaveBeenCalledTimes(1);
    expect(engine.plip).toHaveBeenCalledTimes(1);

    store.toggle();
    store.pop();
    store.blip(voice, 'b');
    expect(engine.pop).toHaveBeenCalledTimes(1);
    expect(engine.blip).toHaveBeenCalledTimes(1);
  });

  it('disposes the engine and builds a fresh one at the next start', () => {
    const { store, engine, createEngine } = setup();
    store.activate();
    store.dispose();
    expect(engine.dispose).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().playing).toBe(false);
    store.activate();
    expect(createEngine).toHaveBeenCalledTimes(2);
  });
});
