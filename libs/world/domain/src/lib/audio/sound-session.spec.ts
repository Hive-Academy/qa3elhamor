import { describe, expect, it } from 'vitest';
import {
  autoStartAllowed,
  createSoundSession,
  isAudible,
  isSoundOn,
  showsPrompt,
  soundReducer,
  type SoundEvent,
  type SoundSession,
} from './sound-session.js';
import { parseSoundPreference, serializeSoundPreference } from './sound-preference.js';

const run = (session: SoundSession, ...events: SoundEvent[]): SoundSession =>
  events.reduce(soundReducer, session);

const activate: SoundEvent = { type: 'activate' };
const toggle: SoundEvent = { type: 'toggle' };

describe('sound preference', () => {
  it('parses on and off, and reads anything else as unset', () => {
    expect(parseSoundPreference('on')).toBe('on');
    expect(parseSoundPreference('off')).toBe('off');
    for (const raw of [null, undefined, '', 'ON', 'true', '{"sound":1}']) {
      expect(parseSoundPreference(raw)).toBe('unset');
    }
  });

  it('round-trips a choice and never writes unset', () => {
    expect(parseSoundPreference(serializeSoundPreference('on'))).toBe('on');
    expect(parseSoundPreference(serializeSoundPreference('off'))).toBe('off');
    expect(serializeSoundPreference('unset')).toBeNull();
  });
});

describe('autoStartAllowed', () => {
  it('lets only the dive, without reduced motion, start sound by itself', () => {
    expect(autoStartAllowed({ presentation: 'dive', reducedMotion: false })).toBe(true);
    expect(autoStartAllowed({ presentation: 'dive', reducedMotion: true })).toBe(false);
    expect(autoStartAllowed({ presentation: 'page', reducedMotion: false })).toBe(false);
  });
});

describe('sound session', () => {
  it('is silent before any activation, whatever the preference', () => {
    for (const preference of ['on', 'off', 'unset'] as const) {
      expect(isAudible(createSoundSession(preference, true))).toBe(false);
    }
  });

  it('starts an unset preference in the dive at the first activation', () => {
    const before = createSoundSession('unset', true);
    expect(showsPrompt(before)).toBe(true);
    expect(isSoundOn(before)).toBe(false);

    const after = run(before, activate);
    expect(isAudible(after)).toBe(true);
    expect(isSoundOn(after)).toBe(true);
    expect(showsPrompt(after)).toBe(false);
    // Auto-start is not a choice: nothing is persisted.
    expect(after.preference).toBe('unset');
  });

  it('never auto-starts an unset preference on the page view or with reduced motion', () => {
    const session = run(createSoundSession('unset', false), activate);
    expect(isAudible(session)).toBe(false);
    expect(showsPrompt(session)).toBe(true);
  });

  it('starts only from the toggle where auto-start is off, and persists the choice', () => {
    const session = run(createSoundSession('unset', false), activate, toggle);
    expect(session.preference).toBe('on');
    expect(isAudible(session)).toBe(true);
  });

  it('resumes a persisted "on" at the first activation of a later visit', () => {
    const visit = createSoundSession('on', false);
    expect(isSoundOn(visit)).toBe(true);
    expect(isAudible(visit)).toBe(false);
    expect(isAudible(run(visit, activate))).toBe(true);
  });

  it('keeps a persisted "off" silent until the toggle', () => {
    const muted = run(createSoundSession('off', true), activate);
    expect(isAudible(muted)).toBe(false);
    expect(showsPrompt(muted)).toBe(false);
    expect(isAudible(run(muted, toggle))).toBe(true);
  });

  it('turns off what it shows as on: an auto-started sound mutes and persists off', () => {
    const muted = run(createSoundSession('unset', true), activate, toggle);
    expect(muted.preference).toBe('off');
    expect(isAudible(muted)).toBe(false);
  });

  it('turns on from the prompt even before any other activation', () => {
    // An unset preference in the dive is "wanted" but not yet shown as on: the toggle means on.
    const session = run(createSoundSession('unset', true), toggle);
    expect(session.preference).toBe('on');
    expect(isAudible(session)).toBe(true);
  });

  it('suspends while the tab is hidden and resumes when it is visible again', () => {
    const playing = run(createSoundSession('on', true), activate);
    const hidden = run(playing, { type: 'visibility', hidden: true });
    expect(isAudible(hidden)).toBe(false);
    expect(isSoundOn(hidden)).toBe(true);
    expect(isAudible(run(hidden, { type: 'visibility', hidden: false }))).toBe(true);
  });

  it('does not resume on visibility a sound that was not playing', () => {
    const muted = run(createSoundSession('off', true), activate, { type: 'visibility', hidden: true });
    expect(isAudible(run(muted, { type: 'visibility', hidden: false }))).toBe(false);
  });

  it('follows auto-start changes only while the preference is unset', () => {
    const dive = run(createSoundSession('unset', true), activate);
    expect(isAudible(run(dive, { type: 'auto-start', allowed: false }))).toBe(false);

    const chosen = run(createSoundSession('on', true), activate, { type: 'auto-start', allowed: false });
    expect(isAudible(chosen)).toBe(true);
  });

  it('returns the same session for events that change nothing', () => {
    const session = run(createSoundSession('unset', true), activate);
    expect(soundReducer(session, activate)).toBe(session);
    expect(soundReducer(session, { type: 'visibility', hidden: false })).toBe(session);
    expect(soundReducer(session, { type: 'auto-start', allowed: true })).toBe(session);
  });
});
