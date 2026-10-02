import { describe, expect, it } from 'vitest';
import {
  AMBIENCE,
  AUDIO_MIX,
  bubbleChirp,
  dbToGain,
  glideTimeConstant,
  lowpassCutoffHz,
  musicGainFor,
  nextBubbleDelayS,
} from './audio-mix.js';

describe('audio mix', () => {
  it('converts decibels to gain', () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-20)).toBeCloseTo(0.1, 10);
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
  });

  it('ducks the music by the configured dB while a narrator talks', () => {
    expect(musicGainFor(false)).toBe(AUDIO_MIX.musicGain);
    const ratio = musicGainFor(true) / musicGainFor(false);
    expect(20 * Math.log10(ratio)).toBeCloseTo(AUDIO_MIX.duckDb, 6);
    expect(AUDIO_MIX.duckDb).toBeLessThan(0);
  });

  it('keeps the fades and the ducking smooth', () => {
    expect(AUDIO_MIX.fadeInS).toBeGreaterThan(AUDIO_MIX.fadeOutS);
    expect(AUDIO_MIX.duckReleaseS).toBeGreaterThan(AUDIO_MIX.duckAttackS);
    expect(glideTimeConstant(1.5)).toBeCloseTo(0.5, 10);
    expect(glideTimeConstant(0)).toBeGreaterThan(0);
  });

  it('opens the filter at the surface and muffles it on the seabed', () => {
    expect(lowpassCutoffHz(0)).toBeCloseTo(AUDIO_MIX.surfaceCutoffHz, 6);
    expect(lowpassCutoffHz(1)).toBeCloseTo(AUDIO_MIX.floorCutoffHz, 6);
  });

  it('maps depth to cutoff exponentially, monotonically and clamped', () => {
    const mid = lowpassCutoffHz(0.5);
    expect(mid).toBeCloseTo(Math.sqrt(AUDIO_MIX.surfaceCutoffHz * AUDIO_MIX.floorCutoffHz), 6);
    let previous = Infinity;
    for (let i = 0; i <= 10; i++) {
      const cutoff = lowpassCutoffHz(i / 10);
      expect(cutoff).toBeLessThan(previous);
      previous = cutoff;
    }
    expect(lowpassCutoffHz(-1)).toBe(lowpassCutoffHz(0));
    expect(lowpassCutoffHz(2)).toBe(lowpassCutoffHz(1));
    expect(lowpassCutoffHz(Number.NaN)).toBe(lowpassCutoffHz(0));
  });
});

describe('ambience plan', () => {
  it('spaces bubbles 0.6 to 3 seconds apart', () => {
    expect(nextBubbleDelayS(0)).toBe(AMBIENCE.bubbleMinGapS);
    expect(nextBubbleDelayS(0.999999)).toBeLessThanOrEqual(AMBIENCE.bubbleMaxGapS);
    expect(nextBubbleDelayS(0.5)).toBeGreaterThan(AMBIENCE.bubbleMinGapS);
  });

  it('makes each bubble a short, quiet chirp rising in pitch', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.99]) {
      const chirp = bubbleChirp(r);
      expect(chirp.endHz).toBeGreaterThan(chirp.startHz);
      expect(chirp.durationS).toBeGreaterThan(0);
      expect(chirp.durationS).toBeLessThanOrEqual(0.12);
      expect(chirp.gain).toBeGreaterThan(0);
      expect(chirp.gain).toBeLessThanOrEqual(AMBIENCE.bubbleGain);
    }
  });
});
