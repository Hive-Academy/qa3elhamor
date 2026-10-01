# Landmarks

A landmark is a positioned model with a hit target, hover and focus states, a camera-focus
transition and a bound HTML overlay. It is declared as data; the kernel renders it. Adding
one never touches `libs/dive`, `libs/world` or the scene graph.

| Library                         | What it holds                                                                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@qa3elhamor/landmarks-domain`  | `LandmarkDefinition`, `validateLandmark`, `createLandmarkRegistry` (returns a `Result`), the interaction state machine (`transition`, `LandmarkInteraction`). No React. |
| `@qa3elhamor/landmarks-ui`      | React DOM only: `LandmarkOverlayHost` (accessible dialog shell), `LandmarkStage` (non-modal in-world stage), `LandmarkIndex` (landmark buttons), `LandmarkOverlayProps`. |
| `@qa3elhamor/landmarks-feature` | `LandmarkProvider`, `<LandmarkLayer>` (R3F, in the canvas), `<LandmarkOverlays>` and `<LandmarkNav>` (DOM, outside the canvas).                                         |

The landmark libraries may import only each other and `scope:shared`. Everything they need
from the rest of the site is injected by the composition root (`apps/web`):

- **Camera**: `LandmarkCamera { focus(waypointId); release() }`. `apps/web` implements it over
  `useDive()` (`landmark-ports.ts`).
- **Models**: `useModel(model)` (a hook that suspends and throws) and optional
  `evictModel(model)`. `apps/web` implements them over world-feature's `useCompressedModel`.
- **Text**: labels are plain strings or `{ en, ar? }`; the provider's `locale` picks one and
  sets the overlays' `dir`.
- **Telemetry**: `onLandmarkEvent` receives `landmark_hover`, `landmark_open`,
  `landmark_close` and `landmark_model_error`.

## How it fits together

```tsx
<DiveProvider path={DIVE_PATH}>
  <LandmarkProvider
    registry={registry}
    camera={camera}
    locale="en"
    inWorld={!reducedMotion && tier !== 'low' && webgl} // else in-world falls back to its dialog
    onLandmarkEvent={track}
  >
    <Canvas aria-hidden="true">
      <OceanWorld environmentUrl={url}>
        {/* scene-world units, inside the world's <WorldSpace> */}
        <LandmarkLayer
          useModel={useLandmarkModel}
          evictModel={evictLandmarkModel}
          reducedMotion={reducedMotion}
        />
      </OceanWorld>
    </Canvas>
    <LandmarkNav /> {/* keyboard and screen-reader route to every landmark */}
    <LandmarkOverlays overlays={LANDMARK_OVERLAYS} />{' '}
    {/* the open landmark's dialog */}
  </LandmarkProvider>
</DiveProvider>
```

Interaction: `idle → hovered → focused → idle`. Pointer over the model or its beacon, or
keyboard focus on its `LandmarkNav` button, is _hover_ (emissive tint, a small lift and bob,
pointer cursor). Click or Enter/Space is _activate_: the camera swims to the landmark's
waypoint and its overlay opens. Esc, the close button, a click on the backdrop or the
overlay's own `onClose` closes it and the camera returns to the scroll. Reduced motion drops
the bob, lift easing and beacon pulse.

Each landmark loads behind its own Suspense and error boundary: a slow model does not delay
the others, and a failed one keeps a clickable target and its beacon (and is reported as
`landmark_model_error`).

## Presentations and in-scene content

`presentation` decides what opening a landmark shows besides moving the camera:

| `presentation`     | Needs     | Opening it shows                                                                                 |
| ------------------ | --------- | ------------------------------------------------------------------------------------------------ |
| `dialog` (default) | `overlay` | The overlay component in the modal paper dialog.                                                 |
| `in-world`         | `scene`   | Nothing modal: the scene component gets `phase: 'focused'`, inside the non-modal stage.          |
| `none`             | nothing   | The camera visits; the same stage's "Back to the dive" bar returns to the dive.                  |

**Fallback.** `LandmarkProvider inWorld={false}` (the site passes false for reduced motion, the
low quality tier and no WebGL) turns every `in-world` landmark into its `overlay` in the dialog
(`effectivePresentation`), or a camera-only visit when it has none, and does not mount its
scene. So an in-world landmark should keep an `overlay` carrying the same content: the
Pineapple's is the Citizenship Card dialog.

**The stage.** For `in-world` and `none`, `<LandmarkOverlays>` renders `LandmarkStage`: a
full-viewport layer above the canvas, a named region (the landmark's label) while open,
holding a **scene slot** and a sonar-ping "Back to the dive" bar. The slot lives outside the
`aria-hidden` canvas, so DOM a scene mounts there is real, crisp, selectable and reachable by
keyboard and screen readers. A scene receives it as `LandmarkSceneProps.sceneLayer` (for drei
`<Html portal>`); it stays mounted while closed, so a scene can animate its exit. Focus moves
to the bar's button on open, then onto the element marked `data-landmark-autofocus`
(`LANDMARK_AUTOFOCUS_ATTRIBUTE`) once the scene's DOM arrives, unless the visitor has moved it.
Esc anywhere, the button, or scrolling the page `leaveOnScroll` pixels (default 64, close
reason `scroll`) closes it; focus then returns to the opener, or the landmark's list button.
The page chrome can react to it with `useFocusedLandmark()` (the site dims the town and plays
a bubble curtain).

A `scene` component (registered in `LandmarkLayer scenes={...}`, typed `LandmarkSceneProps`)
renders R3F children in the landmark's own frame (its position, rotation and scale, in
model units), so a 3D menu or notice board is placed relative to the model with no world
maths. It receives `phase`, `bounds` (the model's hit volume), `locale`, `title`, `reducedMotion`,
`sceneLayer` (above), `activate` and `close`, and handles its own pointer events on its own meshes. While its
landmark is focused, the landmark's hit target stops ray-casting so the scene's meshes get
the pointer. Any landmark may have a scene, dialog ones included (decoration). A scene that
throws is contained to itself and reported as `landmark_scene_error`.

Opening another landmark while one is open switches straight to it (`landmark_close` with
reason `switch`, then `landmark_open`); the camera goes on to the next stop without
returning to the scroll first.

**Overlay data.** Overlays receive only the landmark's identity and text direction. Content
(bio, menu, form endpoint) is bound where the overlay is registered, in `apps/web`:
`pineapple: (props) => <CitizenshipCard {...props} profile={content.profile} />`. The
landmark libraries never import content.

**Focus and scroll.** The dialog makes everything outside it `inert`. On close, focus returns
to whatever opened it; if that was the canvas (a click on a model or beacon), it goes to the
landmark's `LandmarkNav` button, never `<body>`. The kernel does not lock page scroll: while a
landmark is focused the dive ignores scroll and, on release, restores the exact pre-focus
position itself.

**Beacons** fade with camera distance (`beaconRange`, default 45 to 80 world units) and hide
when scene geometry stands between them and the camera (`beaconOcclusion`, a ray a few
times a second per beacon against opaque, non-instanced meshes). Hovered and open beacons
always show.

**Shared models.** `useCompressedModel` gives each caller its own clone (shared geometry,
materials and textures), and each landmark clones its materials for the hover tint, so two
landmarks may use the same model.

## Add your own landmark in 3 steps

1. **Ship the model.** Add the GLB to the asset manifest (`libs/world/domain`, `WEB_ASSETS`)
   and run the asset pipeline, which writes its placement to
   `apps/web/public/models/placements.json`. The model should be centred at its origin, in
   scene-world units.

2. **Declare it.** Add an entry to `LANDMARKS` in `apps/web/src/app/landmarks.config.ts`, and
   a camera stop for it in `apps/web/src/app/dive.config.ts` (`{ kind: 'stop', landmark: ... }`
   plus its placement in `LANDMARK_PLACEMENTS`):

   ```ts
   {
     id: 'jellyfish-fields',
     model: 'landmark-jellyfish-fields',          // WEB_ASSETS id
     position: LANDMARK_PLACEMENTS['landmark-jellyfish-fields'],
     waypoint: 'landmark-jellyfish-fields',       // the dive stop's id
     overlay: 'jellyfish-fields',                 // key in LANDMARK_OVERLAYS
     label: { en: 'Jellyfish Fields', ar: 'حقول قناديل البحر' },
     caption: 'Side projects',
     hitTarget: { kind: 'bounds', padding: 0.01 }, // optional; or { kind: 'sphere', radius }
   }
   ```

3. **Write its overlay.** A plain React component taking `LandmarkOverlayProps`, registered
   under the key from step 2 (for `presentation: 'in-world'`, write a scene component taking
   `LandmarkSceneProps` and register it in `LANDMARK_SCENES` under its `scene` key instead):

   ```tsx
   export function JellyfishOverlay({ title, locale, onClose }: LandmarkOverlayProps) {
     return <p>…</p>;
   }

   export const LANDMARK_OVERLAYS = { …, 'jellyfish-fields': JellyfishOverlay };
   ```

   The host supplies the dialog, heading, close button, focus handling, Esc and `dir`; the
   overlay renders only its content. It is an ordinary component, so the no-WebGL fallback
   can render it too.

`landmarks.config.spec.ts` fails if an entry names a waypoint the dive does not have, an
overlay or scene that is not registered, an unknown asset, or a position that disagrees with
`placements.json`. The page also refuses to start with an invalid config, so a typo is a
test failure, never a dead click.
