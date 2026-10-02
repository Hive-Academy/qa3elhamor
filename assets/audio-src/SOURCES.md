# Audio sources - Qaa El-Hamour music bed

Checked 2026-10-02. All three candidates are CC0 per the author's own OpenGameArt page (OGA is the author's upload host; the author also ships a readme stating CC0 for candidate 1). No SpongeBob/Nickelodeon material. Mood notes come from the authors' descriptions and tags; I could not listen to the audio, so a human listen is needed before shipping.

## Ranking

1. cleyton-underwater-theme-ii.ogg (RECOMMENDED)
2. cleyton-underwater-theme.mp3
3. isaiah658-heavenly-loop.ogg (too short alone; fallback layer)

## 1. Underwater Theme II (RECOMMENDED)

- File: `cleyton-underwater-theme-ii.ogg` (extracted from the author's zip; readme saved as `cleyton-underwater-theme-ii.readme.txt`)
- Title / author: Underwater Theme II / Cleyton Kauffman
- Source page: https://opengameart.org/content/underwater-theme-ii
- Direct download: https://opengameart.org/sites/default/files/underwater_theme_ii.zip (zip holds WAV, FLAC, MP3, OGG; we kept the OGG, 4.2 MB)
- Licence: CC0 1.0 Universal / Public Domain Dedication - https://creativecommons.org/publicdomain/zero/1.0/ (OGA page says CC0; zip readme says "Creative Commons Zero (CC0)")
- Attribution (not required, requested by author, include in credits): `Music by Cleyton Kauffman - https://soundcloud.com/cleytonkauffman`
- Duration: 1:44.7 (ffprobe), Vorbis 44.1 kHz stereo 320 kb/s
- Mood: serene, chill ambient with bell-like pads and wave sounds; tagged ambient/calm, made for underwater/diving scenes.
- Loopability: author states it loops seamlessly and recommends OGG/WAV/FLAC over MP3 (MP3 adds gaps). Length is above the 90 s target. Verify the seam by ear; add a short crossfade as insurance.
- Why #1: designed to loop, longest-clean CC0 file that is explicitly underwater and calm, compact OGG, gapless-friendly format.

## 2. Underwater Theme

- File: `cleyton-underwater-theme.mp3` (6.8 MB)
- Title / author: Underwater Theme (file "Cleyton RX - Underwater") / Cleyton Kauffman
- Source page: https://opengameart.org/content/underwater-theme
- Direct download: https://opengameart.org/sites/default/files/Cleyton%20RX%20-%20Underwater_0.mp3 (WAV also available: .../Cleyton%20RX%20-%20Underwater.wav, 45 MB, not downloaded)
- Licence: CC0 (per OGA page) - https://creativecommons.org/publicdomain/zero/1.0/
- Attribution (optional): `Music by Cleyton Kauffman - https://soundcloud.com/cleytonkauffman`
- Duration: 2:50.2, MP3 44.1 kHz stereo 320 kb/s
- Mood: bell, flute and arpeggios; calm, slightly more melodic/busy than #1; suits underwater/cave/puzzle.
- Loopability: tagged loopable by author, but the file is MP3, so expect encoder-delay gap; re-encode from the WAV or use a crossfade. Seam unverified.
- Why #2: good alternative or second track in rotation; MP3 weakens looping; arpeggios may be less "lounge-still".

## 3. Heavenly Loop

- File: `isaiah658-heavenly-loop.ogg` (1.2 MB)
- Title / author: Heavenly Loop / isaiah658
- Source page: https://opengameart.org/content/heavenly-loop
- Direct download: https://opengameart.org/sites/default/files/Heavenly%20Loop_0.ogg (FLAC: .../Heavenly%20Loop.flac)
- Licence: CC0 (per OGA page) - https://creativecommons.org/publicdomain/zero/1.0/
- Attribution: not required; author says credit "is not need but is appreciated": `Music by isaiah658`
- Duration: 0:33.7 (ffprobe), Vorbis 44.1 kHz stereo
- Mood: dreamy ambient synth pad loop (ZynAddSubFX in LMMS); not underwater-specific.
- Loopability: designed as a seamless loop, but 33 s is under the 90 s target and would sound repetitive alone. Best used as a quiet layer under #1 or not at all.
- Why #3: right mood, wrong length.

## Ambience (optional)

Not sourced; low priority per brief. Synthesize procedurally.

## Verification limits

- Licence read from OGA pages and the Cleyton readme (via page fetch tool); no separate author-site licence statement exists beyond the SoundCloud profile, which was not checked.
- OGA uploads are self-declared by the uploader; provenance of samples inside the tracks is not independently verifiable.
- Audio content/mood/loop seams not listened to.
- Repo is public: shipping CC0 files needs no notice, but keep this file and add a credits line for courtesy.

## Shipped encoding (2026-10-02)

`apps/web/public/audio/aquarium-bed.opus` and `aquarium-bed.m4a` are Underwater Theme II
(`cleyton-underwater-theme-ii.ogg`, CC0), re-encoded with ffmpeg 9.0, metadata stripped:

    ffmpeg -i cleyton-underwater-theme-ii.ogg -c:a libopus -b:a 64k -vbr on -map_metadata -1 aquarium-bed.opus
    ffmpeg -i cleyton-underwater-theme-ii.ogg -c:a aac -b:a 96k -movflags +faststart -map_metadata -1 aquarium-bed.m4a

The other two candidates were not shipped and were removed from this folder. The owner
listened on the local preview and signed off on the mood (2026-10-02).
