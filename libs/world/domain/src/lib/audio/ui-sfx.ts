import type { VoiceWaveform } from './voice-profiles.js';

/** A pitched UI sound: one oscillator sweeping from `startHz` to `endHz`. */
export interface ToneSfx {
  readonly kind: 'tone';
  readonly waveform: VoiceWaveform;
  readonly startHz: number;
  readonly endHz: number;
  readonly attackS: number;
  readonly durationS: number;
  /** Peak level (linear), before the SFX bus. */
  readonly gain: number;
}

/** A breathy UI sound: noise through a band-pass that sweeps up to `peakHz` and back down. */
export interface NoiseSfx {
  readonly kind: 'noise';
  readonly startHz: number;
  readonly peakHz: number;
  readonly endHz: number;
  readonly q: number;
  readonly attackS: number;
  readonly durationS: number;
  readonly gain: number;
}

export type UiSfxId = 'pop' | 'whoosh' | 'plip';

/** The small interface sounds, as data. Soft, short, never startling. */
export const UI_SFX: {
  /** A speech bubble appears: a round bubble pop, rising fast. */
  readonly pop: ToneSfx;
  /** A landmark opens or closes: a soft swish of water. */
  readonly whoosh: NoiseSfx;
  /** A button or "Next": a light droplet, falling a little. */
  readonly plip: ToneSfx;
} = {
  pop: {
    kind: 'tone',
    waveform: 'sine',
    startHz: 420,
    endHz: 1_250,
    attackS: 0.004,
    durationS: 0.09,
    gain: 0.5,
  },
  whoosh: {
    kind: 'noise',
    startHz: 300,
    peakHz: 1_800,
    endHz: 500,
    q: 1.2,
    attackS: 0.12,
    durationS: 0.5,
    gain: 0.6,
  },
  plip: {
    kind: 'tone',
    waveform: 'sine',
    startHz: 1_400,
    endHz: 950,
    attackS: 0.003,
    durationS: 0.06,
    gain: 0.3,
  },
};
