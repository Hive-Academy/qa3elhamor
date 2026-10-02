# Third-party assets and notices

The source code in this repository is MIT licensed (see [`LICENSE`](LICENSE)). **Nothing below
is covered by that licence.** Each asset keeps its own licence, and you must comply with it when
you fork, redistribute or deploy the site.

The site shows its model and music credits itself (the "Credits" button, the in-world notice
board at the end of the dive, and the page view). If you fork, keep them.

## 3D models (CC-BY-4.0, attribution required)

All four are from Sketchfab, licensed under
[Creative Commons Attribution 4.0](http://creativecommons.org/licenses/by/4.0/). The credit
strings are data, in `libs/world/domain/src/lib/attribution.ts`; the site renders them from the
asset manifest, so a model cannot ship without its credit. The originals are in `assets/`, each
with its own `license.txt`.

| Model | Author | Source | Used for |
| --- | --- | --- | --- |
| Bikini Bottom Map 3D Model | [spongebob.evolution](https://sketchfab.com/spongebob.evolution) | [Sketchfab](https://sketchfab.com/3d-models/bikini-bottom-map-3d-model-8951fa974ac94e97b83e05ff01c92b3b) | The seabed town and the four landmark buildings cut out of it |
| Sbfbb-SpongeBob House | Sajin Mickey Firey fan 1342 from Cheryl hill ([profile](https://sketchfab.com/cherylhill28)) | [Sketchfab](https://sketchfab.com/3d-models/sbfbb-spongebob-house-80e59e8223e24c3bb96e0404587f96ea) | The pineapple's interior |
| Sponge On The Run: SpongeBob Base Model | [NickBob](https://sketchfab.com/nickbob) | [Sketchfab](https://sketchfab.com/3d-models/sponge-on-the-run-spongebob-base-model-539d085105f74f70a93310e2f4246b88) | The optional bundled SpongeBob narrator |
| Sponge On The Run: Patrick Base Model (Textured) | [NickBob](https://sketchfab.com/nickbob) | [Sketchfab](https://sketchfab.com/3d-models/sponge-on-the-run-patrick-base-model-textured-9254a020fb76477ab4be69ee353e3fcb) | The optional bundled Patrick narrator |

**The models in `apps/web/public/models/` are modified versions**, produced by
`npm run assets:compress` (`tools/asset-pipeline/`):

- Every model is recompressed for the web (Meshopt geometry compression, textures converted to WebP), and the map is split
  into an environment and four landmark buildings.
- The SpongeBob model is **decimated** (519,664 to about 77,900 triangles;
  `docs/asset-compression-report.md`).
- The SpongeBob and Patrick models are **rigged at runtime**: bones are built and the mesh is
  skinned in the browser when the model loads, then animated (`apps/web/src/app/narrators/`).
  The shipped files contain no animation.

## Characters (not covered by any licence here)

SpongeBob SquarePants, Patrick Star and the rest of the Bikini Bottom cast and setting are
intellectual property of Nickelodeon / Paramount. The CC-BY-4.0 licences above cover the
**mesh files their authors made**, not the characters. This project is an unofficial, non-commercial
fan parody and is not affiliated with or endorsed by Nickelodeon, Paramount or the model authors.

How the repository handles this:

- The site's branding is the Egyptian "Qaa El-Hamour" trend (the Sardine President, the complaints
  bureau, "we reached the bottom"), not SpongeBob.
- The narrators have an original cast built in code (the Hamour, the Sardine President, the Crab
  Clerk) that is the template's intended default and the fallback.
- The bundled SpongeBob and Patrick narrators are switched by
  `NARRATOR_CAST.bundledByDefault` in `apps/web/src/site.config.ts`. It is `true` in this
  repository because the owner's site uses them. **A fork should set it to `false`**, and can override it at build time with
  `VITE_BUNDLED_CHARACTERS=true|false`. With it `false` the characters are not shown, though their
  model files remain in the repository and their CC-BY credits stay in the credits list (the
  credits follow the asset manifest, not the switch).
- If you fork and turn the characters on, or build a commercial site on this, that risk is yours.
  Removing them means deleting the `bundled` entries and the models from the manifest
  (`docs/template.md`, section 5).

## Music

| Track | Author | Licence | Source |
| --- | --- | --- | --- |
| Underwater Theme II (the looping music bed, shipped as `apps/web/public/audio/aquarium-bed.opus` and `.m4a`) | Cleyton Kauffman | CC0 1.0 (public domain dedication) | <https://opengameart.org/content/underwater-theme-ii> |

CC0 needs no credit; the author asks for one, and the site gives it ("Music by Cleyton Kauffman -
https://soundcloud.com/cleytonkauffman", `content/credits.json`, id `ambient-music`). The original
download, its readme and the source notes are in `assets/audio-src/` (`SOURCES.md`). The narrators'
babble, the UI sounds and the ambience (rumble, bubbles) are synthesized in code and are covered by
the MIT licence.

## Fonts

| Font | Licence | Files and modifications |
| --- | --- | --- |
| IBM Plex Sans Arabic 1.1.0 (copyright 2017 IBM Corp., Reserved Font Name "Plex") | SIL Open Font License 1.1 | `apps/web/public/fonts/ibm-plex-sans-arabic/`: the Regular and SemiBold `.woff2` files, shipped unmodified. `IBMPlexSansArabic-SemiBold.ttf` is a lossless container conversion of the SemiBold WOFF2 (nothing subset or edited), used for 3D text. Licence text: `LICENSE.txt` in the folder. |
| Qaa Title | SIL Open Font License 1.1 | `apps/web/public/fonts/qaa-title/`: a **modified version** of IBM Plex Sans Arabic SemiBold (Latin glyphs only, printable ASCII, converted to three.js typeface JSON; outlines and advance widths only). Because "Plex" is a Reserved Font Name, the derivative is named "Qaa Title" and does not use that name. Licence text: `LICENSE.txt` in the folder. |

If you redistribute or modify the fonts, keep the OFL text with them and respect the Reserved
Font Name.

## Libraries

The runtime libraries (three.js, React, react-three-fiber, drei and others) are installed
from npm under their own licences, mostly MIT; they are not copied into this repository. Run
`npm ls` to see them. `content/credits.json` credits three.js (MIT) in the site's credits.

## Personal content

The text in `content/*.json` and the favicon (`apps/web/public/favicon.ico`) belong to
Abdallah Khalil. They are not part of the template. A fork replaces them with
`npm run template:reset` and its own content (`docs/template.md`, section 0). The fictional
"Sam Reef" sample in `content.example/` is MIT licensed with the code.
