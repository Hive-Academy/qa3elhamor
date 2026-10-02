/**
 * The narrators' synthesized voices as data: each blip is one short oscillator tone through a
 * filter, its pitch set per character (`voicePitchHz`). The WebAudio shell
 * (`@qa3elhamor/world-audio`) turns a profile into nodes; nothing here touches audio.
 */
export type VoiceWaveform = 'sine' | 'triangle' | 'square' | 'sawtooth';

export type VoiceProfileId =
  | 'spongebob'
  | 'patrick'
  | 'hamour'
  | 'sardine-president'
  | 'crab-clerk'
  | 'default';

export interface VoiceProfile {
  readonly id: VoiceProfileId;
  /** The voice's centre pitch, in Hz. */
  readonly baseHz: number;
  /** How far a character's pitch strays from `baseHz`, in semitones either way. */
  readonly jitterSemitones: number;
  readonly waveform: VoiceWaveform;
  /** One blip's length, attack to silence, in seconds. */
  readonly blipS: number;
  /** Where the pitch ends, as a ratio of where it starts: below 1 glides down, above 1 up. */
  readonly glide: number;
  /** `lowpass` softens; `bandpass` makes a narrow, nasal or gurgly formant. */
  readonly filter: 'lowpass' | 'bandpass';
  readonly filterHz: number;
  /** The filter's resonance: higher is more pronounced (and more "wet" on a bandpass). */
  readonly filterQ: number;
  /** Vibrato rate in Hz; 0 for none. */
  readonly vibratoHz: number;
  /** Vibrato depth, in semitones. */
  readonly vibratoSemitones: number;
  /** The blip's peak level (linear), before the voice bus. Bright waveforms need less. */
  readonly gain: number;
  /** One blip per this many letters: 2 is chatty, 3 is slower. Never machine-gun. */
  readonly blipEvery: number;
}

export const VOICE_PROFILES: Readonly<Record<VoiceProfileId, VoiceProfile>> = {
  // High, bright and quick, with a little upward squeak at the end of each blip.
  spongebob: {
    id: 'spongebob',
    baseHz: 540,
    jitterSemitones: 4,
    waveform: 'square',
    blipS: 0.05,
    glide: 1.18,
    filter: 'lowpass',
    filterHz: 3_400,
    filterQ: 3,
    vibratoHz: 0,
    vibratoSemitones: 0,
    gain: 0.16,
    blipEvery: 2,
  },
  // Low, slow and dopey: soft triangle tones that sag a little.
  patrick: {
    id: 'patrick',
    baseHz: 140,
    jitterSemitones: 2,
    waveform: 'triangle',
    blipS: 0.11,
    glide: 0.88,
    filter: 'lowpass',
    filterHz: 900,
    filterQ: 0.7,
    vibratoHz: 0,
    vibratoSemitones: 0,
    gain: 0.5,
    blipEvery: 3,
  },
  // Bubbly and gurgly: each blip glides well down, its overtones sweeping across a resonant
  // low-pass ("bwoop"), with a fast watery wobble.
  hamour: {
    id: 'hamour',
    baseHz: 320,
    jitterSemitones: 3,
    waveform: 'triangle',
    blipS: 0.08,
    glide: 0.6,
    filter: 'lowpass',
    filterHz: 950,
    filterQ: 8,
    vibratoHz: 16,
    vibratoSemitones: 1,
    // The resonance lifts the overtones near the cutoff by several dB: keep the source low.
    gain: 0.28,
    blipEvery: 2,
  },
  // Pompous mid voice: a reedy sawtooth, steady, with a slow statesmanlike vibrato.
  'sardine-president': {
    id: 'sardine-president',
    baseHz: 200,
    jitterSemitones: 2.5,
    waveform: 'sawtooth',
    blipS: 0.09,
    glide: 0.96,
    filter: 'lowpass',
    filterHz: 1_500,
    filterQ: 1.5,
    vibratoHz: 6,
    vibratoSemitones: 0.6,
    gain: 0.18,
    blipEvery: 3,
  },
  // Clicky and nasal: very short square ticks through a narrow band.
  'crab-clerk': {
    id: 'crab-clerk',
    baseHz: 380,
    jitterSemitones: 5,
    waveform: 'square',
    blipS: 0.032,
    glide: 1.04,
    filter: 'bandpass',
    filterHz: 1_600,
    filterQ: 3,
    vibratoHz: 0,
    vibratoSemitones: 0,
    gain: 0.32,
    blipEvery: 2,
  },
  default: {
    id: 'default',
    baseHz: 300,
    jitterSemitones: 3,
    waveform: 'triangle',
    blipS: 0.06,
    glide: 1,
    filter: 'lowpass',
    filterHz: 2_000,
    filterQ: 1,
    vibratoHz: 0,
    vibratoSemitones: 0,
    gain: 0.35,
    blipEvery: 2,
  },
};

export const isVoiceProfileId = (value: unknown): value is VoiceProfileId =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(VOICE_PROFILES, value);

/** The profile for an id, or the `default` voice for anything unknown (or none). */
export const voiceProfileFor = (id: string | null | undefined): VoiceProfile =>
  isVoiceProfileId(id) ? VOICE_PROFILES[id] : VOICE_PROFILES.default;
