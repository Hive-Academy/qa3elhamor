import type { VoiceProfile } from './voice-profiles.js';

/** The babble's pacing, shared by every voice. */
export const BABBLE = {
  /**
   * A reveal that adds more characters than this at once is a jump (the line was finished with
   * a click, or shown whole for reduced motion), not speech: it stays silent.
   */
  maxRevealChars: 12,
  /** Seconds between characters inside one reveal: the typewriter's pace (42 a second). */
  charS: 1 / 42,
  /** Extra seconds after a punctuation mark inside one reveal. */
  punctuationPauseS: 0.12,
} as const;

/** One blip to play: which character, at what pitch, how long after the reveal. */
export interface VoiceBlip {
  /** The character's index in the revealed text, in code points. */
  readonly index: number;
  readonly char: string;
  readonly pitchHz: number;
  /** Seconds after now: blips revealed together are spread out, not stacked. */
  readonly delayS: number;
}

const VOICED = /[\p{L}\p{N}]/u;
const PUNCTUATION = /[\p{P}]/u;

/** Letters and digits speak, in any script (Arabic included); spaces and marks do not. */
export const isVoiced = (char: string): boolean => VOICED.test(char);

/** A punctuation mark ends a phrase: the next letter always speaks. */
export const isPhraseBreak = (char: string): boolean => PUNCTUATION.test(char);

/** A stable hash of a character in [0, 1): the same letter always gets the same pitch. */
export function charHash01(char: string): number {
  let h = (char.toLowerCase().codePointAt(0) ?? 0) >>> 0;
  // A 32-bit integer mix (lowbias32): neighbouring letters land far apart.
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 0x1_0000_0000;
}

/** The pitch a voice gives a character: `baseHz`, moved by up to ± `jitterSemitones`. */
export const voicePitchHz = (profile: VoiceProfile, char: string): number =>
  profile.baseHz * 2 ** (((charHash01(char) * 2 - 1) * profile.jitterSemitones) / 12);

/**
 * Which characters of `text` speak: letters and digits, one blip every `blipEvery` letters,
 * the first letter of the text and the first after any punctuation always included. Walked
 * over the whole text, so the answer for a character never depends on how it was revealed.
 */
export function voicedIndices(text: string, profile: VoiceProfile): readonly boolean[] {
  const every = Math.max(1, Math.round(profile.blipEvery));
  let countdown = 0;
  return Array.from(text).map((char) => {
    if (isVoiced(char)) {
      if (countdown <= 0) {
        countdown = every - 1;
        return true;
      }
      countdown -= 1;
      return false;
    }
    if (isPhraseBreak(char)) countdown = 0;
    return false;
  });
}

/**
 * The blips for what the typewriter just revealed, going from `previous` to `next`. A `next`
 * that does not continue `previous` is a new line, babbled from its start. Nothing is revealed,
 * or too much at once (`BABBLE.maxRevealChars`): no blips.
 */
export function babbleFor(previous: string, next: string, profile: VoiceProfile): VoiceBlip[] {
  const chars = Array.from(next);
  const from = next.startsWith(previous) ? Array.from(previous).length : 0;
  const added = chars.length - from;
  if (added <= 0 || added > BABBLE.maxRevealChars) return [];

  const voiced = voicedIndices(next, profile);
  const blips: VoiceBlip[] = [];
  let delayS = 0;
  for (let index = from; index < chars.length; index++) {
    const char = chars[index] ?? '';
    if (voiced[index]) blips.push({ index, char, pitchHz: voicePitchHz(profile, char), delayS });
    delayS += BABBLE.charS + (isPhraseBreak(char) ? BABBLE.punctuationPauseS : 0);
  }
  return blips;
}
