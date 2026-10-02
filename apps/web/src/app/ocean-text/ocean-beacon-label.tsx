import { useFrame } from '@react-three/fiber';
import type { BeaconLabelProps } from '@qa3elhamor/landmarks-feature';
import { OceanText, type OceanTextBounds } from '@qa3elhamor/world-ui';
import { useRef, useState } from 'react';
import { Vector3, type Group } from 'three';
import { IN_WORLD_ATTRIBUTE } from '../in-world/in-world-atmosphere';
import { useOceanText } from './ocean-text-context';
import { faceCameraAtPixelScale } from './screen-pose';

/** One local unit is this many screen pixels: the label keeps the DOM label's size. */
const UNIT_PX = 100;
/**
 * Where the DOM beacon's words start, from its edge on the dot's side: its padding there, the
 * dot and the gap after it (`landmark-beacon.css`: 0.45rem or 0.6rem, 0.5rem, 0.4rem).
 */
const WORDS_FROM_PX = { ltr: 7.2 + 8 + 6.4, rtl: 9.6 + 8 + 6.4 } as const;
/** Seconds between re-reading the DOM beacon's width (it changes with the caption, the locale). */
const MEASURE_S = 0.5;

const width = (bounds: OceanTextBounds): number => bounds.maxX - bounds.minX;
const projected = new Vector3();
/** Opacity steps the label re-renders at while it fades with distance. */
const FADE_STEP = 0.1;
/** Seconds the page's own "beacons step back" takes (`.lmk-beacon-anchor`'s transition). */
const GIVE_WAY_S = 0.5;

/**
 * Whether the page has the beacons give way, as its stylesheet does for the DOM ones: while an
 * in-world landmark is open, and while the tour's intro has the screen.
 */
function beaconsGiveWay(): boolean {
  const root = document.documentElement;
  return (
    root.hasAttribute(IN_WORLD_ATTRIBUTE) ||
    root.dataset['tourState'] === 'intro'
  );
}

/**
 * A landmark beacon's name as underwater text, where the DOM beacon's words were: the DOM button
 * stays over it as the pointer target with its pulsing dot (`LandmarkLayer beaconLabel`). Fades
 * and hides with the DOM beacon (distance, terrain in front). Its caption surfaces on hover.
 */
export function OceanBeaconLabel({
  label,
  caption,
  phase,
  reducedMotion,
  opacity,
  element,
}: BeaconLabelProps) {
  const ocean = useOceanText();
  const group = useRef<Group>(null);
  const [fade, setFade] = useState(1);
  const present = useRef(1);
  const lit = phase !== 'idle';
  // Where the DOM beacon's words start and its middle, in screen pixels from this anchor, and
  // its direction: the drawn words start right after its dot. (drei does not always centre the
  // DOM on the anchor: right to left, its box lands a width off.)
  const [beacon, setBeacon] = useState<{
    readonly startPx: number;
    readonly middlePx: number;
    readonly rtl: boolean;
  } | null>(null);
  const [labelBounds, setLabelBounds] = useState<OceanTextBounds | null>(null);
  const [captionBounds, setCaptionBounds] = useState<OceanTextBounds | null>(
    null,
  );
  const sinceMeasure = useRef(MEASURE_S);

  useFrame(({ camera, size, gl }, delta) => {
    const g = group.current;
    if (!g) return;
    const depth = faceCameraAtPixelScale(g, camera, size.height, UNIT_PX);
    const away = beaconsGiveWay();
    present.current = away
      ? Math.max(0, present.current - delta / GIVE_WAY_S)
      : Math.min(1, present.current + delta / GIVE_WAY_S);
    const next =
      Math.round((opacity() * present.current) / FADE_STEP) * FADE_STEP;
    if (next !== fade) setFade(next);
    g.visible = depth > 0 && next > 0;
    sinceMeasure.current += delta;
    const button = element.current;
    if (!button || depth <= 0 || sinceMeasure.current < MEASURE_S) return;
    sinceMeasure.current = 0;
    g.updateWorldMatrix(true, false);
    projected.setFromMatrixPosition(g.matrixWorld).project(camera);
    const canvas = gl.domElement.getBoundingClientRect();
    const anchorX = canvas.left + ((projected.x + 1) / 2) * size.width;
    const anchorY = canvas.top + ((1 - projected.y) / 2) * size.height;
    const box = button.getBoundingClientRect();
    if (!(box.width > 0)) return;
    const rtl = getComputedStyle(button).direction === 'rtl';
    const startPx = Math.round(
      rtl
        ? box.right - WORDS_FROM_PX.rtl - anchorX
        : box.left + WORDS_FROM_PX.ltr - anchorX,
    );
    const middlePx = Math.round(box.top + box.height / 2 - anchorY);
    if (
      !beacon ||
      beacon.startPx !== startPx ||
      beacon.middlePx !== middlePx ||
      beacon.rtl !== rtl
    )
      setBeacon({ startPx, middlePx, rtl });
  });

  // Centred on where its own width puts it (troika's left and right anchors read differently
  // for right-to-left text, so the block is placed by its laid-out width instead).
  const along = beacon?.rtl ? -1 : 1;
  const start = (beacon?.startPx ?? 0) / UNIT_PX;
  const lift = -(beacon?.middlePx ?? 0) / UNIT_PX;
  const labelX =
    beacon && labelBounds ? start + (along * width(labelBounds)) / 2 : 0;
  const captionX =
    beacon && captionBounds ? start + (along * width(captionBounds)) / 2 : 0;
  const showCaption = lit && Boolean(caption);
  return (
    <group
      ref={group}
      matrixAutoUpdate={false}
      visible={false}
      name="beacon-label"
    >
      <OceanText
        text={label}
        fontUrl={ocean.fontUrl}
        size={0.145}
        color={lit ? '#fff6dc' : '#f3ead3'}
        glowColor="#ffb547"
        glowOpacity={lit ? 0.75 : 0.55}
        shimmer={0.55}
        reducedMotion={reducedMotion}
        opacity={fade}
        depthTest={false}
        fog={false}
        renderOrder={20}
        position={[labelX, lift + (showCaption ? 0.085 : 0), 0]}
        onLayout={setLabelBounds}
        onError={ocean.reportError}
      />
      {showCaption && caption && (
        <OceanText
          text={caption}
          fontUrl={ocean.fontUrl}
          size={0.12}
          color="#d9f6ff"
          glowColor="#2fc9ff"
          glowOpacity={0.5}
          shimmer={0.4}
          reveal={1}
          reducedMotion={reducedMotion}
          opacity={fade * 0.9}
          depthTest={false}
          fog={false}
          renderOrder={20}
          position={[captionX, lift - 0.1, 0]}
          onLayout={setCaptionBounds}
          onError={ocean.reportError}
        />
      )}
    </group>
  );
}
