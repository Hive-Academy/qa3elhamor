import { describe, expect, it } from 'vitest';
import { AUDIO_MIX } from './audio-mix.js';
import { UI_SFX } from './ui-sfx.js';
import {
  BABBLE,
  babbleFor,
  charHash01,
  isVoiced,
  voicedIndices,
  voicePitchHz,
} from './voice-babble.js';
import { VOICE_PROFILES, isVoiceProfileId, voiceProfileFor, type VoiceProfile } from './voice-profiles.js';

const every = (n: number): VoiceProfile => ({ ...VOICE_PROFILES.default, blipEvery: n });

/** Reveals `text` one character at a time, the way the typewriter does, collecting the blips. */
function typeOut(text: string, profile: VoiceProfile) {
  const chars = Array.from(text);
  return chars.flatMap((_, i) =>
    babbleFor(chars.slice(0, i).join(''), chars.slice(0, i + 1).join(''), profile),
  );
}

describe('voice profiles', () => {
  it('has every narrator plus a default, and falls back to it', () => {
    for (const id of ['spongebob', 'patrick', 'hamour', 'sardine-president', 'crab-clerk', 'default']) {
      expect(isVoiceProfileId(id)).toBe(true);
      expect(voiceProfileFor(id).id).toBe(id);
    }
    expect(voiceProfileFor('squidward').id).toBe('default');
    expect(voiceProfileFor(null).id).toBe('default');
    expect(isVoiceProfileId('toString')).toBe(false);
  });

  it('keeps every voice short, quiet and audible', () => {
    for (const profile of Object.values(VOICE_PROFILES)) {
      expect(profile.baseHz).toBeGreaterThan(80);
      expect(profile.baseHz).toBeLessThan(1_000);
      expect(profile.blipS).toBeGreaterThan(0.02);
      expect(profile.blipS).toBeLessThanOrEqual(0.12);
      expect(profile.gain).toBeGreaterThan(0);
      expect(profile.gain).toBeLessThanOrEqual(0.6);
      expect(profile.blipEvery).toBeGreaterThanOrEqual(2);
      expect(profile.blipEvery).toBeLessThanOrEqual(3);
    }
  });

  it('gives each narrator its character', () => {
    const { spongebob, patrick, hamour, 'sardine-president': president } = VOICE_PROFILES;
    expect(spongebob.baseHz).toBeGreaterThan(patrick.baseHz * 3);
    expect(spongebob.blipS).toBeLessThan(patrick.blipS);
    expect(spongebob.glide).toBeGreaterThan(1);
    expect(hamour.glide).toBeLessThan(0.8);
    expect(president.vibratoHz).toBeGreaterThan(0);
  });
});

describe('voice pitch', () => {
  it('is the same for the same character, case-insensitively', () => {
    const profile = VOICE_PROFILES.spongebob;
    expect(voicePitchHz(profile, 'a')).toBe(voicePitchHz(profile, 'a'));
    expect(voicePitchHz(profile, 'A')).toBe(voicePitchHz(profile, 'a'));
  });

  it('stays within the jitter around the base pitch, Arabic letters included', () => {
    const profile = VOICE_PROFILES.hamour;
    const lowest = profile.baseHz * 2 ** (-profile.jitterSemitones / 12);
    const highest = profile.baseHz * 2 ** (profile.jitterSemitones / 12);
    for (const char of Array.from('abcxyz019سبونجبوبمرحبا')) {
      const hz = voicePitchHz(profile, char);
      expect(hz).toBeGreaterThanOrEqual(lowest - 1e-9);
      expect(hz).toBeLessThanOrEqual(highest + 1e-9);
    }
  });

  it('spreads letters over the range rather than one note', () => {
    const hashes = new Set(Array.from('abcdefghij').map((c) => Math.round(charHash01(c) * 10)));
    expect(hashes.size).toBeGreaterThan(4);
  });
});

describe('voiced characters', () => {
  it('voices letters and digits in any script, never spaces or marks', () => {
    for (const char of ['a', 'Z', '7', 'ب', 'ع', '٣']) expect(isVoiced(char)).toBe(true);
    for (const char of [' ', '.', '!', '،', '؟', '—', '\n']) expect(isVoiced(char)).toBe(false);
  });

  it('speaks one letter in every `blipEvery`, starting with the first', () => {
    expect(voicedIndices('abcdef', every(2))).toEqual([true, false, true, false, true, false]);
    expect(voicedIndices('abcdef', every(3))).toEqual([true, false, false, true, false, false]);
  });

  it('carries the count over spaces but restarts it after punctuation', () => {
    // a·b c → the space does not count; "b" waits, "c" speaks.
    expect(voicedIndices('ab c', every(2))).toEqual([true, false, false, true]);
    // After the comma the next letter speaks at once.
    expect(voicedIndices('a,b', every(3))).toEqual([true, false, true]);
  });
});

describe('babbleFor', () => {
  it('blips only the newly revealed characters', () => {
    const profile = every(1);
    expect(babbleFor('he', 'hel', profile).map((b) => b.char)).toEqual(['l']);
    expect(babbleFor('hel', 'hel', profile)).toEqual([]);
  });

  it('is the same however the line is revealed', () => {
    const profile = VOICE_PROFILES.spongebob;
    const text = 'I am ready!';
    const oneByOne = typeOut(text, profile).map((b) => b.index);
    const inChunks = [
      ...babbleFor('', 'I am', profile),
      ...babbleFor('I am', 'I am rea', profile),
      ...babbleFor('I am rea', text, profile),
    ].map((b) => b.index);
    expect(inChunks).toEqual(oneByOne);
  });

  it('is never a machine-gun: at most one blip per two letters', () => {
    const text = 'the quick brown fox jumps over the lazy dog';
    const letters = Array.from(text).filter(isVoiced).length;
    for (const profile of Object.values(VOICE_PROFILES)) {
      expect(typeOut(text, profile).length).toBeLessThanOrEqual(Math.ceil(letters / 2) + 1);
    }
  });

  it('babbles Arabic lines', () => {
    const blips = typeOut('مرحبا بكم', VOICE_PROFILES.hamour);
    expect(blips.length).toBeGreaterThan(0);
    expect(blips.every((b) => isVoiced(b.char))).toBe(true);
  });

  it('spreads blips revealed together, with a pause after punctuation', () => {
    const blips = babbleFor('', 'ab. c', every(1));
    expect(blips.map((b) => b.char)).toEqual(['a', 'b', 'c']);
    expect(blips[0]?.delayS).toBe(0);
    expect(blips[1]?.delayS).toBeCloseTo(BABBLE.charS, 9);
    expect(blips[2]?.delayS).toBeCloseTo(4 * BABBLE.charS + BABBLE.punctuationPauseS, 9);
  });

  it('treats text that does not continue the previous as a new line', () => {
    const blips = babbleFor('hello there', 'Hi', every(1));
    expect(blips.map((b) => b.index)).toEqual([0, 1]);
  });

  it('stays silent on a jump: a finished or instantly shown line', () => {
    const line = 'This whole line appeared at once.';
    expect(babbleFor('', line, VOICE_PROFILES.default)).toEqual([]);
    expect(babbleFor('This', line, VOICE_PROFILES.default)).toEqual([]);
  });
});

describe('UI sounds and the voice mix', () => {
  it('keeps the UI sounds short and soft', () => {
    for (const sfx of Object.values(UI_SFX)) {
      expect(sfx.attackS).toBeGreaterThan(0);
      expect(sfx.attackS).toBeLessThan(sfx.durationS);
      expect(sfx.durationS).toBeLessThanOrEqual(0.6);
      expect(sfx.gain).toBeLessThanOrEqual(0.6);
    }
    expect(UI_SFX.pop.endHz).toBeGreaterThan(UI_SFX.pop.startHz);
    expect(UI_SFX.plip.endHz).toBeLessThan(UI_SFX.plip.startHz);
    expect(UI_SFX.whoosh.peakHz).toBeGreaterThan(UI_SFX.whoosh.startHz);
  });

  it('has voice and SFX levels and a cap on concurrent sounds', () => {
    expect(AUDIO_MIX.voiceGain).toBeGreaterThan(0);
    expect(AUDIO_MIX.sfxGain).toBeGreaterThan(0);
    expect(AUDIO_MIX.maxSfxVoices).toBe(6);
  });
});
