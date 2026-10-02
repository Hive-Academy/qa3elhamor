import { useFrame } from '@react-three/fiber';
import { resolveText } from '@qa3elhamor/landmarks-domain';
import { OceanText, isRtlText } from '@qa3elhamor/world-ui';
import { useEffect, useRef, useState } from 'react';
import type { Group } from 'three';
import { useLocale } from '../i18n/locale-context';
import { useOceanText } from '../ocean-text/ocean-text-context';
import { poseAtScreenPoint } from '../ocean-text/screen-pose';
import { useTour, useTourState } from './tour-context';

/** One local unit of the card is this many screen pixels. */
const UNIT_PX = 100;
/** How far ahead of the camera the card floats (it is drawn over the scene anyway). */
const CARD_DEPTH = 2.5;
/** Its baseline sits this far up from the bottom of the screen, as the DOM card's 19vh. */
const FROM_BOTTOM = 0.19;
/** Seconds into the flight before the name surfaces, and the line under it. */
const NAME_AFTER_S = 0.9;
const WHAT_AFTER_S = 1.25;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * The flight's location card as underwater text, low in the frame while the camera travels:
 * the landmark's name surfacing letter by letter, its caption under it in spaced capitals. The
 * SDF twin of `TourCaption` (which steps aside while this one shows). Decorative, like it.
 * Inside the canvas; shows only in ocean text mode.
 */
export function TourCaptionScene() {
  const { on } = useOceanText();
  const { store } = useTour();
  const flying = useTourState((s) => s.phase === 'flying');
  const index = useTourState((s) => s.stop);
  const leg = useTourState((s) => s.leg);
  const stop = store.stops[index];
  if (!on || !flying || !stop) return null;
  return <LocationCard key={leg} name={stop.label} caption={stop.caption} />;
}

function LocationCard({
  name,
  caption,
}: {
  readonly name: Parameters<typeof resolveText>[0];
  readonly caption?: Parameters<typeof resolveText>[0];
}) {
  const { locale } = useLocale();
  const ocean = useOceanText();
  const frame = useRef<Group>(null);
  const [shown, setShown] = useState({ name: false, what: false });
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const timers = [
      window.setTimeout(
        () => setShown((s) => ({ ...s, name: true })),
        NAME_AFTER_S * 1000,
      ),
      window.setTimeout(
        () => setShown((s) => ({ ...s, what: true })),
        WHAT_AFTER_S * 1000,
      ),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useFrame(({ camera, size }) => {
    if (size.width !== width) setWidth(size.width);
    const group = frame.current;
    if (!group) return;
    poseAtScreenPoint(
      group,
      camera,
      size,
      size.width / 2,
      size.height * (1 - FROM_BOTTOM),
      CARD_DEPTH,
      UNIT_PX,
    );
  });

  const nameText = resolveText(name, locale);
  const whatText = caption ? resolveText(caption, locale) : '';
  // As the DOM card: clamp(1.75rem, 4.5vw, 3.25rem) and clamp(0.8125rem, 1.6vw, 1rem).
  const namePx = clamp(width * 0.045, 28, 52);
  const whatPx = clamp(width * 0.016, 13, 16);
  return (
    <group
      ref={frame}
      matrixAutoUpdate={false}
      visible={false}
      name="tour-location-card"
    >
      <OceanText
        text={nameText}
        fontUrl={ocean.fontUrl}
        size={namePx / UNIT_PX}
        maxWidth={(width * 0.9) / UNIT_PX}
        anchorY="bottom"
        letterSpacing={isRtlText(nameText) ? 0 : 0.02}
        color="#f3fbff"
        glowColor="#4fe3ff"
        glowOpacity={0.6}
        shimmer={0.85}
        reveal={shown.name ? 1 : 0}
        depthTest={false}
        fog={false}
        renderOrder={50}
        position={[0, (whatPx * 1.9) / UNIT_PX, 0]}
        onError={ocean.reportError}
      />
      {whatText && (
        <OceanText
          text={isRtlText(whatText) ? whatText : whatText.toUpperCase()}
          fontUrl={ocean.fontUrl}
          size={whatPx / UNIT_PX}
          maxWidth={(width * 0.9) / UNIT_PX}
          anchorY="bottom"
          letterSpacing={isRtlText(whatText) ? 0 : 0.32}
          color="#9fe6ff"
          glowColor="#1fb8ff"
          glowOpacity={0.45}
          shimmer={0.5}
          reveal={shown.what ? 1 : 0}
          depthTest={false}
          fog={false}
          renderOrder={50}
          onError={ocean.reportError}
        />
      )}
    </group>
  );
}
