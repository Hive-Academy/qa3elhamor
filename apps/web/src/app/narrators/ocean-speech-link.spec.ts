import { describe, expect, it, vi } from 'vitest';
import {
  OCEAN_SPEECH_MIN_PX,
  createOceanSpeechLink,
  departingOpacity,
  oceanSpeechBoxPx,
  oceanSpeechWrapPx,
  oceanTailSide,
  popScale,
  type OceanSpeechLine,
} from './ocean-speech-link';

const LINE: OceanSpeechLine = {
  text: 'Hello there',
  typed: 3,
  speaker: 'The Hamour',
  departing: false,
  lingerSeconds: 1.6,
  dir: 'ltr',
};

describe('the speech bubble and its twin in the water', () => {
  it('passes a line on, telling listeners only when it changes', () => {
    const link = createOceanSpeechLink({ current: null });
    const listener = vi.fn();
    link.subscribe(listener);
    link.set(LINE);
    link.set({ ...LINE });
    expect(listener).toHaveBeenCalledTimes(1);
    link.set({ ...LINE, typed: 4 });
    expect(link.get()?.typed).toBe(4);
    link.set(null);
    expect(link.get()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('wraps at the DOM bubble width, and sizes the box to the text within bounds', () => {
    expect(oceanSpeechWrapPx(1440)).toBe(440);
    expect(oceanSpeechWrapPx(390)).toBe(326);
    expect(oceanSpeechBoxPx(20, 1440)).toBe(OCEAN_SPEECH_MIN_PX);
    expect(oceanSpeechBoxPx(380, 1440)).toBe(424);
    expect(oceanSpeechBoxPx(2000, 1440)).toBe(480);
  });

  it('points the tail at the side the placement put the narrator on', () => {
    expect(oceanTailSide(40, 400)).toBe('left');
    expect(oceanTailSide(360, 400)).toBe('right');
  });

  it('pops in from 55% with a small overshoot, then holds', () => {
    expect(popScale(0)).toBeCloseTo(0.55);
    expect(Math.max(...[0.1, 0.15, 0.2, 0.25].map(popScale))).toBeGreaterThan(
      1,
    );
    expect(popScale(0.34)).toBeCloseTo(1);
    expect(popScale(5)).toBeCloseTo(1);
  });

  it('lingers whole when departing, then fades out over 0.7 s', () => {
    expect(departingOpacity(1, 1.6)).toBe(1);
    expect(departingOpacity(1.95, 1.6)).toBeCloseTo(0.5);
    expect(departingOpacity(3, 1.6)).toBe(0);
  });
});
