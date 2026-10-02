# Ambient audio

The dive has a soft, looping underwater music bed under a synthesized ambience: a low rumble with a slow swell and quiet, sparse bubble blips. Deeper in the dive the sound is more muffled, through a low-pass filter that falls from about 18 kHz at the surface to about 1.2 kHz on the seabed. While a narrator talks, the music drops about 9 dB and comes back gently afterwards.

## When it plays

Sound is **off until the visitor's first gesture**. Browsers block audio before a user activation, and scrolling is not one. Nothing is created or downloaded before that point: no `AudioContext`, no `<audio>` element, no music request.

| Situation | What happens |
| --- | --- |
| The dive, no stored choice | Sound fades in at the first click, tap or key press. The sound button reads "Sound on?" until then. |
| The page view (no WebGL, `?view=page`), no stored choice | Silent. Only the sound button starts it. |
| `prefers-reduced-motion: reduce`, no stored choice | Silent. Only the sound button starts it. |
| The visitor turned sound **on** in an earlier visit | It resumes at the first gesture. Browsers still require one. |
| The visitor muted it | Silent until they press the button again. |
| The tab is hidden | Suspended. It resumes when the tab is visible again, if it was playing. |

The button is in the top inline-end corner of the dive, under the depth gauge, and in the bottom inline-end corner of the page view. It is a toggle (`aria-pressed`), reachable with Tab and pressed with Enter or Space. Its hit area is at least 44 × 44 px, and its name is in the site's language (`CHROME_COPY.sound` / `soundPrompt`). The choice is kept in `localStorage` under `qa3elhamor:sound`.

## Where the code is

- **Policy**: `libs/world/domain/src/lib/audio/`. The preference, the session state machine (`soundReducer`, `autoStartAllowed`) and the mix numbers (`AUDIO_MIX`, `lowpassCutoffHz`, `musicGainFor`, `AMBIENCE`) are pure and unit-tested.
- **Shell**: `libs/world/audio` (`@qa3elhamor/world-audio`). It holds the Web Audio engine, the external store, the provider with the gesture gate, and the toggle. See its README.
- **Wiring**: in `apps/web`, `app.tsx` holds the provider and the toggle for both presentations. `audio/dive-audio-mix.tsx` feeds depth, mounted in `dive-shell.tsx`. The narrated visits (`narrators/narrated-visit.tsx`, `bureau/bureau-scene.tsx`) duck the music while a line types out.

## Swapping or disabling the track

The music is configured in `apps/web/src/site.config.ts` → `AUDIO`:

```ts
export const AUDIO: AudioConfig = {
  music: {
    sources: [
      { url: 'audio/aquarium-bed.opus', type: 'audio/ogg; codecs=opus' }, // tried first
      { url: 'audio/aquarium-bed.m4a', type: 'audio/mp4' },               // AAC fallback (Safari)
    ],
    creditId: 'ambient-music',
  },
  ambience: true,
};
```

- **Swap the track**: put the files in `apps/web/public/audio/`, point `sources` at them (paths inside `public`, resolved against the deploy base), and update the credit (below).
- **Music off, ambience only**: `music: null`.
- **No sound at all**: `music: null, ambience: false`. The button disappears too.

### Encoding

Make the bed a seamless loop of about 60 to 90 s, mono or narrow stereo, mixed quietly with no sharp transients. Encode two files:

- **Opus in Ogg**: e.g. `ffmpeg -i bed.wav -c:a libopus -b:a 96k bed.opus`.
- **AAC in MP4**: e.g. `ffmpeg -i bed.wav -c:a aac -b:a 128k -movflags +faststart bed.m4a`.

The browser plays the first source whose `type` it reports it can play (`canPlayType`). If neither is playable, or the file fails to load, the error is logged and the ambience keeps playing.

### Budget and security

- `npm run perf:budget` fails if any audio file in the build is over **1.6 MiB** (`BUDGETS.maxAudioFileBytes`), or if `index.html` or `moderation.html` references or preloads audio. Audio is never part of the initial load (docs/perf-budget.md).
- The Content Security Policy's `media-src` is `'self' blob:` (`tools/deploy/csp.ts`, asserted in `csp.spec.ts`). Serve the music from the site itself. Adding another origin means changing that policy on purpose.

## Licence rules

The music must be **licence-clean**: CC0, royalty-free with attribution, or generated or commissioned for this site. **No copyrighted SpongeBob (or other) music.** Record the source and licence as a credit in `content/credits.json` (and `content.example/credits.json` for the template), with kind `music`:

```json
{
  "id": "ambient-music",
  "kind": "music",
  "title": { "en": "Track title", "ar": "…" },
  "author": "Composer",
  "url": "https://where-the-track-came-from.example",
  "license": "CC0-1.0"
}
```

`AUDIO.music.creditId` names that entry. The credit shows in the site's Credits dialog under "Music", and in the page view's credits. `apps/web/src/app/audio/audio-config.spec.ts` fails if the configured music has no `music` credit with a licence, or if a source file is missing from `public/`. The entry shipped today is a placeholder marked **TBD** until the final track is chosen.

The ambience is synthesized in the browser (noise and sine chirps) and has no licence to record.
