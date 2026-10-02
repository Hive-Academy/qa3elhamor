import {
  AMBIENCE,
  AUDIO_MIX,
  bubbleChirp,
  glideTimeConstant,
  lowpassCutoffHz,
  musicGainFor,
  nextBubbleDelayS,
  UI_SFX,
  voicePitchHz,
  type AudioMix,
  type VoiceProfile,
} from '@qa3elhamor/world-domain';
import { noiseBuffer, synthBlip, synthNoise, synthTone, type SoundDone } from './sfx-synth.js';

/** One encoding of the music bed: a URL and the MIME type `canPlayType` is asked about. */
export interface AudioSource {
  readonly url: string;
  /** e.g. `audio/ogg; codecs=opus` or `audio/mp4`. */
  readonly type: string;
}

export interface AudioEngineOptions {
  /** The music bed's encodings, best first; `null` for ambience only. */
  readonly music: readonly AudioSource[] | null;
  /** Synthesize the rumble and bubbles. */
  readonly ambience: boolean;
  readonly mix?: AudioMix;
  /** Called at the first `start()` only, never at import or render. Tests pass a fake. */
  readonly createContext?: () => AudioContext;
  /** The music's `<audio>` element, created at the first `start()`. */
  readonly createElement?: () => HTMLAudioElement;
  /** Uniform random numbers in [0, 1): the noise and the bubbles' timing. */
  readonly random?: () => number;
}

/** The imperative sound shell. Every method is safe to call at any time and never throws. */
export interface AudioEngine {
  /** Builds the graph on first use, resumes it and fades in. Call from a user gesture. */
  start(): void;
  /** Fades out, then pauses the music and suspends the context. */
  stop(): void;
  /** Dive progress in [0, 1]: deeper is more muffled. */
  setDepth(depth01: number): void;
  /** Ducks the music while a narrator talks. */
  setDucked(ducked: boolean): void;
  /**
   * One babble blip of a narrator's voice for `char`, `delayS` from now. Like the UI sounds
   * below, it plays only while the sound is on and running (never builds the graph), and is
   * dropped when `maxSfxVoices` sounds are already playing.
   */
  blip(profile: VoiceProfile, char: string, delayS?: number): void;
  /** A speech bubble appears. */
  pop(): void;
  /** A landmark opens or closes. */
  whoosh(): void;
  /** A button or "Next". */
  plip(): void;
  /** Stops everything and closes the context. The engine is unusable afterwards. */
  dispose(): void;
}

/** Whether this browser has Web Audio at all. */
export const webAudioSupported = (): boolean =>
  typeof window !== 'undefined' && typeof window.AudioContext === 'function';

/** The first source the browser says it can play (`canPlayType` not empty), or null. */
export const pickMusicSource = (
  sources: readonly AudioSource[],
  canPlay: (type: string) => string,
): AudioSource | null => sources.find((source) => canPlay(source.type) !== '') ?? null;

interface Graph {
  readonly context: AudioContext;
  readonly master: GainNode;
  readonly depthFilter: BiquadFilterNode;
  readonly music: GainNode;
  readonly ambience: GainNode | null;
  /** The narrators' babble, straight to the master: not muffled by depth. */
  readonly voices: GainNode;
  /** The UI sounds, straight to the master. */
  readonly sfx: GainNode;
  readonly element: HTMLAudioElement | null;
  readonly loops: readonly AudioScheduledSourceNode[];
}

const BUBBLE_ATTACK_S = 0.008;
const SILENT = 0.0001;

/** Moves a parameter smoothly from where it is now: no clicks, whatever was scheduled before. */
function glide(param: AudioParam, value: number, now: number, durationS: number): void {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.setTargetAtTime(value, now, glideTimeConstant(durationS));
}

/**
 * Looped brown noise (integrated white noise): a soft, low rumble once filtered. The drift is
 * subtracted so the loop's ends meet and it does not click on every repeat.
 */
function rumbleBuffer(context: AudioContext, random: () => number): AudioBuffer {
  const length = Math.max(1, Math.floor(context.sampleRate * AMBIENCE.rumbleLoopS));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    last = (last + 0.02 * (random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  const drift = (data[length - 1] ?? 0) - (data[0] ?? 0);
  for (let i = 0; i < length; i++) data[i] = (data[i] ?? 0) - (drift * i) / Math.max(1, length - 1);
  return buffer;
}

/** The rumble: noise through a low-pass, its level swelling slowly on an LFO. */
function startRumble(
  context: AudioContext,
  out: AudioNode,
  random: () => number,
): AudioScheduledSourceNode[] {
  const noise = context.createBufferSource();
  noise.buffer = rumbleBuffer(context, random);
  noise.loop = true;
  const lowpass = context.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = AMBIENCE.rumbleCutoffHz;
  const level = context.createGain();
  level.gain.value = AMBIENCE.rumbleGain;
  const lfo = context.createOscillator();
  lfo.frequency.value = AMBIENCE.rumbleSwellHz;
  const swell = context.createGain();
  swell.gain.value = AMBIENCE.rumbleSwell;

  noise.connect(lowpass);
  lowpass.connect(level);
  level.connect(out);
  lfo.connect(swell);
  swell.connect(level.gain);
  noise.start();
  lfo.start();
  return [noise, lfo];
}

/** One bubble: a short sine chirp rising in pitch, with a fast attack and a soft tail. */
function blip(context: AudioContext, out: AudioNode, random01: number): void {
  const chirp = bubbleChirp(random01);
  const t = context.currentTime;
  const end = t + chirp.durationS;
  const osc = context.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(chirp.startHz, t);
  osc.frequency.exponentialRampToValueAtTime(chirp.endHz, end);
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(SILENT, t);
  envelope.gain.exponentialRampToValueAtTime(chirp.gain, t + BUBBLE_ATTACK_S);
  envelope.gain.exponentialRampToValueAtTime(SILENT, end);
  osc.connect(envelope);
  envelope.connect(out);
  osc.onended = () => {
    osc.disconnect();
    envelope.disconnect();
  };
  osc.start(t);
  osc.stop(end + 0.02);
}

const logPlayFailure = (url: string) => (error: unknown) => {
  // A pause() before play() settled: expected when sound is turned off at once.
  if (error instanceof DOMException && error.name === 'AbortError') return;
  // The browser's autoplay policy, not a defect: the next start (a gesture, the toggle) retries.
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    console.warn(`Ambient music is waiting for a user gesture (${url}).`, error);
    return;
  }
  console.error(`Ambient music could not play (${url}); the ambience continues.`, error);
};

/**
 * The ambient sound as a WebAudio graph:
 *
 *   music <audio> → MediaElementSource → music gain (ducking) ┐
 *   rumble + bubbles (synthesized) → ambience gain ───────────┤→ depth low-pass → master → out
 *   narrator babble blips → voice gain ──────────────────────────────────────────┤
 *   pop / whoosh / plip → sfx gain ──────────────────────────────────────────────┘
 *
 * The voice and SFX buses skip the depth filter so speech stays crisp on the seabed, and they
 * pass through the master, so they fade with it and fall silent when sound is off.
 *
 * Nothing is created until the first `start()`: no AudioContext at import or render, and no
 * music request before the visitor wants sound (`preload="none"`). A music bed that is missing,
 * unplayable or fails to load is logged and the ambience keeps playing; no method throws.
 */
export function createAudioEngine({
  music,
  ambience,
  mix = AUDIO_MIX,
  createContext = () => new AudioContext(),
  createElement = () => document.createElement('audio'),
  random = Math.random,
}: AudioEngineOptions): AudioEngine {
  let graph: Graph | null = null;
  let disposed = false;
  let running = false;
  let depth = 0;
  let ducked = false;
  let bubbleTimer: ReturnType<typeof setTimeout> | null = null;
  let suspendTimer: ReturnType<typeof setTimeout> | null = null;

  const clearBubbles = () => {
    if (bubbleTimer !== null) clearTimeout(bubbleTimer);
    bubbleTimer = null;
  };
  const clearSuspend = () => {
    if (suspendTimer !== null) clearTimeout(suspendTimer);
    suspendTimer = null;
  };

  let sounding = 0;
  let noise: AudioBuffer | null = null;

  /**
   * Plays a one-shot sound while running, within the `maxSfxVoices` cap. Never builds the graph
   * (no AudioContext from a sound effect), and never throws: a synth failure is logged.
   */
  const oneShot = (play: (graph: Graph, done: SoundDone) => void) => {
    if (!running || !graph || sounding >= mix.maxSfxVoices) return;
    sounding += 1;
    let released = false;
    const done = () => {
      if (released) return;
      released = true;
      sounding = Math.max(0, sounding - 1);
    };
    try {
      play(graph, done);
    } catch (error) {
      done();
      console.error('A sound effect could not play.', error);
    }
  };

  const scheduleBubble = (context: AudioContext, out: AudioNode) => {
    bubbleTimer = setTimeout(() => {
      blip(context, out, random());
      scheduleBubble(context, out);
    }, nextBubbleDelayS(random()) * 1000);
  };

  const connectMusic = (context: AudioContext, out: AudioNode): HTMLAudioElement | null => {
    if (!music || music.length === 0) return null;
    const element = createElement();
    const source = pickMusicSource(music, (type) => element.canPlayType(type));
    if (!source) {
      console.error(
        `Ambient music: this browser plays none of ${music.map((s) => s.type).join(', ')}; ` +
          'the ambience continues.',
      );
      return null;
    }
    element.preload = 'none';
    element.loop = true;
    element.addEventListener('error', () =>
      console.error(
        `Ambient music failed to load (${source.url}); the ambience continues.`,
        element.error,
      ),
    );
    element.src = source.url;
    context.createMediaElementSource(element).connect(out);
    return element;
  };

  const build = (): Graph | null => {
    try {
      const context = createContext();
      const master = context.createGain();
      master.gain.value = 0;
      master.connect(context.destination);
      const depthFilter = context.createBiquadFilter();
      depthFilter.type = 'lowpass';
      depthFilter.frequency.value = lowpassCutoffHz(depth, mix);
      depthFilter.connect(master);

      const musicGain = context.createGain();
      musicGain.gain.value = musicGainFor(ducked, mix);
      musicGain.connect(depthFilter);
      let element: HTMLAudioElement | null = null;
      try {
        element = connectMusic(context, musicGain);
      } catch (error) {
        console.error('Ambient music could not be set up; the ambience continues.', error);
      }

      let ambienceGain: GainNode | null = null;
      let loops: AudioScheduledSourceNode[] = [];
      if (ambience) {
        ambienceGain = context.createGain();
        ambienceGain.gain.value = mix.ambienceGain;
        ambienceGain.connect(depthFilter);
        loops = startRumble(context, ambienceGain, random);
      }

      const voices = context.createGain();
      voices.gain.value = mix.voiceGain;
      voices.connect(master);
      const sfx = context.createGain();
      sfx.gain.value = mix.sfxGain;
      sfx.connect(master);
      return {
        context,
        master,
        depthFilter,
        music: musicGain,
        ambience: ambienceGain,
        voices,
        sfx,
        element,
        loops,
      };
    } catch (error) {
      console.error('Ambient sound is unavailable: the audio graph could not be created.', error);
      return null;
    }
  };

  const start = () => {
    if (disposed || running) return;
    graph ??= build();
    if (!graph) return;
    running = true;
    // Sounds cut off by a suspend may never report their end: do not let them hold the cap.
    sounding = 0;
    clearSuspend();
    const { context, master, ambience: ambienceGain, element } = graph;
    void Promise.resolve(context.resume()).catch((error: unknown) =>
      console.error('Ambient sound could not resume.', error),
    );
    glide(master.gain, mix.masterGain, context.currentTime, mix.fadeInS);
    if (element) {
      const url = element.currentSrc || element.src;
      try {
        void Promise.resolve(element.play()).catch(logPlayFailure(url));
      } catch (error) {
        logPlayFailure(url)(error);
      }
    }
    if (ambienceGain && bubbleTimer === null) scheduleBubble(context, ambienceGain);
  };

  const stop = () => {
    if (!running || !graph) return;
    running = false;
    clearBubbles();
    const { context, master, element } = graph;
    glide(master.gain, 0, context.currentTime, mix.fadeOutS);
    clearSuspend();
    suspendTimer = setTimeout(() => {
      suspendTimer = null;
      element?.pause();
      void Promise.resolve(context.suspend()).catch(() => undefined);
    }, mix.fadeOutS * 1000);
  };

  return {
    start,
    stop,
    setDepth(depth01) {
      depth = depth01;
      if (graph) {
        glide(
          graph.depthFilter.frequency,
          lowpassCutoffHz(depth01, mix),
          graph.context.currentTime,
          mix.depthGlideS,
        );
      }
    },
    setDucked(next) {
      if (next === ducked) return;
      ducked = next;
      if (graph) {
        glide(
          graph.music.gain,
          musicGainFor(next, mix),
          graph.context.currentTime,
          next ? mix.duckAttackS : mix.duckReleaseS,
        );
      }
    },
    blip(profile, char, delayS = 0) {
      oneShot(({ context, voices }, done) =>
        synthBlip(context, voices, profile, voicePitchHz(profile, char), delayS, done),
      );
    },
    pop() {
      oneShot(({ context, sfx }, done) => synthTone(context, sfx, UI_SFX.pop, done));
    },
    plip() {
      oneShot(({ context, sfx }, done) => synthTone(context, sfx, UI_SFX.plip, done));
    },
    whoosh() {
      oneShot(({ context, sfx }, done) => {
        noise ??= noiseBuffer(context, random);
        synthNoise(context, sfx, UI_SFX.whoosh, noise, done);
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      running = false;
      noise = null;
      clearBubbles();
      clearSuspend();
      if (!graph) return;
      const { context, element, loops } = graph;
      graph = null;
      for (const loop of loops) {
        try {
          loop.stop();
        } catch {
          // Already stopped: nothing to release.
        }
      }
      if (element) {
        element.pause();
        element.removeAttribute('src');
      }
      void Promise.resolve(context.close()).catch(() => undefined);
    },
  };
}
