# The cinematic tour

A first-time visitor to the dive does not have to guess where to scroll or click. Over the surface
view, the place's name rises out of the water as extruded mother-of-pearl letters, with its Arabic
name and a tagline surfacing under it, and two choices:

- **Begin the journey**: the camera flies itself to every landmark in dive order. At each stop the
  landmark opens and its narrator talks hands-free: each line types out (with the voice blips),
  stays up for a reading time, then the next one comes. After the last line the content (skill
  bubbles, stone tablets, the menu board) gets a few seconds, the visit closes and the camera flies
  on. The last stop is the Complaints Bureau: the President's lines play, then the journey ends
  with the visitor left in the contact flow ("File a complaint") and an **Explore freely** button.
- **Explore on my own**: the ordinary free-scroll dive, exactly as before.

The choice is remembered (`localStorage` `qa3elhamor:tour` = `done` | `skipped`). A returning
visitor gets no intro, only a small **Replay the journey** button at the top of the screen (hidden
while a landmark is open).

## Controls

While the journey runs, a bar at the top of the screen shows where it is (stop *i* of *n*, one
mark per stop, each named for screen readers, and a polite status line: "Heading to …", "Now at …")
and three buttons. Everything is in the site's language and direction.

| Action | Button | Keyboard |
| --- | --- | --- |
| Pause / resume | **Pause** / **Resume the journey** | Space, when focus is not on a control or a text field (Space on a button presses it; on the narrator's bubble it advances the line, as always) |
| Next stop | **Next stop** | Tab to it |
| Leave the journey | **Skip tour** (at the end: **Explore freely**) | Tab to it |
| Step out of a visit | the visit's own **Back to the dive** | Esc, unchanged: it closes the open visit first (the kernel's rule). With no visit open during a flight, Esc pauses. |

The visitor's own input always wins, and the tour never fights it:

- A wheel, touch-scroll, scroll-bar drag or scroll key (arrows, Page Up/Down, Home/End) during a
  flight pauses it where the camera is; **Resume the journey** flies on from there. During the
  intro, the same input means "explore on my own".
- Closing an in-world visit yourself (Esc, Back to the dive, scrolling away) pauses before the next
  stop. Opening a landmark of your own (the landmark list, a click in the scene) pauses too.
- Opening a landmark's full view, the Bureau's scroll or the wall holds the narration where it is;
  it moves on again when you close it.
- **Skip tour** ends the journey where it is. An open visit stays open, to be left as usual.

Nothing takes focus by itself when the intro appears (a first visit to the dive never moves focus).
The intro is first in the dive's DOM, so Tab reaches **Begin the journey** right after the page's
own way out and the language switch. Opening a stop moves focus into the visit, exactly as opening
it by hand does.

## Reduced motion, the low tier

- **Reduced motion**: no flying. Between stops the view fades to the water's colour, the camera
  moves while it is covered, and it fades back (opacity only). The intro is a flat card with the
  same title, tagline and buttons (no 3D title).
- **Reduced motion or the low tier**: landmarks open as their dialog (the kernel's fallback, which
  carries the same content), not as narrated visits. A dialog has no hands-free narration and the
  page around it is inert, so the journey waits for the visitor: closing the card (Esc or Close) is
  "next stop". The last stop's dialog is the end of the journey.
- The low tier (or a page that started on it) also gets the flat intro card.

## Sound

The click on **Begin the journey** is a user gesture. The site's sound gate starts sound on it
unless the visitor turned sound off (the stored preference) or prefers reduced motion (where only
the sound button starts it, as everywhere on the site). Each leg starts with a whoosh; the
narrators' voice blips play while their lines type.

## For forks: reorder or turn it off

`TOUR` in `apps/web/src/site.config.ts`:

```ts
export const TOUR: TourConfig = { enabled: true };                          // every landmark, in dive order
export const TOUR: TourConfig = { enabled: true, stops: ['bureau', 'pineapple'] }; // your order; the last is the finale
export const TOUR: TourConfig = { enabled: false };                         // no intro, no journey, no replay
```

An unknown or repeated id in `stops` fails at startup, like a broken landmark (and in
`tour-entry.spec.ts`). The intro's words are in `apps/web/src/app/tour/tour-copy.ts` (both
languages); the title is the place's name from `SITE.brand.place`. The 3D title's font
(`apps/web/public/fonts/qaa-title/`) carries printable ASCII only: a Latin place name with other
letters needs the font regenerated (see the README there).

## URL switches and the end-to-end suite

- `?tour=on` forces the intro, even for a returning visitor or an automated browser.
- `?tour=off` turns the tour off for that page load.
- An automated browser (`navigator.webdriver`, which Playwright sets) gets no tour unless
  `?tour=on`, so every existing spec still starts in the free dive with nothing in the way.
- `<html data-tour-state>` is the tour's phase: `off`, `intro`, `flying`, `visiting`, `paused`,
  `finale` or `free`. The visits keep their own `data-visit-state` (`arriving`, `talking`, `ready`,
  `leaving`), unchanged.
- `apps/web-e2e/src/tour.spec.ts`: the default is the free dive; `?tour=on` shows the intro and
  "Explore on my own" leaves it (push/PR); and, tagged `@nightly @desktop-only` like the other
  in-world flows, "Begin the journey" reaches the first visit, pauses and resumes, and **Skip
  tour** returns to free exploration.

## How it is built

`apps/web/src/app/tour/`, functional core and imperative shell:

| File | What |
| --- | --- |
| `tour-machine.ts` | The pure state machine: phases, events (begin, arrived, finished, next, pause, resume, visit closed or opened by the visitor, explore) and what is remembered. |
| `tour-timing.ts` | Leg duration from distance (3–5 s), the smootherstep curve, the reduced-motion cut timing. |
| `tour-entry.ts` | Intro or not (`?tour`, automation, the stored choice), the intro's style, the stops from `TOUR`, storage helpers. |
| `tour-store.ts` | The machine as an external store (`useSyncExternalStore`); also the narrated visits' `VisitAutoplay`. |
| `tour-director.tsx` | The shell: flights (the page scroll moved along the eased curve every animation frame, so the camera stays on the dive path and the dive's own spring smooths it), opening and closing landmarks through the kernel (`useLandmarkActions`), input detection, keys, `data-tour-state`. |
| `tour-chrome.tsx`, `tour.css` | The intro's DOM, the control bar, the location card during flights, the replay button. |
| `tour-intro-scene.tsx`, `tour-title-material.ts` | The 3D title (drei `Text3D`, physical pearl with caustics) and the `OceanText` lines; in the lazy dive chunk only. |
| `troika-config.ts` | troika (under `OceanText`) typesets on the main thread: its blob: worker is refused by the CSP. |

The narrator kit's hook for it is `narrators/visit-autoplay.ts` (see `narrators/README.md`). No
dive or landmark library changed: the dive already follows the page scroll, and the kernel already
has programmatic `activate` and `close`.
