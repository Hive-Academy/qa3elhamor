import type { NoiseSfx, ToneSfx, VoiceProfile } from '@qa3elhamor/world-domain';

/**
 * One-shot synthesized sounds: each call builds a few nodes, starts them at `when` and lets them
 * go after their tail (`onended` disconnects them; the browser collects them). Every envelope
 * starts and ends at near-silence with a few milliseconds of attack, so nothing clicks.
 */

const SILENT = 0.0001;
/** Seconds after the envelope reaches silence before the source stops. */
const TAIL_S = 0.02;

/** Called once when a sound's source has ended and its nodes are released. */
export type SoundDone = () => void;

/** A gain envelope: silence → `peak` in `attackS` → silence at `end`. */
function envelope(context: AudioContext, when: number, peak: number, attackS: number, end: number): GainNode {
  const gain = context.createGain();
  gain.gain.setValueAtTime(SILENT, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, SILENT * 2), when + attackS);
  gain.gain.exponentialRampToValueAtTime(SILENT, end);
  return gain;
}

/** Starts `sources` at `when`, stops them at `stopAt`, and releases every node after the first ends. */
function play(
  sources: readonly AudioScheduledSourceNode[],
  nodes: readonly AudioNode[],
  when: number,
  stopAt: number,
  done: SoundDone,
): void {
  const [lead] = sources;
  if (!lead) return;
  lead.onended = () => {
    for (const node of [...sources, ...nodes]) node.disconnect();
    done();
  };
  for (const source of sources) {
    source.start(when);
    source.stop(stopAt);
  }
}

/**
 * A narrator's blip: the profile's waveform at `pitchHz`, gliding by `glide`, through its
 * filter, with optional vibrato. `delayS` after now.
 */
export function synthBlip(
  context: AudioContext,
  out: AudioNode,
  profile: VoiceProfile,
  pitchHz: number,
  delayS: number,
  done: SoundDone,
): void {
  const when = context.currentTime + Math.max(0, delayS);
  const end = when + profile.blipS;
  const attackS = Math.min(0.006, profile.blipS / 4);

  const osc = context.createOscillator();
  osc.type = profile.waveform;
  osc.frequency.setValueAtTime(pitchHz, when);
  if (profile.glide !== 1) osc.frequency.exponentialRampToValueAtTime(pitchHz * profile.glide, end);

  const filter = context.createBiquadFilter();
  filter.type = profile.filter;
  filter.frequency.value = profile.filterHz;
  filter.Q.value = profile.filterQ;
  const level = envelope(context, when, profile.gain, attackS, end);

  osc.connect(filter);
  filter.connect(level);
  level.connect(out);

  const sources: AudioScheduledSourceNode[] = [osc];
  const nodes: AudioNode[] = [filter, level];
  if (profile.vibratoHz > 0 && profile.vibratoSemitones > 0) {
    const lfo = context.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = profile.vibratoHz;
    const depth = context.createGain();
    depth.gain.value = pitchHz * (2 ** (profile.vibratoSemitones / 12) - 1);
    lfo.connect(depth);
    depth.connect(osc.frequency);
    sources.push(lfo);
    nodes.push(depth);
  }
  play(sources, nodes, when, end + TAIL_S, done);
}

/** A pitched UI sound (pop, plip): one oscillator sweeping from `startHz` to `endHz`. */
export function synthTone(context: AudioContext, out: AudioNode, sfx: ToneSfx, done: SoundDone): void {
  const when = context.currentTime;
  const end = when + sfx.durationS;
  const osc = context.createOscillator();
  osc.type = sfx.waveform;
  osc.frequency.setValueAtTime(sfx.startHz, when);
  osc.frequency.exponentialRampToValueAtTime(sfx.endHz, end);
  const level = envelope(context, when, sfx.gain, sfx.attackS, end);
  osc.connect(level);
  level.connect(out);
  play([osc], [level], when, end + TAIL_S, done);
}

/** Seconds of white noise in the shared whoosh buffer. */
export const NOISE_BUFFER_S = 1;

/** White noise for the breathy sounds: built once per context and reused. */
export function noiseBuffer(context: AudioContext, random: () => number): AudioBuffer {
  const length = Math.max(1, Math.floor(context.sampleRate * NOISE_BUFFER_S));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = random() * 2 - 1;
  return buffer;
}

/** A breathy UI sound (whoosh): noise through a band-pass sweeping up to `peakHz` and down. */
export function synthNoise(
  context: AudioContext,
  out: AudioNode,
  sfx: NoiseSfx,
  noise: AudioBuffer,
  done: SoundDone,
): void {
  const when = context.currentTime;
  const end = when + sfx.durationS;
  const source = context.createBufferSource();
  source.buffer = noise;
  source.loop = true;
  const band = context.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = sfx.q;
  band.frequency.setValueAtTime(sfx.startHz, when);
  band.frequency.exponentialRampToValueAtTime(sfx.peakHz, when + sfx.durationS * 0.4);
  band.frequency.exponentialRampToValueAtTime(sfx.endHz, end);
  const level = envelope(context, when, sfx.gain, sfx.attackS, end);
  source.connect(band);
  band.connect(level);
  level.connect(out);
  play([source], [band, level], when, end + TAIL_S, done);
}
