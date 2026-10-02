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
- **Testing**: `createAudioEngine` takes `createContext`, `createElement` and `random`, and `AudioProvider` takes `createEngine` and `storage`. The specs use fakes for all of them.
