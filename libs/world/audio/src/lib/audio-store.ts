import {
  createSoundSession,
  isAudible,
  isSoundOn,
  parseSoundPreference,
  serializeSoundPreference,
  showsPrompt,
  soundReducer,
  type SoundEvent,
  type SoundSession,
  type VoiceProfile,
} from '@qa3elhamor/world-domain';
import type { AudioEngine } from './audio-engine.js';

/** Where the choice is kept between visits. */
export const SOUND_STORAGE_KEY = 'qa3elhamor:sound';

/** The slice of `Storage` the store uses; `localStorage` in the browser. */
export type SoundStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** What the sound toggle shows. */
export interface SoundView {
  /** The toggle is pressed: sound is on (or will resume when the tab is visible). */
  readonly on: boolean;
  /** No choice made and nothing playing: invite the visitor ("Sound on?"). */
  readonly prompt: boolean;
  /** Audio is actually running now. */
  readonly playing: boolean;
}

export interface AudioStore {
  readonly getSnapshot: () => SoundView;
  readonly subscribe: (listener: () => void) => () => void;
  /** The visitor's first click, tap or key press. */
  readonly activate: () => void;
  readonly toggle: () => void;
  readonly setHidden: (hidden: boolean) => void;
  readonly setAutoStart: (allowed: boolean) => void;
  readonly setDepth: (depth01: number) => void;
  /** Ducks the music until the returned release is called. Claims from several narrators stack. */
  readonly duck: () => () => void;
  /**
   * The one-shot sounds: a narrator's blip and the UI sounds. They play only while sound is
   * audible, and never create the engine: muted, not yet activated or hidden, they do nothing.
   */
  readonly blip: (profile: VoiceProfile, char: string, delayS?: number) => void;
  readonly pop: () => void;
  readonly whoosh: () => void;
  readonly plip: () => void;
  /** Releases the engine (closing its context). The store stays usable: a later start rebuilds it. */
  readonly dispose: () => void;
}

export interface AudioStoreOptions {
  /** `null` when storage is unavailable (private mode, blocked): the choice lasts this visit. */
  readonly storage: SoundStorage | null;
  /** May an `unset` preference start by itself (`autoStartAllowed`)? */
  readonly autoStart: boolean;
  /** Builds the engine, at the first moment sound is wanted. */
  readonly createEngine: () => AudioEngine;
}

const readPreference = (storage: SoundStorage | null) => {
  try {
    return parseSoundPreference(storage?.getItem(SOUND_STORAGE_KEY));
  } catch {
    // Storage that throws on read (blocked cookies) is the same as no stored choice.
    return parseSoundPreference(null);
  }
};

const viewOf = (session: SoundSession): SoundView => ({
  on: isSoundOn(session),
  prompt: showsPrompt(session),
  playing: isAudible(session),
});

/**
 * The visit's sound as an external store (read with `useSyncExternalStore`): the pure session
 * (`soundReducer`, world-domain) plus the shell around it, which persists the visitor's choice
 * and keeps the engine in step with `isAudible` after every event.
 */
export function createAudioStore({
  storage,
  autoStart,
  createEngine,
}: AudioStoreOptions): AudioStore {
  let session = createSoundSession(readPreference(storage), autoStart);
  let view = viewOf(session);
  let engine: AudioEngine | null = null;
  let depth = 0;
  let duckClaims = 0;
  const listeners = new Set<() => void>();

  const engineNow = (): AudioEngine => {
    if (!engine) {
      engine = createEngine();
      engine.setDepth(depth);
      engine.setDucked(duckClaims > 0);
    }
    return engine;
  };

  const persist = (next: SoundSession) => {
    if (!storage) return;
    const value = serializeSoundPreference(next.preference);
    try {
      if (value === null) storage.removeItem(SOUND_STORAGE_KEY);
      else storage.setItem(SOUND_STORAGE_KEY, value);
    } catch (error) {
      console.warn('The sound choice could not be saved; it lasts this visit only.', error);
    }
  };

  const dispatch = (event: SoundEvent) => {
    const previous = session;
    const next = soundReducer(previous, event);
    if (next === previous) return;
    session = next;
    if (next.preference !== previous.preference) persist(next);

    const wasAudible = isAudible(previous);
    const audible = isAudible(next);
    if (audible && !wasAudible) engineNow().start();
    else if (!audible && wasAudible) engine?.stop();

    const nextView = viewOf(next);
    if (
      nextView.on !== view.on ||
      nextView.prompt !== view.prompt ||
      nextView.playing !== view.playing
    ) {
      view = nextView;
      for (const listener of listeners) listener();
    }
  };

  return {
    getSnapshot: () => view,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    activate: () => dispatch({ type: 'activate' }),
    toggle: () => dispatch({ type: 'toggle' }),
    setHidden: (hidden) => dispatch({ type: 'visibility', hidden }),
    setAutoStart: (allowed) => dispatch({ type: 'auto-start', allowed }),
    setDepth: (depth01) => {
      depth = depth01;
      engine?.setDepth(depth01);
    },
    duck: () => {
      duckClaims += 1;
      engine?.setDucked(true);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        duckClaims -= 1;
        engine?.setDucked(duckClaims > 0);
      };
    },
    blip: (profile, char, delayS) => {
      if (isAudible(session)) engine?.blip(profile, char, delayS);
    },
    pop: () => {
      if (isAudible(session)) engine?.pop();
    },
    whoosh: () => {
      if (isAudible(session)) engine?.whoosh();
    },
    plip: () => {
      if (isAudible(session)) engine?.plip();
    },
    dispose: () => {
      engine?.dispose();
      engine = null;
      if (isAudible(session)) {
        // The engine is gone: the next audible transition must start a fresh one.
        session = { ...session, activated: false };
        view = viewOf(session);
        for (const listener of listeners) listener();
      }
    },
  };
}
