import type { VoiceProfileId } from '@qa3elhamor/world-domain';
import type { BundledCharacter, NarratorChoice } from '../narrators.config';

/** The voice each bundled model speaks in (`VOICE_PROFILES` in `@qa3elhamor/world-domain`). */
const MODEL_VOICES: Readonly<
  Record<BundledCharacter['asset'], VoiceProfileId>
> = {
  'spongebob-narrator': 'spongebob',
  'patrick-narrator': 'patrick',
};

/**
 * The babble voice of whoever plays `choice`: an original cast member speaks in its own voice
 * (the cast ids are voice ids), a bundled model in its character's. Pass the narrator actually
 * on screen (its fallback cast, when the model is not allowed or failed), so the voice matches.
 */
export const voiceOf = (choice: NarratorChoice): VoiceProfileId =>
  choice.kind === 'cast' ? choice.cast : MODEL_VOICES[choice.asset];
