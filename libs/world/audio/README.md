# world-audio

The dive's ambient sound: a looping music bed plus synthesized ambience (a low rumble and sparse bubbles), muffled deeper down and ducked while a narrator talks. Plain Web Audio and React, with no three.js, R3F or drei, because the site's entry chunk imports it. The policy (preference, gesture gate, mix numbers) is pure data in `@qa3elhamor/world-domain` (`lib/audio/`). How the site uses it, and how to swap or turn off the track: `docs/audio.md`.

```tsx
import { AudioProvider, SoundToggle, useAudioDepth, useAudioDucking } from '@qa3elhamor/world-audio';

<AudioProvider
  music={[{ url: '/audio/bed.opus', type: 'audio/ogg; codecs=opus' }, { url: '/audio/bed.m4a', type: 'audio/mp4' }]}
  ambience                     // the synthesized rumble and bubbles
  presentation="dive"          // 'page': only the toggle ever starts sound
>
  <SoundToggle label="Sound" promptLabel="Sound on?" placement="dive" />
  …
</AudioProvider>;

useAudioDepth(progress01);     // inside the dive: deeper is more muffled
useAudioDucking(isTalking);    // in a narrator: the music drops ~9 dB while true
```

- **Off until a gesture.** Nothing plays, and no `AudioContext` or `<audio>` exists, until the visitor's first `pointerdown`, `keydown` or `touchend`. Scroll and wheel do not count, since a browser would still block the audio. With no stored choice, the dive starts sound at that gesture. The page view and `prefers-reduced-motion` never do; there only the toggle starts it.
- **The choice persists** in `localStorage` (`qa3elhamor:sound`: `on` | `off`). A stored `on` resumes at the first gesture of a later visit. Storage that throws is treated as no choice.
- **A hidden tab** suspends the sound. Showing it again resumes what was playing.
- **Failures never throw to React.** An unplayable or missing music file is logged with `console.error`, and the ambience keeps playing. Without Web Audio, or with nothing configured, the toggle renders nothing.
- **Hooks without a provider** are safe: `useAudioDepth` and `useAudioDucking` do nothing, and `useSound().available` is false.
- **Narrator voices and UI sounds** are synthesized on two buses (`voiceGain`, `sfxGain` in `AUDIO_MIX`) that go straight to the master, around the depth filter, so speech stays clear on the seabed. They follow the single sound toggle: silent while off, before the first gesture or in a hidden tab, and they never create an `AudioContext` themselves. At most `maxSfxVoices` (6) sound at once; more are dropped.

```tsx
import { useVoiceBabble, useVoice, useSfx, useAudioBridge, AudioBridge } from '@qa3elhamor/world-audio';

useVoiceBabble('spongebob', typedText);  // babble newly typed letters (Animal Crossing style)
const { speakChar, onReveal } = useVoice('hamour'); // the same, by hand; null = no voice
const { pop, whoosh, plip } = useSfx();  // bubble appears / landmark opens or closes / button

// drei <Html> renders a separate React root: context does not reach it. Bridge it:
const audio = useAudioBridge();
<Html><AudioBridge value={audio}>…</AudioBridge></Html>;
```

  The voices are data (`VOICE_PROFILES` in world-domain: `spongebob`, `patrick`, `hamour`, `sardine-president`, `crab-clerk`, `default`). `babbleFor(previous, next, profile)` decides the blips: letters and digits in any script, one per two or three letters, restarting after punctuation; each character has a fixed pitch (a hash of it), so a word sounds the same every time. A reveal of more than 12 characters at once (a finished line, reduced motion) is silent.
- **Testing**: `createAudioEngine` takes `createContext`, `createElement` and `random`, and `AudioProvider` takes `createEngine` and `storage`. The specs use fakes for all of them.
