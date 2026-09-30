import {
  presentationOf,
  resolveText,
  textDirection,
} from '@qa3elhamor/landmarks-domain';
import {
  LandmarkIndex,
  LandmarkOverlayHost,
  LandmarkReturnBar,
  landmarkIndexButton,
  type LandmarkOverlayRegistry,
} from '@qa3elhamor/landmarks-ui';
import { useCallback, useLayoutEffect, useRef } from 'react';
import {
  useActiveLandmarkId,
  useLandmarkActions,
  useLandmarkContext,
  useLandmarkState,
} from './landmark-context.js';

export interface LandmarkOverlaysProps {
  /** Overlay components by key; every dialog landmark's `overlay` must be one of them. */
  readonly overlays: LandmarkOverlayRegistry;
  /** Accessible name of the dialog's close button, in the current locale. */
  readonly closeLabel?: string;
  /** Text of the "back to the dive" button for in-world and camera-only landmarks. */
  readonly returnLabel?: string;
}

/**
 * The DOM side of the focused landmark, by its presentation: a `dialog` landmark opens its
 * overlay in the modal dialog shell; an `in-world` or `none` landmark gets the non-modal
 * return bar (its content, if any, is its in-scene component). Render it outside the
 * `<Canvas>`, under the same `<LandmarkProvider>` as the layer.
 *
 * Scroll is not locked here: while a landmark is focused the camera port owns the scroll
 * (the dive ignores it and restores the page position itself on release), and a lock would
 * sit between that restore and the page.
 *
 * Focus goes back to the opener; when that was the canvas (a click on a model or beacon), it
 * goes to the landmark's button in `<LandmarkNav>` instead of being dropped on `<body>`.
 */
export function LandmarkOverlays({
  overlays,
  closeLabel,
  returnLabel,
}: LandmarkOverlaysProps) {
  const { registry, locale } = useLandmarkContext();
  const { close } = useLandmarkActions();
  const focusedId = useLandmarkState((s) =>
    s.phase === 'focused' ? s.id : null,
  );
  const definition = focusedId ? registry.get(focusedId) : undefined;
  const presentation = definition ? presentationOf(definition) : null;
  const Overlay = definition?.overlay
    ? overlays[definition.overlay]
    : undefined;
  const dir = textDirection(locale);
  const title = definition ? resolveText(definition.label, locale) : '';

  // The last landmark shown, read when the dialog or bar closes (the state is idle by then).
  const lastId = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (focusedId) lastId.current = focusedId;
  }, [focusedId]);
  const returnFocus = useCallback(
    () => (lastId.current ? landmarkIndexButton(lastId.current) : null),
    [],
  );

  return (
    <>
      <LandmarkOverlayHost
        open={presentation === 'dialog' && Boolean(Overlay)}
        title={title}
        dir={dir}
        lang={locale}
        closeLabel={closeLabel}
        returnFocus={returnFocus}
        lockScroll={false}
        onClose={close}
      >
        {definition && Overlay && (
          <Overlay
            landmarkId={definition.id}
            title={title}
            locale={locale}
            dir={dir}
            onClose={() => close('programmatic')}
          />
        )}
      </LandmarkOverlayHost>
      <LandmarkReturnBar
        open={presentation === 'in-world' || presentation === 'none'}
        title={title}
        hint={
          definition?.caption
            ? resolveText(definition.caption, locale)
            : undefined
        }
        closeLabel={returnLabel}
        dir={dir}
        lang={locale}
        returnFocus={returnFocus}
        onClose={close}
      />
    </>
  );
}

export interface LandmarkNavProps {
  /** Accessible name of the list. Default "Landmarks". */
  readonly label?: string;
}

/** Every landmark as a keyboard- and screen-reader-reachable button, wired to the scene. */
export function LandmarkNav({ label = 'Landmarks' }: LandmarkNavProps) {
  const { registry, locale } = useLandmarkContext();
  const { hover, unhover, activate } = useLandmarkActions();
  const activeId = useActiveLandmarkId();
  const items = registry.all.map((d) => ({
    id: d.id,
    label: resolveText(d.label, locale),
    caption: d.caption ? resolveText(d.caption, locale) : undefined,
  }));

  return (
    <LandmarkIndex
      items={items}
      label={label}
      activeId={activeId}
      onActivate={activate}
      onHover={hover}
      onUnhover={unhover}
      dir={textDirection(locale)}
      lang={locale}
    />
  );
}
