# Underwater text

The dive draws its words in the water: what characters say, short labels and titles as troika
SDF text with the underwater shader (`OceanText`, `libs/world/ui/src/lib/ocean-text`); dense
boards as painted canvas textures (`SignDecal`, `libs/world/ui/src/lib/sign-texture.ts`); the
intro's hero title stays the extruded 3D title (`tour/tour-intro-scene.tsx`). The HTML is never
removed: it carries every word for assistive technology, the focus and the buttons, and it is what
shows whenever the drawn text cannot.

## When it is on

`OceanTextProvider` (`apps/web/src/app/ocean-text/`) wraps the dive. It is on when:

- the visitor's settings allow it: no `prefers-reduced-motion`, and not the low quality tier
  (`oceanTextAllowed`); a page that drops to the low tier mid-visit goes back to HTML at once;
- and the SDF font has arrived (`ocean-font.ts`): the self-hosted
  `fonts/ibm-plex-sans-arabic/IBMPlexSansArabic-SemiBold.ttf` (Latin and Arabic in one face),
  fetched once, lazily, from the dive chunk. A failed or slow request (20 s), or troika failing to
  read the file (`OceanText onError`), turns it off for the page.

`?oceanText=off` forces the HTML text (for comparisons and checks). `<html data-ocean-text>` says
which mode the page is in (`on` / `off`), for the stylesheet and the e2e suite. troika runs with
`useWorker: false` (`tour/troika-config.ts`), so nothing needs a `blob:` script under the CSP.

## What is drawn where

| Surface | Drawn as | The HTML in ocean mode |
| --- | --- | --- |
| Narrator's speech bubble (`narrators/ocean-speech.tsx`) | SDF line in a glass bubble, letters surfacing with the typewriter and voice; name and topic as small glass tags on the rim; tail over the narrator | The DOM box stays exactly over it (transparent): click target, focus ring, buttons as glass pills along the bottom; name and line visually hidden but read |
| Pineapple skill bubbles (`pineapple/skill-bubbles.tsx`) | SDF label on each bubble's face, surfacing as it arrives | Label buttons keep their size over the bubbles, text unseen |
| Tiki tablets (`tiki/stone-tablets.tsx`) | Carved inscription (role, company, years) painted on the stone | As above |
| Krusty Krab menu rows (`krusty-krab/menu-board.tsx`) | Chalk on the slate (dish, then the service) | As above |
| Landmark beacons (`ocean-text/ocean-beacon-label.tsx`) | SDF name beside the pulsing dot; caption on hover | The DOM beacon stays the pointer target (`LandmarkLayer beaconLabel`) |
| Tour location card (`tour/tour-caption-scene.tsx`) | SDF name surfacing, caption in spaced capitals | `TourCaption` steps aside (it is `aria-hidden` anyway) |
| Full view title (`in-world/in-world-card-title.tsx`) | SDF title over the card when the screen has room | The card's own headings |
| Bureau form heading | Painted wooden board over the scroll, or hanging beside its top | The form's heading, visually hidden while the board shows; shown again where there is no room |

Painted signs use the page's own fonts (`SITE.theme.fontUi` / `fontPaper`), so the browser shapes
Arabic right to left; they are painted at the pixel ratio (and the zoom a selected object comes
forward to), filtered with the quality profile's anisotropy, and repainted on a locale change and
once the web fonts have loaded.

## DOM layers over the canvas

The drawn words are under every DOM layer. Two of those would dim them: the in-world veil (the
town's rim dims and blurs while a landmark is open) and the full view's dim. Both are masked with
soft windows over the drawn bubble and the card title (`setVeilHole`, `--veil-a-*` and
`--veil-b-*` on `<html>`). The sound switch steps back like the rest of the chrome during a visit
in ocean mode, so it never sits solid over a bubble near the top of the screen.
