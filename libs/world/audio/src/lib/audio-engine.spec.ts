import {
  AUDIO_MIX,
  VOICE_PROFILES,
  glideTimeConstant,
  lowpassCutoffHz,
  musicGainFor,
  voicePitchHz,
} from '@qa3elhamor/world-domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudioEngine, pickMusicSource, type AudioSource } from './audio-engine.js';

/* A recording stand-in for the slice of Web Audio the engine uses. */

class FakeParam {
  value: number;
  readonly targets: { value: number; at: number; constant: number }[] = [];
  readonly cancelled: number[] = [];
  constructor(value = 1) {
    this.value = value;
  }
  setValueAtTime(value: number) {
    this.value = value;
    return this;
  }
  setTargetAtTime(value: number, at: number, constant: number) {
    this.targets.push({ value, at, constant });
    return this;
  }
  cancelScheduledValues(at: number) {
    this.cancelled.push(at);
    return this;
  }
  linearRampToValueAtTime() {
    return this;
  }
  exponentialRampToValueAtTime() {
    return this;
  }
  get lastTarget() {
    return this.targets.at(-1)?.value;
  }
}

class FakeNode {
  readonly connections: unknown[] = [];
  connect(destination: unknown) {
    this.connections.push(destination);
    return destination;
  }
  disconnect() {
    this.connections.length = 0;
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1);
}

class FakeFilter extends FakeNode {
  type = 'lowpass';
  readonly frequency = new FakeParam(350);
  readonly Q = new FakeParam(1);
}

class FakeSource extends FakeNode {
  started = 0;
  stopped = 0;
  buffer: unknown = null;
  loop = false;
  type = 'sine';
  onended: (() => void) | null = null;
  readonly frequency = new FakeParam(440);
  start() {
    this.started += 1;
  }
  stop() {
    this.stopped += 1;
  }
}

class FakeContext {
  readonly sampleRate = 100;
  currentTime = 0;
  state = 'suspended';
  readonly destination = new FakeNode();
  readonly gains: FakeGain[] = [];
  readonly filters: FakeFilter[] = [];
  readonly sources: FakeSource[] = [];
  readonly mediaSources: { element: unknown; node: FakeNode }[] = [];
  readonly resume = vi.fn(async () => {
    this.state = 'running';
  });
  readonly suspend = vi.fn(async () => {
    this.state = 'suspended';
  });
  readonly close = vi.fn(async () => {
    this.state = 'closed';
  });
  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
  createBiquadFilter() {
    const filter = new FakeFilter();
    this.filters.push(filter);
    return filter;
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  createOscillator() {
    return this.createBufferSource();
  }
  createMediaElementSource(element: unknown) {
    const node = new FakeNode();
    this.mediaSources.push({ element, node });
    return node;
  }
}

const OPUS: AudioSource = { url: '/audio/bed.opus', type: 'audio/ogg; codecs=opus' };
const AAC: AudioSource = { url: '/audio/bed.m4a', type: 'audio/mp4' };

function fakeElement(playable: readonly string[] = [OPUS.type, AAC.type]) {
  const element = document.createElement('audio');
  vi.spyOn(element, 'canPlayType').mockImplementation((type) =>
    playable.includes(type) ? 'maybe' : '',
  );
  const play = vi.spyOn(element, 'play').mockResolvedValue(undefined);
  const pause = vi.spyOn(element, 'pause').mockImplementation(() => undefined);
  return { element, play, pause };
}

function setup({
  music = [OPUS, AAC] as readonly AudioSource[] | null,
  ambience = true,
  playable = [OPUS.type, AAC.type] as readonly string[],
} = {}) {
  const context = new FakeContext();
  const createContext = vi.fn(() => context as unknown as AudioContext);
  const media = fakeElement(playable);
  const createElement = vi.fn(() => media.element);
  const engine = createAudioEngine({
    music,
    ambience,
    createContext,
    createElement,
    random: () => 0.5,
  });
  // Graph order: master, music gain, [ambience gain, rumble level, rumble swell].
  const master = () => context.gains[0];
  const musicGain = () => context.gains[1];
  const depthFilter = () => context.filters[0];
  return { engine, context, createContext, createElement, media, master, musicGain, depthFilter };
}

describe('pickMusicSource', () => {
  it('takes the first source the browser can play: Opus first, AAC as the fallback', () => {
    expect(pickMusicSource([OPUS, AAC], () => 'maybe')).toBe(OPUS);
    expect(pickMusicSource([OPUS, AAC], (type) => (type === AAC.type ? 'probably' : ''))).toBe(AAC);
    expect(pickMusicSource([OPUS, AAC], () => '')).toBeNull();
  });
});

describe('createAudioEngine', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('creates no context and no element before the first start', () => {
    const { engine, createContext, createElement } = setup();
    engine.setDepth(0.5);
    engine.setDucked(true);
    engine.stop();
    expect(createContext).not.toHaveBeenCalled();
    expect(createElement).not.toHaveBeenCalled();
  });

  it('builds the graph once, at the first start, and fades in from silence', () => {
    const { engine, context, createContext, media, master } = setup();
    engine.start();
    engine.start();

    expect(createContext).toHaveBeenCalledTimes(1);
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(master()?.connections).toContain(context.destination);
    expect(master()?.gain.targets).toEqual([
      { value: AUDIO_MIX.masterGain, at: 0, constant: glideTimeConstant(AUDIO_MIX.fadeInS) },
    ]);
    expect(media.play).toHaveBeenCalledTimes(1);
  });

  it('loads the music lazily, looping, from the first playable source', () => {
    const { engine, context, media } = setup({ playable: [AAC.type] });
    engine.start();
    expect(media.element.preload).toBe('none');
    expect(media.element.loop).toBe(true);
    expect(media.element.src).toContain(AAC.url);
    expect(context.mediaSources).toHaveLength(1);
  });

  it('keeps the ambience playing when no music source is playable, and says why', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { engine, context, media } = setup({ playable: [] });
    engine.start();
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/plays none of/));
    expect(media.play).not.toHaveBeenCalled();
    expect(context.mediaSources).toHaveLength(0);
    // Rumble noise and its LFO are running.
    expect(context.sources.filter((s) => s.started > 0)).toHaveLength(2);
  });

  it('logs a music load failure without throwing, and the ambience goes on', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { engine, context, media } = setup();
    engine.start();
    media.element.dispatchEvent(new Event('error'));
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/failed to load/), media.element.error);
    expect(context.sources.filter((s) => s.started > 0)).toHaveLength(2);
  });

  it('logs a rejected play() and does not throw', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { engine, media } = setup();
    media.play.mockRejectedValue(new Error('decode failed'));
    expect(() => engine.start()).not.toThrow();
    await vi.waitFor(() => expect(log).toHaveBeenCalled());
  });

  it('treats an autoplay refusal as a warning, not an error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { engine, media } = setup();
    media.play.mockRejectedValue(new DOMException('no gesture', 'NotAllowedError'));
    engine.start();
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    expect(error).not.toHaveBeenCalled();
  });

  it('plays music only when configured without ambience', () => {
    const { engine, context } = setup({ ambience: false });
    engine.start();
    expect(context.sources).toHaveLength(0);
    expect(context.mediaSources).toHaveLength(1);
  });

  it('reports an unavailable audio graph instead of throwing', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const engine = createAudioEngine({
      music: null,
      ambience: true,
      createContext: () => {
        throw new Error('no audio device');
      },
    });
    expect(() => engine.start()).not.toThrow();
    expect(log).toHaveBeenCalled();
  });

  it('schedules sparse bubbles while running and none after stopping', () => {
    const { engine, context } = setup({ music: null });
    engine.start();
    const before = context.sources.length;
    vi.advanceTimersByTime(10_000);
    const bubbles = context.sources.length - before;
    expect(bubbles).toBeGreaterThan(0);
    // 0.5 → 1.8 s apart: never more than one bubble per 0.6 s.
    expect(bubbles).toBeLessThanOrEqual(10_000 / 600);

    engine.stop();
    const stopped = context.sources.length;
    vi.advanceTimersByTime(10_000);
    expect(context.sources.length).toBe(stopped);
  });

  it('fades out on stop, then pauses the music and suspends the context', () => {
    const { engine, context, media, master } = setup();
    engine.start();
    engine.stop();
    expect(master()?.gain.lastTarget).toBe(0);
    expect(master()?.gain.targets.at(-1)?.constant).toBe(glideTimeConstant(AUDIO_MIX.fadeOutS));
    expect(context.suspend).not.toHaveBeenCalled();

    vi.advanceTimersByTime(AUDIO_MIX.fadeOutS * 1000);
    expect(media.pause).toHaveBeenCalled();
    expect(context.suspend).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending suspend when started again during the fade out', () => {
    const { engine, context, master } = setup();
    engine.start();
    engine.stop();
    engine.start();
    vi.advanceTimersByTime(5_000);
    expect(context.suspend).not.toHaveBeenCalled();
    expect(master()?.gain.lastTarget).toBe(AUDIO_MIX.masterGain);
  });

  it('applies the depth and ducking set before the first start', () => {
    const { engine, depthFilter, musicGain } = setup();
    engine.setDepth(1);
    engine.setDucked(true);
    engine.start();
    expect(depthFilter()?.frequency.value).toBeCloseTo(lowpassCutoffHz(1), 6);
    expect(musicGain()?.gain.value).toBeCloseTo(musicGainFor(true), 6);
  });

  it('glides the depth filter and ducks smoothly, with a slower release', () => {
    const { engine, depthFilter, musicGain } = setup();
    engine.start();
    engine.setDepth(0.5);
    expect(depthFilter()?.frequency.lastTarget).toBeCloseTo(lowpassCutoffHz(0.5), 6);

    engine.setDucked(true);
    expect(musicGain()?.gain.targets.at(-1)).toEqual({
      value: musicGainFor(true),
      at: 0,
      constant: glideTimeConstant(AUDIO_MIX.duckAttackS),
    });
    engine.setDucked(false);
    expect(musicGain()?.gain.targets.at(-1)).toEqual({
      value: musicGainFor(false),
      at: 0,
      constant: glideTimeConstant(AUDIO_MIX.duckReleaseS),
    });
    // Every change starts from the current value: no jumps.
    expect(musicGain()?.gain.cancelled).toHaveLength(2);
  });

  describe('voices and UI sounds', () => {
    // Without music or ambience the graph is: master, music gain, voice bus, SFX bus.
    const sfxSetup = () => {
      const s = setup({ music: null, ambience: false });
      return { ...s, voiceBus: () => s.context.gains[2], sfxBus: () => s.context.gains[3] };
    };
    const playAll = (engine: ReturnType<typeof setup>['engine']) => {
      engine.blip(VOICE_PROFILES.spongebob, 'a');
      engine.pop();
      engine.whoosh();
      engine.plip();
    };

    it('creates nothing before the first start: a sound effect never builds the graph', () => {
      const { engine, createContext } = sfxSetup();
      playAll(engine);
      expect(createContext).not.toHaveBeenCalled();
    });

    it('routes voices and SFX to the master, around the depth filter', () => {
      const { engine, master, voiceBus, sfxBus, depthFilter } = sfxSetup();
      engine.start();
      expect(voiceBus()?.connections).toEqual([master()]);
      expect(sfxBus()?.connections).toEqual([master()]);
      expect(voiceBus()?.gain.value).toBe(AUDIO_MIX.voiceGain);
      expect(sfxBus()?.gain.value).toBe(AUDIO_MIX.sfxGain);
      expect(depthFilter()?.connections).toEqual([master()]);
    });

    it('plays a blip through the profile filter on the voice bus, from silence, at the char pitch', () => {
      const { engine, context, voiceBus } = sfxSetup();
      engine.start();
      const profile = VOICE_PROFILES.spongebob;
      engine.blip(profile, 'k');
      const [osc] = context.sources;
      expect(osc?.type).toBe(profile.waveform);
      expect(osc?.started).toBe(1);
      expect(osc?.stopped).toBe(1);
      const filter = context.filters.at(-1);
      expect(filter?.type).toBe(profile.filter);
      expect(filter?.Q.value).toBe(profile.filterQ);
      const level = context.gains.at(-1);
      expect(level?.connections).toEqual([voiceBus()]);
      // The envelope starts at near-silence: no click.
      expect(level?.gain.value).toBeLessThan(0.001);
      expect(osc?.frequency.value).toBeCloseTo(voicePitchHz(profile, 'k'), 6);
    });

    it('adds a vibrato oscillator for a voice that has one', () => {
      const { engine, context } = sfxSetup();
      engine.start();
      engine.blip(VOICE_PROFILES['sardine-president'], 'a');
      expect(context.sources).toHaveLength(2);
      expect(context.sources.every((s) => s.started === 1 && s.stopped === 1)).toBe(true);
    });

    it('plays pop, plip and whoosh on the SFX bus, reusing one noise buffer', () => {
      const { engine, context, sfxBus } = sfxSetup();
      engine.start();
      engine.pop();
      engine.plip();
      engine.whoosh();
      engine.whoosh();
      expect(context.sources).toHaveLength(4);
      const toSfx = context.gains.filter((g) => g.connections.includes(sfxBus()));
      expect(toSfx).toHaveLength(4);
      const [, , first, second] = context.sources;
      expect(first?.buffer).not.toBeNull();
      expect(second?.buffer).toBe(first?.buffer);
    });

    it('caps concurrent sounds, and frees a slot when one ends', () => {
      const { engine, context } = sfxSetup();
      engine.start();
      for (let i = 0; i < AUDIO_MIX.maxSfxVoices + 4; i++) engine.plip();
      expect(context.sources).toHaveLength(AUDIO_MIX.maxSfxVoices);

      const first = context.sources[0];
      first?.onended?.();
      expect(first?.connections).toHaveLength(0);
      engine.plip();
      expect(context.sources).toHaveLength(AUDIO_MIX.maxSfxVoices + 1);
    });

    it('is silent while stopped and after dispose', () => {
      const { engine, context } = sfxSetup();
      engine.start();
      engine.stop();
      playAll(engine);
      expect(context.sources).toHaveLength(0);
      engine.start();
      engine.dispose();
      playAll(engine);
      expect(context.sources).toHaveLength(0);
    });
  });

  it('disposes everything: loops stopped, music released, context closed, start inert', () => {
    const { engine, context, createContext, media } = setup();
    engine.start();
    engine.dispose();
    expect(context.sources.every((s) => s.stopped > 0)).toBe(true);
    expect(media.pause).toHaveBeenCalled();
    expect(media.element.hasAttribute('src')).toBe(false);
    expect(context.close).toHaveBeenCalledTimes(1);

    engine.start();
    engine.dispose();
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(context.close).toHaveBeenCalledTimes(1);
  });
});
