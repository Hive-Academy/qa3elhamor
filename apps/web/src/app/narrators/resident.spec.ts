import { describe, expect, it } from 'vitest';
import {
  RESIDENT_HIDE_BEYOND,
  RESIDENT_SHOW_WITHIN,
  RESIDENT_WAVE_COOLDOWN,
  RESIDENT_WAVE_SECONDS,
  RESIDENT_WAVE_WITHIN,
  createResidentState,
  stepResident,
} from './resident';

const STOP = 8;
const at = (k: number): number => k * STOP;

describe('stepResident', () => {
  it('shows within reach, and only goes beyond a wider one (no flicker at the edge)', () => {
    const state = createResidentState();
    expect(stepResident(state, at(RESIDENT_SHOW_WITHIN + 0.5), STOP, 0.016).shown).toBe(false);
    expect(stepResident(state, at(RESIDENT_SHOW_WITHIN - 0.1), STOP, 0.016).shown).toBe(true);
    expect(stepResident(state, at(RESIDENT_HIDE_BEYOND - 0.1), STOP, 0.016).shown).toBe(true);
    expect(stepResident(state, at(RESIDENT_HIDE_BEYOND + 0.1), STOP, 0.016).shown).toBe(false);
  });

  it('waves once as the camera passes close, for a while', () => {
    const state = createResidentState();
    stepResident(state, at(3), STOP, 0.016);
    expect(stepResident(state, at(RESIDENT_WAVE_WITHIN - 0.1), STOP, 0.016).waving).toBe(true);
    expect(stepResident(state, at(1), STOP, RESIDENT_WAVE_SECONDS / 2).waving).toBe(true);
    expect(stepResident(state, at(1), STOP, RESIDENT_WAVE_SECONDS).waving).toBe(false);
    // Lingering close does not wave again.
    expect(stepResident(state, at(1), STOP, RESIDENT_WAVE_COOLDOWN * 2).waving).toBe(false);
  });

  it('waves again on the next approach, but not within the cooldown', () => {
    const state = createResidentState();
    stepResident(state, at(3), STOP, 0.016);
    stepResident(state, at(1), STOP, 0.016);
    stepResident(state, at(3), STOP, 1);
    expect(stepResident(state, at(1), STOP, 0.016).waving).toBe(true);
    stepResident(state, at(3), STOP, RESIDENT_WAVE_SECONDS);
    expect(stepResident(state, at(1), STOP, 0.016).waving).toBe(false);
    stepResident(state, at(3), STOP, RESIDENT_WAVE_COOLDOWN);
    expect(stepResident(state, at(1), STOP, 0.016).waving).toBe(true);
  });

  it('keeps its state for an unknown distance, and shows nothing for a broken stop', () => {
    const state = createResidentState();
    stepResident(state, at(2), STOP, 0.016);
    expect(stepResident(state, Number.NaN, STOP, 0.016).shown).toBe(true);
    expect(stepResident(state, at(2), 0, 0.016)).toEqual({ shown: false, waving: false });
    expect(stepResident(state, at(2), Number.NaN, Number.NaN)).toEqual({ shown: false, waving: false });
  });
});
