import {
  autoStartAllowed,
  babbleFor,
  voiceProfileFor,
  type VoiceProfileId,
} from '@qa3elhamor/world-domain';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  createAudioEngine,
  webAudioSupported,
  type AudioEngine,
  type AudioSource,
} from './audio-engine.js';
import {
  createAudioStore,
  type AudioStore,
  type SoundStorage,
  type SoundView,
} from './audio-store.js';

const AudioStoreContext = createContext<AudioStore | null>(null);

/** Marks the sound toggle: a press on it is the toggle's to handle, not a page activation. */
export const SOUND_TOGGLE_ATTRIBUTE = 'data-sound-toggle';

/**
 * The events that count as a user activation for autoplay. Scrolling and wheel do not: a
 * browser would still block the audio, so only a click, tap or key press starts it.
 */
const ACTIVATION_EVENTS = ['pointerdown', 'keydown', 'touchend'] as const;

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

const browserStorage = (): SoundStorage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    // Reading `localStorage` itself throws where storage is blocked.
    return null;
  }
};

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
      const query = window.matchMedia(REDUCED_MOTION);
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    },
    () =>
      typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

const isActivation = (event: Event): boolean => {
  if (event instanceof KeyboardEvent && event.key === 'Escape') return false;
  const target = event.target;
  return !(target instanceof Element && target.closest(`[${SOUND_TOGGLE_ATTRIBUTE}]`));
};

export interface AudioProviderProps {
  /** The music bed's encodings, best first; `null` for none. */
  readonly music: readonly AudioSource[] | null;
  /** Synthesized rumble and bubbles. */
  readonly ambience: boolean;
  /**
   * `dive` may start sound at the first activation when the visitor has made no choice; `page`
   * (no WebGL, `?view=page`) is opt-in only, as is `prefers-reduced-motion` anywhere.
   */
  readonly presentation: 'dive' | 'page';
  /** Tests inject a fake engine; the default is Web Audio, when the browser has it. */
  readonly createEngine?: () => AudioEngine;
  /** Tests inject storage; the default is `localStorage` (null where it is blocked). */
  readonly storage?: SoundStorage | null;
  readonly children?: ReactNode;
}

/**
 * Owns the visit's ambient sound: the persisted choice, the gesture gate and the engine. Mount
 * it once around both presentations, so switching between the dive and the page keeps it.
 *
 * Nothing is created or downloaded until sound is wanted: the store builds the engine then,
 * and the engine its AudioContext and `<audio>` element at its first start. Without Web Audio
 * (old browsers, jsdom) the provider renders its children and the sound hooks report it
 * unavailable, so the toggle hides.
 */
export function AudioProvider({
  music,
  ambience,
  presentation,
  createEngine,
  storage,
  children,
}: AudioProviderProps) {
  const reducedMotion = usePrefersReducedMotion();
  const autoStart = autoStartAllowed({ presentation, reducedMotion });
  const [store] = useState<AudioStore | null>(() => {
    const factory =
      createEngine ??
      (webAudioSupported() ? () => createAudioEngine({ music, ambience }) : null);
    if (!factory || (!ambience && !music?.length)) return null;
    return createAudioStore({
      storage: storage === undefined ? browserStorage() : storage,
      autoStart,
      createEngine: factory,
    });
  });

  useEffect(() => store?.setAutoStart(autoStart), [store, autoStart]);

  // The gesture gate: the first click, tap or key press anywhere unlocks audio. Removed after
  // it, since later gestures change nothing.
  useEffect(() => {
    if (!store) return undefined;
    function remove() {
      for (const type of ACTIVATION_EVENTS) window.removeEventListener(type, onActivation, true);
    }
    function onActivation(event: Event) {
      if (!isActivation(event)) return;
      store?.activate();
      remove();
    }
    for (const type of ACTIVATION_EVENTS) {
      window.addEventListener(type, onActivation, { capture: true, passive: true });
    }
    return remove;
  }, [store]);

  // A hidden tab suspends the sound; showing it again resumes what was playing.
  useEffect(() => {
    if (!store) return undefined;
    const onVisibility = () => store.setHidden(document.visibilityState === 'hidden');
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [store]);

  useEffect(() => (store ? () => store.dispose() : undefined), [store]);

  return <AudioStoreContext.Provider value={store}>{children}</AudioStoreContext.Provider>;
}

const UNAVAILABLE: SoundView = { on: false, prompt: false, playing: false };
const noop = () => undefined;
const subscribeNone = () => noop;

export interface SoundControls extends SoundView {
  /** False without a provider, without Web Audio, or with nothing configured to play. */
  readonly available: boolean;
  readonly toggle: () => void;
}

/** The sound toggle's state and action. */
export function useSound(): SoundControls {
  const store = useContext(AudioStoreContext);
  const view = useSyncExternalStore(
    store?.subscribe ?? subscribeNone,
    store?.getSnapshot ?? (() => UNAVAILABLE),
    store?.getSnapshot ?? (() => UNAVAILABLE),
  );
  return { ...view, available: store !== null, toggle: store?.toggle ?? noop };
}

/** Feeds the dive's progress in [0, 1] to the depth filter. A no-op without a provider. */
export function useAudioDepth(depth01: number): void {
  const store = useContext(AudioStoreContext);
  useEffect(() => store?.setDepth(depth01), [store, depth01]);
}

/** Ducks the music while `active` (a narrator is talking). A no-op without a provider. */
export function useAudioDucking(active: boolean): void {
  const store = useContext(AudioStoreContext);
  useEffect(() => (store && active ? store.duck() : undefined), [store, active]);
}

/**
 * The provider's sound, as an opaque value to carry into a separate React root. drei's `<Html>`
 * renders its children with its own `createRoot`, so context does not reach them: read this
 * outside and wrap the `<Html>` content in `<AudioBridge value={…}>`.
 */
export type AudioBridgeValue = AudioStore | null;

export function useAudioBridge(): AudioBridgeValue {
  return useContext(AudioStoreContext);
}

/** Re-provides the sound read by `useAudioBridge` inside another React root. */
export function AudioBridge({
  value,
  children,
}: {
  readonly value: AudioBridgeValue;
  readonly children?: ReactNode;
}) {
  return <AudioStoreContext.Provider value={value}>{children}</AudioStoreContext.Provider>;
}

export interface VoiceControls {
  /** One blip of this voice for `char`, `delayS` from now (letters only make sense). */
  readonly speakChar: (char: string, delayS?: number) => void;
  /**
   * The typewriter went from `previous` to `next`: babble the newly revealed letters. A big
   * jump (a finished or instantly shown line) stays silent; a new line babbles from its start.
   */
  readonly onReveal: (previous: string, next: string) => void;
}

const SILENT_VOICE: VoiceControls = { speakChar: noop, onReveal: noop };

/**
 * A narrator's synthesized babble voice (`VOICE_PROFILES`). `null` is no voice. Silent without
 * a provider, while sound is off, and before the visitor's first gesture.
 */
export function useVoice(profileId: VoiceProfileId | null): VoiceControls {
  const store = useContext(AudioStoreContext);
  return useMemo(() => {
    if (!store || profileId === null) return SILENT_VOICE;
    const profile = voiceProfileFor(profileId);
    return {
      speakChar: (char, delayS) => store.blip(profile, char, delayS),
      onReveal: (previous, next) => {
        for (const blip of babbleFor(previous, next, profile)) {
          store.blip(profile, blip.char, blip.delayS);
        }
      },
    };
  }, [store, profileId]);
}

/**
 * Babbles `revealed` as it grows: pass the typewriter's shown text on every render. The first
 * render and any jump (reduced motion shows a line whole) stay silent.
 */
export function useVoiceBabble(profileId: VoiceProfileId | null, revealed: string): void {
  const { onReveal } = useVoice(profileId);
  const previous = useRef(revealed);
  useEffect(() => {
    if (previous.current === revealed) return;
    onReveal(previous.current, revealed);
    previous.current = revealed;
  }, [onReveal, revealed]);
}

export interface SfxControls {
  /** A speech bubble appears. */
  readonly pop: () => void;
  /** A landmark opens or closes. */
  readonly whoosh: () => void;
  /** A button or "Next". */
  readonly plip: () => void;
}

const SILENT_SFX: SfxControls = { pop: noop, whoosh: noop, plip: noop };

/** The small UI sounds. Stable functions; silent without a provider or while sound is off. */
export function useSfx(): SfxControls {
  const store = useContext(AudioStoreContext);
  return useMemo(
    () => (store ? { pop: store.pop, whoosh: store.whoosh, plip: store.plip } : SILENT_SFX),
    [store],
  );
}
