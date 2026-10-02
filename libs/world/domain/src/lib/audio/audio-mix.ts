/**
 * The ambient mix as data: levels, ducking, fades and the depth filter. The WebAudio shell
 * (`@qa3elhamor/world-audio`) only turns these numbers into parameter automation.
 */
export interface AudioMix {
  /** Overall level once faded in (linear gain). */
  readonly masterGain: number;
  /** The music bed's level, before ducking. */
  readonly musicGain: number;
  /** The synthesized ambience (rumble and bubbles). */
  readonly ambienceGain: number;
  /** How far the music drops while a narrator talks, in dB (negative). */
  readonly duckDb: number;
  /** Seconds for the music to settle down when a narrator starts talking. */
  readonly duckAttackS: number;
  /** Seconds for the music to come back after the narrator stops. */
  readonly duckReleaseS: number;
  readonly fadeInS: number;
  readonly fadeOutS: number;
  /** Low-pass cutoff at the surface, in Hz (effectively open). */
  readonly surfaceCutoffHz: number;
  /** Low-pass cutoff on the seabed, in Hz (muffled). */
  readonly floorCutoffHz: number;
  /** Seconds the depth filter takes to follow the dive. */
  readonly depthGlideS: number;
}

export const AUDIO_MIX: AudioMix = {
  masterGain: 0.7,
  musicGain: 0.55,
  ambienceGain: 0.35,
  duckDb: -9,
  duckAttackS: 0.3,
  duckReleaseS: 1.2,
  fadeInS: 1.5,
  fadeOutS: 0.6,
  surfaceCutoffHz: 18_000,
  floorCutoffHz: 1_200,
  depthGlideS: 0.4,
};

const clamp01 = (value: number): number =>
  Number.isNaN(value) || value <= 0 ? 0 : value >= 1 ? 1 : value;

/** Decibels to a linear gain factor: -6 dB is about 0.5. */
export const dbToGain = (db: number): number => 10 ** (db / 20);

/** The music's target level: ducked while a narrator talks. */
export const musicGainFor = (ducked: boolean, mix: AudioMix = AUDIO_MIX): number =>
  mix.musicGain * (ducked ? dbToGain(mix.duckDb) : 1);

/**
 * The depth filter's cutoff for a dive progress in [0, 1] (clamped): exponential between the
 * surface and the seabed, so each stretch of the dive darkens the sound by the same musical
 * interval rather than leaving it bright until the last metres.
 */
export const lowpassCutoffHz = (depth01: number, mix: AudioMix = AUDIO_MIX): number =>
  mix.surfaceCutoffHz * (mix.floorCutoffHz / mix.surfaceCutoffHz) ** clamp01(depth01);

/**
 * The time constant for `AudioParam.setTargetAtTime` that reaches ~95 % of a change in
 * `durationS` (three time constants), so a "1.5 s fade" lasts about 1.5 s.
 */
export const glideTimeConstant = (durationS: number): number => Math.max(durationS, 0.001) / 3;

/** The synthesized ambience: a low rumble under sparse, quiet bubbles. */
export const AMBIENCE = {
  /** Rumble: looped brown noise through a low-pass, its level breathing slowly. */
  rumbleCutoffHz: 300,
  rumbleGain: 0.6,
  /** How far the slow LFO moves the rumble's gain (± linear). */
  rumbleSwell: 0.2,
  rumbleSwellHz: 0.07,
  /** Seconds of noise in the looped buffer. */
  rumbleLoopS: 4,
  /** Seconds between bubbles: random in this range. */
  bubbleMinGapS: 0.6,
  bubbleMaxGapS: 3,
  bubbleGain: 0.05,
} as const;

/** The seconds until the next bubble, for a uniform random number in [0, 1). */
export const nextBubbleDelayS = (random01: number): number =>
  AMBIENCE.bubbleMinGapS + clamp01(random01) * (AMBIENCE.bubbleMaxGapS - AMBIENCE.bubbleMinGapS);

/** One bubble blip: a short sine chirp rising in pitch. */
export interface BubbleChirp {
  readonly startHz: number;
  readonly endHz: number;
  readonly durationS: number;
  readonly gain: number;
}

/** A bubble for a uniform random number in [0, 1): small bubbles are higher, shorter, quieter. */
export function bubbleChirp(random01: number): BubbleChirp {
  const size = 1 - clamp01(random01);
  const startHz = 350 + (1 - size) * 650;
  return {
    startHz,
    endHz: startHz * 2.2,
    durationS: 0.04 + size * 0.08,
    gain: AMBIENCE.bubbleGain * (0.5 + size * 0.5),
  };
}
